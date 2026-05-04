declare const brand: unique symbol

type Brand<Name extends string> = {
  readonly [brand]: Name
}

export type WorkspaceId = string & Brand<"WorkspaceId">
export type RuntimeId = string & Brand<"RuntimeId">
export type AgentId = string & Brand<"AgentId">
export type TaskId = string & Brand<"TaskId">
export type AssignmentId = string & Brand<"AssignmentId">
export type ProviderInstanceId = string & Brand<"ProviderInstanceId">
export type SessionId = string & Brand<"SessionId">

export type ProviderKind = "claude-code" | "openai-codex"
export type SessionConnectivity = "connectionful" | "connectionless"
export type RuntimeState = "healthy" | "unhealthy"
export type RuntimeType = "container" | "local-worktree" | "managed-sandbox"
export type TaskState = "draft" | "ready" | "in_progress" | "completed"
export type AssignmentStatus = "running" | "completed"
export type SessionStatus = "running" | "completed"
export type WorkspaceState = "degraded" | "ready"
export type AgentTag =
  | `agent:${string}`
  | `model-family:${string}`
  | `model:${string}`
  | `provider-instance:${string}`
  | `provider:${ProviderKind}`

export interface IdSequence {
  readonly nextAgentId: () => AgentId
  readonly nextAssignmentId: () => AssignmentId
  readonly nextSessionId: () => SessionId
  readonly nextTaskId: () => TaskId
}

export interface GitHubRepositoryConfig {
  readonly owner: string
  readonly provider: "github"
  readonly repo: string
  readonly targetBranch: string
}

export interface RuntimeConfig {
  readonly capacity: number
  readonly id: RuntimeId
  readonly state: RuntimeState
  readonly type: RuntimeType
  readonly worktreePath?: string
}

export interface AcceptableRuntime {
  readonly id: RuntimeId
  readonly priority: number
}

export interface RuntimeConfigInput {
  readonly capacity: number
  readonly id: RuntimeId | string
  readonly state: RuntimeState
  readonly type: RuntimeType
  readonly worktreePath?: string
}

export interface AcceptableRuntimeInput {
  readonly id: RuntimeId | string
  readonly priority: number
}

export interface AgentConfig {
  readonly acceptableRuntimes: readonly AcceptableRuntime[]
  readonly concurrencyLimit: number
  readonly id: AgentId
  readonly model: string
  readonly modelFamily: string
  readonly provider: ProviderKind
  readonly providerInstanceId: ProviderInstanceId
}

export interface AgentConfigInput {
  readonly acceptableRuntimes: readonly AcceptableRuntimeInput[]
  readonly concurrencyLimit: number
  readonly id?: AgentId | string
  readonly model: string
  readonly modelFamily: string
  readonly provider: ProviderKind
  readonly providerInstanceId: ProviderInstanceId | string
}

export interface WorkspaceView {
  readonly id: WorkspaceId
  readonly repository: GitHubRepositoryConfig
  readonly state: WorkspaceState
}

export interface TaskExecutionContext {
  readonly id: TaskId
  readonly intent: string
  readonly title: string
}
