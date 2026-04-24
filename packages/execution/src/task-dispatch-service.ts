import type {
  Agent,
  AgentId,
  MergeRequestId,
  RoleDefinition,
  RoleDefinitionId,
  Runtime,
  RuntimeId,
  WorkspaceId,
} from "@stoneforge/core";
import {
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
} from "@stoneforge/core";
import type {
  Workspace,
} from "@stoneforge/workspace";

import {
  asAssignmentId,
  asDispatchIntentId,
  asLeaseId,
  asSessionId,
  asTaskId,
} from "./ids.js";
import type {
  AssignmentId,
  DispatchIntentId,
  LeaseId,
  SessionId,
  TaskId,
} from "./ids.js";
import type {
  AgentAdapter,
  AgentAdapterStartContext,
  Assignment,
  AssignmentOwner,
  Checkpoint,
  CreateMergeRequestDispatchIntentInput,
  CreateTaskInput,
  DispatchIntent,
  DispatchPolicy,
  Lease,
  PlacementFailureReason,
  Session,
  SessionHeartbeat,
  Task,
  TaskDispatchConstraints,
  UpdateTaskInput,
  WorkspaceExecutionCapabilities,
} from "./models.js";

type CounterName = "task" | "dispatchIntent" | "assignment" | "session" | "lease";

const defaultPolicy: DispatchPolicy = {
  maxPlacementFailures: 3,
  maxSessionRecoveryFailures: 2,
};

export class TaskDispatchService {
  private readonly workspaces = new Map<WorkspaceId, WorkspaceExecutionCapabilities>();
  private readonly tasks = new Map<TaskId, Task>();
  private readonly dispatchIntents = new Map<DispatchIntentId, DispatchIntent>();
  private readonly assignments = new Map<AssignmentId, Assignment>();
  private readonly sessions = new Map<SessionId, Session>();
  private readonly leases = new Map<LeaseId, Lease>();
  private readonly mergeRequestContexts = new Map<MergeRequestId, CreateMergeRequestDispatchIntentInput["mergeRequest"]>();
  private readonly counters: Record<CounterName, number> = {
    task: 0,
    dispatchIntent: 0,
    assignment: 0,
    session: 0,
    lease: 0,
  };

  constructor(
    private readonly adapter: AgentAdapter,
    private readonly policy: DispatchPolicy = defaultPolicy,
  ) {}

  configureWorkspace(workspace: Workspace): WorkspaceExecutionCapabilities {
    if (workspace.state !== "ready") {
      throw new Error(
        `Workspace ${workspace.id} must be ready before task dispatch is configured.`,
      );
    }

    const capabilities: WorkspaceExecutionCapabilities = {
      workspaceId: workspace.id,
      runtimes: workspace.runtimes.map(cloneRuntime),
      agents: workspace.agents.map(cloneAgent),
      roleDefinitions: workspace.roleDefinitions.map(cloneRoleDefinition),
    };

    this.workspaces.set(workspace.id, capabilities);

    return cloneWorkspaceCapabilities(capabilities);
  }

