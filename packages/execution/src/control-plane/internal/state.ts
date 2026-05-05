import { createDefaultIdSequence } from "../../ids.js"
import type {
  AgentConfig,
  AssignmentId,
  AssignmentView,
  CreateExecutionControlPlaneInput,
  ExecutionLineageEvent,
  IdSequence,
  ProviderInstanceId,
  RuntimeConfig,
  SessionId,
  SessionView,
  TaskId,
  TaskView,
  WorkspaceId,
  WorkspaceView
} from "../../models.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionEvent,
  ProviderSessionStartResult
} from "../../providers/models.js"
import { sessionWithDispatchFailure } from "./failed-session-state.js"
import { sessionWithProviderEvent } from "./session-event-state.js"

export interface TaskRecord extends TaskView {
  readonly intent: string
  readonly workspaceId: WorkspaceId
}

export interface WorkspaceRecord {
  readonly agents: readonly AgentConfig[]
  readonly runtimes: readonly RuntimeConfig[]
  readonly workspace: WorkspaceView
}

export interface ExecutionState {
  readonly assignments: AssignmentView[]
  readonly idSequence: IdSequence
  readonly lineage: ExecutionLineageEvent[]
  readonly providerInstances: Map<ProviderInstanceId, ExecutionProviderInstance>
  readonly sessions: SessionView[]
  readonly tasks: Map<TaskId, TaskRecord>
  readonly workspaces: Map<WorkspaceId, WorkspaceRecord>
}

export function createExecutionState(
  input: CreateExecutionControlPlaneInput
): ExecutionState {
  return {
    assignments: [],
    idSequence: input.idSequence ?? createDefaultIdSequence(),
    lineage: [],
    providerInstances: new Map(
      input.providerInstances.map((instance) => [
        instance.id,
        instance
      ])
    ),
    sessions: [],
    tasks: new Map(),
    workspaces: new Map()
  }
}

export function recordCompletedDispatch(
  state: ExecutionState,
  input: {
    readonly agent: AgentConfig
    readonly assignmentId: AssignmentId
    readonly providerInstance: ExecutionProviderInstance
    readonly providerResult: ProviderSessionStartResult
    readonly runtime: RuntimeConfig
    readonly task: TaskRecord
  }
) {
  const assignment = {
    agentId: input.agent.id,
    id: input.assignmentId,
    provider: input.agent.provider,
    providerInstanceId: input.agent.providerInstanceId,
    runtimeId: input.runtime.id,
    sessionId: input.providerResult.sessionId,
    status: "completed",
    taskId: input.task.id
  } satisfies AssignmentView
  const session = {
    id: input.providerResult.sessionId,
    assignmentId: input.assignmentId,
    connectivity: input.providerInstance.capabilities.connectivity,
    events: input.providerResult.events,
    finalSummary: input.providerResult.terminalOutcome?.summary ?? "",
    logs: input.providerResult.logs,
    provider: input.agent.provider,
    providerInstanceId: input.agent.providerInstanceId,
    providerSession: input.providerResult.providerSession,
    providerSessionId: input.providerResult.providerSession.providerSessionId,
    status: "completed",
    transcript: input.providerResult.transcript
  } satisfies SessionView

  upsertAssignment(state, assignment)
  upsertSession(state, session)
  state.tasks.set(input.task.id, { ...input.task, state: "completed" })
  state.lineage.push({
    event: "session.completed",
    providerInstanceId: input.agent.providerInstanceId,
    providerSessionId: input.providerResult.providerSession.providerSessionId,
    sessionId: input.providerResult.sessionId
  })
  state.lineage.push({ event: "task.completed", taskId: input.task.id })
}

