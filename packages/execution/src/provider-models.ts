import type {
  AgentConfig,
  AssignmentId,
  ProviderInstanceId,
  ProviderKind,
  RuntimeConfig,
  SessionConnectivity,
  SessionId,
  TaskExecutionContext,
  WorkspaceView
} from "./base-models.js"
import { makeProviderInstanceId } from "./ids.js"

let providerInstanceCounter = 0

export interface ProviderSessionStartContext {
  readonly agent: AgentConfig
  readonly assignmentId: AssignmentId
  readonly noCode: true
  readonly runtime: RuntimeConfig
  readonly sessionId: SessionId
  readonly task: TaskExecutionContext
  readonly workspace: WorkspaceView
}

export interface ProviderSessionResumeContext extends ProviderSessionStartContext {
  readonly previousSession: ProviderSessionIdentity
  readonly resumePrompt: string
}

export interface ProviderSessionControlContext {
  readonly assignmentId: AssignmentId
  readonly providerSession: ProviderSessionIdentity
  readonly reason?: string
  readonly sessionId: SessionId
}

export type ProviderSessionLifecycleState =
  | "canceled"
  | "completed"
  | "failed"
  | "interrupted"
  | "running"

export type TerminalProviderSessionStatus = Exclude<
  ProviderSessionLifecycleState,
  "running"
>

export type ProviderSessionOperation =
  | "cancel"
  | "collect-terminal-outcome"
  | "interrupt"
  | "resume"
  | "start"

export interface ProviderSessionCapabilities {
  readonly connectivity: SessionConnectivity
  readonly supportsCancel: boolean
  readonly supportsInterrupt: boolean
  readonly supportsResume: boolean
  readonly supportsSteering: boolean
  readonly supportsTerminalOutcomeCollection: boolean
}

export type ProviderExternalIdentity =
  | {
      readonly kind: "claude.session"
      readonly sessionId: string
    }
  | {
      readonly kind: "codex.thread"
      readonly threadId: string
    }
  | {
      readonly kind: "codex.turn"
      readonly threadId: string
      readonly turnId: string
    }

export interface ProviderSessionIdentity {
  readonly external: readonly ProviderExternalIdentity[]
  readonly provider: ProviderKind
  readonly providerInstanceId: ProviderInstanceId
  readonly providerSessionId: string
}

export type ProviderTranscriptRole = "assistant" | "system" | "tool" | "user"

export interface ProviderTranscriptEntry {
  readonly providerItemId?: string
  readonly role: ProviderTranscriptRole
  readonly text: string
}

export type ProviderLogLevel = "debug" | "error" | "info" | "warn"

export interface ProviderLogEntry {
  readonly level: ProviderLogLevel
  readonly message: string
}

export type ProviderSessionEvent =
  | {
      readonly kind: "provider.event"
      readonly name: string
      readonly providerItemId?: string
    }
  | {
      readonly kind: "provider.log"
      readonly level: ProviderLogLevel
      readonly message: string
    }
  | {
      readonly kind: "provider.session.completed"
      readonly status: TerminalProviderSessionStatus
      readonly summary: string
    }
  | {
      readonly kind: "provider.session.started"
      readonly providerSessionId: string
    }
  | {
      readonly kind: "provider.transcript.delta"
      readonly providerItemId?: string
      readonly role: ProviderTranscriptRole
      readonly text: string
    }
  | {
      readonly kind: "provider.transcript.item.completed"
      readonly providerItemId?: string
      readonly role: ProviderTranscriptRole
      readonly text: string
    }
  | {
      readonly kind: "provider.turn.started"
      readonly turnId: string
    }

export interface ProviderSessionReport {
  readonly events: readonly ProviderSessionEvent[]
  readonly logs: readonly ProviderLogEntry[]
  readonly transcript: readonly ProviderTranscriptEntry[]
}

export interface ProviderTerminalOutcome {
  readonly providerSession: ProviderSessionIdentity
  readonly status: TerminalProviderSessionStatus
  readonly summary: string
}

export interface ProviderSessionStartResult extends ProviderSessionReport {
  readonly providerSession: ProviderSessionIdentity
  readonly sessionId: SessionId
  readonly status: ProviderSessionLifecycleState
  readonly terminalOutcome?: ProviderTerminalOutcome
}

