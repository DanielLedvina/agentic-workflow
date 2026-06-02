import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/postgres';
import { generateCode } from './lib/code-generator';
import { createPullRequest } from './lib/github';
import axios from 'axios';

const db = createClient({ connectionString: process.env.POSTGRES_URL });

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'sessionId is required' });
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

    if (!session.orchestrator_plan) {
      await db.end();
      return res.status(400).json({ error: 'NO_PLAN', message: 'No orchestrator plan found' });
    }

    // Get messages
    const messagesResult = await db.query(
      'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );

    const messages = messagesResult.rows;

    // Get repo analysis from session
    const repoContext = session.repo_analysis ? JSON.parse(session.repo_analysis) : {};
    const plan = JSON.parse(session.orchestrator_plan);

    console.log(`Generating code for session ${sessionId}...`);

    // Generate code
    let codeResult;
    try {
      codeResult = await generateCode(
        plan.summary || 'Implementation task',
        plan,
        messages,
        repoContext
      );
      console.log('Code generation successful:', codeResult.files.length, 'files');
    } catch (err: any) {
      console.error('Code generation failed:', err.message);
      await db.end();
      return res.status(500).json({
        error: 'CODE_GENERATION_ERROR',
        message: err.message,
        details: err.toString(),
      });
    }

    // Create branch name from task
    const timestamp = Date.now();
    const branchName = `feat/task-${sessionId.substring(0, 8)}-${timestamp}`;

    console.log(`Creating PR with branch ${branchName}...`);

    // Create PR with generated files
    let prResult;
    try {
      prResult = await createPullRequest({
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
      console.log('PR created successfully:', prResult.prUrl);
    } catch (err: any) {
      console.error('PR creation failed:', err.message, err.response?.data);
      await db.end();
      return res.status(500).json({
        error: 'PR_CREATION_ERROR',
        message: err.message,
        details: err.response?.data || err.toString(),
      });
    }

    // Update session with PR info
    await db.query(
      'UPDATE sessions SET pr_url = $1, approval_status = $2, updated_at = NOW() WHERE id = $3',
      [prResult.prUrl, 'implemented', sessionId]
    );

    await db.end();

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
    console.error('Stack:', err.stack);
    return res.status(500).json({
      error: 'IMPLEMENTATION_ERROR',
      message: err.message || 'Failed to implement task',
      details: err.toString(),
    });
  }
};
