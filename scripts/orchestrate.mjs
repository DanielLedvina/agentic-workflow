import Anthropic from '@anthropic-ai/sdk';
import { Langfuse } from 'langfuse';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  ANTHROPIC_API_KEY,
  LANGFUSE_SECRET_KEY,
  LANGFUSE_PUBLIC_KEY,
  LANGFUSE_BASE_URL,
  SLACK_WEBHOOK_URL,
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL,
  TICKET_KEY,
  FEEDBACK_COMMENT,
} = process.env;

if (!TICKET_KEY) {
  console.error('Missing TICKET_KEY');
  process.exit(1);
}

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
const jiraHeaders = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' };

// ── Langfuse setup ────────────────────────────────────────────────────────

const langfuse = new Langfuse({
  secretKey: LANGFUSE_SECRET_KEY,
  publicKey: LANGFUSE_PUBLIC_KEY,
  baseUrl: LANGFUSE_BASE_URL,
});

const trace = langfuse.trace({
  name: 'orchestrate',
  userId: JIRA_EMAIL,
  metadata: { ticketKey: TICKET_KEY },
  tags: ['agentic-workflow'],
});

// ── 1. Fetch Jira ticket ──────────────────────────────────────────────────

const jiraSpan = trace.span({ name: 'fetch-jira-ticket', input: { ticketKey: TICKET_KEY } });

const jiraRes = await fetch(
  `${JIRA_BASE_URL}/rest/api/3/issue/${TICKET_KEY}`,
  { headers: jiraHeaders }
);

if (!jiraRes.ok) {
  const err = await jiraRes.text();
  jiraSpan.end({ output: { error: err }, level: 'ERROR' });
  await langfuse.flushAsync();
  console.error(`Jira API error: ${jiraRes.status} ${err}`);
  process.exit(1);
}

const issue = await jiraRes.json();
const summary = issue.fields.summary;
const description = extractDescription(issue.fields.description);
const issueType = issue.fields.issuetype.name;
const priority = issue.fields.priority?.name ?? 'Medium';
const reporterEmail = issue.fields.reporter?.emailAddress;

jiraSpan.end({ output: { summary, issueType, priority, reporterEmail } });

if (reporterEmail !== JIRA_EMAIL) {
  trace.update({ metadata: { skipped: true, reason: `reporter=${reporterEmail}` } });
  await langfuse.flushAsync();
  console.log(`Skipping — ticket reported by ${reporterEmail ?? 'nobody'}, expected ${JIRA_EMAIL}`);
  process.exit(0);
}

console.log(`Ticket: ${TICKET_KEY} — ${summary}`);

// ── 2. Fetch existing comments — find previous plan + feedback ───────────

const commentsRes = await fetch(
  `${JIRA_BASE_URL}/rest/api/3/issue/${TICKET_KEY}/comment`,
  { headers: jiraHeaders }
);
const commentsData = await commentsRes.json();
const comments = commentsData.comments ?? [];

const previousPlanComment = comments.findLast(
  c => extractAdfText(c.body).startsWith('🤖 *Orchestrátor*')
);

// If triggered by a ticket update (not feedback), skip if plan already exists
if (!FEEDBACK_COMMENT && previousPlanComment) {
  console.log('Plan comment already exists, skipping orchestration.');
  await langfuse.flushAsync();
  process.exit(0);
}

const previousPlanText = previousPlanComment ? extractAdfText(previousPlanComment.body) : null;
const feedbackText = FEEDBACK_COMMENT ?? null;

// ── 3. Read repo structure ────────────────────────────────────────────────

const repoTree = execSync('find src -type f | head -60', { encoding: 'utf8' });

// ── 4. Call Claude — orchestrator plan ───────────────────────────────────

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const systemPrompt = `You are a software architect orchestrating an agentic workflow for an Angular 20 project.

Repository structure:
${repoTree}

A Jira ticket needs to be implemented. Analyze it and produce an execution plan.

Return ONLY a valid JSON object starting with { and ending with }. No prose, no markdown.

Schema:
{
  "agents": [
    {
      "name": "frontend" | "backend" | "architect" | "styles",
      "task": "<specific instruction for this agent>",
      "files": ["<src/... file paths this agent should read and possibly modify>"]
    }
  ],
  "summary": "<1-2 sentence human-readable summary of the plan>"
}

Agent responsibilities:
- "architect": project structure, new modules, new routes in app.routes.ts, new config files. Only needed when creating a brand new feature area or restructuring the project.
- "backend": services, API calls, data models, dependency injection. Only needed when the ticket requires fetching data, a new service, or business logic.
- "frontend": Angular components (.ts + .html), routing changes, consuming services. Needed for any UI work.
- "styles": SCSS only. Only needed when there are significant styling changes beyond trivial inline styles.

Minimum agents rule — use the fewest agents that can correctly implement the ticket:
- Simple CSS fix → ["styles"]
- Text/label change → ["frontend"]
- New page with data → ["architect", "backend", "frontend", "styles"]
- New page, static content → ["architect", "frontend", "styles"]
- Bug in a component → ["frontend"]
- New API service only → ["backend"]

Never include an agent unless the ticket explicitly requires their area of responsibility.`;

