import type { ExecutionState, TaskRecord } from "./state.js"
import type {
  AgentConfig,
  AgentView,
  RuntimeConfig,
  TaskId,
  TaskView,
  WorkspaceId,
  WorkspaceView
} from "../../models.js"

export function workspaceState(
  runtimes: readonly RuntimeConfig[],
  agents: readonly AgentConfig[]
): WorkspaceView["state"] {
  const hasHealthyRuntime = runtimes.some((runtime) => runtime.state === "healthy")
  return hasHealthyRuntime && agents.length > 0 ? "ready" : "degraded"
}

export function agentView(agent: AgentConfig): AgentView {
  return {
    id: agent.id,
    provider: agent.provider,
    providerInstanceId: agent.providerInstanceId,
    systemTags: [
      `agent:${agent.id}`,
      `model:${agent.model}`,
      `model-family:${agent.modelFamily}`,
      `provider-instance:${agent.providerInstanceId}`,
      `provider:${agent.provider}`
    ]
  }
}

export function taskView(task: TaskRecord): TaskView {
  return {
    id: task.id,
    requiredAgentTags: task.requiredAgentTags,
    state: task.state,
    title: task.title
  }
}

export function workspaceTaskIds(
  state: ExecutionState,
  workspaceId: WorkspaceId
): Set<TaskId> {
  return new Set(
    [...state.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId)
      .map((task) => task.id)
  )
}
