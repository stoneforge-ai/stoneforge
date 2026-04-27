import { cloneAgent, cloneRoleDefinition, cloneRuntime } from "@stoneforge/core"
import { Effect } from "effect"

import type { SessionId } from "./ids.js"
import {
  cloneAssignment,
  cloneCheckpoint,
  cloneSession,
  cloneTask,
} from "./cloning.js"
import type { DispatchScheduler } from "./dispatch-scheduler.js"
import {
  type AdapterResumeFailed,
  type AgentAdapterService,
  resumeAgentSession,
  SessionRecoveryPolicyExceeded,
  TaskRecoveryUnavailable,
} from "./agent-adapter-runtime.js"
import type { ExecutionState } from "./execution-state.js"
import type {
  Assignment,
  Checkpoint,
  DispatchPolicy,
  Session,
  SessionHandle,
  SessionHeartbeat,
  Task,
} from "./models.js"

export class SessionLifecycle {
  constructor(
    private readonly state: ExecutionState,
    private readonly scheduler: DispatchScheduler,
    private readonly policy: DispatchPolicy
  ) {}

  recordHeartbeat(sessionId: SessionId, note?: string): SessionHeartbeat {
    const session = this.state.requireSession(sessionId)
    const assignment = this.state.requireAssignment(session.assignmentId)
    const intent = this.state.requireDispatchIntent(assignment.dispatchIntentId)
    const observedAt = this.state.now()
    const heartbeat: SessionHeartbeat = {
      sessionId,
      observedAt,
      note,
    }

    session.heartbeats.push(heartbeat)
    session.state = "active"
    session.updatedAt = observedAt
    assignment.state = "running"
    assignment.updatedAt = observedAt
    intent.state = "running"
    intent.updatedAt = observedAt

    if (assignment.owner.type === "task") {
      const task = this.state.requireTask(assignment.owner.taskId)
      task.state = "in_progress"
      task.updatedAt = observedAt
    }

    return { ...heartbeat }
  }

  recordCheckpoint(sessionId: SessionId, checkpoint: Checkpoint): Session {
    const session = this.state.requireSession(sessionId)
    const assignment = this.state.requireAssignment(session.assignmentId)
    const storedCheckpoint = cloneCheckpoint(checkpoint)

    session.checkpoints.push(storedCheckpoint)
    session.state = "checkpointed"
    session.updatedAt = storedCheckpoint.capturedAt

    if (assignment.owner.type === "task") {
      const task = this.state.requireTask(assignment.owner.taskId)
      task.progressRecord.checkpoints.push({
        ...storedCheckpoint,
        assignmentId: assignment.id,
        sessionId: session.id,
      })
      task.updatedAt = storedCheckpoint.capturedAt
    }

    return cloneSession(session)
  }

  recordRecoverableSessionFailure(
    sessionId: SessionId,
    failureState: "crashed" | "expired",
    checkpoint: Checkpoint
  ): Effect.Effect<
    Session,
    | AdapterResumeFailed
    | SessionRecoveryPolicyExceeded
    | TaskRecoveryUnavailable,
    AgentAdapterService
  > {
    const self = this

    return Effect.gen(function* () {
      const failedSession = self.state.requireSession(sessionId)
      const assignment = self.state.requireAssignment(
        failedSession.assignmentId
      )

      if (assignment.owner.type !== "task") {
        return yield* Effect.fail(
          new TaskRecoveryUnavailable({ assignmentId: assignment.id })
        )
      }

      const task = self.state.requireTask(assignment.owner.taskId)

      yield* self.recordRecoverableTaskFailure(
        sessionId,
        failureState,
        checkpoint,
        failedSession,
        assignment,
        task
      )
      const handle = yield* self.resumeTaskSession(
        task,
        assignment,
        checkpoint,
        failedSession
      )
      const replacement = self.scheduler.createSession(
        assignment,
        handle.providerSessionId
      )

      assignment.sessionIds.push(replacement.id)
      assignment.state = "running"
      assignment.updatedAt = self.state.now()

      return cloneSession(replacement)
    }).pipe(
      Effect.withSpan("assignment.resume_session", {
        attributes: {
          "stoneforge.session.id": sessionId,
        },
      })
    )
  }

  private recordRecoverableTaskFailure(
    sessionId: SessionId,
    failureState: "crashed" | "expired",
    checkpoint: Checkpoint,
    failedSession: Session,
    assignment: Assignment,
    task: Task
  ): Effect.Effect<void, SessionRecoveryPolicyExceeded> {
    return Effect.sync(() => {
      this.recordCheckpoint(sessionId, checkpoint)
      failSession(failedSession, failureState, this.state.now())
      assignment.recoveryFailureCount += 1

      if (
        assignment.recoveryFailureCount > this.policy.maxSessionRecoveryFailures
      ) {
        this.escalateRecoveryFailure(assignment, task)
        return "escalated"
      }

      assignment.state = "resume_pending"
      assignment.updatedAt = this.state.now()
      return "resume"
    }).pipe(
      Effect.tap((decision) =>
        Effect.annotateCurrentSpan(
          "stoneforge.policy.decision",
          decision === "escalated" ? "escalate" : "resume"
        )
      ),
      Effect.flatMap((decision) =>
        decision === "escalated"
          ? Effect.fail(
              new SessionRecoveryPolicyExceeded({
                assignmentId: assignment.id,
              })
            )
          : Effect.void
      ),
      Effect.withSpan("dispatch.recovery_decision", {
        attributes: {
          "stoneforge.assignment.id": assignment.id,
          "stoneforge.session.id": failedSession.id,
        },
      })
    )
  }

  private resumeTaskSession(
    task: Task,
    assignment: Assignment,
    checkpoint: Checkpoint,
    failedSession: Session
  ): Effect.Effect<SessionHandle, AdapterResumeFailed, AgentAdapterService> {
    const capabilities = this.state.requireWorkspace(task.workspaceId)
    const agent = requireById(capabilities.agents, assignment.agentId, "Agent")
    const runtime = requireById(
      capabilities.runtimes,
      assignment.runtimeId,
      "Runtime"
    )
    const roleDefinition = requireById(
      capabilities.roleDefinitions,
      assignment.roleDefinitionId,
      "RoleDefinition"
    )

    return resumeAgentSession({
      target: {
        type: "task",
        task: cloneTask(task),
      },
      assignment: cloneAssignment(assignment),
      agent: cloneAgent(agent),
      runtime: cloneRuntime(runtime),
      roleDefinition: cloneRoleDefinition(roleDefinition),
      checkpoint: cloneCheckpoint(checkpoint),
      failedSession: cloneSession(failedSession),
    })
  }

  private escalateRecoveryFailure(assignment: Assignment, task: Task): void {
    assignment.state = "escalated"
    assignment.updatedAt = this.state.now()
    task.state = "human_review_required"
    task.updatedAt = assignment.updatedAt
    this.scheduler.releaseLease(assignment.leaseId)
  }
}

function failSession(
  session: Session,
  failureState: "crashed" | "expired",
  endedAt: string
): void {
  session.state = failureState
  session.endedAt = endedAt
  session.updatedAt = endedAt
}

function requireById<TItem extends { id: string }>(
  items: TItem[],
  id: string,
  label: string
): TItem {
  const item = items.find((candidate) => candidate.id === id)

  if (!item) {
    throw new Error(`${label} ${id} does not exist.`)
  }

  return item
}
