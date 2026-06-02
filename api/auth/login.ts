import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { verifyPassword } from '../lib/password-utils';
import { generateAccessToken } from '../lib/jwt-utils';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
  };
  token: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'POST required' });
  }

  try {
    const { email, password } = req.body as LoginRequest;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Email and password are required' });
    }

    // Fetch user
    const result = await sql`
      SELECT id, email, password_hash, role FROM users WHERE email = $1
    `, [email];

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    // Verify password
    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = await generateAccessToken(user.id, user.email, user.role);

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token,
    } as LoginResponse);
  } catch (err: any) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'LOGIN_ERROR', message: 'Failed to authenticate' });
  }
}
