import Anthropic from '@anthropic-ai/sdk';
import { Langfuse } from 'langfuse';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname } from 'path';

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  ANTHROPIC_API_KEY,
  LANGFUSE_SECRET_KEY,
  LANGFUSE_PUBLIC_KEY,
  LANGFUSE_BASE_URL,
  TICKET_KEY,
} = process.env;

if (!TICKET_KEY) {
  console.error('Missing TICKET_KEY');
  process.exit(1);
}

// ── Langfuse setup ────────────────────────────────────────────────────────

const langfuse = new Langfuse({
  secretKey: LANGFUSE_SECRET_KEY,
  publicKey: LANGFUSE_PUBLIC_KEY,
  baseUrl: LANGFUSE_BASE_URL,
});

const trace = langfuse.trace({
  name: 'implement-ticket',
  userId: JIRA_EMAIL,
  metadata: { ticketKey: TICKET_KEY },
  tags: ['agentic-workflow'],
});

// ── 1. Fetch Jira ticket ──────────────────────────────────────────────────

const jiraSpan = trace.span({ name: 'fetch-jira-ticket', input: { ticketKey: TICKET_KEY } });

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
const jiraRes = await fetch(
  `${JIRA_BASE_URL}/rest/api/3/issue/${TICKET_KEY}`,
  { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
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

appendEnvFile('TICKET_SUMMARY', summary);
appendEnvFile('TICKET_DESCRIPTION', description);

// ── 2. Read repo structure ────────────────────────────────────────────────

const repoTree = execSync('find src -type f | head -60', { encoding: 'utf8' });

// ── 3. Orchestrator — plan which agents to involve ────────────────────────

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const orchestratorPrompt = `You are a software architect orchestrating an agentic workflow for an Angular 20 project.

Repository structure:
${repoTree}

A Jira ticket needs to be implemented. Your job is to analyze it and produce an execution plan.

Return ONLY a valid JSON object starting with { and ending with }. No prose, no markdown.

Schema:
{
  "agents": [
    {
      "name": "frontend" | "backend" | "architect" | "styles",
      "task": "<specific instruction for this agent>",
      "files": ["<src/... file paths this agent should read and possibly modify>"]
    }
  ]
}

Rules:
- Use only the agents that are actually needed for this ticket.
- "frontend" handles Angular components, templates, routing.
- "backend" handles services, API calls, data models.
- "architect" handles project structure, new modules, config files.
- "styles" handles SCSS only.
- Keep the task descriptions concise and specific.
- File paths must exist in the repo structure above or be new files under src/.`;

const orchestratorUserPrompt = `Ticket: ${TICKET_KEY}
Type: ${issueType}
Priority: ${priority}
Summary: ${summary}

Description:
${description}

Produce the agent execution plan.`;

console.log('\n[Orchestrator] Analyzing ticket...');

const orchestratorGen = trace.generation({
  name: 'orchestrator-plan',
  model: 'claude-sonnet-4-6',
  input: [
    { role: 'system', content: orchestratorPrompt },
    { role: 'user', content: orchestratorUserPrompt },
  ],
});

const orchestratorMsg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  system: orchestratorPrompt,
  messages: [{ role: 'user', content: orchestratorUserPrompt }],
});

const rawPlan = orchestratorMsg.content[0].text.trim();

orchestratorGen.end({
  output: rawPlan,
  usage: {
    input: orchestratorMsg.usage.input_tokens,
    output: orchestratorMsg.usage.output_tokens,
  },
});

let plan;
try {
  const match = rawPlan.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  plan = JSON.parse(match[0]);
} catch (e) {
  trace.update({ metadata: { error: 'orchestrator-non-json' } });
  await langfuse.flushAsync();
  console.error('Orchestrator returned non-JSON response:\n', rawPlan);
  process.exit(1);
}

console.log(`[Orchestrator] Plan: ${plan.agents.map(a => a.name).join(', ')}`);

// ── 4. Run sub-agents sequentially ───────────────────────────────────────

const allChanges = new Map(); // path → content (last agent wins on conflict)

for (const agent of plan.agents) {
  console.log(`\n[Agent: ${agent.name}] Task: ${agent.task}`);

  const agentFiles = (agent.files ?? [])
    .filter(f => existsSync(f))
    .map(f => `// ${f}\n${readFileSync(f, 'utf8')}`)
    .join('\n\n');

  // Include any files already changed by previous agents
  const pendingChanges = [...allChanges.entries()]
    .map(([p, c]) => `// ${p} (modified by previous agent)\n${c}`)
    .join('\n\n');

  const agentSystemPrompt = `You are a "${agent.name}" specialist in an Angular 20 project.
The project uses Angular 20, standalone components, TypeScript, SCSS, and signals.

Repository structure:
${repoTree}

${agentFiles ? `Relevant current files:\n${agentFiles}` : ''}
${pendingChanges ? `\nFiles already modified by previous agents (use as updated baseline):\n${pendingChanges}` : ''}

Rules:
- Return ONLY a valid JSON array, starting with [ and ending with ]. No prose, no markdown.
- Each item: { "path": "src/...", "content": "<full file content>" }
- Only create or modify files inside src/.
- Stay consistent with existing code style, types, and patterns.`;

  const agentUserPrompt = `You are responsible for the "${agent.name}" part of this ticket:

Ticket: ${TICKET_KEY} — ${summary}
Your specific task: ${agent.task}

Return the JSON array of file changes.`;

  const agentGen = trace.generation({
    name: `agent-${agent.name}`,
    model: 'claude-sonnet-4-6',
    input: [
      { role: 'system', content: agentSystemPrompt },
      { role: 'user', content: agentUserPrompt },
    ],
    metadata: { agentRole: agent.name },
  });

  const agentMsg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    system: agentSystemPrompt,
    messages: [{ role: 'user', content: agentUserPrompt }],
  });

  const rawAgentResponse = agentMsg.content[0].text.trim();

  agentGen.end({
    output: rawAgentResponse,
    usage: {
      input: agentMsg.usage.input_tokens,
      output: agentMsg.usage.output_tokens,
    },
  });

  let agentChanges;
  try {
    const match = rawAgentResponse.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array found');
    agentChanges = JSON.parse(match[0]);
  } catch (e) {
    console.warn(`[Agent: ${agent.name}] Returned non-JSON, skipping.`);
    continue;
  }

  for (const { path, content } of agentChanges) {
    if (!path.startsWith('src/')) {
      console.warn(`  Skipping out-of-scope path: ${path}`);
      continue;
    }
    allChanges.set(path, content);
    console.log(`  Queued: ${path}`);
  }
}

// ── 5. Write all changes ──────────────────────────────────────────────────

if (allChanges.size === 0) {
  trace.update({ metadata: { error: 'empty-changes' } });
  await langfuse.flushAsync();
  console.error('No file changes from any agent.');
  process.exit(1);
}

const writtenFiles = [];
for (const [path, content] of allChanges) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  writtenFiles.push(path);
  console.log(`Written: ${path}`);
}

trace.update({ output: { filesChanged: writtenFiles, agents: plan.agents.map(a => a.name) } });
await langfuse.flushAsync();

console.log(`\nDone — ${writtenFiles.length} file(s) changed by ${plan.agents.length} agent(s).`);

// ── Helpers ───────────────────────────────────────────────────────────────

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

function appendEnvFile(key, value) {
  const envFile = process.env.GITHUB_ENV;
  if (envFile) {
    const safe = value.replace(/\n/g, ' ');
    writeFileSync(envFile, `${key}=${safe}\n`, { flag: 'a', encoding: 'utf8' });
  }
}
