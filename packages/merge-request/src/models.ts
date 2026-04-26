import type {
  CIRunId,
  MergeRequestId,
  RoleDefinitionId,
  WorkspaceId,
} from "@stoneforge/core";
import type { AssignmentId, TaskId } from "@stoneforge/execution";
import type { PolicyPreset } from "@stoneforge/workspace";

export type MergeRequestState =
  | "draft"
  | "open"
  | "repair_required"
  | "policy_pending"
  | "merge_ready"
  | "merged"
  | "closed_unmerged";

export type CIRunState =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "canceled"
  | "stale";

export type ReviewOutcome = "approved" | "changes_requested";
export type PolicyCheckState = "pending" | "passed" | "failed";

export interface ProviderPullRequest {
  provider: "github";
  providerPullRequestId: string;
  number: number;
  url: string;
  headSha: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface ProviderCheckObservation {
  providerCheckId: string;
  name: string;
  state: CIRunState;
  observedAt?: string;
}

export interface ProviderPullRequestObservation {
  providerPullRequestId: string;
  state: "open" | "closed" | "merged";
  headSha: string;
  checks: ProviderCheckObservation[];
  reviewOutcome?: ReviewOutcome;
  reviewReason?: string;
}

export interface MergeRequest {
  id: MergeRequestId;
  workspaceId: WorkspaceId;
  sourceOwner: {
    type: "task";
    taskId: TaskId;
  };
  state: MergeRequestState;
  providerPullRequest: ProviderPullRequest;
  ciRunIds: CIRunId[];
  reviewAssignmentIds: AssignmentId[];
  reviewOutcome?: ReviewOutcome;
  reviewReason?: string;
  humanApproval?: {
    approvedBy: string;
    approvedAt: string;
  };
  policyCheck?: {
    state: PolicyCheckState;
    publishedAt: string;
    reason: string;
  };
  mergedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CIRun {
  id: CIRunId;
  workspaceId: WorkspaceId;
  mergeRequestId: MergeRequestId;
  providerCheckId: string;
  name: string;
  state: CIRunState;
  observedAt: string;
}

export interface OpenTaskMergeRequestInput {
  taskAssignmentId: AssignmentId;
}

export interface RecordCIRunInput {
  providerCheckId: string;
  name: string;
  state: CIRunState;
  observedAt?: string;
}

export interface RecordReviewOutcomeInput {
  assignmentId: AssignmentId;
  outcome: ReviewOutcome;
  reason?: string;
}

export interface RequestReviewInput {
  roleDefinitionId?: RoleDefinitionId;
  requiredAgentTags?: string[];
  requiredRuntimeTags?: string[];
}

export interface GitHubMergeRequestAdapter {
  createOrUpdateTaskPullRequest(input: {
    workspaceId: WorkspaceId;
    taskId: TaskId;
    title: string;
    body: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ProviderPullRequest>;

  publishPolicyCheck(input: {
    mergeRequestId: MergeRequestId;
    providerPullRequest: ProviderPullRequest;
    state: PolicyCheckState;
    reason: string;
  }): Promise<void>;

  mergePullRequest(input: {
    mergeRequestId: MergeRequestId;
    providerPullRequest: ProviderPullRequest;
  }): Promise<{ mergedAt: string }>;

  observePullRequest(input: {
    mergeRequestId: MergeRequestId;
    providerPullRequest: ProviderPullRequest;
  }): Promise<ProviderPullRequestObservation>;
}

export interface MergeRequestServiceOptions {
  policyPreset: PolicyPreset;
  targetBranch?: string;
  sourceBranchPrefix?: string;
}

export interface MergeRequestSnapshot {
  mergeRequests: MergeRequest[];
  ciRuns: CIRun[];
}
