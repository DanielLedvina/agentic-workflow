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

for (const msg of messages.reverse()) {
  const text = (msg.text ?? '').trim();

  // Skip bot messages
  if (msg.bot_id) continue;

  if (text.toLowerCase() === 'approve') {
    // Find the ticket key from the most recent bot message before this
    ticketKey = extractTicketKeyFromHistory(messages, msg.ts);
    if (ticketKey) {
      action = 'approve';
      console.log(`Found approve for ticket: ${ticketKey}`);
      break;
    }
  }

  if (text.toLowerCase().startsWith('feedback:')) {
    ticketKey = extractTicketKeyFromHistory(messages, msg.ts);
    if (ticketKey) {
      action = 'feedback';
      feedbackText = text;
      console.log(`Found feedback for ticket: ${ticketKey} — ${feedbackText}`);
      break;
    }
  }
}

// Write outputs for GitHub Actions
if (GITHUB_OUTPUT) {
  writeFileSync(GITHUB_OUTPUT, `SLACK_ACTION=${action}\nSLACK_TICKET_KEY=${ticketKey}\nSLACK_FEEDBACK_TEXT=${feedbackText.replace(/\n/g, ' ')}\n`, { flag: 'a' });
}

console.log(`Result: action=${action}, ticket=${ticketKey}`);

// ── Helpers ───────────────────────────────────────────────────────────────

function extractTicketKeyFromHistory(messages, beforeTs) {
  // Look for the most recent bot message before this timestamp that contains a ticket key
  const botMessages = messages.filter(m => m.bot_id && m.ts < beforeTs);
  for (const msg of botMessages.reverse()) {
    const text = msg.text ?? '';
    const match = text.match(/([A-Z]+-\d+)/);
    if (match) return match[1];
  }
  return '';
}
