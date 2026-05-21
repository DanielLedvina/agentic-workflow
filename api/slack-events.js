/**
 * Vercel serverless function — receives Slack Events API events.
 * Slack sends an event immediately when a message is posted in the channel.
 * We look for "approve" or "feedback: ..." and trigger the appropriate GitHub dispatch.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // Slack URL verification challenge (first-time setup)
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // Only handle message events
  if (body.type !== 'event_callback' || body.event?.type !== 'message') {
    return res.status(200).json({ ok: true });
  }

  const event = body.event;

  // Skip bot messages and message edits/deletes
  if (event.bot_id || event.subtype) {
    return res.status(200).json({ ok: true });
  }

  const text = (event.text ?? '').trim();
  const GH_PAT = process.env.GH_PAT;
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO ?? 'DanielLedvina/agentic-workflow';

  if (!GH_PAT) {
    console.error('Missing GH_PAT env var');
    return res.status(500).json({ error: 'Missing GH_PAT' });
  }

  // Find latest ticket key from channel history
  const ticketKey = await findLatestTicketKey(event.channel, SLACK_BOT_TOKEN);
  if (!ticketKey) {
    console.log('No ticket key found in channel history, ignoring message.');
    return res.status(200).json({ ok: true });
  }

  let eventType = null;
  let payload = { ticket_key: ticketKey };

  if (text.toLowerCase() === 'approve') {
    eventType = 'jira-approved';
    console.log(`approve → ${ticketKey}`);
  } else if (text.toLowerCase().startsWith('feedback:')) {
    eventType = 'jira-feedback';
    payload.feedback = text;
    console.log(`feedback → ${ticketKey}: ${text}`);
  }

  if (!eventType) {
    return res.status(200).json({ ok: true });
  }

  // Trigger GitHub dispatch
  const ghRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    }
  );

  if (ghRes.ok || ghRes.status === 204) {
    console.log(`Dispatched ${eventType} for ${ticketKey}`);
    return res.status(200).json({ ok: true, dispatched: eventType });
  } else {
    const err = await ghRes.text();
    console.error(`GitHub dispatch failed: ${ghRes.status} ${err}`);
    return res.status(500).json({ error: err });
  }
}

async function findLatestTicketKey(channel, botToken) {
  if (!botToken) return '';
  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${channel}&limit=50`,
    { headers: { Authorization: `Bearer ${botToken}` } }
  );
  const data = await res.json();
  if (!data.ok) return '';

  for (const msg of (data.messages ?? [])) {
    if (!msg.bot_id) continue;
    const text = msg.text ?? '';
    const match = text.match(/([A-Z]+-\d+)/);
    if (match) return match[1];
    for (const block of (msg.blocks ?? [])) {
      const blockMatch = JSON.stringify(block).match(/([A-Z]+-\d+)/);
      if (blockMatch) return blockMatch[1];
    }
  }
  return '';
}
