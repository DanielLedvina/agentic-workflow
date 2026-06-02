import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/postgres';
import axios from 'axios';

const db = createClient({ connectionString: process.env.POSTGRES_URL });

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { id: sessionId } = req.query as { id?: string };
  const { decision, notes } = req.body;

  if (!sessionId || !decision) {
    return res.status(400).json({ error: 'INVALID_INPUT' });
  }

  try {
    await db.connect();

    // Get session
    const sessionResult = await db.query(
      'SELECT * FROM sessions WHERE id = $1',
      [sessionId]
    );

    if (!sessionResult.rows.length) {
      await db.end();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const session = sessionResult.rows[0];

    // Update session approval_status
    if (decision === 'implement') {
      await db.query(
        'UPDATE sessions SET approval_status = $1, updated_at = NOW() WHERE id = $2',
        ['approved_easy', sessionId]
      );
    } else if (decision === 'escalate') {
      await db.query(
        'UPDATE sessions SET approval_status = $1, updated_at = NOW() WHERE id = $2',
        ['approved_hard', sessionId]
      );
    }

    // Get Jira info
    const jiraResult = await db.query(
      'SELECT * FROM jira_task_links WHERE session_id = $1 LIMIT 1',
      [sessionId]
    );

    const jiraTask = jiraResult.rows[0];

    // Send Discord notification
    try {
      await sendDiscordNotification(sessionId, decision, session, jiraTask);
    } catch (discordErr) {
      console.error('Failed to send Discord notification:', discordErr);
      // Don't fail the response
    }

    // If easy → implement, if hard → prepare context
    if (decision === 'implement') {
      return res.status(200).json({
        status: 'ok',
        message: 'Approved for auto-implementation',
        nextAction: 'implementing',
      });
    } else if (decision === 'escalate') {
      return res.status(200).json({
        status: 'ok',
        message: 'Escalated to IDE',
        nextAction: 'copy_to_ide',
      });
    } else if (decision === 'cancel') {
      await db.query(
        'UPDATE sessions SET approval_status = $1, updated_at = NOW() WHERE id = $2',
        ['cancelled', sessionId]
      );

      await db.end();
      return res.status(200).json({
        status: 'ok',
        message: 'Task cancelled',
        nextAction: 'cancelled',
      });
    }

    await db.end();
  } catch (err) {
    console.error('Checkpoint decision error:', err);
    return res.status(500).json({ error: 'CHECKPOINT_ERROR' });
  }
};

async function sendDiscordNotification(
  sessionId: string,
  decision: string,
  session: any,
  jiraTask: any
): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const userId = process.env.DISCORD_SENIOR_USER_ID;

  if (!botToken || !userId) {
    console.warn('Discord credentials not configured');
    return;
  }

  let message = '';
  const jiraKey = jiraTask?.jira_key || 'AGD-???';
  const jiraUrl = jiraTask?.jira_url || '#';

  if (decision === 'implement') {
    message = `✅ **Task Approved for Auto-Implementation**\n\n📋 Task: ${jiraKey}\n🔗 [View in Jira](${jiraUrl})\n\nOrchestrator will now generate code and create a PR. Monitor for PR ready notification.`;
  } else if (decision === 'escalate') {
    message = `📤 **Task Escalated to IDE**\n\n📋 Task: ${jiraKey}\n🔗 [View in Jira](${jiraUrl})\n💻 Context prepared and ready in the app\n\nProceed to IDE for implementation.`;
  } else if (decision === 'cancel') {
    message = `❌ **Task Cancelled**\n\n📋 Task: ${jiraKey}\n🔗 [View in Jira](${jiraUrl})`;
  }

  if (!message) return;

  try {
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
      { content: message },
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    );

    console.log(`Discord notification sent for decision: ${decision}`);
  } catch (err) {
    console.error('Discord API error:', err);
    throw err;
  }
}
