import type { MergeRequestId, WorkspaceId } from "@stoneforge/core";

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
  Lease,
  Session,
  Task,
  WorkspaceExecutionCapabilities,
} from "./models.js";

type CounterName = "task" | "dispatchIntent" | "assignment" | "session" | "lease";

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

  requireWorkspace(workspaceId: WorkspaceId): WorkspaceExecutionCapabilities {
    const capabilities = this.workspaces.get(workspaceId);

    if (!capabilities) {
      throw new Error(`Workspace ${workspaceId} is not configured for dispatch.`);
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

  nextId(counterName: CounterName): string {
    this.counters[counterName] += 1;
    return `${counterName}_${this.counters[counterName]}`;
  }

  now(): string {
    return new Date().toISOString();
  }
}
