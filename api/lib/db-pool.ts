import { sql } from '@vercel/postgres';

/**
 * Vercel Postgres automatically manages connection pooling.
 * The `sql` import uses built-in connection pooling with 10 connections by default.
 *
 * For custom pooling or on-demand connections, use:
 * - `sql` for serverless functions (recommended)
 * - Custom Pool if you need more control
 */

export const dbPool = {
  /**
   * Raw query with parameterized inputs.
   * Always use parameterized queries to prevent SQL injection.
   */
  async query<T = any>(query: string, params?: any[]): Promise<T[]> {
    try {
      const result = await sql.query(query, params || []);
      return result.rows as T[];
    } catch (err: any) {
      console.error('Database query error:', err.message);
      throw new DatabaseError(`Query failed: ${err.message}`, 'DB_ERROR');
    }
  },

  /**
   * Get single row or null.
   */
  async getOne<T = any>(query: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(query, params);
    return rows[0] || null;
  },

  /**
   * Insert and return the created row.
   */
  async insert<T = any>(query: string, params?: any[]): Promise<T> {
    const rows = await this.query<T>(query, params);
    if (!rows[0]) throw new DatabaseError('Insert failed', 'DB_INSERT_ERROR');
    return rows[0];
  },

  /**
   * Update and return affected rows.
   */
  async update<T = any>(query: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(query, params);
    return rows[0] || null;
  },

  /**
   * Delete and return success.
   */
  async delete(query: string, params?: any[]): Promise<boolean> {
    await this.query(query, params);
    return true;
  },

  /**
   * Batch operations (for testing, not recommended in production serverless).
   * Each query counts against connection quota.
   */
  async batch(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    const results = [];
    for (const q of queries) {
      const rows = await this.query(q.sql, q.params);
      results.push(rows);
    }
    return results;
  },

  /**
   * Health check to ensure database is accessible.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await sql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
};

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string = 'DB_ERROR',
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}
