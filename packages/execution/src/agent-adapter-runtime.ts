import { Context, Data, Effect, Layer } from "effect"

import type {
  AgentAdapter,
  AgentAdapterResumeContext,
  AgentAdapterStartContext,
  SessionHandle,
} from "./models.js"
import type { AssignmentId } from "./ids.js"

export class AgentAdapterService extends Context.Tag(
  "@stoneforge/execution/AgentAdapterService"
)<AgentAdapterService, AgentAdapter>() {}

export function agentAdapterRuntime(
  adapter: AgentAdapter
): Layer.Layer<AgentAdapterService> {
  return Layer.succeed(AgentAdapterService, adapter)
}

export class AdapterStartFailed extends Data.TaggedError("AdapterStartFailed")<{
  readonly assignmentId: AssignmentId
}> {
  get message(): string {
    return `Agent adapter failed to start Assignment ${this.assignmentId}.`
  }
}

export class AdapterResumeFailed extends Data.TaggedError(
  "AdapterResumeFailed"
)<{
  readonly assignmentId: AssignmentId
}> {
  get message(): string {
    return `Agent adapter failed to resume Assignment ${this.assignmentId}.`
  }
}

export class TaskRecoveryUnavailable extends Data.TaggedError(
  "TaskRecoveryUnavailable"
)<{
  readonly assignmentId: AssignmentId
}> {
  get message(): string {
    return `Assignment ${this.assignmentId} is not a Task-owned Assignment and cannot use task recovery.`
  }
}

export class SessionRecoveryPolicyExceeded extends Data.TaggedError(
  "SessionRecoveryPolicyExceeded"
)<{
  readonly assignmentId: AssignmentId
}> {
  get message(): string {
    return `Assignment ${this.assignmentId} exceeded session recovery policy.`
  }
}

export function startAgentSession(
  context: AgentAdapterStartContext
): Effect.Effect<SessionHandle, AdapterStartFailed, AgentAdapterService> {
  return Effect.gen(function* () {
    const adapter = yield* AgentAdapterService

    return yield* Effect.tryPromise({
      try: () => adapter.start(context),
      catch: () =>
        new AdapterStartFailed({
          assignmentId: context.assignment.id,
        }),
    })
  }).pipe(
    Effect.withSpan("agent_adapter.start_session", {
      attributes: {
        "stoneforge.assignment.id": context.assignment.id,
        "stoneforge.provider.operation": "start",
      },
    })
  )
}

export function resumeAgentSession(
  context: AgentAdapterResumeContext
): Effect.Effect<SessionHandle, AdapterResumeFailed, AgentAdapterService> {
  return Effect.gen(function* () {
    const adapter = yield* AgentAdapterService

    return yield* Effect.tryPromise({
      try: () => adapter.resume(context),
      catch: () =>
        new AdapterResumeFailed({
          assignmentId: context.assignment.id,
        }),
    })
  }).pipe(
    Effect.withSpan("agent_adapter.resume_session", {
      attributes: {
        "stoneforge.assignment.id": context.assignment.id,
        "stoneforge.session.id": context.failedSession.id,
        "stoneforge.provider.operation": "resume",
      },
    })
  )
}
