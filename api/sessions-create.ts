import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { withAuth } from './lib/auth-jwt';

interface CreateSessionRequest {
  ticket_key?: string;
  github_owner?: string;
  github_repo?: string;
  github_branch?: string;
}

interface CreateSessionResponse {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  messages: any[];
  orchestrator_plan: null;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'POST required' });
  }

  try {
    const userId = (req as any).user?.userId;
    const { ticket_key, github_owner, github_repo, github_branch } = req.body as CreateSessionRequest;

    const sessionId = crypto.randomUUID();

    // Create new session in DB linked to user
    const result = await sql`
      INSERT INTO sessions (
        id, user_id, status, ticket_key, github_owner, github_repo, github_branch,
        created_at, updated_at
      )
      VALUES ($1, $2, 'active', $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, user_id, status, created_at
    `, [sessionId, userId, ticket_key || null, github_owner || null, github_repo || null, github_branch || null];

    const session = result.rows[0];

    return res.status(201).json({
      id: session.id,
      user_id: session.user_id,
      status: session.status,
      created_at: session.created_at,
      messages: [],
      orchestrator_plan: null,
    } as CreateSessionResponse);
  } catch (err: any) {
    console.error('Session creation error:', err.message);
    return res.status(500).json({ error: 'DB_ERROR', message: 'Failed to create session' });
  }
}

export default withAuth(handler);