  createTask(input: CreateTaskInput): Task {
    this.requireWorkspace(input.workspaceId);

    const now = this.now();
    const task: Task = {
      id: asTaskId(this.nextId("task")),
      workspaceId: input.workspaceId,
      title: input.title,
      intent: input.intent,
      acceptanceCriteria: [...(input.acceptanceCriteria ?? [])],
      priority: input.priority ?? "normal",
      dependencyIds: [...(input.dependencyIds ?? [])],
      planId: input.planId,
      state: "planned",
      requiresMergeRequest: input.requiresMergeRequest ?? false,
      dispatchConstraints: normalizeDispatchConstraints(
        input.dispatchConstraints,
      ),
      continuity: [],
      repairContexts: [],
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    this.evaluateTaskReadiness(task);

    return cloneTask(task);
  }

  updateTask(taskId: TaskId, input: UpdateTaskInput): Task {
    const task = this.requireTask(taskId);

    if (input.title !== undefined) {
      task.title = input.title;
    }

    if (input.intent !== undefined) {
      task.intent = input.intent;
    }

    if (input.acceptanceCriteria !== undefined) {
      task.acceptanceCriteria = [...input.acceptanceCriteria];
    }

    if (input.priority !== undefined) {
      task.priority = input.priority;
    }

    if (input.dependencyIds !== undefined) {
      task.dependencyIds = [...input.dependencyIds];
    }

    if (input.dispatchConstraints !== undefined) {
      task.dispatchConstraints = normalizeDispatchConstraints({
        ...task.dispatchConstraints,
        ...input.dispatchConstraints,
      });
    }

    task.updatedAt = this.now();
    this.evaluateTaskReadiness(task);

    return cloneTask(task);
  }

  createMergeRequestDispatchIntent(
    input: CreateMergeRequestDispatchIntentInput,
  ): DispatchIntent {
    this.requireWorkspace(input.workspaceId);
    this.mergeRequestContexts.set(input.mergeRequest.id, {
      ...input.mergeRequest,
    });

    const existingIntent = Array.from(this.dispatchIntents.values()).find(
      (intent) => {
        return (
          intent.targetType === "merge_request" &&
          intent.mergeRequestId === input.mergeRequest.id &&
          intent.action === input.action &&
          intent.state !== "completed" &&
          intent.state !== "escalated" &&
          intent.state !== "canceled"
        );
      },
    );

    if (existingIntent) {
      return cloneDispatchIntent(existingIntent);
    }

    const now = this.now();
    const intent: DispatchIntent = {
      id: asDispatchIntentId(this.nextId("dispatchIntent")),
      workspaceId: input.workspaceId,
      targetType: "merge_request",
      mergeRequestId: input.mergeRequest.id,
      action: input.action,
      state: "queued",
      roleDefinitionId: input.roleDefinitionId,
      requiredAgentTags: [...(input.requiredAgentTags ?? [])],
      requiredRuntimeTags: [...(input.requiredRuntimeTags ?? [])],
      placementFailureCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.dispatchIntents.set(intent.id, intent);

    return cloneDispatchIntent(intent);
  }

  async runSchedulerOnce(): Promise<DispatchIntent | null> {
    const intent = this.nextDispatchIntent();

    if (!intent) {
      return null;
    }

    if (intent.state === "retry_wait") {
      intent.state = "queued";
      intent.updatedAt = this.now();
    }

    const task =
      intent.targetType === "task" && intent.taskId
        ? this.requireTask(intent.taskId)
        : undefined;

    if (task) {
      this.evaluateTaskReadiness(task);

      if (task.state !== "ready") {
        this.recordPlacementFailure(intent, "task_not_ready");
        return cloneDispatchIntent(intent);
      }
    }

    const placement = this.resolvePlacement(intent);

    if ("reason" in placement) {
      this.recordPlacementFailure(intent, placement.reason);
      return cloneDispatchIntent(intent);
    }

    const lease = this.createLease(intent, placement.agent, placement.runtime);
    const assignment = this.createAssignment(
      intent,
      lease,
      placement.agent,
      placement.runtime,
      placement.roleDefinition,
    );

    try {
      intent.state = "starting";
      intent.updatedAt = this.now();
      const handle = await this.adapter.start({
        target: this.buildAdapterTarget(intent, task),
        assignment: cloneAssignment(assignment),
        agent: cloneAgent(placement.agent),
        runtime: cloneRuntime(placement.runtime),
        roleDefinition: cloneRoleDefinition(placement.roleDefinition),
      });

      const session = this.createSession(
        assignment,
        handle.providerSessionId,
      );
      assignment.sessionIds.push(session.id);
      assignment.state = "running";
      assignment.updatedAt = this.now();

      return cloneDispatchIntent(intent);
    } catch {
      this.releaseLease(lease.id);
      assignment.state = "canceled";
      assignment.updatedAt = this.now();
      if (task) {
        task.state = "ready";
        task.updatedAt = this.now();
      }
      this.recordPlacementFailure(intent, "adapter_start_failed");

      return cloneDispatchIntent(intent);
    }
  }

  recordHeartbeat(sessionId: SessionId, note?: string): SessionHeartbeat {
    const session = this.requireSession(sessionId);
    const assignment = this.requireAssignment(session.assignmentId);
    const intent = this.requireDispatchIntent(assignment.dispatchIntentId);
    const observedAt = this.now();
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
      const task = this.requireTask(assignment.owner.taskId);
      task.state = "in_progress";
      task.updatedAt = observedAt;
    }

    return { ...heartbeat };
  }

  recordCheckpoint(sessionId: SessionId, checkpoint: Checkpoint): Session {
    const session = this.requireSession(sessionId);
    const assignment = this.requireAssignment(session.assignmentId);
    const storedCheckpoint = cloneCheckpoint(checkpoint);

    session.checkpoints.push(storedCheckpoint);
    session.state = "checkpointed";
    session.updatedAt = storedCheckpoint.capturedAt;
    if (assignment.owner.type === "task") {
      const task = this.requireTask(assignment.owner.taskId);
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
    const failedSession = this.requireSession(sessionId);
    const assignment = this.requireAssignment(failedSession.assignmentId);

    if (assignment.owner.type !== "task") {
      throw new Error(
        `Assignment ${assignment.id} is not a Task-owned Assignment and cannot use task recovery.`,
      );
    }

    const task = this.requireTask(assignment.owner.taskId);

    this.recordCheckpoint(sessionId, checkpoint);

    failedSession.state = failureState;
    failedSession.endedAt = this.now();
    failedSession.updatedAt = failedSession.endedAt;

    assignment.recoveryFailureCount += 1;

    if (assignment.recoveryFailureCount > this.policy.maxSessionRecoveryFailures) {
      assignment.state = "escalated";
      assignment.updatedAt = this.now();
      task.state = "human_review_required";
      task.updatedAt = assignment.updatedAt;
      this.releaseLease(assignment.leaseId);
      throw new Error(
        `Assignment ${assignment.id} exceeded session recovery policy.`,
      );
    }

    assignment.state = "resume_pending";
    assignment.updatedAt = this.now();

    const capabilities = this.requireWorkspace(task.workspaceId);
    const agent = requireById(
      capabilities.agents,
      assignment.agentId,
      "Agent",
    );
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
    const replacement = this.createSession(assignment, handle.providerSessionId);

    assignment.sessionIds.push(replacement.id);
    assignment.state = "running";
    assignment.updatedAt = this.now();

    return cloneSession(replacement);
  }

  completeAssignment(assignmentId: AssignmentId): Assignment {
    const assignment = this.requireAssignment(assignmentId);
    const intent = this.requireDispatchIntent(assignment.dispatchIntentId);
    const now = this.now();

    for (const sessionId of assignment.sessionIds) {
      const session = this.requireSession(sessionId);

      if (session.state === "active" || session.state === "checkpointed") {
        session.state = "ended";
        session.endedAt = now;
        session.updatedAt = now;
      }
    }

    assignment.state = "succeeded";
    assignment.updatedAt = now;
    intent.state = "completed";
    intent.updatedAt = now;

    if (assignment.owner.type === "task") {
      const task = this.requireTask(assignment.owner.taskId);
      task.state = task.requiresMergeRequest ? "awaiting_review" : "completed";
      task.updatedAt = now;
    }

    this.releaseLease(assignment.leaseId);

    return cloneAssignment(assignment);
  }

  reopenTaskForRepair(taskId: TaskId, reason: string): Task {
    const task = this.requireTask(taskId);

    if (task.state === "completed" || task.state === "canceled") {
      throw new Error(`Task ${taskId} cannot be reopened from state ${task.state}.`);
    }

    task.repairContexts.push(reason);
    task.state = "ready";
    task.updatedAt = this.now();
    this.ensureDispatchIntentForTask(task);

    return cloneTask(task);
  }

  completeTaskAfterMerge(taskId: TaskId): Task {
    const task = this.requireTask(taskId);

    task.state = "completed";
    task.updatedAt = this.now();

    return cloneTask(task);
  }

  getTask(taskId: TaskId): Task {
    return cloneTask(this.requireTask(taskId));
  }

  getDispatchIntent(intentId: DispatchIntentId): DispatchIntent {
    return cloneDispatchIntent(this.requireDispatchIntent(intentId));
  }

  getAssignment(assignmentId: AssignmentId): Assignment {
    return cloneAssignment(this.requireAssignment(assignmentId));
  }

  getSession(sessionId: SessionId): Session {
    return cloneSession(this.requireSession(sessionId));
  }

  listDispatchIntents(): DispatchIntent[] {
    return Array.from(this.dispatchIntents.values()).map(cloneDispatchIntent);
  }

  listAssignments(): Assignment[] {
    return Array.from(this.assignments.values()).map(cloneAssignment);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).map(cloneSession);
  }

  listLeases(): Lease[] {
    return Array.from(this.leases.values()).map(cloneLease);
  }

  activeLeaseCount(agentId: AgentId): number {
    return Array.from(this.leases.values()).filter((lease) => {
      return lease.agentId === agentId && lease.state === "active";
    }).length;
  }

  private evaluateTaskReadiness(task: Task): void {
    if (
      task.state === "draft" ||
      task.state === "completed" ||
      task.state === "canceled" ||
      task.state === "human_review_required"
    ) {
      return;
    }

    if (!this.isTaskDispatchable(task)) {
      if (task.state === "ready") {
        task.state = "planned";
      }

      return;
    }

    task.state = "ready";
    task.updatedAt = this.now();
    this.ensureDispatchIntentForTask(task);
  }

  private isTaskDispatchable(task: Task): boolean {
    if (task.planId !== undefined) {
      return false;
    }

    if (task.title.trim().length === 0 || task.intent.trim().length === 0) {
      return false;
    }

    if (task.acceptanceCriteria.length === 0) {
      return false;
    }

    for (const dependencyId of task.dependencyIds) {
      const dependency = this.tasks.get(dependencyId);

      if (!dependency || dependency.state !== "completed") {
        return false;
      }
    }

    if (this.hasActiveWork(task.id)) {
      return false;
    }

    return this.canEvaluateConstraints(task);
  }

  private canEvaluateConstraints(task: Task): boolean {
    const capabilities = this.workspaces.get(task.workspaceId);

    if (!capabilities) {
      return false;
    }

    if (task.dispatchConstraints.roleDefinitionId) {
      return capabilities.roleDefinitions.some((roleDefinition) => {
        return (
          roleDefinition.id === task.dispatchConstraints.roleDefinitionId &&
          roleDefinition.enabled
        );
      });
    }

    return capabilities.roleDefinitions.some((roleDefinition) => {
      return roleDefinition.enabled;
    });
  }

  private hasActiveWork(taskId: TaskId): boolean {
    return Array.from(this.assignments.values()).some((assignment) => {
      return (
        assignment.owner.type === "task" &&
        assignment.owner.taskId === taskId &&
        (assignment.state === "created" ||
          assignment.state === "running" ||
          assignment.state === "resume_pending")
      );
    });
  }

  private ensureDispatchIntentForTask(task: Task): DispatchIntent {
    const existingIntent = Array.from(this.dispatchIntents.values()).find(
      (intent) => {
        return (
          intent.taskId === task.id &&
          intent.action === "implement" &&
          intent.state !== "completed" &&
          intent.state !== "escalated" &&
          intent.state !== "canceled"
        );
      },
    );

    if (existingIntent) {
      return existingIntent;
    }

    const now = this.now();
    const intent: DispatchIntent = {
      id: asDispatchIntentId(this.nextId("dispatchIntent")),
      workspaceId: task.workspaceId,
      targetType: "task",
      taskId: task.id,
      action: "implement",
      state: "queued",
      roleDefinitionId: task.dispatchConstraints.roleDefinitionId,
      requiredAgentTags: [...task.dispatchConstraints.requiredAgentTags],
      requiredRuntimeTags: [...task.dispatchConstraints.requiredRuntimeTags],
      placementFailureCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.dispatchIntents.set(intent.id, intent);

    return intent;
  }

  private nextDispatchIntent(): DispatchIntent | null {
    return (
      Array.from(this.dispatchIntents.values()).find((intent) => {
        return intent.state === "queued" || intent.state === "retry_wait";
      }) ?? null
    );
  }

  private resolvePlacement(intent: DispatchIntent):
    | {
        reason: PlacementFailureReason;
      }
    | {
        agent: Agent;
        runtime: Runtime;
        roleDefinition: RoleDefinition;
      } {
    const capabilities = this.requireWorkspace(intent.workspaceId);
    const roleDefinition = selectRoleDefinition(
      capabilities.roleDefinitions,
      intent.roleDefinitionId,
    );

    if (!roleDefinition) {
      return { reason: "no_eligible_agent" };
    }

    const eligibleAgents = capabilities.agents.filter((agent) => {
      if (agent.healthStatus !== "healthy") {
        return false;
      }

      if (!hasAllTags(agent.tags, intent.requiredAgentTags)) {
        return false;
      }

      const runtime = capabilities.runtimes.find((candidateRuntime) => {
        return candidateRuntime.id === agent.runtimeId;
      });

      if (!runtime || runtime.healthStatus !== "healthy") {
        return false;
      }

      return hasAllTags(runtime.tags, intent.requiredRuntimeTags);
    });

    if (eligibleAgents.length === 0) {
      return { reason: "no_eligible_agent" };
    }

    const agent = eligibleAgents.find((candidateAgent) => {
      return this.activeLeaseCount(candidateAgent.id) < candidateAgent.concurrencyLimit;
    });

    if (!agent) {
      return { reason: "capacity_exhausted" };
    }

    const runtime = capabilities.runtimes.find((candidateRuntime) => {
      return candidateRuntime.id === agent.runtimeId;
    });

    if (!runtime) {
      return { reason: "no_eligible_agent" };
    }

    return {
      agent,
      runtime,
      roleDefinition,
    };
  }

  private createLease(
    intent: DispatchIntent,
    agent: Agent,
    runtime: Runtime,
  ): Lease {
    const now = this.now();
    const lease: Lease = {
      id: asLeaseId(this.nextId("lease")),
      workspaceId: intent.workspaceId,
      agentId: agent.id,
      runtimeId: runtime.id,
      dispatchIntentId: intent.id,
      state: "active",
      leasedAt: now,
    };

    this.leases.set(lease.id, lease);
    intent.leaseId = lease.id;
    intent.state = "leased";
    intent.updatedAt = now;

    return lease;
  }

  private createAssignment(
    intent: DispatchIntent,
    lease: Lease,
    agent: Agent,
    runtime: Runtime,
    roleDefinition: RoleDefinition,
  ): Assignment {
    const now = this.now();
    const owner = buildAssignmentOwner(intent);
    const assignment: Assignment = {
      id: asAssignmentId(this.nextId("assignment")),
      workspaceId: intent.workspaceId,
      owner,
      taskId: owner.type === "task" ? owner.taskId : undefined,
      mergeRequestId:
        owner.type === "merge_request" ? owner.mergeRequestId : undefined,
      dispatchIntentId: intent.id,
      roleDefinitionId: roleDefinition.id,
      agentId: agent.id,
      runtimeId: runtime.id,
      leaseId: lease.id,
      state: "created",
      sessionIds: [],
      recoveryFailureCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.assignments.set(assignment.id, assignment);
    lease.assignmentId = assignment.id;
    intent.assignmentId = assignment.id;
    intent.updatedAt = now;

    if (owner.type === "task") {
      const task = this.requireTask(owner.taskId);
      task.state = "leased";
      task.updatedAt = now;
    }

    return assignment;
  }

  private createSession(
    assignment: Assignment,
    providerSessionId: string,
  ): Session {
    const now = this.now();
    const session: Session = {
      id: asSessionId(this.nextId("session")),
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

    this.sessions.set(session.id, session);

    return session;
  }

  private recordPlacementFailure(
    intent: DispatchIntent,
    reason: PlacementFailureReason,
  ): void {
    intent.placementFailureCount += 1;
    intent.lastFailureReason = reason;
    intent.updatedAt = this.now();

    if (intent.placementFailureCount >= this.policy.maxPlacementFailures) {
      intent.state = "escalated";
      if (intent.targetType === "task" && intent.taskId) {
        const task = this.requireTask(intent.taskId);
        task.state = "human_review_required";
        task.updatedAt = intent.updatedAt;
      }
      return;
    }

    intent.state = "retry_wait";
    if (intent.targetType === "task" && intent.taskId) {
      const task = this.requireTask(intent.taskId);
      task.state = "ready";
      task.updatedAt = intent.updatedAt;
    }
  }

  private releaseLease(leaseId: LeaseId): void {
    const lease = this.leases.get(leaseId);

    if (!lease || lease.state === "released") {
      return;
    }

    lease.state = "released";
    lease.releasedAt = this.now();
  }

  private requireWorkspace(
    workspaceId: WorkspaceId,
  ): WorkspaceExecutionCapabilities {
    const capabilities = this.workspaces.get(workspaceId);

    if (!capabilities) {
      throw new Error(`Workspace ${workspaceId} is not configured for dispatch.`);
    }

    return capabilities;
  }

  private requireTask(taskId: TaskId): Task {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} does not exist.`);
    }

    return task;
  }

  private requireDispatchIntent(intentId: DispatchIntentId): DispatchIntent {
    const intent = this.dispatchIntents.get(intentId);

    if (!intent) {
      throw new Error(`Dispatch intent ${intentId} does not exist.`);
    }

    return intent;
  }

  private requireAssignment(assignmentId: AssignmentId): Assignment {
    const assignment = this.assignments.get(assignmentId);

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} does not exist.`);
    }

    return assignment;
  }

  private requireSession(sessionId: SessionId): Session {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} does not exist.`);
    }

    return session;
  }

  private nextId(counterName: CounterName): string {
    this.counters[counterName] += 1;
    return `${counterName}_${this.counters[counterName]}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private buildAdapterTarget(
    intent: DispatchIntent,
    task: Task | undefined,
  ): AgentAdapterStartContext["target"] {
    if (intent.targetType === "task") {
      if (!task) {
        throw new Error(`Task dispatch intent ${intent.id} has no Task.`);
      }

      return {
        type: "task",
        task: cloneTask(task),
      };
    }

    if (!intent.mergeRequestId) {
      throw new Error(`MergeRequest dispatch intent ${intent.id} has no target.`);
    }

    const mergeRequest = this.mergeRequestContexts.get(intent.mergeRequestId);

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
}

function buildAssignmentOwner(intent: DispatchIntent): AssignmentOwner {
  if (intent.targetType === "task" && intent.taskId) {
    return {
      type: "task",
      taskId: intent.taskId,
    };
  }

  if (intent.targetType === "merge_request" && intent.mergeRequestId) {
    return {
      type: "merge_request",
      mergeRequestId: intent.mergeRequestId,
    };
  }

  throw new Error(`Dispatch intent ${intent.id} does not have a valid owner.`);
}

function normalizeDispatchConstraints(
  input: Partial<TaskDispatchConstraints> | undefined,
): TaskDispatchConstraints {
  return {
    roleDefinitionId: input?.roleDefinitionId,
    requiredAgentTags: [...(input?.requiredAgentTags ?? [])],
    requiredRuntimeTags: [...(input?.requiredRuntimeTags ?? [])],
  };
}

function selectRoleDefinition(
  roleDefinitions: RoleDefinition[],
  roleDefinitionId: RoleDefinitionId | undefined,
): RoleDefinition | null {
  if (roleDefinitionId) {
    return (
      roleDefinitions.find((roleDefinition) => {
        return roleDefinition.id === roleDefinitionId && roleDefinition.enabled;
      }) ?? null
    );
  }

  return (
    roleDefinitions.find((roleDefinition) => {
      return roleDefinition.enabled;
    }) ?? null
  );
}

function hasAllTags(candidateTags: string[], requiredTags: string[]): boolean {
  return requiredTags.every((requiredTag) => candidateTags.includes(requiredTag));
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

function cloneWorkspaceCapabilities(
  capabilities: WorkspaceExecutionCapabilities,
): WorkspaceExecutionCapabilities {
  return {
    workspaceId: capabilities.workspaceId,
    runtimes: capabilities.runtimes.map(cloneRuntime),
    agents: capabilities.agents.map(cloneAgent),
    roleDefinitions: capabilities.roleDefinitions.map(cloneRoleDefinition),
  };
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    acceptanceCriteria: [...task.acceptanceCriteria],
    dependencyIds: [...task.dependencyIds],
    dispatchConstraints: {
      roleDefinitionId: task.dispatchConstraints.roleDefinitionId,
      requiredAgentTags: [...task.dispatchConstraints.requiredAgentTags],
      requiredRuntimeTags: [...task.dispatchConstraints.requiredRuntimeTags],
    },
    continuity: task.continuity.map((checkpoint) => ({
      ...checkpoint,
      completedWork: [...checkpoint.completedWork],
      remainingWork: [...checkpoint.remainingWork],
      importantContext: [...checkpoint.importantContext],
    })),
    repairContexts: [...task.repairContexts],
  };
}

function cloneDispatchIntent(intent: DispatchIntent): DispatchIntent {
  return {
    ...intent,
    requiredAgentTags: [...intent.requiredAgentTags],
    requiredRuntimeTags: [...intent.requiredRuntimeTags],
  };
}

function cloneLease(lease: Lease): Lease {
  return {
    ...lease,
  };
}

function cloneAssignment(assignment: Assignment): Assignment {
  return {
    ...assignment,
    sessionIds: [...assignment.sessionIds],
  };
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    heartbeats: session.heartbeats.map((heartbeat) => ({ ...heartbeat })),
    checkpoints: session.checkpoints.map(cloneCheckpoint),
  };
}

function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return {
    ...checkpoint,
    completedWork: [...checkpoint.completedWork],
    remainingWork: [...checkpoint.remainingWork],
    importantContext: [...checkpoint.importantContext],
  };
}
