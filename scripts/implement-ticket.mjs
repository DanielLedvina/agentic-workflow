/**
 * Fetches a Jira ticket, sends it to Claude API, and applies the generated code changes.
 * Called by the GitHub Action; expects env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN,
 * ANTHROPIC_API_KEY, TICKET_KEY.
 */

import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname } from 'path';

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  ANTHROPIC_API_KEY,
  TICKET_KEY,
} = process.env;

if (!TICKET_KEY) {
  console.error('Missing TICKET_KEY');
  process.exit(1);
}

// ── 1. Fetch Jira ticket ────────────────────────────────────────────────────

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
const jiraRes = await fetch(
  `${JIRA_BASE_URL}/rest/api/3/issue/${TICKET_KEY}`,
  { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
);

if (!jiraRes.ok) {
  console.error(`Jira API error: ${jiraRes.status} ${await jiraRes.text()}`);
  process.exit(1);
}

const issue = await jiraRes.json();
const summary = issue.fields.summary;
const description = extractDescription(issue.fields.description);
const issueType = issue.fields.issuetype.name;
const priority = issue.fields.priority?.name ?? 'Medium';
const reporterEmail = issue.fields.reporter?.emailAddress;

if (reporterEmail !== JIRA_EMAIL) {
  console.log(`Skipping — ticket reported by ${reporterEmail ?? 'nobody'}, expected ${JIRA_EMAIL}`);
  process.exit(0);
}

console.log(`Ticket: ${TICKET_KEY} — ${summary}`);

// Export for GitHub Action step
appendEnvFile('TICKET_SUMMARY', summary);
appendEnvFile('TICKET_DESCRIPTION', description);

// ── 2. Read repo structure and key files for context ─────────────────────

const repoTree = execSync('find src -type f | head -40', { encoding: 'utf8' });

const keyFiles = ['src/app/app.ts', 'src/app/app.html', 'src/app/app.scss'];
const fileContents = keyFiles
  .filter(existsSync)
  .map(f => `// ${f}\n${readFileSync(f, 'utf8')}`)
  .join('\n\n');

// ── 3. Call Claude API ────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const systemPrompt = `You are an Angular developer working on the "agentic-demo" project.
The project uses Angular 20, standalone components, TypeScript, SCSS, and signals.

Repo structure:
${repoTree}

Current file contents:
${fileContents}

Rules:
- Return ONLY a valid JSON array, starting with [ and ending with ]. No prose, no markdown, no explanation before or after.
- Each item: { "path": "src/...", "content": "<full file content>" }
- Stay consistent with existing code style, types, and patterns.
- Only create or modify files inside src/.`;

const userPrompt = `Implement the following Jira ticket:

Ticket: ${TICKET_KEY}
Type: ${issueType}
Priority: ${priority}
Summary: ${summary}

Description:
${description}

Return the JSON array of file changes. Start your response with [ immediately.`;

const message = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 8096,
  system: systemPrompt,
  messages: [
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: '[' },
  ],
});

const rawResponse = '[' + message.content[0].text.trim();

// ── 4. Parse and apply file changes ──────────────────────────────────────

let changes;
try {
  changes = JSON.parse(rawResponse);
} catch (e) {
  console.error('Claude returned non-JSON response:\n', rawResponse);
  process.exit(1);
}

if (!Array.isArray(changes) || changes.length === 0) {
  console.error('No file changes returned by Claude.');
  process.exit(1);
}

for (const { path, content } of changes) {
  if (!path.startsWith('src/')) {
    console.warn(`Skipping out-of-scope path: ${path}`);
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log(`  Written: ${path}`);
}

console.log(`\nDone — ${changes.length} file(s) changed.`);

// ── Helpers ───────────────────────────────────────────────────────────────

function extractDescription(adf) {
  if (!adf) return '(no description)';
  if (typeof adf === 'string') return adf;
  // Atlassian Document Format → plain text
  const lines = [];
  for (const block of adf.content ?? []) {
    for (const inline of block.content ?? []) {
      if (inline.type === 'text') lines.push(inline.text);
    }
    lines.push('');
  }
  return lines.join('\n').trim() || '(no description)';
}

function appendEnvFile(key, value) {
  const envFile = process.env.GITHUB_ENV;
  if (envFile) {
    const safe = value.replace(/\n/g, ' ');
    writeFileSync(envFile, `${key}=${safe}\n`, { flag: 'a', encoding: 'utf8' });
  }
}
