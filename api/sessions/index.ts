import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const sessionId = randomUUID();

    // DEV MODE: Return mock session without DB
    return res.status(201).json({
      id: sessionId,
      status: 'active',
      created_at: new Date().toISOString(),
      messages: [],
      orchestrator_plan: null,
    });
  } catch (err: any) {
    console.error('Session creation error:', err);
    return res.status(500).json({ error: 'SESSION_ERROR', message: 'Failed to create session' });
  }
};
