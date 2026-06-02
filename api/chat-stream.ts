import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import Anthropic from '@anthropic-ai/sdk';
import { analyzeRepository, RepoAnalysis } from './lib/repo-analyzer';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildContextualSystemPrompt(repoAnalysis: RepoAnalysis | null): string {
  let prompt = `You are a software orchestrator helping to plan and implement software tasks.

## Your Role
1. Understand what the user wants to build
2. Analyze the repository structure and tech stack
3. Create a detailed plan with specific implementation steps
4. Assess difficulty: "easy" for straightforward changes, "hard" for complex logic or architecture changes
5. Identify which files will be affected
6. Suggest agents (Frontend, Backend, Testing, Architecture) for the work

## Repository Context`;

  if (repoAnalysis) {
    prompt += `
**Tech Stack:** ${repoAnalysis.technologies.join(', ') || 'Node.js/TypeScript'}
**Project:** ${repoAnalysis.summary}

**Key Source Files:**
${repoAnalysis.files
  .slice(0, 20)
  .map((f) => `- \`${f.path}\`${f.language ? ` (${f.language})` : ''}`)
  .join('\n')}`;
  }

  prompt += `

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

  return prompt;
}

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { sessionId, message } = req.method === 'GET' ? req.query : req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'sessionId and message required' });
  }

  try {
    // Get session and prior messages
    const sessionResult = await sql`
      SELECT * FROM sessions WHERE id = $1
    `, [sessionId];

    if (!sessionResult.rows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    const messagesResult = await sql`
      SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC
    `, [sessionId];

    const priorMessages = messagesResult.rows.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // Analyze repo on first message (no prior messages)
    let repoAnalysis: RepoAnalysis | null = null;
    if (priorMessages.length === 0) {
      repoAnalysis = await analyzeRepository(sessionId);

      // Store analysis in session for future calls
      if (repoAnalysis && repoAnalysis.technologies.length > 0) {
        await sql`
          UPDATE sessions SET repo_analysis = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(repoAnalysis), sessionId];
      }
    } else if (session.repo_analysis) {
      // Use cached analysis for subsequent messages
      repoAnalysis = JSON.parse(session.repo_analysis);
    }

    // Build context-aware system prompt
    const systemPrompt = buildContextualSystemPrompt(repoAnalysis);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream from Claude
    let fullResponse = '';
    const stream = await client.messages.stream({
      model: 'claude-opus-4-1',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        ...priorMessages,
        { role: 'user', content: message as string },
      ],
    });

    // Send tokens as they arrive
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const token = event.delta.text;
        fullResponse += token;

        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
      }
    }

    // Save messages to DB
    await sql`
      INSERT INTO messages (session_id, role, content, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [sessionId, 'user', message];

    await sql`
      INSERT INTO messages (session_id, role, content, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [sessionId, 'orchestrator', fullResponse];

    // Extract plan from response
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);

        // Save plan to session
        await sql`
          UPDATE sessions SET orchestrator_plan = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(plan), sessionId];

        res.write(`event: plan\ndata: ${JSON.stringify(plan)}\n\n`);
      }
    } catch (parseErr) {
      console.error('Failed to parse plan:', parseErr);
    }

    res.write('event: done\ndata: {}\n\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'CHAT_ERROR' })}\n\n`);
    res.end();
  }
};
