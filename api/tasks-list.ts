import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/postgres';

const db = createClient({ connectionString: process.env.POSTGRES_URL });

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    await db.connect();

    // Get all sessions with their orchestrator plans and task info
    const result = await db.query(`
      SELECT
        s.id,
        s.user_id,
        s.approval_status,
        s.orchestrator_plan,
        s.created_at,
        s.updated_at,
        jt.jira_key,
        jt.jira_url
      FROM sessions s
      LEFT JOIN jira_task_links jt ON s.id = jt.session_id
      WHERE s.approval_status IN ('pending', 'approved_easy', 'approved_hard', 'completed', 'implemented')
      ORDER BY s.updated_at DESC
    `);

    const tasks = result.rows.map((row: any) => {
      const plan = row.orchestrator_plan ? JSON.parse(row.orchestrator_plan) : null;
      let status = 'To Do';

      if (row.approval_status === 'pending') {
        status = 'Waiting for Approve';
      } else if (row.approval_status === 'approved_easy' || row.approval_status === 'approved_hard') {
        status = 'In Progress';
      } else if (row.approval_status === 'completed') {
        status = 'Done';
      }

      return {
        id: row.id,
        jira_key: row.jira_key,
        jira_url: row.jira_url,
        pr_url: null,
        approval_status: row.approval_status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        sessionId: row.id,
      };
    });

    await db.end();
    return res.status(200).json({ tasks });
  } catch (err: any) {
    console.error('Tasks list error:', err);
    return res.status(500).json({ error: 'TASKS_LIST_ERROR', message: err.message });
  }
};
