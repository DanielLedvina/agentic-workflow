import { sql } from '@vercel/postgres';

export const db = {
  query: sql,

  async getSession(sessionId: string) {
    const result = await sql`
      SELECT * FROM sessions WHERE id = $1
    `, [sessionId];
    return result.rows[0];
  },

  async createSession(data: any) {
    const result = await sql`
      INSERT INTO sessions (user_id, status, github_owner, github_repo)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [data.user_id, 'active', data.github_owner, data.github_repo];
    return result.rows[0];
  },

  async saveMessage(sessionId: string, role: string, content: string, metadata?: any) {
    const result = await sql`
      INSERT INTO messages (session_id, role, content, input_tokens, output_tokens)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      sessionId,
      role,
      content,
      metadata?.input_tokens || null,
      metadata?.output_tokens || null,
    ];
    return result.rows[0];
  },

  async getMessages(sessionId: string) {
    const result = await sql`
      SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC
    `, [sessionId];
    return result.rows;
  },

  async savePlan(sessionId: string, plan: any) {
    const result = await sql`
      UPDATE sessions SET orchestrator_plan = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(plan), sessionId];
    return result.rows[0];
  },

  async updateSessionStatus(sessionId: string, status: string) {
    const result = await sql`
      UPDATE sessions SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, sessionId];
    return result.rows[0];
  },

  async createCheckpointDecision(sessionId: string, difficulty: string, reason: string) {
    const result = await sql`
      INSERT INTO checkpoint_decisions (session_id, difficulty, reason)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [sessionId, difficulty, reason];
    return result.rows[0];
  },

  async updateCheckpointDecision(decisionId: string, humanDecision: string, userId?: string) {
    const result = await sql`
      UPDATE checkpoint_decisions
      SET human_decision = $1, decided_by_user_id = $2, decided_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [humanDecision, userId || null, decisionId];
    return result.rows[0];
  },

  async saveJiraTask(sessionId: string, jiraKey: string, jiraUrl: string) {
    const result = await sql`
      INSERT INTO jira_task_links (session_id, jira_key, jira_url)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [sessionId, jiraKey, jiraUrl];
    return result.rows[0];
  },

  async updateSessionPR(sessionId: string, prUrl: string, filesModified: number) {
    const result = await sql`
      UPDATE sessions SET pr_url = $1, files_modified = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [prUrl, filesModified, sessionId];
    return result.rows[0];
  },
};
