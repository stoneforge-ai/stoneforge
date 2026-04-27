import type {
  AgentId,
  RoleDefinitionId,
  RuntimeId,
  WorkspaceId,
} from "./ids.js"

export type RuntimeLocation = "customer_host" | "managed"
export type RuntimeMode = "local_worktree" | "container" | "managed_sandbox"
export type HealthStatus = "healthy" | "unhealthy"
export type AgentHarness = "claude-code" | "openai-codex"
export type RoleCategory = "director" | "worker" | "reviewer" | "custom"

interface RuntimeBase {
  id: RuntimeId
  workspaceId: WorkspaceId
  name: string
  healthStatus: HealthStatus
  tags: string[]
}

export interface CustomerHostRuntime extends RuntimeBase {
  location: "customer_host"
  mode: "local_worktree" | "container"
  hostId?: string
  managedProvider?: never
}

export interface ManagedRuntime extends RuntimeBase {
  location: "managed"
  mode: "managed_sandbox"
  hostId?: never
  managedProvider: "daytona"
}

export type Runtime = CustomerHostRuntime | ManagedRuntime

export interface Agent {
  id: AgentId
  workspaceId: WorkspaceId
  runtimeId: RuntimeId
  name: string
  harness: AgentHarness
  model: string
  concurrencyLimit: number
  healthStatus: HealthStatus
  tags: string[]
  launcher: string
}

export interface RoleDefinition {
  id: RoleDefinitionId
  workspaceId: WorkspaceId
  name: string
  category: RoleCategory
  prompt: string
  toolAccess: string[]
  skillAccess: string[]
  lifecycleHooks: string[]
  tags: string[]
  enabled: boolean
}

export function cloneRuntime(runtime: Runtime): Runtime {
  return {
    ...runtime,
    tags: [...runtime.tags],
  }
}

export function cloneAgent(agent: Agent): Agent {
  return {
    ...agent,
    tags: [...agent.tags],
  }
}

export function cloneRoleDefinition(
  roleDefinition: RoleDefinition
): RoleDefinition {
  return {
    ...roleDefinition,
    toolAccess: [...roleDefinition.toolAccess],
    skillAccess: [...roleDefinition.skillAccess],
    lifecycleHooks: [...roleDefinition.lifecycleHooks],
    tags: [...roleDefinition.tags],
  }
}
