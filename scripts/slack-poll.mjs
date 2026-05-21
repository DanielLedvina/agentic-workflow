/**
 * Polls the Slack channel for approve/feedback replies since the last check.
 * Called by the slack-poll GitHub Actions workflow on a schedule.
 * Outputs: SLACK_ACTION (approve|feedback|none), SLACK_TICKET_KEY, SLACK_FEEDBACK_TEXT
 */

import { writeFileSync } from 'fs';

const {
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID,
  GITHUB_OUTPUT,
  JIRA_BASE_URL,
} = process.env;

if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL_ID) {
  console.error('Missing SLACK_BOT_TOKEN or SLACK_CHANNEL_ID');
  process.exit(1);
}

const slackHeaders = {
  Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
  'Content-Type': 'application/json',
};

// Look back 10 minutes to catch messages since last poll
const oldest = String(Math.floor(Date.now() / 1000) - 10 * 60);

const res = await fetch(
  `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL_ID}&oldest=${oldest}&limit=20`,
  { headers: slackHeaders }
);

const data = await res.json();

if (!data.ok) {
  console.error('Slack API error:', data.error);
  process.exit(1);
}

const messages = data.messages ?? [];
console.log(`Found ${messages.length} messages in last 10 minutes.`);

let action = 'none';
let ticketKey = '';
let feedbackText = '';

// Find the most recent bot message ticket key (from any time, not just last 10 min)
const recentBotTicket = await findLatestBotTicketKey();
console.log(`Latest bot ticket key: ${recentBotTicket}`);

for (const msg of messages.reverse()) {
  const text = (msg.text ?? '').trim();

  // Skip bot messages
  if (msg.bot_id) continue;

  if (text.toLowerCase() === 'approve' && recentBotTicket) {
    action = 'approve';
    ticketKey = recentBotTicket;
    console.log(`Found approve for ticket: ${ticketKey}`);
    break;
  }

  if (text.toLowerCase().startsWith('feedback:') && recentBotTicket) {
    action = 'feedback';
    ticketKey = recentBotTicket;
    feedbackText = text;
    console.log(`Found feedback for ticket: ${ticketKey} — ${feedbackText}`);
    break;
  }
}

// Write outputs for GitHub Actions
if (GITHUB_OUTPUT) {
  writeFileSync(GITHUB_OUTPUT, `SLACK_ACTION=${action}\nSLACK_TICKET_KEY=${ticketKey}\nSLACK_FEEDBACK_TEXT=${feedbackText.replace(/\n/g, ' ')}\n`, { flag: 'a' });
}

console.log(`Result: action=${action}, ticket=${ticketKey}`);

// ── Helpers ───────────────────────────────────────────────────────────────

async function findLatestBotTicketKey() {
  // Fetch more history to find the latest bot message with a ticket key
  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL_ID}&limit=50`,
    { headers: slackHeaders }
  );
  const data = await res.json();
  if (!data.ok) return '';

  for (const msg of (data.messages ?? [])) {
    if (!msg.bot_id) continue;
    // Check text field
    const textMatch = (msg.text ?? '').match(/([A-Z]+-\d+)/);
    if (textMatch) return textMatch[1];
    // Check blocks
    for (const block of (msg.blocks ?? [])) {
      const blockText = JSON.stringify(block);
      const blockMatch = blockText.match(/([A-Z]+-\d+)/);
      if (blockMatch) return blockMatch[1];
    }
  }
  return '';
}
