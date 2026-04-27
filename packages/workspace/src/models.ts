import type {
  AgentId,
  AuditEventId,
  OrgId,
  RoleDefinitionId,
  RuntimeId,
  WorkspaceId,
} from "./ids.js"
import type {
  Agent,
  AgentHarness,
  CustomerHostRuntime,
  HealthStatus,
  ManagedRuntime,
  RoleDefinition,
  RoleCategory,
  Runtime,
  RuntimeLocation,
  RuntimeMode,
} from "@stoneforge/core"

export type WorkspaceState =
  | "draft"
  | "repo_connected"
  | "execution_configured"
  | "ready"
  | "degraded"
  | "archived"

/**
 * The first-slice V2 docs currently freeze only these two workspace presets.
 * A richer preset taxonomy stays open until the docs freeze it explicitly.
 */
export type PolicyPreset = "supervised" | "autonomous"

export type RepositoryConnectionStatus = "connected" | "disconnected"

export type {
  Agent,
  AgentHarness,
  CustomerHostRuntime,
  HealthStatus,
  ManagedRuntime,
  RoleDefinition,
  RoleCategory,
  Runtime,
  RuntimeLocation,
  RuntimeMode,
} from "@stoneforge/core"

/**
 * Setup-path audit actions emitted by this package's workspace-ready flow.
 * This is intentionally narrower than the full Stoneforge audit surface.
 */
export type WorkspaceSetupAuditAction =
  | "workspace.created"
  | "workspace.github_repository_connected"
  | "workspace.policy_preset_selected"
  | "workspace.runtime_registered"
  | "workspace.agent_registered"
  | "workspace.role_definition_registered"
  | "workspace.github_repository_connection_updated"
  | "workspace.runtime_health_updated"
  | "workspace.validated"

export type WorkspaceSetupAuditTargetType =
  | "org"
  | "workspace"
  | "repository"
  | "policy"
  | "runtime"
  | "agent"
  | "role_definition"

export type AuditOutcome = "success" | "failure"
export type AuditActorKind = "human" | "service"

export interface AuditActor {
  kind: AuditActorKind
  id: string
  displayName: string
}

export interface Org {
  id: OrgId
  name: string
  createdAt: string
}

export interface GitHubRepositoryLink {
  installationId: string
  owner: string
  repository: string
  defaultBranch: string
  connectionStatus: RepositoryConnectionStatus
  connectedAt: string
}

export interface WorkspaceExecutionPath {
  runtimeId: RuntimeId
  agentId: AgentId
  roleDefinitionId: RoleDefinitionId
}

export type WorkspaceValidationIssueCode =
  | "repo_not_connected"
  | "policy_not_configured"
  | "runtime_not_configured"
  | "agent_not_configured"
  | "role_definition_not_configured"
  | "no_valid_execution_path"

export interface WorkspaceValidationIssue {
  code: WorkspaceValidationIssueCode
  message: string
}

export interface WorkspaceValidationResult {
  repoConnected: boolean
  policyConfigured: boolean
  executionConfigured: boolean
  ready: boolean
  issues: WorkspaceValidationIssue[]
  selectedExecutionPath?: WorkspaceExecutionPath
  validatedAt: string
}

export interface Workspace {
  id: WorkspaceId
  orgId: OrgId
  name: string
  targetBranch: string
  state: WorkspaceState
  repository?: GitHubRepositoryLink
  policyPreset?: PolicyPreset
  runtimes: Runtime[]
  agents: Agent[]
  roleDefinitions: RoleDefinition[]
  validation?: WorkspaceValidationResult
  createdAt: string
  updatedAt: string
}

export interface AuditEvent {
  id: AuditEventId
  timestamp: string
  orgId: OrgId
  workspaceId?: WorkspaceId
  actor: AuditActor
  action: WorkspaceSetupAuditAction
  targetType: WorkspaceSetupAuditTargetType
  targetId: string
  outcome: AuditOutcome
  reason?: string
  policyPreset?: PolicyPreset
}

export interface WorkspaceSetupSnapshot {
  orgs: Org[]
  workspaces: Workspace[]
  auditEvents: AuditEvent[]
}

export interface CreateOrgInput {
  name: string
}

export interface CreateWorkspaceInput {
  name: string
  targetBranch: string
}

export interface ConnectGitHubRepositoryInput {
  installationId: string
  owner: string
  repository: string
  defaultBranch: string
  connectionStatus?: RepositoryConnectionStatus
}

interface RegisterRuntimeInputBase {
  name: string
  tags?: string[]
  healthStatus?: HealthStatus
}

export interface RegisterCustomerHostRuntimeInput extends RegisterRuntimeInputBase {
  location: "customer_host"
  mode: Extract<RuntimeMode, "local_worktree" | "container">
  hostId?: string
  managedProvider?: never
}

export interface RegisterManagedRuntimeInput extends RegisterRuntimeInputBase {
  location: "managed"
  mode: Extract<RuntimeMode, "managed_sandbox">
  hostId?: never
  managedProvider: "daytona"
}

export type RegisterRuntimeInput =
  | RegisterCustomerHostRuntimeInput
  | RegisterManagedRuntimeInput

export interface RegisterAgentInput {
  name: string
  runtimeId: RuntimeId
  harness: AgentHarness
  model: string
  concurrencyLimit: number
  launcher: string
  tags?: string[]
  healthStatus?: HealthStatus
}

export interface RegisterRoleDefinitionInput {
  name: string
  category: RoleCategory
  prompt: string
  toolAccess?: string[]
  skillAccess?: string[]
  lifecycleHooks?: string[]
  tags?: string[]
  enabled?: boolean
}
