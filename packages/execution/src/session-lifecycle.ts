import {
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
} from "@stoneforge/core";

import type { SessionId } from "./ids.js";
import {
  cloneAssignment,
  cloneCheckpoint,
  cloneSession,
  cloneTask,
} from "./cloning.js";
import type { DispatchScheduler } from "./dispatch-scheduler.js";
import type { ExecutionState } from "./execution-state.js";
import type {
  AgentAdapter,
  Checkpoint,
  DispatchPolicy,
  Session,
  SessionHeartbeat,
} from "./models.js";

export class SessionLifecycle {
  constructor(
    private readonly state: ExecutionState,
    private readonly scheduler: DispatchScheduler,
    private readonly adapter: AgentAdapter,
    private readonly policy: DispatchPolicy,
  ) {}

  recordHeartbeat(sessionId: SessionId, note?: string): SessionHeartbeat {
    const session = this.state.requireSession(sessionId);
    const assignment = this.state.requireAssignment(session.assignmentId);
    const intent = this.state.requireDispatchIntent(assignment.dispatchIntentId);
    const observedAt = this.state.now();
    const heartbeat: SessionHeartbeat = {
      sessionId,
      observedAt,
      note,
    };

    session.heartbeats.push(heartbeat);
    session.state = "active";
    session.updatedAt = observedAt;
    assignment.state = "running";
    assignment.updatedAt = observedAt;
    intent.state = "running";
    intent.updatedAt = observedAt;

    if (assignment.owner.type === "task") {
      const task = this.state.requireTask(assignment.owner.taskId);
      task.state = "in_progress";
      task.updatedAt = observedAt;
    }

    return { ...heartbeat };
  }

  recordCheckpoint(sessionId: SessionId, checkpoint: Checkpoint): Session {
    const session = this.state.requireSession(sessionId);
    const assignment = this.state.requireAssignment(session.assignmentId);
    const storedCheckpoint = cloneCheckpoint(checkpoint);

    session.checkpoints.push(storedCheckpoint);
    session.state = "checkpointed";
    session.updatedAt = storedCheckpoint.capturedAt;

    if (assignment.owner.type === "task") {
      const task = this.state.requireTask(assignment.owner.taskId);
      task.continuity.push({
        ...storedCheckpoint,
        assignmentId: assignment.id,
        sessionId: session.id,
      });
      task.updatedAt = storedCheckpoint.capturedAt;
    }

    return cloneSession(session);
  }

  async recordRecoverableSessionFailure(
    sessionId: SessionId,
    failureState: "crashed" | "expired",
    checkpoint: Checkpoint,
  ): Promise<Session> {
    const failedSession = this.state.requireSession(sessionId);
    const assignment = this.state.requireAssignment(failedSession.assignmentId);

    if (assignment.owner.type !== "task") {
      throw new Error(
        `Assignment ${assignment.id} is not a Task-owned Assignment and cannot use task recovery.`,
      );
    }

    const task = this.state.requireTask(assignment.owner.taskId);

    this.recordCheckpoint(sessionId, checkpoint);
    failSession(failedSession, failureState, this.state.now());
    assignment.recoveryFailureCount += 1;

    if (assignment.recoveryFailureCount > this.policy.maxSessionRecoveryFailures) {
      assignment.state = "escalated";
      assignment.updatedAt = this.state.now();
      task.state = "human_review_required";
      task.updatedAt = assignment.updatedAt;
      this.scheduler.releaseLease(assignment.leaseId);
      throw new Error(
        `Assignment ${assignment.id} exceeded session recovery policy.`,
      );
    }

    assignment.state = "resume_pending";
    assignment.updatedAt = this.state.now();

    const capabilities = this.state.requireWorkspace(task.workspaceId);
    const agent = requireById(capabilities.agents, assignment.agentId, "Agent");
    const runtime = requireById(
      capabilities.runtimes,
      assignment.runtimeId,
      "Runtime",
    );
    const roleDefinition = requireById(
      capabilities.roleDefinitions,
      assignment.roleDefinitionId,
      "RoleDefinition",
    );
    const handle = await this.adapter.resume({
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
    });
    const replacement = this.scheduler.createSession(
      assignment,
      handle.providerSessionId,
    );

    assignment.sessionIds.push(replacement.id);
    assignment.state = "running";
    assignment.updatedAt = this.state.now();

    return cloneSession(replacement);
  }
}

function failSession(
  session: Session,
  failureState: "crashed" | "expired",
  endedAt: string,
): void {
  session.state = failureState;
  session.endedAt = endedAt;
  session.updatedAt = endedAt;
}

function requireById<TItem extends { id: string }>(
  items: TItem[],
  id: string,
  label: string,
): TItem {
  const item = items.find((candidate) => candidate.id === id);

  if (!item) {
    throw new Error(`${label} ${id} does not exist.`);
  }

  return item;
}
