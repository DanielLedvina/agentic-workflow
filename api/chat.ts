import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/postgres';
import Anthropic from '@anthropic-ai/sdk';

const db = createClient({ connectionString: process.env.POSTGRES_URL });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildContextualSystemPrompt(): string {
  return `You are a software orchestrator helping to plan and implement software tasks.

## Your Role
1. Understand what the user wants to build
2. Create a detailed plan with specific implementation steps
3. Assess difficulty: "easy" for straightforward changes, "hard" for complex logic or architecture changes
4. Identify which files will be affected
5. Suggest agents (Frontend, Backend, Testing, Architecture) for the work

## Tech Stack
**Stack:** Angular, TypeScript, Node.js, PostgreSQL, Vercel
**Project:** Agentic workflow system - multi-agent task orchestration platform

## Implementation Guidelines
- For **easy tasks**: straightforward feature additions, simple UI changes, new endpoints
- For **hard tasks**: refactoring, architectural changes, complex logic, database migrations

## Response Format
Always end your response with a JSON plan block:
\`\`\`json
{
  "summary": "brief description of what will be implemented",
  "difficulty": "easy|hard",
  "reasoning": "explanation of difficulty assessment",
  "agents": [
    {
      "name": "Agent Name",
      "role": "Frontend|Backend|Testing|Architecture|Styling",
      "task": "specific task this agent will do",
      "files": ["path/to/file1.ts", "path/to/file2.ts"]
    }
  ],
  "estimatedTime": 30,
  "risks": ["potential issue 1", "potential issue 2"],
  "implementation_steps": ["step 1", "step 2", "step 3"]
}
\`\`\``;
}

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { sessionId, message } = req.method === 'GET' ? req.query : req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'INVALID_INPUT' });
  }

  try {
    // Connect to database
    await db.connect();

    // Ensure session exists
    const sessionCheckResult = await db.query(
      'SELECT id FROM sessions WHERE id = $1',
      [String(sessionId)]
    );

    if (sessionCheckResult.rows.length === 0) {
      await db.query(
        'INSERT INTO sessions (id, created_at, updated_at) VALUES ($1, NOW(), NOW())',
        [String(sessionId)]
      );
    }

    // Get prior messages from DB
    const messagesResult = await db.query(
      'SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [String(sessionId)]
    );

    const priorMessages = messagesResult.rows.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // Stream from Claude
    let fullResponse = '';

    const stream = await client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      system: buildContextualSystemPrompt(),
      messages: [
        ...priorMessages,
        {
          role: 'user',
          content: message as string,
        },
      ],
    });

    // Collect all tokens
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && 'delta' in event) {
        const delta = event.delta as any;
        if (delta.type === 'text_delta') {
          fullResponse += delta.text;
        }
      }
    }

    // Save user message
    await db.query(
      'INSERT INTO messages (session_id, role, content, created_at) VALUES ($1, $2, $3, NOW())',
      [String(sessionId), 'user', message]
    );

    // Save assistant message
    await db.query(
      'INSERT INTO messages (session_id, role, content, created_at) VALUES ($1, $2, $3, NOW())',
      [String(sessionId), 'orchestrator', fullResponse]
    );

    // Parse plan
    let plan = null;
    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        plan = JSON.parse(jsonMatch[0]);

        // Save plan to session
        await db.query(
          'UPDATE sessions SET orchestrator_plan = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(plan), String(sessionId)]
        );
      } catch (parseErr) {
        console.error('Failed to parse plan:', parseErr);
      }
    }

    // Set response headers before writing
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send text as tokens
    const words = fullResponse.split(' ');
    for (const word of words) {
      res.write(`event: token\ndata: ${JSON.stringify({ token: word + ' ' })}\n\n`);
    }

    // Send plan
    if (plan) {
      res.write(`event: plan\ndata: ${JSON.stringify(plan)}\n\n`);

      // Send assessment
      if (plan.difficulty) {
        res.write(`event: assessment\ndata: ${JSON.stringify({
          difficulty: plan.difficulty,
          reason: plan.reasoning || plan.summary || '',
        })}\n\n`);
      }
    }

    res.write('event: done\ndata: {}\n\n');
    res.end();

    await db.end();
  } catch (err: any) {
    console.error('Chat error:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'CHAT_ERROR', message: err.message, details: err.toString() });
  }
};
