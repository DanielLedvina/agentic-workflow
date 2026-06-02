import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/postgres';
import axios from 'axios';

const db = createClient({ connectionString: process.env.POSTGRES_URL });

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { sessionId, title } = req.body;

  if (!sessionId || !title) {
    return res.status(400).json({ error: 'INVALID_INPUT' });
  }

  try {
    await db.connect();

    // Get session to retrieve conversation
    const sessionResult = await db.query(
      'SELECT * FROM sessions WHERE id = $1',
      [sessionId]
    );

    if (!sessionResult.rows.length) {
      await db.end();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const session = sessionResult.rows[0];

    // Get messages
    const messagesResult = await db.query(
      'SELECT content FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );

    const messages = messagesResult.rows;
    const conversationSummary = messages
      .slice(-4) // Last 4 messages for context
      .map((m: any) => m.content)
      .join('\n\n');

    // Create Jira task
    const jiraAuth = Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    const jiraResponse = await axios.post(
      `${process.env.JIRA_BASE_URL}/rest/api/2/issue`,
      {
        fields: {
          project: { key: process.env.JIRA_PROJECT_KEY },
          summary: title,
          description: `Orchestrator Plan:\n${session.orchestrator_plan ? JSON.stringify(session.orchestrator_plan, null, 2) : 'N/A'}\n\nRecent Context:\n${conversationSummary}`,
          issuetype: { name: 'Task' },
        },
      },
      {
        headers: {
          Authorization: `Basic ${jiraAuth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const ticketKey = jiraResponse.data.key;
    const ticketUrl = `${process.env.JIRA_BASE_URL}/browse/${ticketKey}`;

    // Store in DB
    await db.query(
      'INSERT INTO jira_task_links (session_id, jira_key, jira_url) VALUES ($1, $2, $3)',
      [sessionId, ticketKey, ticketUrl]
    );

    await db.end();

    // Send Discord notification to senior dev
    try {
      const discordMessage = `🎯 **New Task Created**\n\n📋 Task: ${ticketKey}\n📝 Title: ${title}\n🔗 [View in Jira](${ticketUrl})\n\n👤 Senior Dev Checkpoint: <@${process.env.DISCORD_SENIOR_USER_ID}>\nReview and decide: Easy task (auto-implement) or Hard task (take to IDE)\n🔗 [Review Checkpoint](https://agentic-workflow.vercel.app/checkpoint/${sessionId})`;

      const botToken = process.env.DISCORD_BOT_TOKEN;
      const userId = process.env.DISCORD_SENIOR_USER_ID;

      // Create DM channel
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
        { content: discordMessage },
        {
          headers: {
            Authorization: `Bot ${botToken}`,
          },
        }
      );

      console.log(`Discord notification sent for ${ticketKey}`);
    } catch (discordErr) {
      console.error('Failed to send Discord notification:', discordErr);
      // Don't fail the request if Discord fails
    }

    return res.status(201).json({
      ticketKey,
      ticketUrl,
    });
  } catch (err: any) {
    console.error('Jira error:', err);
    console.error('Jira error details:', err.message, err.response?.data || err.toString());
    return res.status(500).json({ error: 'JIRA_ERROR', message: err.message, details: err.response?.data || err.toString() });
  }
};
