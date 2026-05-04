import { agentView } from "./view.js"
import { PlacementFailure } from "./errors.js"
import type { ExecutionState, TaskRecord, WorkspaceRecord } from "./state.js"
import type {
  AgentConfig,
  AgentTag,
  ProviderInstanceId,
  RuntimeConfig,
  TaskId,
  WorkspaceId
} from "../models.js"
import type { ExecutionProviderInstance } from "../provider-models.js"

export function nextReadyTask(
  state: ExecutionState,
  workspaceId: WorkspaceId
): TaskRecord | undefined {
  return [...state.tasks.values()].find((task) => {
    return task.workspaceId === workspaceId && task.state === "ready"
  })
}

export function requireEligibleAgent(
  agents: readonly AgentConfig[],
  requiredTags: readonly AgentTag[]
): AgentConfig {
  const agent = agents.find((candidate) => {
    const tags = new Set(agentView(candidate).systemTags)
    return requiredTags.every((tag) => tags.has(tag))
  })

  if (agent === undefined) {
    throw new PlacementFailure({
      message: "No eligible Agent satisfies the required Agent tags."
    })
  }

  return agent
}

export function requireRuntime(
  runtimes: readonly RuntimeConfig[],
  acceptableRuntimes: AgentConfig["acceptableRuntimes"]
): RuntimeConfig {
  const acceptable = [...acceptableRuntimes].sort(runtimePriorityOrder)

  for (const candidate of acceptable) {
    const runtime = runtimes.find((item) => item.id === candidate.id)

    if (runtime?.state === "healthy") {
      return runtime
    }
  }

  throw new PlacementFailure({
    message: "No healthy Runtime is acceptable for the selected Agent."
  })
}

export function requireProviderRuntime(
  state: ExecutionState,
  providerInstanceId: ProviderInstanceId
): ExecutionProviderInstance {
  const providerInstance = state.providerInstances.get(providerInstanceId)

  if (providerInstance === undefined) {
    throw new PlacementFailure({
      message: `No provider instance is registered for ${providerInstanceId}.`
    })
  }

  return providerInstance
}

export function requireWorkspace(
  state: ExecutionState,
  workspaceId: WorkspaceId
): WorkspaceRecord {
  const workspace = state.workspaces.get(workspaceId)

  if (workspace === undefined) {
    throw new PlacementFailure({
      message: `Workspace ${workspaceId} has not been configured.`
    })
  }

  return workspace
}

export function requireTask(
  state: ExecutionState,
  workspaceId: WorkspaceId,
  taskId: TaskId
): TaskRecord {
  const task = state.tasks.get(taskId)

  if (task?.workspaceId === workspaceId) {
    return task
  }

  throw new PlacementFailure({
    message: `Task ${taskId} does not exist in Workspace ${workspaceId}.`
  })
}

function runtimePriorityOrder(
  left: AgentConfig["acceptableRuntimes"][number],
  right: AgentConfig["acceptableRuntimes"][number]
): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority
  }

  return left.id.localeCompare(right.id)
}
