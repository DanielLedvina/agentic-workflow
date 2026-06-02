import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/postgres';

const db = createClient({ connectionString: process.env.POSTGRES_URL });

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { id: sessionId } = req.query as { id?: string };

  if (!sessionId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'sessionId required' });
  }

  try {
    await db.connect();

    // Get session
    const sessionResult = await db.query(
      'SELECT * FROM sessions WHERE id = $1',
      [String(sessionId)]
    );

    if (sessionResult.rows.length === 0) {
      await db.end();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const session = sessionResult.rows[0];

    // Get messages
    const messagesResult = await db.query(
      'SELECT id, role, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [String(sessionId)]
    );

    const messages = messagesResult.rows.map((msg: any) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.created_at,
    }));

    // Parse orchestrator_plan if it's a string
    let orchestratorPlan = session.orchestrator_plan;
    if (typeof orchestratorPlan === 'string') {
      try {
        orchestratorPlan = JSON.parse(orchestratorPlan);
      } catch (e) {
        orchestratorPlan = null;
      }
    }

    await db.end();

    return res.status(200).json({
      id: session.id,
      user_id: session.user_id,
      status: session.status,
      ticket_key: session.ticket_key,
      jira_key: session.jira_key,
      approval_status: session.approval_status,
      orchestrator_plan: orchestratorPlan,
      messages,
      created_at: session.created_at,
      updated_at: session.updated_at,
    });
  } catch (err: any) {
    console.error('Session GET error:', err);
    return res.status(500).json({ error: 'SESSION_ERROR', message: err.message });
  }
};
