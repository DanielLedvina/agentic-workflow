import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import axios from 'axios';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { sessionId, type } = req.body;

  if (!sessionId || !type) {
    return res.status(400).json({ error: 'INVALID_INPUT' });
  }

  try {
    // Get session
    const sessionResult = await sql`
      SELECT * FROM sessions WHERE id = $1
    `, [sessionId];

    if (!sessionResult.rows.length) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const session = sessionResult.rows[0];

    // Get Jira task
    const jiraResult = await sql`
      SELECT * FROM jira_task_links WHERE session_id = $1
    `, [sessionId];

    const jiraTask = jiraResult.rows[0];

    // Build message based on type
    let message = '';
    if (type === 'task_created') {
      message = `🎯 **New Task Created**\n\n📋 Task: ${jiraTask?.jira_key || 'Pending'}\n🔗 [View in Jira](${jiraTask?.jira_url || '#'})\n\n👤 Senior Dev Checkpoint: <@${process.env.DISCORD_SENIOR_USER_ID}>\nReview and decide: Easy task (auto-implement) or Hard task (take to IDE)\n🔗 [Review Checkpoint](https://agentic-workflow.vercel.app/checkpoint/${sessionId})`;
    } else if (type === 'pr_ready') {
      message = `✅ **PR Ready for Review**\n\n📋 Task: ${jiraTask?.jira_key}\n🔗 [View PR](${session.pr_url})\n\nAutomatically implemented based on your approval.`;
    } else if (type === 'hard_task') {
      message = `⚙️ **Hard Task - Ready for IDE**\n\n📋 Task: ${jiraTask?.jira_key}\n💻 Context prepared for your IDE\n🔗 [Continue in App](https://agentic-workflow.vercel.app/checkpoint/${sessionId})`;
    }

    if (!message) {
      return res.status(400).json({ error: 'INVALID_TYPE' });
    }

    // Send Discord DM
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const userId = process.env.DISCORD_SENIOR_USER_ID;

    // First, create DM channel
    const dmResponse = await axios.post(
      'https://discord.com/api/v10/users/@me/channels',
      { recipient_id: userId },
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    );

    const channelId = dmResponse.data.id;

    // Send message
    await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      { content: message },
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    );

    return res.status(200).json({ status: 'ok', message: 'Discord notification sent' });
  } catch (err) {
    console.error('Discord error:', err);
    return res.status(500).json({ error: 'DISCORD_ERROR', message: 'Failed to send Discord message' });
  }
};
