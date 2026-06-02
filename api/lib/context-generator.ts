import { sql } from '@vercel/postgres';

export interface IDEContext {
  taskSummary: string;
  difficulty: string;
  implementation_steps: string[];
  agents: any[];
  conversationHistory: string;
  relevantFiles: string[];
  notes: string;
}

export async function generateIDEContext(sessionId: string): Promise<IDEContext> {
  try {
    // Get session with plan
    const sessionResult = await sql`
      SELECT * FROM sessions WHERE id = $1
    `, [sessionId];

    if (!sessionResult.rows.length) {
      throw new Error('Session not found');
    }

    const session = sessionResult.rows[0];
    const plan = session.orchestrator_plan ? JSON.parse(session.orchestrator_plan) : {};

    // Get all messages
    const messagesResult = await sql`
      SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC
    `, [sessionId];

    const messages = messagesResult.rows;

    // Format conversation history
    const conversationHistory = messages
      .map((msg: any) => {
        const role = msg.role === 'orchestrator' ? '🤖 Orchestrator' : '👤 Developer';
        return `### ${role}\n${msg.content}`;
      })
      .join('\n\n');

    // Extract relevant files from plan
    const relevantFiles = new Set<string>();
    if (plan.agents && Array.isArray(plan.agents)) {
      plan.agents.forEach((agent: any) => {
        if (agent.files && Array.isArray(agent.files)) {
          agent.files.forEach((file: string) => relevantFiles.add(file));
        }
      });
    }

    // Build context object
    const context: IDEContext = {
      taskSummary: plan.summary || 'Task implementation',
      difficulty: plan.difficulty || 'unknown',
      implementation_steps: plan.implementation_steps || [],
      agents: plan.agents || [],
      conversationHistory,
      relevantFiles: Array.from(relevantFiles),
      notes: plan.notes || '',
    };

    return context;
  } catch (err) {
    console.error('Failed to generate IDE context:', err);
    throw err;
  }
}

export function formatContextForIDE(context: IDEContext): string {
  const lines: string[] = [];

  lines.push('# Task Implementation Context');
  lines.push('');
  lines.push(`## Task Summary`);
  lines.push(`${context.taskSummary}`);
  lines.push('');

  lines.push(`## Difficulty Level`);
  lines.push(`**${context.difficulty.toUpperCase()}**`);
  lines.push('');

  if (context.implementation_steps && context.implementation_steps.length > 0) {
    lines.push(`## Implementation Steps`);
    context.implementation_steps.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step}`);
    });
    lines.push('');
  }

  if (context.agents && context.agents.length > 0) {
    lines.push(`## Implementation Plan`);
    context.agents.forEach((agent) => {
      lines.push(`### ${agent.name || 'Agent'}`);
      lines.push(`**Role:** ${agent.role || 'Not specified'}`);
      if (agent.task) lines.push(`**Task:** ${agent.task}`);
      if (agent.files && agent.files.length > 0) {
        lines.push(`**Files to modify:**`);
        agent.files.forEach((file: string) => {
          lines.push(`- \`${file}\``);
        });
      }
      lines.push('');
    });
  }

  if (context.relevantFiles && context.relevantFiles.length > 0) {
    lines.push(`## Relevant Files`);
    context.relevantFiles.forEach((file) => {
      lines.push(`- \`${file}\``);
    });
    lines.push('');
  }

  lines.push(`## Conversation History`);
  lines.push(context.conversationHistory);
  lines.push('');

  if (context.notes) {
    lines.push(`## Additional Notes`);
    lines.push(context.notes);
    lines.push('');
  }

  lines.push('---');
  lines.push('_Context generated for IDE implementation_');

  return lines.join('\n');
}

export function formatContextForJira(context: IDEContext): string {
  const lines: string[] = [];

  lines.push(`h2. Implementation Context`);
  lines.push('');
  lines.push(`*Summary:* ${context.taskSummary}`);
  lines.push(`*Difficulty:* ${context.difficulty}`);
  lines.push('');

  if (context.implementation_steps && context.implementation_steps.length > 0) {
    lines.push(`h3. Steps`);
    context.implementation_steps.forEach((step) => {
      lines.push(`* ${step}`);
    });
    lines.push('');
  }

  if (context.agents && context.agents.length > 0) {
    lines.push(`h3. Implementation Plan`);
    context.agents.forEach((agent) => {
      lines.push(`* *${agent.name}*: ${agent.task}`);
      if (agent.files && agent.files.length > 0) {
        lines.push(`  Files: ${agent.files.join(', ')}`);
      }
    });
    lines.push('');
  }

  lines.push(`h3. Relevant Files`);
  if (context.relevantFiles && context.relevantFiles.length > 0) {
    context.relevantFiles.forEach((file) => {
      lines.push(`* {{${file}}}`);
    });
  }
  lines.push('');

  lines.push(`h3. Conversation Context`);
  lines.push(`{code}`);
  lines.push(context.conversationHistory.substring(0, 1000)); // Limit to 1000 chars
  lines.push(`{code}`);

  return lines.join('\n');
}
