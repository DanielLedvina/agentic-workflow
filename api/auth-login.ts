import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Password is required' });
  }

  // Simple password auth (APP_PASSWORD from env)
  const appPassword = process.env.APP_PASSWORD || 'Signosoft1974';
  if (password !== appPassword) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid password' });
  }

  // Create or get session
  try {
    const sessionId = crypto.randomUUID();

    // Store session in DB (simple approach)
    await sql`
      INSERT INTO sessions (id, status, created_at, updated_at)
      VALUES ($1, 'active', NOW(), NOW())
    `, [sessionId];

    // Set httpOnly cookie
    res.setHeader('Set-Cookie', [
      `sessionId=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`,
    ]);

    return res.status(200).json({
      status: 'ok',
      sessionId,
      message: 'Authenticated successfully',
    });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'AUTH_ERROR', message: 'Failed to authenticate' });
  }
};
