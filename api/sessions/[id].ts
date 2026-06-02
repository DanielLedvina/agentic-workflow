import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCookie, validateStatusTransition, successResponse, errorResponse } from '../lib/auth';
import { dbPool } from '../lib/db-pool';

interface SessionDetail {
  id: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }>;
  plan?: any;
}

interface UpdateSessionRequest {
  status?: 'active' | 'paused' | 'completed' | 'failed';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Require authentication
  const sessionIdCookie = getCookie(req, 'session_id');
  if (!sessionIdCookie) {
    return errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
  }

  const { id } = req.query as { id: string };
  if (!id) {
    return errorResponse(res, 'MISSING_ID', 'Session ID required', 400);
  }

  if (req.method === 'GET') {
    return handleGetSession(id, res);
  }

  if (req.method === 'PATCH') {
    return handleUpdateSession(id, req, res);
  }

  return errorResponse(res, 'METHOD_NOT_ALLOWED', 'GET, PATCH required', 405);
}

async function handleGetSession(sessionId: string, res: VercelResponse) {
  try {
    // Get session
    const session = await dbPool.getOne(
      'SELECT id, status, created_at, updated_at, user_id, orchestrator_plan FROM sessions WHERE id = $1',
      [sessionId],
    );

    if (!session) {
      return errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
    }

    // Get messages
    const messages = await dbPool.query(
      `SELECT id, role, content, created_at, input_tokens, output_tokens
       FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId],
    );

    const detail: SessionDetail = {
      id: session.id,
      status: session.status,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      userId: session.user_id || null,
      messages: messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        inputTokens: m.input_tokens,
        outputTokens: m.output_tokens,
      })),
    };

    if (session.orchestrator_plan) {
      detail.plan = typeof session.orchestrator_plan === 'string'
        ? JSON.parse(session.orchestrator_plan)
        : session.orchestrator_plan;
    }

    return successResponse<SessionDetail>(res, detail);
  } catch (err: any) {
    console.error('Get session error:', err.message);
    return errorResponse(res, 'QUERY_ERROR', 'Failed to retrieve session', 500);
  }
}

async function handleUpdateSession(sessionId: string, req: VercelRequest, res: VercelResponse) {
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as UpdateSessionRequest;

  if (!body.status) {
    return errorResponse(res, 'MISSING_STATUS', 'status is required', 400);
  }

  try {
    // Get current session
    const current = await dbPool.getOne('SELECT status FROM sessions WHERE id = $1', [sessionId]);

    if (!current) {
      return errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
    }

    // Validate transition
    const transition = validateStatusTransition(current.status, body.status);
    if (!transition.valid) {
      return errorResponse(res, 'INVALID_TRANSITION', transition.error || '', 400);
    }

    // Update status
    const updated = await dbPool.update(
      'UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status, updated_at, created_at, user_id',
      [body.status, sessionId],
    );

    return successResponse(res, {
      id: updated.id,
      status: updated.status,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      userId: updated.user_id || null,
    });
  } catch (err: any) {
    console.error('Update session error:', err.message);
    return errorResponse(res, 'UPDATE_ERROR', 'Failed to update session', 500);
  }
}
