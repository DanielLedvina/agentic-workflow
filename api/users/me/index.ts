import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJWT, extractToken } from '../../lib/jwt-utils';
import { dbPool } from '../../lib/db-pool';

interface UserResponse {
  id: string;
  email: string;
  role: string;
  discord_user_id?: string;
  created_at: string;
}

/**
 * GET /api/users/me - Get current authenticated user profile
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'GET required' });
  }

  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing authentication token' });
    }

    const payload = await verifyJWT(token);

    if (!payload) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    }

    const user = await dbPool.getOne<UserResponse>(
      `SELECT id, email, role, discord_user_id, created_at FROM users WHERE id = $1`,
      [payload.userId],
    );

    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        discord_user_id: user.discord_user_id,
        created_at: user.created_at,
      },
    });
  } catch (err: any) {
    console.error('Get user error:', err.message);
    return res.status(500).json({ error: 'GET_USER_ERROR', message: 'Failed to fetch user' });
  }
}
