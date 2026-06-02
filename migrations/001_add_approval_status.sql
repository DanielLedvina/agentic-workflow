-- Add approval_status column to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'pending';

-- Add repo_analysis column to sessions table (stores JSON)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS repo_analysis TEXT;

-- Create index for faster queries on approval_status
CREATE INDEX IF NOT EXISTS idx_sessions_approval_status ON sessions(approval_status);

-- Create index for faster queries on created_at (for sorting)
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

-- Update existing sessions to have approval_status
UPDATE sessions SET approval_status = 'completed' WHERE approval_status IS NULL AND orchestrator_plan IS NOT NULL;
UPDATE sessions SET approval_status = 'pending' WHERE approval_status IS NULL;
