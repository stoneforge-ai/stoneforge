import type { Agent, RoleDefinition, Runtime } from "@stoneforge/core";

import {
  asAssignmentId,
  asLeaseId,
  asSessionId,
} from "./ids.js";
import { cloneTask } from "./cloning.js";
import type { ExecutionState } from "./execution-state.js";
import type {
  AgentAdapterStartContext,
  Assignment,
  AssignmentOwner,
  DispatchIntent,
  Lease,
  Session,
  Task,
} from "./models.js";

export interface PlacementRecordInput {
  agent: Agent;
  runtime: Runtime;
  roleDefinition: RoleDefinition;
}

export function createLease(
  state: ExecutionState,
  intent: DispatchIntent,
  agent: Agent,
  runtime: Runtime,
): Lease {
  const now = state.now();
  const lease: Lease = {
    id: asLeaseId(state.nextId("lease")),
    workspaceId: intent.workspaceId,
    agentId: agent.id,
    runtimeId: runtime.id,
    dispatchIntentId: intent.id,
    state: "active",
    leasedAt: now,
  };

  state.leases.set(lease.id, lease);
  intent.leaseId = lease.id;
  intent.state = "leased";
  intent.updatedAt = now;

  return lease;
}

export function createAssignment(
  state: ExecutionState,
  intent: DispatchIntent,
  lease: Lease,
  placement: PlacementRecordInput,
): Assignment {
  const now = state.now();
  const owner = buildAssignmentOwner(intent);
  const assignment: Assignment = {
    id: asAssignmentId(state.nextId("assignment")),
    workspaceId: intent.workspaceId,
    owner,
    taskId: owner.type === "task" ? owner.taskId : undefined,
    mergeRequestId:
      owner.type === "merge_request" ? owner.mergeRequestId : undefined,
    dispatchIntentId: intent.id,
    roleDefinitionId: placement.roleDefinition.id,
    agentId: placement.agent.id,
    runtimeId: placement.runtime.id,
    leaseId: lease.id,
    state: "created",
    sessionIds: [],
    recoveryFailureCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  state.assignments.set(assignment.id, assignment);
  lease.assignmentId = assignment.id;
  intent.assignmentId = assignment.id;
  intent.updatedAt = now;
  markTaskLeased(state, owner, now);

  return assignment;
}

export function createSession(
  state: ExecutionState,
  assignment: Assignment,
  providerSessionId: string,
): Session {
  const now = state.now();
  const session: Session = {
    id: asSessionId(state.nextId("session")),
    workspaceId: assignment.workspaceId,
    assignmentId: assignment.id,
    providerSessionId,
    state: "active",
    heartbeats: [],
    checkpoints: [],
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  state.sessions.set(session.id, session);

  return session;
}

export function buildAdapterTarget(
  state: ExecutionState,
  intent: DispatchIntent,
  task: Task | undefined,
): AgentAdapterStartContext["target"] {
  if (intent.targetType === "task") {
    return buildTaskAdapterTarget(intent, task);
  }

  return buildMergeRequestAdapterTarget(state, intent);
}

export function endActiveSession(session: Session, endedAt: string): void {
  if (session.state !== "active" && session.state !== "checkpointed") {
    return;
  }

  session.state = "ended";
  session.endedAt = endedAt;
  session.updatedAt = endedAt;
}

function buildAssignmentOwner(intent: DispatchIntent): AssignmentOwner {
  if (hasTaskOwner(intent)) {
    return {
      type: "task",
      taskId: intent.taskId,
    };
  }

  if (hasMergeRequestOwner(intent)) {
    return {
      type: "merge_request",
      mergeRequestId: intent.mergeRequestId,
    };
  }

  throw new Error(`Dispatch intent ${intent.id} does not have a valid owner.`);
}

function hasTaskOwner(
  intent: DispatchIntent,
): intent is DispatchIntent & { taskId: NonNullable<DispatchIntent["taskId"]> } {
  if (intent.targetType !== "task") {
    return false;
  }

  return intent.taskId !== undefined;
}

function hasMergeRequestOwner(
  intent: DispatchIntent,
): intent is DispatchIntent & {
  mergeRequestId: NonNullable<DispatchIntent["mergeRequestId"]>;
} {
  if (intent.targetType !== "merge_request") {
    return false;
  }

  return intent.mergeRequestId !== undefined;
}

function markTaskLeased(
  state: ExecutionState,
  owner: AssignmentOwner,
  now: string,
): void {
  if (owner.type !== "task") {
    return;
  }

  const task = state.requireTask(owner.taskId);
  task.state = "leased";
  task.updatedAt = now;
}

function buildTaskAdapterTarget(
  intent: DispatchIntent,
  task: Task | undefined,
): AgentAdapterStartContext["target"] {
  if (!task) {
    throw new Error(`Task dispatch intent ${intent.id} has no Task.`);
  }

  return {
    type: "task",
    task: cloneTask(task),
  };
}

function buildMergeRequestAdapterTarget(
  state: ExecutionState,
  intent: DispatchIntent,
): AgentAdapterStartContext["target"] {
  if (!intent.mergeRequestId) {
    throw new Error(`MergeRequest dispatch intent ${intent.id} has no target.`);
  }

  const mergeRequest = state.mergeRequestContexts.get(intent.mergeRequestId);

  if (!mergeRequest) {
    throw new Error(
      `MergeRequest context ${intent.mergeRequestId} does not exist.`,
    );
  }

  return {
    type: "merge_request",
    mergeRequest: { ...mergeRequest },
  };
}
