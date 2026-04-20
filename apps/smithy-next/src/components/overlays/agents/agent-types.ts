// ── Agent Type Definitions (Typeless Architecture) ──
//
// Agents are blank compute resources. Behavioral specialization comes from
// Role Definitions, which are attached at spawn time via the dispatch context
// (Director Panel, task dispatch, or automation agent step).

export type AgentStatus = 'running' | 'idle' | 'error' | 'starting'
export type AgentEnvironment = 'local' | 'cloud'

export type SessionStatus = 'active' | 'completed' | 'error'

export interface AgentSession {
  id: string
  agentId: string                // which compute agent
  roleDefinitionId?: string      // which role definition prompt (resolved at spawn time)
  status: SessionStatus
  startedAt: string
  duration: string
  tasksCompleted: number
  errors: number
  tasks: AgentTaskRef[]
  launchedByUserId?: string
}

export interface AgentTaskRef {
  id: string
  title: string
  status: 'open' | 'in-progress' | 'done' | 'error'
  timeSpent: string
  branch?: string
}

export interface AgentConfig {
  maxTokens: number
  temperature: number
  tools: string[]
  executablePath?: string
}

export interface AgentActivityEvent {
  id: string
  type: 'session_started' | 'session_stopped' | 'task_completed' | 'task_started' | 'error' | 'config_changed'
  message: string
  timestamp: string
}

export interface AgentExtended {
  id: string
  name: string
  tags: string[]                 // compute capability tags: ['opus', 'fast', 'local', 'gpu']
  ownerUserId?: string
  model: string
  provider: string
  environment: AgentEnvironment
  runtimeId?: string
  status: AgentStatus
  sessions: AgentSession[]
  config: AgentConfig
  lastActiveAt: string
  totalUptime: string
  totalTasksCompleted: number
  errorRate: number              // percentage 0-100
  maxConcurrentTasks?: number    // max simultaneous sessions (replaces pool capacity)
  spawnPriority?: number         // dispatch preference when multiple agents match (higher = preferred)
  enabled: boolean
  recentActivity: AgentActivityEvent[]
}

// ── Role Definitions (first-class behavioral presets) ──

export type RoleDefinitionCategory = 'orchestrator' | 'executor' | 'reviewer' | string

export interface WorkspaceResourceRef {
  name: string         // display name
  path: string         // workspace-relative file path
  description?: string // optional one-liner
}

export type HookEvent =
  // Lifecycle
  | 'agent:start'
  | 'agent:stop'
  | 'task:assigned'
  | 'task:completed'
  | 'agent:error'
  | 'agent:stuck'
  // Tool-level
  | 'tool:before'
  | 'tool:after'
  | 'file:write:before'
  | 'file:write:after'
  | 'bash:before'
  | 'bash:after'

export const HOOK_EVENTS: HookEvent[] = [
  'agent:start', 'agent:stop', 'task:assigned', 'task:completed', 'agent:error', 'agent:stuck',
  'tool:before', 'tool:after', 'file:write:before', 'file:write:after', 'bash:before', 'bash:after',
]

export const HOOK_EVENT_CATEGORIES: Record<string, HookEvent[]> = {
  Lifecycle: ['agent:start', 'agent:stop', 'task:assigned', 'task:completed', 'agent:error', 'agent:stuck'],
  'Tool-level': ['tool:before', 'tool:after', 'file:write:before', 'file:write:after', 'bash:before', 'bash:after'],
}

export interface HookBinding {
  event: HookEvent
  path: string         // workspace-relative file path to TS function
  name?: string        // optional display name
}

export const DEFAULT_TOOL_NAMES = [
  'read', 'write', 'edit', 'bash', 'grep', 'glob', 'agent', 'web_search', 'mcp',
] as const

export type DefaultToolName = typeof DEFAULT_TOOL_NAMES[number]

export interface RoleDefinition {
  id: string
  name: string                       // e.g., 'Director', 'Frontend Specialist', 'Code Reviewer'
  description?: string
  rolePrompt: string                 // the role definition prompt (first message after system prompt)
  systemPromptOverride?: string      // optional advanced override of provider system prompt
  tags: string[]                     // specialization tags for matching: ['auth', 'frontend', 'merge-review']
  category?: RoleDefinitionCategory  // for organization/display
  defaultTools?: string[]            // allowlist of default tools (undefined = all enabled)
  customTools?: WorkspaceResourceRef[]  // file path references to TS functions
  skills?: WorkspaceResourceRef[]       // file path references to markdown files
  hooks?: HookBinding[]                 // event + file path references
  builtIn?: boolean                  // system-provided, cannot be deleted
  createdAt: string
  updatedAt: string
}

// ── Runtimes — canonical types live in ../runtimes/runtime-types.ts ──

export type { Host, Runtime, RuntimeMode, RuntimeStatus, HostStatus, TunnelStatus, SandboxProvider, SandboxTier } from '../runtimes/runtime-types'

// ── Filter / Sort / Group ──

export type AgentFilterField = 'status' | 'environment' | 'model' | 'provider'
export interface AgentActiveFilter { field: AgentFilterField; value: string }

export type AgentSortField = 'name' | 'status' | 'lastActive' | 'sessions'
export type AgentGroupField = 'status' | 'provider' | 'environment' | 'none'