const userPrompt = `Ticket: ${TICKET_KEY}
Type: ${issueType}
Priority: ${priority}
Summary: ${summary}

Description:
${description}
${previousPlanText ? `\nPrevious plan (that the user reviewed):\n${previousPlanText}` : ''}
${feedbackText ? `\nUser feedback on the previous plan:\n${feedbackText}\n\nRevise the plan based on this feedback.` : '\nProduce the agent execution plan.'}`.trim();

const gen = trace.generation({
  name: 'orchestrator-plan',
  model: 'claude-sonnet-4-6',
  input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
});

const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
});

const rawPlan = msg.content[0].text.trim();

gen.end({
  output: rawPlan,
  usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens },
});

let plan;
try {
  const match = rawPlan.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  plan = JSON.parse(match[0]);
} catch (e) {
  trace.update({ metadata: { error: 'orchestrator-non-json' } });
  await langfuse.flushAsync();
  console.error('Orchestrator returned non-JSON:\n', rawPlan);
  process.exit(1);
}

console.log(`Plan: ${plan.agents.map(a => a.name).join(', ')}`);

// ── 5. Post plan to Slack ─────────────────────────────────────────────────

const agentBlocks = plan.agents.map(a => ({
  type: 'section',
  text: { type: 'mrkdwn', text: `*${a.name}:* ${a.task}` },
}));

const slackMessage = {
  text: `🤖 Orchestrátor — *${TICKET_KEY}*`,
  blocks: [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🤖 Orchestrátor — ${TICKET_KEY}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: plan.summary },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Plán agentů:*' },
    },
    ...agentBlocks,
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Napiš \`approve\` pro spuštění implementace, nebo \`feedback: <připomínka>\` pro úpravu plánu.\n_Ticket: ${JIRA_BASE_URL}/browse/${TICKET_KEY}_`,
      },
    },
  ],
};

if (SLACK_WEBHOOK_URL) {
  const slackRes = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackMessage),
  });
  if (slackRes.ok) {
    console.log('Plan posted to Slack.');
  } else {
    console.error(`Failed to post to Slack: ${slackRes.status}`);
  }
} else {
  console.warn('SLACK_WEBHOOK_URL not set, skipping Slack notification.');
}

// ── 6. Also write plan as Jira comment (as backup) ───────────────────────

const commentBody = {
  body: {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '🤖 *Orchestrátor*', marks: [{ type: 'strong' }] }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: plan.summary }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Plán agentů:', marks: [{ type: 'strong' }] }],
      },
      ...plan.agents.map(a => ({
        type: 'paragraph',
        content: [
          { type: 'text', text: `${a.name}: `, marks: [{ type: 'strong' }] },
          { type: 'text', text: a.task },
        ],
      })),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Odpověz ve Slacku nebo napiš ' },
          { type: 'text', text: 'approve', marks: [{ type: 'code' }] },
          { type: 'text', text: ' / ' },
          { type: 'text', text: 'feedback: <připomínka>', marks: [{ type: 'code' }] },
          { type: 'text', text: ' do komentáře.' },
        ],
      },
    ],
  },
};

const commentRes = await fetch(
  `${JIRA_BASE_URL}/rest/api/3/issue/${TICKET_KEY}/comment`,
  { method: 'POST', headers: jiraHeaders, body: JSON.stringify(commentBody) }
);

if (!commentRes.ok) {
  console.error(`Failed to post Jira comment: ${commentRes.status}`);
} else {
  console.log('Plan posted to Jira as comment.');
}

trace.update({ metadata: { planPosted: true, agents: plan.agents.map(a => a.name) } });
await langfuse.flushAsync();

// ── Helpers ───────────────────────────────────────────────────────────────

function extractAdfText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  const lines = [];
  for (const block of adf.content ?? []) {
    for (const inline of block.content ?? []) {
      if (inline.type === 'text') lines.push(inline.text);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function extractDescription(adf) {
  if (!adf) return '(no description)';
  if (typeof adf === 'string') return adf;
  const lines = [];
  for (const block of adf.content ?? []) {
    for (const inline of block.content ?? []) {
      if (inline.type === 'text') lines.push(inline.text);
    }
    lines.push('');
  }
  return lines.join('\n').trim() || '(no description)';
}
