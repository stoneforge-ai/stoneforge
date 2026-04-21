export type SessionStatus = 'active' | 'completed' | 'error'

export type SessionEventType =
  | 'session_start'
  | 'user_message'
  | 'agent_message'
  | 'tool_call'
  | 'system_message'

export type ToolName =
  | 'Glob'
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Grep'
  | 'Web_search'
  | 'Web_fetch'

export interface SessionEvent {
  id: string
  type: SessionEventType
  title: string
  content: string
  /** Offset from session start in milliseconds */
  timestamp: number
  /** Duration in milliseconds */
  duration?: number
  tokensIn?: number
  tokensOut?: number
  toolName?: ToolName
  toolInput?: string
  toolResult?: string
  toolStatus?: 'running' | 'completed' | 'error'
  /** Cross-agent message fields */
  crossAgent?: { fromAgent: string; toAgent: string; channelName?: string }
}

export interface SessionAgentRecentSession {
  id: string
  title: string
  status: SessionStatus
  startedAt: string
  duration: string
}

export interface SessionAgent {
  id: string
  name: string
  version: string
  status: 'active' | 'idle' | 'error'
  model: string
  provider: string
  rolePrompt: string
  recentSessions: SessionAgentRecentSession[]
}

export interface Session {
  id: string
  title: string
  agent: SessionAgent
  status: SessionStatus
  startedAt: string
  /** Total duration, e.g. "5m 34s" */
  duration: string
  /** Active processing time, e.g. "2m 44s" */
  activeDuration?: string
  tokensIn: number
  tokensOut: number
  environment: 'local' | 'docker' | 'ssh'
  /** Files touched during the session */
  files?: string[]
  linkedTaskId?: string
  linkedMRId?: string
  linkedBranch?: string
  linkedDirectorId?: string
  linkedPreviewTabId?: string
  events: SessionEvent[]
}

export type SessionFilterField = 'status' | 'agent' | 'environment'

export interface SessionActiveFilter {
  field: SessionFilterField
  value: string
}

export type SessionSortField = 'date' | 'duration' | 'status' | 'tokens'
