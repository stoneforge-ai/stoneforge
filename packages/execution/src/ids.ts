import type {
  AgentId,
  AssignmentId,
  IdSequence,
  ProviderInstanceId,
  RuntimeId,
  SessionId,
  TaskId,
  WorkspaceId
} from "./base-models.js"

export function makeWorkspaceId(value: string): WorkspaceId {
  return makeId(value, "WorkspaceId") as WorkspaceId
}

export function makeRuntimeId(value: string): RuntimeId {
  return makeId(value, "RuntimeId") as RuntimeId
}

export function makeAgentId(value: string): AgentId {
  return makeId(value, "AgentId") as AgentId
}

export function makeTaskId(value: string): TaskId {
  return makeId(value, "TaskId") as TaskId
}

export function makeAssignmentId(value: string): AssignmentId {
  return makeId(value, "AssignmentId") as AssignmentId
}

export function makeProviderInstanceId(value: string): ProviderInstanceId {
  return makeId(value, "ProviderInstanceId") as ProviderInstanceId
}

export function makeSessionId(value: string): SessionId {
  return makeId(value, "SessionId") as SessionId
}

export function createDefaultIdSequence(): IdSequence {
  let agentCounter = 0
  let assignmentCounter = 0
  let sessionCounter = 0
  let taskCounter = 0

  return {
    nextAgentId: () => makeAgentId(`agent-${String((agentCounter += 1))}`),
    nextAssignmentId: () =>
      makeAssignmentId(`assignment-${String((assignmentCounter += 1))}`),
    nextSessionId: () => makeSessionId(`session-${String((sessionCounter += 1))}`),
    nextTaskId: () => makeTaskId(`task-${String((taskCounter += 1))}`)
  }
}

function makeId(value: string, name: string): string {
  const trimmed = value.trim()

  if (trimmed === "") {
    throw new Error(`${name} cannot be empty.`)
  }

  return trimmed
}
