/**
 * Shared Type Definitions for Agentic Workflow
 * Covers Session, Message, Difficulty Assessment, GitHub Context, and Jira models
 */

// ============================================================================
// Authentication
// ============================================================================

export type UserRole = 'user' | 'senior_dev' | 'admin' | 'po_dev';

export interface AuthResponse {
  token: string;
  expiresIn: number;
  user: User;
}

export interface User {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  discord_user_id?: string;
  created_at?: string;
}

export interface UserProfile extends User {
  // Extended profile information
}

// ============================================================================
// Workflow Session
// ============================================================================

export interface WorkflowSession {
  id: string;
  repoUrl: string;
  context: GitHubContext;
  messages: Message[];
  status: SessionStatus;
  difficulty?: DifficultyAssessment;
  jiraTaskId?: string;
  jiraTaskUrl?: string;
  githubPrUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionStatus = 'analyzing' | 'awaiting_user' | 'checkpoint' | 'auto_implementing' | 'in_ide' | 'completed' | 'error';

// ============================================================================
// Messages & Streaming
// ============================================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming: boolean;
  timestamp: Date;
  tokenCount?: {
    input: number;
    output: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Represents a streaming update to a message
 * Used by workflow.service to yield partial messages
 */
export interface StreamingMessageUpdate {
  messageId: string;
  delta: string;           // Partial content chunk
  isComplete: boolean;
  totalTokens?: number;
}

// ============================================================================
// Difficulty Assessment
// ============================================================================

export interface DifficultyAssessment {
  level: 'simple' | 'complex';
  confidence: number;      // 0 to 1
  reasoning: string;
  summary: string;
  estimatedTime?: number;  // minutes
  requiredSkills: string[];
  potentialRisks: string[];
  recommendedApproach: 'auto_implement' | 'manual_review' | 'hybrid';
}

// ============================================================================
// GitHub Context
// ============================================================================

export interface GitHubContext {
  repositoryName: string;
  description: string;
  defaultBranch: string;
  files: GitHubFile[];
  structure: GitHubTreeNode;
  summary: string;          // High-level repo summary
  technologies: string[];   // Tech stack detected
}

export interface GitHubFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  content?: string;         // Loaded on demand
  language?: string;        // e.g., 'typescript', 'python'
}

export interface GitHubTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: GitHubTreeNode[];
}

// ============================================================================
// Jira Integration
// ============================================================================

export interface JiraTask {
  id: string;
  key: string;
  url: string;
  title: string;
  description: string;
  status: string;
  createdAt: Date;
  metadata?: {
    sessionId?: string;
    difficulty?: string;
    autoImplemented?: boolean;
  };
}

export interface JiraCreateRequest {
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Checkpoint Payload
// ============================================================================

export interface CheckpointPayload {
  sessionId: string;
  difficulty: DifficultyAssessment;
  conversationHistory: Message[];
  githubContext: GitHubContext;
  suggestedActions: {
    canAutoImplement: boolean;
    canSendToIde: boolean;
    estimatedImplementationTime?: number;
  };
}

// ============================================================================
// Implementation Results
// ============================================================================

export interface ImplementationResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branch?: string;
  filesChanged: string[];
  errors?: string[];
}

export interface IdeModePayload {
  sessionId: string;
  changes: FileChange[];
  instructions: string;
}

export interface FileChange {
  path: string;
  originalContent?: string;
  newContent: string;
  changeType: 'create' | 'modify' | 'delete';
}

// ============================================================================
// API Responses
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Streaming response for workflow messages
export interface WorkflowStreamResponse {
  messageId: string;
  isComplete: boolean;
  content?: string;
  delta?: string;           // Partial content for streaming
  difficulty?: DifficultyAssessment;
  timestamp: Date;
}

// ============================================================================
// UI State Models
// ============================================================================

export interface LoadingState {
  isLoading: boolean;
  progress?: number;        // 0-100 for progress bars
  message?: string;         // e.g., "Analyzing repository..."
}

export interface ErrorState {
  hasError: boolean;
  message?: string;
  code?: string;
  recoverable?: boolean;    // Can user retry?
  details?: unknown;
}
