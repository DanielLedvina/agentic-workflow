import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbPool } from '../lib/db-pool';
import { verifyJWT, extractToken } from '../lib/jwt-utils';
import { createHash } from 'crypto';

interface LogoutResponse {
  status: 'ok';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'POST required' });
  }

  try {
    // Extract token from Authorization header
    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing authentication token' });
    }

    // Verify JWT token
    const payload = await verifyJWT(token);

    if (!payload) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    }

    // Invalidate token by storing its hash in auth_tokens table
    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');

      await dbPool.insert(
        `INSERT INTO auth_tokens (user_id, token_hash, expires_at, invalidated_at, created_at)
         VALUES ($1, $2, NOW(), NOW(), NOW())
         ON CONFLICT (token_hash) DO UPDATE SET invalidated_at = NOW()`,
        [payload.userId, tokenHash],
      );
    } catch (err: any) {
      console.error('Token invalidation error:', err.message);
      // Don't fail logout; token will expire naturally
    }

    return res.status(200).json({ status: 'ok' } as LogoutResponse);
  } catch (err: any) {
    console.error('Logout error:', err.message);
    return res.status(500).json({ error: 'LOGOUT_ERROR', message: 'Failed to logout' });
  }
}
