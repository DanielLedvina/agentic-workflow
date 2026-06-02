import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { generateIDEContext, formatContextForIDE, formatContextForJira } from './lib/context-generator';
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
    console.log(`Generating context for session ${sessionId}...`);

    // Get session to find Jira ticket
    const sessionResult = await sql`
      SELECT * FROM sessions WHERE id = $1
    `, [sessionId];

    if (!sessionResult.rows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Generate context
    const context = await generateIDEContext(sessionId);
    const ideContext = formatContextForIDE(context);
    const jiraContext = formatContextForJira(context);

    // Update Jira description if ticket exists
    if (session.jira_key) {
      try {
        await updateJiraDescription(session.jira_key, jiraContext);
        console.log(`Updated Jira ticket ${session.jira_key}`);
      } catch (err) {
        console.error('Failed to update Jira:', err);
        // Don't fail the response if Jira update fails
      }
    }

    return res.status(200).json({
      success: true,
      context: ideContext,
      jiraKey: session.jira_key,
    });
  } catch (err: any) {
    console.error('Context generation error:', err);
    return res.status(500).json({
      error: 'CONTEXT_GENERATION_ERROR',
      message: err.message || 'Failed to generate context',
    });
  }
};

async function updateJiraDescription(jiraKey: string, context: string): Promise<void> {
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  const jiraBaseUrl = process.env.JIRA_BASE_URL;

  if (!jiraEmail || !jiraToken || !jiraBaseUrl) {
    throw new Error('Jira credentials not configured');
  }

  const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');

  // First, get current issue to preserve existing description
  const getResponse = await axios.get(`${jiraBaseUrl}/rest/api/3/issues/${jiraKey}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  const currentDescription = getResponse.data.fields.description || {};

  // Append context to existing description
  const updatedDescription = {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'IDE Implementation Context:\n\n',
            marks: [{ type: 'strong' }],
          },
        ],
      },
      {
        type: 'codeBlock',
        attrs: { language: 'markdown' },
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      },
    ],
  };

  // Update issue
  await axios.put(
    `${jiraBaseUrl}/rest/api/3/issues/${jiraKey}`,
    {
      fields: {
        description: updatedDescription,
      },
    },
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log(`Updated Jira issue ${jiraKey} with context`);
}
