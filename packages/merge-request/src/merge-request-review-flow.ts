import type { MergeRequestId } from "@stoneforge/core";
import {
  type Assignment,
  type AssignmentId,
  type TaskDispatchService,
} from "@stoneforge/execution";

import type { MergeRequest, RecordReviewOutcomeInput } from "./models.js";
import { type MergeRequestPolicyFlow } from "./merge-request-policy-flow.js";
import {
  assertMergeRequestReviewAssignment,
  rememberReviewAssignment,
} from "./review-assignments.js";

export async function recordReviewOutcomeOnMergeRequest(
  execution: TaskDispatchService,
  policyFlow: MergeRequestPolicyFlow,
  mergeRequestId: MergeRequestId,
  mergeRequest: MergeRequest,
  input: RecordReviewOutcomeInput,
  now: string,
): Promise<void> {
  rememberCompletedReviewAssignment(
    execution,
    mergeRequestId,
    mergeRequest,
    input.assignmentId,
    now,
  );

  mergeRequest.reviewOutcomes.push({
    reviewerKind: input.reviewerKind,
    reviewerId: input.reviewerId,
    outcome: input.outcome,
    reason: input.reason,
    assignmentId: input.assignmentId,
    recordedAt: now,
  });

  if (input.outcome === "changes_requested") {
    await policyFlow.requestRepair(
      mergeRequest,
      input.reason ?? "Review requested changes",
    );
    return;
  }

  await policyFlow.evaluatePolicy(mergeRequest);
}

function rememberCompletedReviewAssignment(
  execution: TaskDispatchService,
  mergeRequestId: MergeRequestId,
  mergeRequest: MergeRequest,
  assignmentId: AssignmentId | undefined,
  now: string,
): void {
  if (!assignmentId) {
    return;
  }

  const assignment = execution.getAssignment(assignmentId);

  assertMergeRequestReviewAssignment(assignment, mergeRequestId);
  assertReviewAssignmentSucceeded(assignment, assignmentId);
  rememberReviewAssignment(mergeRequest, assignmentId, now);
}

function assertReviewAssignmentSucceeded(
  assignment: Assignment,
  assignmentId: AssignmentId,
): void {
  if (assignment.state === "succeeded") {
    return;
  }

  throw new Error(
    `Review Assignment ${assignmentId} must succeed before recording review outcome.`,
  );
}
