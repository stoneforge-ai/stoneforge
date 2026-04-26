import {
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
} from "@stoneforge/core";
import type { Agent, Runtime, RoleDefinition } from "@stoneforge/core";
import { Effect } from "effect";

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
import {
  type AgentAdapterService,
  type AdapterStartFailed,
  startAgentSession,
} from "./effect-boundary.js";
import type { ExecutionState } from "./execution-state.js";
import type { TaskLifecycle } from "./task-lifecycle.js";
import type {
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
    private readonly policy: DispatchPolicy,
  ) {}

  runOnce(): Effect.Effect<DispatchIntent | null, never, AgentAdapterService> {
    return Effect.suspend(() => {
      const intent = this.nextDispatchIntent();

      if (!intent) {
        return Effect.succeed(null);
      }

      return this.dispatchIntent(intent);
    }).pipe(Effect.withSpan("scheduler.evaluate_readiness"));
  }

  private dispatchIntent(
    intent: DispatchIntent,
  ): Effect.Effect<DispatchIntent, never, AgentAdapterService> {
    return Effect.suspend(() => {
      this.requeueRetryIntent(intent);

      const task = this.readyTaskForIntent(intent);

      if (intent.targetType === "task" && !task) {
        return this.recordPlacementFailureEffect(intent, "task_not_ready");
      }

      const placement = resolvePlacement(
        this.state.requireWorkspace(intent.workspaceId),
        intent,
        (agent) => this.activeLeaseCount(agent.id),
      );

      if ("reason" in placement) {
        return this.recordPlacementFailureEffect(intent, placement.reason);
      }

      return this.startAssignment(intent, task, placement).pipe(
        Effect.withSpan("dispatch.acquire_lease", {
          attributes: dispatchAttributes(intent),
        }),
      );
    }).pipe(
      Effect.withSpan("dispatch.evaluate_intent", {
        attributes: dispatchAttributes(intent),
      }),
    );
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

  private recordPlacementFailureEffect(
    intent: DispatchIntent,
    reason: PlacementFailureReason,
  ): Effect.Effect<DispatchIntent> {
    return Effect.sync(() => {
      this.recordPlacementFailure(intent, reason);

      return cloneDispatchIntent(intent);
    }).pipe(
      Effect.tap(() =>
        Effect.annotateCurrentSpan(
          "stoneforge.policy.decision",
          retryDecision(intent),
        ),
      ),
      Effect.withSpan("dispatch.retry_decision", {
        attributes: dispatchAttributes(intent),
      }),
    );
  }

  releaseLease(leaseId: LeaseId): void {
    const lease = this.state.leases.get(leaseId);

    if (!lease || lease.state === "released") {
      return;
    }

    lease.state = "released";
    lease.releasedAt = this.state.now();
  }

  private startAssignment(
    intent: DispatchIntent,
    task: Task | undefined,
    placement: {
      agent: Agent;
      runtime: Runtime;
      roleDefinition: RoleDefinition;
    },
  ): Effect.Effect<DispatchIntent, never, AgentAdapterService> {
    const self = this;

    return Effect.gen(function* () {
      const lease = createLease(
        self.state,
        intent,
        placement.agent,
        placement.runtime,
      );
      const assignment = createAssignment(self.state, intent, lease, placement);

      intent.state = "starting";
      intent.updatedAt = self.state.now();
      const handle = yield* startAgentSession({
        target: buildAdapterTarget(self.state, intent, task),
        assignment: cloneAssignment(assignment),
        agent: cloneAgent(placement.agent),
        runtime: cloneRuntime(placement.runtime),
        roleDefinition: cloneRoleDefinition(placement.roleDefinition),
      });

      const session = self.createSession(assignment, handle.providerSessionId);
      assignment.sessionIds.push(session.id);
      assignment.state = "running";
      assignment.updatedAt = self.state.now();

      return cloneDispatchIntent(intent);
    }).pipe(
      Effect.catchTag("AdapterStartFailed", (error) =>
        this.recordAdapterStartFailure(error, intent, task),
      ),
      Effect.withSpan("assignment.start_session", {
        attributes: dispatchAttributes(intent),
      }),
    );
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

  private recordAdapterStartFailure(
    error: AdapterStartFailed,
    intent: DispatchIntent,
    task: Task | undefined,
  ): Effect.Effect<DispatchIntent> {
    return Effect.sync(() => {
      const assignment = this.state.requireAssignment(error.assignmentId);
      const lease = this.state.requireLease(assignment.leaseId);

      this.handleAdapterStartFailure(intent, lease, assignment, task);

      return cloneDispatchIntent(intent);
    }).pipe(
      Effect.tap(() =>
        Effect.annotateCurrentSpan(
          "stoneforge.policy.decision",
          retryDecision(intent),
        ),
      ),
      Effect.withSpan("dispatch.retry_decision", {
        attributes: dispatchAttributes(intent),
      }),
    );
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

function dispatchAttributes(intent: DispatchIntent): Record<string, string> {
  const attributes: Record<string, string> = {
    "stoneforge.workspace.id": intent.workspaceId,
    "stoneforge.dispatch_intent.id": intent.id,
  };

  if (intent.targetType === "task") {
    attributes["stoneforge.task.id"] = intent.taskId;
    return attributes;
  }

  attributes["stoneforge.merge_request.id"] = intent.mergeRequestId;
  return attributes;
}

function retryDecision(intent: DispatchIntent): string {
  return intent.state === "escalated" ? "escalate" : "retry";
}
