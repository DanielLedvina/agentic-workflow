import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { generateCode } from './lib/code-generator';
import { createPullRequest } from './lib/github';
import axios from 'axios';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'sessionId is required' });
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

    if (!session.orchestrator_plan) {
      return res.status(400).json({ error: 'NO_PLAN', message: 'No orchestrator plan found' });
    }

    // Get messages
    const messagesResult = await sql`
      SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC
    `, [sessionId];

    const messages = messagesResult.rows;

    // Get repo analysis from session
    const repoContext = session.repo_analysis ? JSON.parse(session.repo_analysis) : {};
    const plan = JSON.parse(session.orchestrator_plan);

    console.log(`Generating code for session ${sessionId}...`);

    // Generate code
    const codeResult = await generateCode(
      plan.summary || 'Implementation task',
      plan,
      messages,
      repoContext
    );

    // Create branch name from task
    const timestamp = Date.now();
    const branchName = `feat/task-${sessionId.substring(0, 8)}-${timestamp}`;

    console.log(`Creating PR with branch ${branchName}...`);

    // Create PR with generated files
    const prResult = await createPullRequest({
      title: plan.summary || 'Auto-implemented task',
      body: `## Task Implementation

**Summary:** ${plan.summary}

**Difficulty:** ${plan.difficulty}

**Session:** ${sessionId}

**Changes:**
${codeResult.files.map((f) => `- ${f.changeType} \`${f.path}\``).join('\n')}

${codeResult.notes ? `\n**Notes:** ${codeResult.notes}` : ''}

_Auto-generated implementation_`,
      branchName,
      files: codeResult.files,
    });

    // Update session with PR info
    await sql`
      UPDATE sessions
      SET pr_url = $1, approval_status = $2, updated_at = NOW()
      WHERE id = $3
    `, [prResult.prUrl, 'implemented', sessionId];

    // Send Discord notification - PR ready
    try {
      const botToken = process.env.DISCORD_BOT_TOKEN;
      const userId = process.env.DISCORD_SENIOR_USER_ID;

      if (botToken && userId) {
        const discordMessage = `✅ **PR Ready for Review**\n\n📋 Task: ${plan.summary}\n🔗 [View PR](${prResult.prUrl})\nPR #${prResult.prNumber}\n\nAuto-generated implementation is ready for your review and merge.`;

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

        console.log('Discord PR ready notification sent');
      }
    } catch (err) {
      console.error('Failed to send Discord notification:', err);
      // Don't fail the request if Discord fails
    }

    return res.status(200).json({
      success: true,
      prUrl: prResult.prUrl,
      prNumber: prResult.prNumber,
      branchName: prResult.branchName,
      filesChanged: codeResult.files.length,
    });
  } catch (err: any) {
    console.error('Implementation error:', err);
    return res.status(500).json({
      error: 'IMPLEMENTATION_ERROR',
      message: err.message || 'Failed to implement task',
    });
  }
};
