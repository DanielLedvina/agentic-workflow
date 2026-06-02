import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbPool } from './lib/db-pool';

interface HealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  timestamp: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const dbHealthy = await dbPool.healthCheck();

    const response: HealthResponse = {
      status: dbHealthy ? 'ok' : 'degraded',
      database: dbHealthy,
      timestamp: new Date().toISOString(),
    };

    res.status(dbHealthy ? 200 : 503).json(response);
  } catch (err: any) {
    console.error('Health check error:', err.message);
    res.status(503).json({
      status: 'degraded',
      database: false,
      timestamp: new Date().toISOString(),
    });
  }
}
