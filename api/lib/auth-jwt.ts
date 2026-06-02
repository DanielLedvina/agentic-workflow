import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJWT, extractToken } from './jwt-utils';

export interface AuthenticatedRequest extends VercelRequest {
  user?: {
    userId: string;
    email: string;
    role: 'user' | 'senior_dev' | 'admin';
  };
}

/**
 * Middleware to verify JWT token and attach user to request
 */
export async function verifyAuth(req: AuthenticatedRequest, res: VercelResponse): Promise<boolean> {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    return false;
  }

  const payload = await verifyJWT(token);

  if (!payload) {
    return false;
  }

  req.user = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  };

  return true;
}

/**
 * Middleware wrapper for protected routes
 */
export function withAuth(handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    const isAuth = await verifyAuth(req, res);

    if (!isAuth) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing authentication token' });
    }

    return handler(req, res);
  };
}

/**
 * Middleware to check user role
 */
export function requireRole(allowedRoles: string[]) {
  return (handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>) => {
    return async (req: AuthenticatedRequest, res: VercelResponse) => {
      const isAuth = await verifyAuth(req, res);

      if (!isAuth) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing authentication token' });
      }

      if (!allowedRoles.includes(req.user?.role || '')) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
      }

      return handler(req, res);
    };
  };
}

/**
 * Middleware to check HTTP method
 */
export function withMethod(method: string) {
  return (handler: (req: VercelRequest, res: VercelResponse) => Promise<void>) => {
    return async (req: VercelRequest, res: VercelResponse) => {
      if (req.method !== method) {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: `${method} required` });
      }

      return handler(req, res);
    };
  };
}
