import { createDefaultIdSequence } from "../ids.js"
import type {
  AgentConfig,
  AssignmentId,
  AssignmentView,
  CreateExecutionControlPlaneInput,
  ExecutionLineageEvent,
  IdSequence,
  ProviderInstanceId,
  RuntimeConfig,
  SessionView,
  TaskId,
  TaskView,
  WorkspaceId,
  WorkspaceView
} from "../models.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionStartResult
} from "../provider-models.js"

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
  state.assignments.push({
    agentId: input.agent.id,
    id: input.assignmentId,
    provider: input.agent.provider,
    providerInstanceId: input.agent.providerInstanceId,
    runtimeId: input.runtime.id,
    sessionId: input.providerResult.sessionId,
    status: "completed",
    taskId: input.task.id
  })
  state.sessions.push({
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
  })
  state.tasks.set(input.task.id, { ...input.task, state: "completed" })
  state.lineage.push({
    event: "session.completed",
    providerInstanceId: input.agent.providerInstanceId,
    providerSessionId: input.providerResult.providerSession.providerSessionId,
    sessionId: input.providerResult.sessionId
  })
  state.lineage.push({ event: "task.completed", taskId: input.task.id })
}