export interface CompleteProviderSessionInput {
  readonly context: ProviderSessionStartContext
  readonly events: readonly ProviderSessionEvent[]
  readonly logs: readonly ProviderLogEntry[]
  readonly providerSession: ProviderSessionIdentity
  readonly summary: string
  readonly transcript: readonly ProviderTranscriptEntry[]
}

export function completeProviderSession(
  input: CompleteProviderSessionInput
): ProviderSessionStartResult {
  return {
    events: input.events,
    logs: input.logs,
    providerSession: input.providerSession,
    sessionId: input.context.sessionId,
    status: "completed",
    terminalOutcome: {
      providerSession: input.providerSession,
      status: "completed",
      summary: input.summary
    },
    transcript: input.transcript
  }
}

export type ProviderSessionResumeResult = ProviderSessionStartResult

export interface ProviderSessionOperationResult {
  readonly providerSession: ProviderSessionIdentity
  readonly status: ProviderSessionLifecycleState
}

export class ProviderOperationUnsupportedError extends Error {
  readonly code = "provider_operation_unsupported"

  constructor(
    readonly details: {
      readonly operation: ProviderSessionOperation
      readonly provider: ProviderKind
      readonly providerInstanceId: ProviderInstanceId
    }
  ) {
    super(
      `${details.provider} provider instance ${details.providerInstanceId} does not support ${details.operation}.`
    )
    this.name = "ProviderOperationUnsupportedError"
  }
}

export interface ExecutionProviderInstance {
  readonly capabilities: ProviderSessionCapabilities
  readonly displayName?: string
  readonly id: ProviderInstanceId
  readonly provider: ProviderKind
  readonly cancelSession: (
    context: ProviderSessionControlContext
  ) => Promise<ProviderSessionOperationResult>
  readonly collectTerminalOutcome: (
    context: ProviderSessionControlContext
  ) => Promise<ProviderTerminalOutcome>
  readonly interruptSession: (
    context: ProviderSessionControlContext
  ) => Promise<ProviderSessionOperationResult>
  readonly resumeSession: (
    context: ProviderSessionResumeContext
  ) => Promise<ProviderSessionResumeResult>
  readonly startSession: (
    context: ProviderSessionStartContext
  ) => Promise<ProviderSessionStartResult>
}

export interface DefineProviderInstanceInput {
  readonly capabilities?: Partial<ProviderSessionCapabilities>
  readonly connectivity: SessionConnectivity
  readonly displayName?: string
  readonly id?: ProviderInstanceId | string
  readonly provider: ProviderKind
  readonly startSession: ExecutionProviderInstance["startSession"]
}

export function defineProviderInstance(
  input: DefineProviderInstanceInput
): ExecutionProviderInstance {
  const providerInstanceId =
    input.id === undefined
      ? makeProviderInstanceId(
          `provider-instance-${String((providerInstanceCounter += 1))}`
        )
      : makeProviderInstanceId(input.id)

  return {
    capabilities: {
      connectivity: input.connectivity,
      supportsCancel: false,
      supportsInterrupt: false,
      supportsResume: false,
      supportsSteering: false,
      supportsTerminalOutcomeCollection: false,
      ...input.capabilities
    },
    displayName: input.displayName,
    id: providerInstanceId,
    provider: input.provider,
    cancelSession: unsupportedProviderOperation(
      "cancel",
      input.provider,
      providerInstanceId
    ),
    collectTerminalOutcome: unsupportedProviderOperation(
      "collect-terminal-outcome",
      input.provider,
      providerInstanceId
    ),
    interruptSession: unsupportedProviderOperation(
      "interrupt",
      input.provider,
      providerInstanceId
    ),
    resumeSession: unsupportedProviderOperation(
      "resume",
      input.provider,
      providerInstanceId
    ),
    startSession: input.startSession
  }
}

function unsupportedProviderOperation(
  operation: Exclude<ProviderSessionOperation, "start">,
  provider: ProviderKind,
  providerInstanceId: ProviderInstanceId
): () => Promise<never> {
  return async () => {
    throw new ProviderOperationUnsupportedError({
      operation,
      provider,
      providerInstanceId
    })
  }
}
