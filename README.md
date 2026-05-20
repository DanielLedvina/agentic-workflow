# Agentic Workflow Demo

Angular 20 app demonstrating an agentic workflow: **Jira ticket → Claude implements → GitHub PR**.

## How it works

```
Jira ticket labeled "claude-implement"
        │
        ▼
Jira Webhook  ──►  GitHub repository_dispatch
        │
        ▼
GitHub Action (.github/workflows/jira-to-pr.yml)
  1. Fetch ticket details from Jira REST API
  2. Send ticket + repo context to Claude API
  3. Claude returns JSON array of file changes
  4. Apply changes to repo
  5. Open Pull Request automatically
```

## Setup

### 1. GitHub Secrets

Add these in **Settings → Secrets → Actions**:

| Secret | Value |
|---|---|
| `JIRA_BASE_URL` | `https://yourorg.atlassian.net` |
| `JIRA_EMAIL` | your Atlassian account email |
| `JIRA_API_TOKEN` | Atlassian API token (account settings) |
| `ANTHROPIC_API_KEY` | Anthropic API key |

### 2. Jira Webhook

In Jira: **Project settings → Webhooks → Create webhook**

- URL: `https://api.github.com/repos/DanielLedvina/agentic-workflow/dispatches`
- Method: POST
- Headers:
  ```
  Authorization: Bearer <GITHUB_PAT>
  Accept: application/vnd.github+json
  Content-Type: application/json
  ```
- Body (map from Jira issue fields):
  ```json
  {
    "event_type": "jira-implement",
    "client_payload": {
      "ticket_key": "${issue.key}"
    }
  }
  ```
- Trigger: Issue updated → label added = `claude-implement`

### 3. Trigger manually (for testing)

```bash
gh api repos/DanielLedvina/agentic-workflow/dispatches \
  --method POST \
  --field event_type=jira-implement \
  --field client_payload='{"ticket_key":"AGD-3"}'
```

## Local development

```bash
npm install
npm start        # http://localhost:4200
```

## Project structure

```
src/app/
├── app.ts          # root component with mock ticket data
├── app.html        # kanban board template
└── app.scss        # Jira-inspired styles
scripts/
└── implement-ticket.mjs   # Node script: Jira → Claude → file changes
.github/workflows/
└── jira-to-pr.yml         # GitHub Action orchestrating the workflow
```
