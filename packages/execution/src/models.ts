import type {
  AgentConfig,
  AgentConfigInput,
  AgentId,
  AgentTag,
  AssignmentId,
  AssignmentStatus,
  GitHubRepositoryConfig,
  IdSequence,
  ProviderInstanceId,
  ProviderKind,
  RuntimeConfig,
  RuntimeConfigInput,
  RuntimeId,
  SessionConnectivity,
  SessionId,
  SessionStatus,
  TaskId,
  TaskState,
  WorkspaceId,
  WorkspaceView
} from "./base-models.js"
import type {
  ExecutionProviderInstance,
  ProviderLogEntry,
  ProviderSessionEvent,
  ProviderSessionIdentity,
  ProviderSessionStartResult,
  ProviderTranscriptEntry
} from "./provider-models.js"

export type {
  AcceptableRuntime,
  AcceptableRuntimeInput,
  AgentConfig,
  AgentConfigInput,
  AgentId,
  AgentTag,
  AssignmentId,
  AssignmentStatus,
  GitHubRepositoryConfig,
  IdSequence,
  ProviderInstanceId,
  ProviderKind,
  RuntimeConfig,
  RuntimeConfigInput,
  RuntimeId,
  RuntimeState,
  RuntimeType,
  SessionConnectivity,
  SessionId,
  SessionStatus,
  TaskExecutionContext,
  TaskId,
  TaskState,
  WorkspaceId,
  WorkspaceView,
  WorkspaceState
} from "./base-models.js"

export interface ConfigureWorkspaceInput {
  readonly agents: readonly AgentConfigInput[]
  readonly id: WorkspaceId | string
  readonly repository: GitHubRepositoryConfig
  readonly runtimes: readonly RuntimeConfigInput[]
}

export interface CreateNoCodeTaskInput {
  readonly id?: TaskId | string
  readonly intent: string
  readonly requiredAgentTags: readonly AgentTag[]
  readonly title: string
  readonly workspaceId: WorkspaceId | string
}

export interface ActivateTaskInput {
  readonly taskId: TaskId | string
  readonly workspaceId: WorkspaceId | string
}

export interface DispatchNextTaskInput {
  readonly workspaceId: WorkspaceId | string
}

export interface ReadWorkspaceExecutionInput {
  readonly workspaceId: WorkspaceId | string
}

export interface CodexAppServerTurnInput {
  readonly cwd?: string
  readonly model: string
  readonly prompt: string
}

export interface CodexAppServerTurnResult {
  readonly events: readonly ProviderSessionEvent[]
  readonly finalSummary: string
  readonly logs: readonly ProviderLogEntry[]
  readonly status: "completed"
  readonly transcript: readonly ProviderTranscriptEntry[]
  readonly threadId: string
  readonly turnId: string
}

export interface CodexAppServerClient {
  readonly runTurn: (
    input: CodexAppServerTurnInput
  ) => Promise<CodexAppServerTurnResult>
}

export interface CreateExecutionControlPlaneInput {
  readonly idSequence?: IdSequence
  readonly providerInstances: readonly ExecutionProviderInstance[]
}

export interface ExecutionControlPlane {
  readonly activateTask: (input: ActivateTaskInput) => Promise<TaskView>
  readonly configureWorkspace: (
    input: ConfigureWorkspaceInput
  ) => Promise<WorkspaceView>
  readonly createNoCodeTask: (
    input: CreateNoCodeTaskInput
  ) => Promise<TaskView>
  readonly dispatchNextTask: (
    input: DispatchNextTaskInput
  ) => Promise<DispatchNextTaskResult>
  readonly readWorkspaceExecution: (
    input: ReadWorkspaceExecutionInput
  ) => Promise<WorkspaceExecutionSnapshot>
}

export interface TaskView {
  readonly id: TaskId
  readonly requiredAgentTags: readonly AgentTag[]
  readonly state: TaskState
  readonly title: string
}

export interface AgentView {
  readonly id: AgentId
  readonly provider: ProviderKind
  readonly providerInstanceId: ProviderInstanceId
  readonly systemTags: readonly AgentTag[]
}

export interface AssignmentView {
  readonly id: AssignmentId
  readonly agentId: AgentId
  readonly provider: ProviderKind
  readonly providerInstanceId: ProviderInstanceId
  readonly runtimeId: RuntimeId
  readonly sessionId: SessionId
  readonly status: AssignmentStatus
  readonly taskId: TaskId
}

export interface SessionView {
  readonly id: SessionId
  readonly assignmentId: AssignmentId
  readonly connectivity: SessionConnectivity
  readonly events: readonly ProviderSessionEvent[]
  readonly finalSummary: string
  readonly logs: readonly ProviderLogEntry[]
  readonly provider: ProviderKind
  readonly providerInstanceId: ProviderInstanceId
  readonly providerSession: ProviderSessionIdentity
  readonly providerSessionId: string
  readonly status: SessionStatus
  readonly transcript: readonly ProviderTranscriptEntry[]
}

export type ExecutionLineageEvent =
  | {
      readonly event: "task.created"
      readonly taskId: TaskId
    }
  | {
      readonly event: "task.activated"
      readonly taskId: TaskId
    }
  | {
      readonly assignmentId: AssignmentId
      readonly event: "assignment.started"
      readonly provider: ProviderKind
      readonly providerInstanceId: ProviderInstanceId
      readonly taskId: TaskId
    }
  | {
      readonly event: "session.completed"
      readonly providerInstanceId: ProviderInstanceId
      readonly providerSessionId: string
      readonly sessionId: SessionId
    }
  | {
      readonly event: "task.completed"
      readonly taskId: TaskId
    }

export interface WorkspaceExecutionSnapshot {
  readonly agents: readonly AgentView[]
  readonly assignments: readonly AssignmentView[]
  readonly lineage: readonly ExecutionLineageEvent[]
  readonly sessions: readonly SessionView[]
  readonly tasks: readonly TaskView[]
  readonly workspace: WorkspaceView
}

export type DispatchNextTaskResult =
  | {
      readonly assignmentId: AssignmentId
      readonly provider: ProviderKind
      readonly providerInstanceId: ProviderInstanceId
      readonly sessionId: SessionId
      readonly status: "completed"
      readonly taskId: TaskId
    }
  | {
      readonly reason: "no_ready_task"
      readonly status: "queued"
    }