export function recordStartedDispatch(
  state: ExecutionState,
  input: {
    readonly agent: AgentConfig
    readonly assignmentId: AssignmentId
    readonly providerInstance: ExecutionProviderInstance
    readonly runtime: RuntimeConfig
    readonly sessionId: SessionId
    readonly task: TaskRecord
  }
) {
  const providerSessionId = pendingProviderSessionId(
    input.agent.provider,
    input.sessionId
  )

  upsertAssignment(state, {
    agentId: input.agent.id,
    id: input.assignmentId,
    provider: input.agent.provider,
    providerInstanceId: input.agent.providerInstanceId,
    runtimeId: input.runtime.id,
    sessionId: input.sessionId,
    status: "running",
    taskId: input.task.id
  })
  upsertSession(state, {
    id: input.sessionId,
    assignmentId: input.assignmentId,
    connectivity: input.providerInstance.capabilities.connectivity,
    events: [
      {
        kind: "provider.session.started",
        providerSessionId
      }
    ],
    finalSummary: "",
    logs: [],
    provider: input.agent.provider,
    providerInstanceId: input.agent.providerInstanceId,
    providerSession: {
      external: [],
      provider: input.agent.provider,
      providerInstanceId: input.agent.providerInstanceId,
      providerSessionId
    },
    providerSessionId,
    status: "running",
    transcript: []
  })
  state.tasks.set(input.task.id, { ...input.task, state: "in_progress" })
  state.lineage.push({
    assignmentId: input.assignmentId,
    event: "assignment.started",
    provider: input.agent.provider,
    providerInstanceId: input.agent.providerInstanceId,
    taskId: input.task.id
  })
}

export function recordFailedDispatch(
  state: ExecutionState,
  input: {
    readonly agent: AgentConfig
    readonly assignmentId: AssignmentId
    readonly message: string
    readonly providerInstance: ExecutionProviderInstance
    readonly runtime: RuntimeConfig
    readonly sessionId: SessionId
    readonly task: TaskRecord
  }
) {
  upsertAssignment(state, {
    agentId: input.agent.id,
    id: input.assignmentId,
    provider: input.agent.provider,
    providerInstanceId: input.agent.providerInstanceId,
    runtimeId: input.runtime.id,
    sessionId: input.sessionId,
    status: "failed",
    taskId: input.task.id
  })
  const session = failedDispatchSession(state, input)

  upsertSession(state, session)
  state.tasks.set(input.task.id, { ...input.task, state: "ready" })
  state.lineage.push({
    event: "session.failed",
    message: input.message,
    providerInstanceId: input.agent.providerInstanceId,
    providerSessionId: session.providerSessionId,
    sessionId: input.sessionId
  })
}

export function recordProviderSessionEvent(
  state: ExecutionState,
  sessionId: SessionId,
  event: ProviderSessionEvent
) {
  const session = state.sessions.find((candidate) => candidate.id === sessionId)

  if (session === undefined) {
    return
  }

  upsertSession(state, sessionWithProviderEvent(session, event))
}

function upsertAssignment(state: ExecutionState, assignment: AssignmentView) {
  const index = state.assignments.findIndex(
    (candidate) => candidate.id === assignment.id
  )

  if (index === -1) {
    state.assignments.push(assignment)
    return
  }

  state.assignments[index] = assignment
}

function upsertSession(state: ExecutionState, session: SessionView) {
  const index = state.sessions.findIndex(
    (candidate) => candidate.id === session.id
  )

  if (index === -1) {
    state.sessions.push(session)
    return
  }

  state.sessions[index] = session
}

function failedDispatchSession(
  state: ExecutionState,
  input: {
    readonly agent: AgentConfig
    readonly assignmentId: AssignmentId
    readonly message: string
    readonly providerInstance: ExecutionProviderInstance
    readonly sessionId: SessionId
  }
): SessionView {
  const existingSession = state.sessions.find(
    (candidate) => candidate.id === input.sessionId
  )

  return sessionWithDispatchFailure({ ...input, existingSession })
}

function pendingProviderSessionId(
  provider: AgentConfig["provider"],
  sessionId: SessionId
) {
  return `${provider}:pending:${sessionId}`
}
