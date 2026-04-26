import {
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
} from "@stoneforge/core";
import type { Agent, Runtime, RoleDefinition } from "@stoneforge/core";

import type { AgentId } from "@stoneforge/core";
import type { LeaseId } from "./ids.js";
import { cloneAssignment, cloneDispatchIntent } from "./cloning.js";
import {
  buildAdapterTarget,
  createAssignment,
  createLease,
  createSession,
  endActiveSession,
} from "./dispatch-records.js";
import type { ExecutionState } from "./execution-state.js";
import type { TaskLifecycle } from "./task-lifecycle.js";
import type {
  AgentAdapter,
  Assignment,
  DispatchIntent,
  DispatchPolicy,
  Lease,
  PlacementFailureReason,
  Session,
  Task,
} from "./models.js";
import { resolvePlacement } from "./placement.js";

export class DispatchScheduler {
  constructor(
    private readonly state: ExecutionState,
    private readonly tasks: TaskLifecycle,
    private readonly adapter: AgentAdapter,
    private readonly policy: DispatchPolicy,
  ) {}

  async runOnce(): Promise<DispatchIntent | null> {
    const intent = this.nextDispatchIntent();

    if (!intent) {
      return null;
    }

    return this.dispatchIntent(intent);
  }

  private async dispatchIntent(
    intent: DispatchIntent,
  ): Promise<DispatchIntent> {
    this.requeueRetryIntent(intent);

    const task = this.readyTaskForIntent(intent);

    if (intent.targetType === "task" && !task) {
      this.recordPlacementFailure(intent, "task_not_ready");
      return cloneDispatchIntent(intent);
    }

    const placement = resolvePlacement(
      this.state.requireWorkspace(intent.workspaceId),
      intent,
      (agent) => this.activeLeaseCount(agent.id),
    );

    if ("reason" in placement) {
      this.recordPlacementFailure(intent, placement.reason);
      return cloneDispatchIntent(intent);
    }

    return this.startAssignment(intent, task, placement);
  }

  completeAssignment(assignmentId: Assignment["id"]): Assignment {
    const assignment = this.state.requireAssignment(assignmentId);
    const intent = this.state.requireDispatchIntent(
      assignment.dispatchIntentId,
    );
    const now = this.state.now();

    for (const sessionId of assignment.sessionIds) {
      const session = this.state.requireSession(sessionId);
      endActiveSession(session, now);
    }

    assignment.state = "succeeded";
    assignment.updatedAt = now;
    intent.state = "completed";
    intent.updatedAt = now;

    if (assignment.owner.type === "task") {
      const task = this.state.requireTask(assignment.owner.taskId);
      task.state = task.requiresMergeRequest ? "awaiting_review" : "completed";
      task.updatedAt = now;
    }

    this.releaseLease(assignment.leaseId);

    return cloneAssignment(assignment);
  }

  activeLeaseCount(agentId: AgentId): number {
    return Array.from(this.state.leases.values()).filter((lease) => {
      return lease.agentId === agentId && lease.state === "active";
    }).length;
  }

  createSession(assignment: Assignment, providerSessionId: string): Session {
    return createSession(this.state, assignment, providerSessionId);
  }

  recordPlacementFailure(
    intent: DispatchIntent,
    reason: PlacementFailureReason,
  ): void {
    intent.placementFailureCount += 1;
    intent.lastFailureReason = reason;
    intent.updatedAt = this.state.now();

    if (intent.placementFailureCount >= this.policy.maxPlacementFailures) {
      this.escalatePlacementFailure(intent);
      return;
    }

    intent.state = "retry_wait";
    this.markTaskReadyForRetry(intent);
  }

  releaseLease(leaseId: LeaseId): void {
    const lease = this.state.leases.get(leaseId);

    if (!lease || lease.state === "released") {
      return;
    }

    lease.state = "released";
    lease.releasedAt = this.state.now();
  }

  private async startAssignment(
    intent: DispatchIntent,
    task: Task | undefined,
    placement: {
      agent: Agent;
      runtime: Runtime;
      roleDefinition: RoleDefinition;
    },
  ): Promise<DispatchIntent> {
    const lease = createLease(
      this.state,
      intent,
      placement.agent,
      placement.runtime,
    );
    const assignment = createAssignment(this.state, intent, lease, placement);

    try {
      intent.state = "starting";
      intent.updatedAt = this.state.now();
      const handle = await this.adapter.start({
        target: buildAdapterTarget(this.state, intent, task),
        assignment: cloneAssignment(assignment),
        agent: cloneAgent(placement.agent),
        runtime: cloneRuntime(placement.runtime),
        roleDefinition: cloneRoleDefinition(placement.roleDefinition),
      });

      const session = this.createSession(assignment, handle.providerSessionId);
      assignment.sessionIds.push(session.id);
      assignment.state = "running";
      assignment.updatedAt = this.state.now();
    } catch {
      this.handleAdapterStartFailure(intent, lease, assignment, task);
    }

    return cloneDispatchIntent(intent);
  }

  private readyTaskForIntent(intent: DispatchIntent): Task | undefined {
    if (intent.targetType !== "task") {
      return undefined;
    }

    const task = this.state.requireTask(intent.taskId);
    this.tasks.evaluateTaskReadiness(task);

    return task.state === "ready" ? task : undefined;
  }

  private nextDispatchIntent(): DispatchIntent | null {
    return (
      Array.from(this.state.dispatchIntents.values()).find((intent) => {
        return intent.state === "queued" || intent.state === "retry_wait";
      }) ?? null
    );
  }

  private requeueRetryIntent(intent: DispatchIntent): void {
    if (intent.state !== "retry_wait") {
      return;
    }

    intent.state = "queued";
    intent.updatedAt = this.state.now();
  }

  private handleAdapterStartFailure(
    intent: DispatchIntent,
    lease: Lease,
    assignment: Assignment,
    task: Task | undefined,
  ): void {
    this.releaseLease(lease.id);
    assignment.state = "canceled";
    assignment.updatedAt = this.state.now();

    if (task) {
      task.state = "ready";
      task.updatedAt = this.state.now();
    }

    this.recordPlacementFailure(intent, "adapter_start_failed");
  }

  private escalatePlacementFailure(intent: DispatchIntent): void {
    intent.state = "escalated";

    if (intent.targetType === "task") {
      const task = this.state.requireTask(intent.taskId);
      task.state = "human_review_required";
      task.updatedAt = intent.updatedAt;
    }
  }

  private markTaskReadyForRetry(intent: DispatchIntent): void {
    if (intent.targetType !== "task") {
      return;
    }

    const task = this.state.requireTask(intent.taskId);
    task.state = "ready";
    task.updatedAt = intent.updatedAt;
  }
}
