import type { VerificationRunId, MergeRequestId } from "@stoneforge/core";
import type { Task } from "@stoneforge/execution";

import type {
  VerificationRun,
  MergeRequest,
  ProviderPullRequest,
} from "./models.js";

export function applyProviderPullRequestUpdate(
  mergeRequest: MergeRequest,
  providerPullRequest: ProviderPullRequest,
  updatedAt: string,
): void {
  mergeRequest.providerPullRequest = providerPullRequest;
  mergeRequest.state =
    mergeRequest.state === "draft" || mergeRequest.state === "repair_required"
      ? "open"
      : mergeRequest.state;
  mergeRequest.updatedAt = updatedAt;
}

export function createTaskMergeRequestRecord(
  id: MergeRequestId,
  task: Task,
  providerPullRequest: ProviderPullRequest,
  now: string,
): MergeRequest {
  return {
    id,
    workspaceId: task.workspaceId,
    sourceOwner: {
      type: "task",
      taskId: task.id,
    },
    state: "open",
    providerPullRequest,
    verificationRunIds: [],
    reviewAssignmentIds: [],
    reviewOutcomes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createVerificationRunRecord(
  id: VerificationRunId,
  mergeRequest: MergeRequest,
  observedAt: string,
): VerificationRun {
  return {
    id,
    workspaceId: mergeRequest.workspaceId,
    mergeRequestId: mergeRequest.id,
    headSha: mergeRequest.providerPullRequest.headSha,
    state: "queued",
    providerChecks: [],
    observedAt,
  };
}
