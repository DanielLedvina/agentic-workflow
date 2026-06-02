import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

export default async (req: VercelRequest, res: VercelResponse) => {
  // Protect migration endpoint
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { key } = req.body;

  // Simple auth - must pass correct key
  if (key !== process.env.MIGRATION_KEY) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    console.log('Running database migrations...');

    // Migration 1: Add approval_status and repo_analysis columns
    console.log('Adding approval_status column...');
    await sql`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'pending'
    `;

    console.log('Adding repo_analysis column...');
    await sql`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS repo_analysis TEXT
    `;

    console.log('Creating indexes...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sessions_approval_status ON sessions(approval_status)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC)
    `;

    console.log('Updating existing data...');
    await sql`
      UPDATE sessions SET approval_status = 'completed'
      WHERE approval_status IS NULL AND orchestrator_plan IS NOT NULL
    `;

    await sql`
      UPDATE sessions SET approval_status = 'pending'
      WHERE approval_status IS NULL
    `;

    return res.status(200).json({
      success: true,
      message: 'Migrations completed successfully',
    });
  } catch (err: any) {
    console.error('Migration error:', err);
    return res.status(500).json({
      error: 'MIGRATION_ERROR',
      message: err.message,
    });
  }
};
