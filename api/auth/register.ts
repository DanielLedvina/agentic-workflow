import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbPool } from '../lib/db-pool';
import { hashPassword } from '../lib/password-utils';
import { generateAccessToken } from '../lib/jwt-utils';

interface RegisterRequest {
  email: string;
  password: string;
  role?: 'user' | 'senior_dev' | 'admin';
  discord_user_id?: string;
}

interface RegisterResponse {
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
    const { email, password, role = 'user', discord_user_id } = req.body as RegisterRequest;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'INVALID_PASSWORD', message: 'Password must be at least 8 characters' });
    }

    if (!['user', 'senior_dev', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'INVALID_ROLE', message: 'Invalid role' });
    }

    // Check if user already exists
    const existing = await dbPool.getOne(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    if (existing) {
      return res.status(409).json({ error: 'USER_EXISTS', message: 'Email already registered' });
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Create user
    const user = await dbPool.insert(
      `INSERT INTO users (email, password_hash, role, discord_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, email, role`,
      [email, passwordHash, role, discord_user_id || null],
    );

    // Generate JWT token
    const token = await generateAccessToken(user.id, user.email, user.role);

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token,
    } as RegisterResponse);
  } catch (err: any) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'REGISTER_ERROR', message: 'Failed to create account' });
  }
}
