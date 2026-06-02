import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCookie, generateSessionId, successResponse, errorResponse } from '../lib/auth';
import { dbPool } from '../lib/db-pool';

interface CreateSessionRequest {
  // Optional: if user is known before session creation
  userId?: string;
  githubOwner?: string;
  githubRepo?: string;
}

interface SessionResponse {
  id: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  userId: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow authenticated users
  const sessionIdCookie = getCookie(req, 'session_id');
  if (!sessionIdCookie) {
    return errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
  }

  if (req.method === 'POST') {
    return handleCreateSession(req, res);
  }

  return errorResponse(res, 'METHOD_NOT_ALLOWED', 'POST required', 405);
}

async function handleCreateSession(req: VercelRequest, res: VercelResponse) {
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as CreateSessionRequest;

  try {
    const sessionId = generateSessionId();

    const session = await dbPool.insert(
      `INSERT INTO sessions (id, status, user_id, github_owner, github_repo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, status, created_at, updated_at, user_id`,
      [sessionId, 'active', body.userId || null, body.githubOwner || null, body.githubRepo || null],
    );

    return successResponse<SessionResponse>(res, {
      id: session.id,
      status: session.status,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      userId: session.user_id || null,
    });
  } catch (err: any) {
    console.error('Session creation error:', err.message);
    return errorResponse(res, 'SESSION_ERROR', 'Failed to create session', 500);
  }
}
