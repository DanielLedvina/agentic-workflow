import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'crypto';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-key-change-in-prod');
const JWT_EXPIRATION = '7d'; // 7 days
const REFRESH_TOKEN_EXPIRATION = '30d'; // 30 days

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'user' | 'senior_dev' | 'admin';
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT access token
 */
export async function generateAccessToken(userId: string, email: string, role: string): Promise<string> {
  const token = await new SignJWT({
    userId,
    email,
    role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Generate a refresh token (stored in DB)
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Verify JWT token
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    return verified.payload as JWTPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
