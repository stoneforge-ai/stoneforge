import type { AgentId } from "@stoneforge/core";
import type { Workspace } from "@stoneforge/workspace";
import { Effect, type Layer } from "effect";

import {
  cloneAssignment,
  cloneDispatchIntent,
  cloneLease,
  cloneSession,
  cloneTask,
} from "./cloning.js";
import { DispatchScheduler } from "./dispatch-scheduler.js";
import {
  type AgentAdapterService,
  agentAdapterLayer,
} from "./effect-boundary.js";
import { ExecutionState } from "./execution-state.js";
import type {
  AssignmentId,
  DispatchIntentId,
  SessionId,
  TaskId,
} from "./ids.js";
import type {
  AgentAdapter,
  Assignment,
  Checkpoint,
  CreateMergeRequestDispatchIntentInput,
  CreateTaskInput,
  DispatchIntent,
  DispatchPolicy,
  ExecutionSnapshot,
  Lease,
  Session,
  SessionHeartbeat,
  Task,
  UpdateTaskInput,
  WorkspaceExecutionCapabilities,
} from "./models.js";
import { SessionLifecycle } from "./session-lifecycle.js";
import { TaskLifecycle } from "./task-lifecycle.js";

const defaultPolicy: DispatchPolicy = {
  maxPlacementFailures: 3,
  maxSessionRecoveryFailures: 2,
};

export class TaskDispatchService {
  private readonly state: ExecutionState;
  private readonly tasks: TaskLifecycle;
  private readonly scheduler: DispatchScheduler;
  private readonly sessions: SessionLifecycle;
  private readonly adapterLayer: Layer.Layer<AgentAdapterService>;

  constructor(
    adapter: AgentAdapter,
    policy: DispatchPolicy = defaultPolicy,
    snapshot?: ExecutionSnapshot,
  ) {
    this.state = new ExecutionState(snapshot);
    this.adapterLayer = agentAdapterLayer(adapter);
    this.tasks = new TaskLifecycle(this.state);
    this.scheduler = new DispatchScheduler(this.state, this.tasks, policy);
    this.sessions = new SessionLifecycle(this.state, this.scheduler, policy);
  }

  configureWorkspace(workspace: Workspace): WorkspaceExecutionCapabilities {
    return this.tasks.configureWorkspace(workspace);
  }

  createTask(input: CreateTaskInput): Task {
    return this.tasks.createTask(input);
  }

  updateTask(taskId: TaskId, input: UpdateTaskInput): Task {
    return this.tasks.updateTask(taskId, input);
  }

  createMergeRequestDispatchIntent(
    input: CreateMergeRequestDispatchIntentInput,
  ): DispatchIntent {
    return this.tasks.createMergeRequestDispatchIntent(input);
  }

  runSchedulerOnce(): Promise<DispatchIntent | null> {
    return this.runEffect(this.scheduler.runOnce());
  }

  recordHeartbeat(sessionId: SessionId, note?: string): SessionHeartbeat {
    return this.sessions.recordHeartbeat(sessionId, note);
  }

  recordCheckpoint(sessionId: SessionId, checkpoint: Checkpoint): Session {
    return this.sessions.recordCheckpoint(sessionId, checkpoint);
  }

  recordRecoverableSessionFailure(
    sessionId: SessionId,
    failureState: "crashed" | "expired",
    checkpoint: Checkpoint,
  ): Promise<Session> {
    return this.runEffect(
      this.sessions.recordRecoverableSessionFailure(
        sessionId,
        failureState,
        checkpoint,
      ),
    );
  }

  completeAssignment(assignmentId: AssignmentId): Assignment {
    return this.scheduler.completeAssignment(assignmentId);
  }

  requireTaskRepair(taskId: TaskId, reason: string): Task {
    return this.tasks.requireTaskRepair(taskId, reason);
  }

  completeTaskAfterMerge(taskId: TaskId): Task {
    return this.tasks.completeTaskAfterMerge(taskId);
  }

  getTask(taskId: TaskId): Task {
    return cloneTask(this.state.requireTask(taskId));
  }

  getDispatchIntent(intentId: DispatchIntentId): DispatchIntent {
    return cloneDispatchIntent(this.state.requireDispatchIntent(intentId));
  }

  getAssignment(assignmentId: AssignmentId): Assignment {
    return cloneAssignment(this.state.requireAssignment(assignmentId));
  }

  getSession(sessionId: SessionId): Session {
    return cloneSession(this.state.requireSession(sessionId));
  }

  listDispatchIntents(): DispatchIntent[] {
    return Array.from(this.state.dispatchIntents.values()).map(
      cloneDispatchIntent,
    );
  }

  listAssignments(): Assignment[] {
    return Array.from(this.state.assignments.values()).map(cloneAssignment);
  }

  listSessions(): Session[] {
    return Array.from(this.state.sessions.values()).map(cloneSession);
  }

  listLeases(): Lease[] {
    return Array.from(this.state.leases.values()).map(cloneLease);
  }

  activeLeaseCount(agentId: AgentId): number {
    return this.scheduler.activeLeaseCount(agentId);
  }

  exportSnapshot(): ExecutionSnapshot {
    return this.state.exportSnapshot();
  }

  private runEffect<TResult, TError>(
    program: Effect.Effect<TResult, TError, AgentAdapterService>,
  ): Promise<TResult> {
    return Effect.runPromise(Effect.provide(program, this.adapterLayer));
  }
}
