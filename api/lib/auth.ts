import { createHmac, randomBytes } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SESSION_COOKIE_NAME = 'session_id';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  maxAge?: number;
  path?: string;
  domain?: string;
}

export function setCookie(res: VercelResponse, name: string, value: string, opts: CookieOptions = {}): void {
  const defaults = {
    httpOnly: true,
    secure: process.env.VERCEL_ENV === 'production',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };

  const options = { ...defaults, ...opts };
  let cookieStr = `${name}=${encodeURIComponent(value)}`;

  if (options.maxAge) cookieStr += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
  if (options.path) cookieStr += `; Path=${options.path}`;
  if (options.domain) cookieStr += `; Domain=${options.domain}`;
  if (options.httpOnly) cookieStr += '; HttpOnly';
  if (options.secure) cookieStr += '; Secure';
  if (options.sameSite) cookieStr += `; SameSite=${options.sameSite}`;

  res.setHeader('Set-Cookie', cookieStr);
}

export function clearCookie(res: VercelResponse, name: string): void {
  setCookie(res, name, '', { maxAge: 0 });
}

export function getCookie(req: VercelRequest, name: string): string | null {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').find(c => c.trim().startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.split('=')[1]);
}

/**
 * Hash password using HMAC-SHA256 with app-level salt.
 * For production, use bcrypt or argon2. This is simple enough for demo auth.
 */
export function hashPassword(password: string): string {
  const salt = process.env.PASSWORD_SALT || 'default-salt-change-in-prod';
  return createHmac('sha256', salt).update(password).digest('hex');
}

/**
 * Compare plain password against hashed version.
 */
export function comparePassword(plain: string, hashed: string): boolean {
  return hashPassword(plain) === hashed;
}

/**
 * Generate secure random session ID.
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate session status transitions.
 * Allowed transitions: active -> completed | paused | failed
 */
export function validateStatusTransition(from: string, to: string): { valid: boolean; error?: string } {
  const allowedTransitions: Record<string, string[]> = {
    active: ['completed', 'paused', 'failed'],
    paused: ['active', 'completed'],
    completed: [],
    failed: [],
  };

  if (!allowedTransitions[from]?.includes(to)) {
    return { valid: false, error: `Cannot transition from ${from} to ${to}` };
  }

  return { valid: true };
}

/**
 * Standard error response format.
 */
export function errorResponse(res: VercelResponse, code: string, message: string, statusCode = 400): void {
  res.status(statusCode).json({ error: code, message });
}

/**
 * Success response wrapper.
 */
export function successResponse<T>(res: VercelResponse, data: T, statusCode = 200): void {
  res.status(statusCode).json(data);
}
