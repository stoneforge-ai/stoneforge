import type { CIRunId, MergeRequestId } from "@stoneforge/core";
import type { Task } from "@stoneforge/execution";

import type {
  CIRun,
  MergeRequest,
  ProviderPullRequest,
  RecordCIRunInput,
} from "./models.js";

export function applyProviderPullRequestUpdate(
  mergeRequest: MergeRequest,
  providerPullRequest: ProviderPullRequest,
  updatedAt: string,
): void {
  mergeRequest.providerPullRequest = providerPullRequest;
  mergeRequest.state =
    mergeRequest.state === "draft" || mergeRequest.state === "changes_requested"
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
    ciRunIds: [],
    reviewAssignmentIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createCIRunRecord(
  id: CIRunId,
  mergeRequest: MergeRequest,
  input: RecordCIRunInput,
  observedAt: string,
): CIRun {
  return {
    id,
    workspaceId: mergeRequest.workspaceId,
    mergeRequestId: mergeRequest.id,
    providerCheckId: input.providerCheckId,
    name: input.name,
    state: input.state,
    observedAt,
  };
}
