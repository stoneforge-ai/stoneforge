import type {
  AgentConfig,
  AssignmentId,
  SessionId,
  SessionView
} from "../../models.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionEvent
} from "../../providers/models.js"
import { sessionWithProviderEvent } from "./session-event-state.js"

export function sessionWithDispatchFailure(input: {
  readonly agent: AgentConfig
  readonly assignmentId: AssignmentId
  readonly existingSession?: SessionView
  readonly message: string
  readonly providerInstance: ExecutionProviderInstance
  readonly sessionId: SessionId
}): SessionView {
  const baseSession =
    input.existingSession ??
    emptyFailedSession({
      agent: input.agent,
      assignmentId: input.assignmentId,
      providerInstance: input.providerInstance,
      sessionId: input.sessionId
    })
  const failureEvents: readonly ProviderSessionEvent[] = [
    {
      kind: "provider.log",
      level: "error",
      message: input.message
    },
    {
      kind: "provider.session.completed",
      status: "failed",
      summary: input.message
    }
  ]

  return failureEvents.reduce(sessionWithProviderEvent, baseSession)
}

function emptyFailedSession(input: {
  readonly agent: AgentConfig
  readonly assignmentId: AssignmentId
  readonly providerInstance: ExecutionProviderInstance
  readonly sessionId: SessionId
}): SessionView {
  const providerSessionId = `${input.agent.provider}:pending:${input.sessionId}`

  return {
    id: input.sessionId,
    assignmentId: input.assignmentId,
    connectivity: input.providerInstance.capabilities.connectivity,
    events: [],
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
  }
}
