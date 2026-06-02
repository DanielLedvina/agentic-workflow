import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbPool } from '../../lib/db-pool';
import { verifyJWT, extractToken } from '../../lib/jwt-utils';

interface LinkDiscordRequest {
  discord_user_id: string;
  discord_username: string;
}

interface UnlinkDiscordResponse {
  success: boolean;
  message?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // Handle POST - Link Discord account
    if (req.method === 'POST') {
      const { discord_user_id, discord_username } = req.body as LinkDiscordRequest;

      if (!discord_user_id || !discord_username) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'discord_user_id and discord_username are required',
        });
      }

      // Check if Discord ID is already linked to another user
      const existingUser = await dbPool.getOne(
        `SELECT id FROM users WHERE discord_user_id = $1 AND id != $2`,
        [discord_user_id, payload.userId],
      );

      if (existingUser) {
        return res.status(409).json({
          error: 'DISCORD_ALREADY_LINKED',
          message: 'This Discord account is already linked to another user',
        });
      }

      // Update user with Discord ID
      const updatedUser = await dbPool.update(
        `UPDATE users
         SET discord_user_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, email, role, discord_user_id, created_at`,
        [discord_user_id, payload.userId],
      );

      if (!updatedUser) {
        return res.status(500).json({
          error: 'UPDATE_FAILED',
          message: 'Failed to link Discord account',
        });
      }

      // Log audit entry
      await dbPool.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          payload.userId,
          'discord_linked',
          'user',
          payload.userId,
          JSON.stringify({
            discord_user_id,
            discord_username,
          }),
        ],
      );

      return res.status(200).json({
        success: true,
        message: 'Discord account linked successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          discord_user_id: updatedUser.discord_user_id,
          created_at: updatedUser.created_at,
        },
      });
    }

    // Handle DELETE - Unlink Discord account
    if (req.method === 'DELETE') {
      // Update user to remove Discord ID
      const updatedUser = await dbPool.update(
        `UPDATE users
         SET discord_user_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, email, role, discord_user_id, created_at`,
        [payload.userId],
      );

      if (!updatedUser) {
        return res.status(500).json({
          error: 'UPDATE_FAILED',
          message: 'Failed to unlink Discord account',
        });
      }

      // Log audit entry
      await dbPool.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
         VALUES ($1, $2, $3, $4)`,
        [payload.userId, 'discord_unlinked', 'user', payload.userId],
      );

      return res.status(200).json({
        success: true,
        message: 'Discord account unlinked successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          discord_user_id: updatedUser.discord_user_id,
          created_at: updatedUser.created_at,
        },
      } as any);
    }

    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'POST and DELETE methods are supported',
    });
  } catch (err: any) {
    console.error('Discord linking error:', err.message);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to process Discord request',
    });
  }
}
