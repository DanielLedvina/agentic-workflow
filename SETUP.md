# Setup Guide

## Environment Variables

Create `.env.local` with:

```
# Database
DATABASE_URL=postgresql://user:password@host/database

# Jira
JIRA_BASE_URL=https://signosofts.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEY=AGD

# GitHub
GH_TOKEN=ghp_xxxxxxxxxxxx
GH_OWNER=your-org
GH_REPO=your-repo

# Discord
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_SENIOR_USER_ID=your-user-id

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx

# Langfuse
LANGFUSE_PUBLIC_KEY=pk_xxxx
LANGFUSE_SECRET_KEY=sk_xxxx

# Migrations
MIGRATION_KEY=your-secure-key
```

## Database Setup

### 1. Create Database Tables

Run these SQL commands in your PostgreSQL database:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  discord_user_id VARCHAR(255),
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',
  orchestrator_plan JSONB,
  approval_status VARCHAR(50) DEFAULT 'pending',
  repo_analysis TEXT,
  github_owner VARCHAR(255),
  github_repo VARCHAR(255),
  pr_url TEXT,
  files_modified INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  role VARCHAR(50),
  content TEXT,
  input_tokens INT,
  output_tokens INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Jira task links
CREATE TABLE IF NOT EXISTS jira_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  jira_key VARCHAR(50),
  jira_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  system_prompt TEXT,
  created_by_user_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Checkpoint decisions
CREATE TABLE IF NOT EXISTS checkpoint_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  difficulty VARCHAR(50),
  reason TEXT,
  human_decision VARCHAR(50),
  decided_by_user_id UUID REFERENCES users(id),
  decided_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_approval_status ON sessions(approval_status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_jira_task_links_session_id ON jira_task_links(session_id);
```

### 2. Run Migrations via API

After deploying to Vercel, run:

```bash
curl -X POST https://your-domain.com/api/migrate \
  -H "Content-Type: application/json" \
  -d '{"key": "your-migration-key"}'
```

This will add any missing columns and create indexes.

## Getting Credentials

### GitHub Token
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it `repo` and `workflow` scopes
4. Copy the token to `GITHUB_TOKEN`

### Jira API Token
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Copy to `JIRA_API_TOKEN`

### Discord Bot Token
1. Create bot at https://discord.com/developers/applications
2. Copy token to `DISCORD_BOT_TOKEN`

### Anthropic API Key
1. Get from https://console.anthropic.com/
2. Copy to `ANTHROPIC_API_KEY`

## Development

### Start Dev Server
```bash
npm start
```

### Build for Production
```bash
npm run build
```

### Test API
```bash
# Health check
curl http://localhost:4200/api/health

# Create session
curl -X POST http://localhost:4200/api/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Troubleshooting

### Database Connection Error
- Check `DATABASE_URL` format
- Verify credentials
- Ensure database exists and is accessible

### Jira Integration Failing
- Verify `JIRA_EMAIL` and `JIRA_API_TOKEN`
- Check `JIRA_BASE_URL` format (no trailing slash)
- Ensure user has permissions in project

### GitHub PR Not Creating
- Verify `GH_TOKEN` has `repo` scope
- Check `GH_OWNER` and `GH_REPO` are correct
- Ensure branch doesn't already exist

### Discord Notifications Not Sending
- Verify bot has message permissions
- Check `DISCORD_SENIOR_USER_ID` is correct user ID (not name)
- Ensure bot can DM the user
