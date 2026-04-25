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

import type {
  AssignmentId,
  DispatchIntentId,
  LeaseId,
  SessionId,
  TaskId,
} from "./ids.js";

export type TaskState =
  | "draft"
  | "planned"
  | "ready"
  | "leased"
  | "in_progress"
  | "awaiting_review"
  | "repair_required"
  | "completed"
  | "human_review_required"
  | "canceled";

export type TaskPriority = "low" | "normal" | "high";

export interface Checkpoint {
  completedWork: string[];
  remainingWork: string[];
  importantContext: string[];
  capturedAt: string;
}

export interface TaskContinuityCheckpoint extends Checkpoint {
  assignmentId: AssignmentId;
  sessionId: SessionId;
}

export interface TaskDispatchConstraints {
  roleDefinitionId?: RoleDefinitionId;
  requiredAgentTags: string[];
  requiredRuntimeTags: string[];
}

export interface Task {
  id: TaskId;
  workspaceId: WorkspaceId;
  title: string;
  intent: string;
  acceptanceCriteria: string[];
  priority: TaskPriority;
  dependencyIds: TaskId[];
  planId?: string;
  state: TaskState;
  requiresMergeRequest: boolean;
  dispatchConstraints: TaskDispatchConstraints;
  continuity: TaskContinuityCheckpoint[];
  repairContexts: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  workspaceId: WorkspaceId;
  title: string;
  intent: string;
  acceptanceCriteria?: string[];
  priority?: TaskPriority;
  dependencyIds?: TaskId[];
  planId?: string;
  requiresMergeRequest?: boolean;
  dispatchConstraints?: Partial<TaskDispatchConstraints>;
}

export interface UpdateTaskInput {
  title?: string;
  intent?: string;
  acceptanceCriteria?: string[];
  priority?: TaskPriority;
  dependencyIds?: TaskId[];
  dispatchConstraints?: Partial<TaskDispatchConstraints>;
}

export type DispatchAction = "implement";
export type MergeRequestDispatchAction = "review" | "merge_evaluate";
export type DispatchTargetType = "task" | "merge_request";

export type DispatchIntentState =
  | "created"
  | "queued"
  | "leased"
  | "starting"
  | "running"
  | "retry_wait"
  | "completed"
  | "escalated"
  | "canceled";

export interface DispatchIntent {
  id: DispatchIntentId;
  workspaceId: WorkspaceId;
  targetType: DispatchTargetType;
  taskId?: TaskId;
  mergeRequestId?: MergeRequestId;
  action: DispatchAction | MergeRequestDispatchAction;
  state: DispatchIntentState;
  roleDefinitionId?: RoleDefinitionId;
  requiredAgentTags: string[];
  requiredRuntimeTags: string[];
  leaseId?: LeaseId;
  assignmentId?: AssignmentId;
  placementFailureCount: number;
  lastFailureReason?: PlacementFailureReason;
  createdAt: string;
  updatedAt: string;
}

export type PlacementFailureReason =
  | "task_not_ready"
  | "no_eligible_agent"
  | "capacity_exhausted"
  | "adapter_start_failed";

export interface Lease {
  id: LeaseId;
  workspaceId: WorkspaceId;
  agentId: AgentId;
  runtimeId: RuntimeId;
  dispatchIntentId: DispatchIntentId;
  assignmentId?: AssignmentId;
  state: "active" | "released";
  leasedAt: string;
  releasedAt?: string;
}

export type AssignmentState =
  | "created"
  | "running"
  | "resume_pending"
  | "succeeded"
  | "escalated"
  | "canceled";

export interface TaskAssignmentOwner {
  type: "task";
  taskId: TaskId;
}

export interface MergeRequestAssignmentOwner {
  type: "merge_request";
  mergeRequestId: MergeRequestId;
}

export type AssignmentOwner = TaskAssignmentOwner | MergeRequestAssignmentOwner;

export interface MergeRequestAssignmentContext {
  id: MergeRequestId;
  title: string;
  providerPullRequestUrl: string;
}

export interface Assignment {
  id: AssignmentId;
  workspaceId: WorkspaceId;
  owner: AssignmentOwner;
  taskId?: TaskId;
  mergeRequestId?: MergeRequestId;
  dispatchIntentId: DispatchIntentId;
  roleDefinitionId: RoleDefinitionId;
  agentId: AgentId;
  runtimeId: RuntimeId;
  leaseId: LeaseId;
  state: AssignmentState;
  sessionIds: SessionId[];
  recoveryFailureCount: number;
  createdAt: string;
  updatedAt: string;
}

export type SessionState =
  | "launching"
  | "active"
  | "checkpointed"
  | "ended"
  | "crashed"
  | "expired"
  | "canceled";

export interface SessionHeartbeat {
  sessionId: SessionId;
  observedAt: string;
  note?: string;
}

export interface Session {
  id: SessionId;
  workspaceId: WorkspaceId;
  assignmentId: AssignmentId;
  providerSessionId: string;
  state: SessionState;
  heartbeats: SessionHeartbeat[];
  checkpoints: Checkpoint[];
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAdapterStartContext {
  target:
    | {
        type: "task";
        task: Task;
      }
    | {
        type: "merge_request";
        mergeRequest: MergeRequestAssignmentContext;
      };
  assignment: Assignment;
  agent: Agent;
  runtime: Runtime;
  roleDefinition: RoleDefinition;
}

export interface AgentAdapterResumeContext extends AgentAdapterStartContext {
  checkpoint: Checkpoint;
  failedSession: Session;
}

export interface CreateMergeRequestDispatchIntentInput {
  workspaceId: WorkspaceId;
  mergeRequest: MergeRequestAssignmentContext;
  action: MergeRequestDispatchAction;
  roleDefinitionId?: RoleDefinitionId;
  requiredAgentTags?: string[];
  requiredRuntimeTags?: string[];
}

export interface SessionHandle {
  providerSessionId: string;
}

export interface AgentAdapter {
  start(context: AgentAdapterStartContext): Promise<SessionHandle>;
  resume(context: AgentAdapterResumeContext): Promise<SessionHandle>;
  cancel(session: Session): Promise<void>;
}

export interface DispatchPolicy {
  maxPlacementFailures: number;
  maxSessionRecoveryFailures: number;
}

export interface WorkspaceExecutionCapabilities {
  workspaceId: WorkspaceId;
  runtimes: Runtime[];
  agents: Agent[];
  roleDefinitions: RoleDefinition[];
}
