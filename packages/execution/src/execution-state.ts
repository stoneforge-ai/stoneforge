import type { MergeRequestId, WorkspaceId } from "@stoneforge/core";

import {
  cloneAssignment,
  cloneDispatchIntent,
  cloneLease,
  cloneSession,
  cloneTask,
  cloneWorkspaceCapabilities,
} from "./cloning.js";
import type {
  AssignmentId,
  DispatchIntentId,
  LeaseId,
  SessionId,
  TaskId,
} from "./ids.js";
import type {
  Assignment,
  CreateMergeRequestDispatchIntentInput,
  DispatchIntent,
  ExecutionSnapshot,
  Lease,
  Session,
  Task,
  WorkspaceExecutionCapabilities,
} from "./models.js";

type CounterName =
  | "task"
  | "dispatchIntent"
  | "assignment"
  | "session"
  | "lease";

export class ExecutionState {
  readonly workspaces = new Map<WorkspaceId, WorkspaceExecutionCapabilities>();
  readonly tasks = new Map<TaskId, Task>();
  readonly dispatchIntents = new Map<DispatchIntentId, DispatchIntent>();
  readonly assignments = new Map<AssignmentId, Assignment>();
  readonly sessions = new Map<SessionId, Session>();
  readonly leases = new Map<LeaseId, Lease>();
  readonly mergeRequestContexts = new Map<
    MergeRequestId,
    CreateMergeRequestDispatchIntentInput["mergeRequest"]
  >();

  private readonly counters: Record<CounterName, number> = {
    task: 0,
    dispatchIntent: 0,
    assignment: 0,
    session: 0,
    lease: 0,
  };

  constructor(snapshot?: ExecutionSnapshot) {
    if (snapshot) {
      this.restoreSnapshot(snapshot);
    }
  }

  requireWorkspace(workspaceId: WorkspaceId): WorkspaceExecutionCapabilities {
    const capabilities = this.workspaces.get(workspaceId);

    if (!capabilities) {
      throw new Error(
        `Workspace ${workspaceId} is not configured for dispatch.`,
      );
    }

    return capabilities;
  }

  requireTask(taskId: TaskId): Task {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} does not exist.`);
    }

    return task;
  }

  requireDispatchIntent(intentId: DispatchIntentId): DispatchIntent {
    const intent = this.dispatchIntents.get(intentId);

    if (!intent) {
      throw new Error(`Dispatch intent ${intentId} does not exist.`);
    }

    return intent;
  }

  requireAssignment(assignmentId: AssignmentId): Assignment {
    const assignment = this.assignments.get(assignmentId);

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} does not exist.`);
    }

    return assignment;
  }

  requireSession(sessionId: SessionId): Session {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} does not exist.`);
    }

    return session;
  }

  requireLease(leaseId: LeaseId): Lease {
    const lease = this.leases.get(leaseId);

    if (!lease) {
      throw new Error(`Lease ${leaseId} does not exist.`);
    }

    return lease;
  }

  nextId(counterName: CounterName): string {
    this.counters[counterName] += 1;
    return `${counterName}_${this.counters[counterName]}`;
  }

  now(): string {
    return new Date().toISOString();
  }

  exportSnapshot(): ExecutionSnapshot {
    return {
      workspaces: Array.from(this.workspaces.values()).map(
        cloneWorkspaceCapabilities,
      ),
      tasks: Array.from(this.tasks.values()).map(cloneTask),
      dispatchIntents: Array.from(this.dispatchIntents.values()).map(
        cloneDispatchIntent,
      ),
      assignments: Array.from(this.assignments.values()).map(cloneAssignment),
      sessions: Array.from(this.sessions.values()).map(cloneSession),
      leases: Array.from(this.leases.values()).map(cloneLease),
      mergeRequestContexts: Array.from(this.mergeRequestContexts.values()).map(
        (context) => ({ ...context }),
      ),
    };
  }

  private restoreSnapshot(snapshot: ExecutionSnapshot): void {
    for (const workspace of snapshot.workspaces) {
      this.workspaces.set(
        workspace.workspaceId,
        cloneWorkspaceCapabilities(workspace),
      );
    }

    this.restoreRecords(snapshot);
    this.restoreMergeRequestContexts(snapshot.mergeRequestContexts);
    this.restoreCounters(snapshot);
  }

  private restoreRecords(snapshot: ExecutionSnapshot): void {
    this.restoreTasks(snapshot);
    this.restoreDispatchIntents(snapshot);
    this.restoreAssignments(snapshot);
    this.restoreSessions(snapshot);
    this.restoreLeases(snapshot);
  }

  private restoreTasks(snapshot: ExecutionSnapshot): void {
    for (const task of snapshot.tasks) {
      this.tasks.set(task.id, cloneTask(task));
    }
  }

  private restoreDispatchIntents(snapshot: ExecutionSnapshot): void {
    for (const intent of snapshot.dispatchIntents) {
      this.dispatchIntents.set(intent.id, cloneDispatchIntent(intent));
    }
  }

  private restoreAssignments(snapshot: ExecutionSnapshot): void {
    for (const assignment of snapshot.assignments) {
      this.assignments.set(assignment.id, cloneAssignment(assignment));
    }
  }

  private restoreSessions(snapshot: ExecutionSnapshot): void {
    for (const session of snapshot.sessions) {
      this.sessions.set(session.id, cloneSession(session));
    }
  }

  private restoreLeases(snapshot: ExecutionSnapshot): void {
    for (const lease of snapshot.leases) {
      this.leases.set(lease.id, cloneLease(lease));
    }
  }

  private restoreMergeRequestContexts(
    contexts: ExecutionSnapshot["mergeRequestContexts"],
  ): void {
    for (const context of contexts) {
      this.mergeRequestContexts.set(context.id, { ...context });
    }
  }

  private restoreCounters(snapshot: ExecutionSnapshot): void {
    this.counters.task = maxNumericSuffix(
      snapshot.tasks.map((task) => task.id),
      "task_",
    );
    this.counters.dispatchIntent = maxNumericSuffix(
      snapshot.dispatchIntents.map((intent) => intent.id),
      "dispatchIntent_",
    );
    this.counters.assignment = maxNumericSuffix(
      snapshot.assignments.map((assignment) => assignment.id),
      "assignment_",
    );
    this.counters.session = maxNumericSuffix(
      snapshot.sessions.map((session) => session.id),
      "session_",
    );
    this.counters.lease = maxNumericSuffix(
      snapshot.leases.map((lease) => lease.id),
      "lease_",
    );
  }
}

function maxNumericSuffix(values: readonly string[], prefix: string): number {
  return values.reduce((max, value) => {
    const suffix = value.startsWith(prefix)
      ? Number(value.slice(prefix.length))
      : 0;

    if (Number.isInteger(suffix) && suffix > max) {
      return suffix;
    }

    return max;
  }, 0);
}
