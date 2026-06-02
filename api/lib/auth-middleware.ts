import { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-key');

export async function verifyAuth(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    return verified.payload.sessionId as string;
  } catch (err) {
    return null;
  }
}

export function createJWT(sessionId: string): string {
  // Simple JWT creation (use jose library)
  // For production, use proper JWT library
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sessionId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  }));

  // HMAC signature (simplified for demo)
  const signature = Buffer.from('mock-signature').toString('base64');

  return `${header}.${payload}.${signature}`;
}

export function withAuth(handler: (req: VercelRequest, res: VercelResponse, sessionId: string) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const sessionId = await verifyAuth(req, res);
    if (!sessionId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing authentication' });
    }

    return handler(req, res, sessionId);
  };
}

export function withMethod(method: string, handler: (req: VercelRequest, res: VercelResponse) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== method) {
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    return handler(req, res);
  };
}
