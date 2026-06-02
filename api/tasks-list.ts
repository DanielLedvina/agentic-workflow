import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    // Get all sessions with their orchestrator plans and task info
    const result = await sql`
      SELECT
        s.id,
        s.user_id,
        s.approval_status,
        s.orchestrator_plan,
        s.created_at,
        s.updated_at,
        jt.jira_key,
        jt.jira_url,
        u.name as created_by
      FROM sessions s
      LEFT JOIN jira_task_links jt ON s.id = jt.session_id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.approval_status IN ('pending', 'approved_easy', 'approved_hard', 'completed')
      ORDER BY s.updated_at DESC
    `;

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
        key: row.jira_key || `AGD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        summary: plan?.summary || 'No summary',
        status,
        priority: plan?.difficulty === 'hard' ? 'High' : 'Medium',
        assignee: row.created_by || 'Unassigned',
        type: 'Task',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        approval_status: row.approval_status,
        jiraUrl: row.jira_url,
        sessionId: row.id,
      };
    });

    return res.status(200).json({ tasks });
  } catch (err) {
    console.error('Tasks list error:', err);
    return res.status(500).json({ error: 'TASKS_LIST_ERROR', message: 'Failed to fetch tasks' });
  }
};
