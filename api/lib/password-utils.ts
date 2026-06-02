import { createHash, randomBytes } from 'crypto';

const SALT_LENGTH = 32;

/**
 * Hash password with salt using PBKDF2-like approach (simplified).
 * For production, use bcrypt or argon2.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify plain password against hashed version
 */
export function verifyPassword(plainPassword: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  if (!salt || !hash) {
    return false;
  }

  const verifyHash = createHash('sha256').update(plainPassword + salt).digest('hex');
  return verifyHash === hash;
}
