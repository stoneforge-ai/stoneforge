import type { MergeRequestId } from "@stoneforge/core";
import { type TaskDispatchService } from "@stoneforge/execution";

import type {
  MergeRequest,
  RecordReviewOutcomeInput,
} from "./models.js";
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
  const assignment = execution.getAssignment(input.assignmentId);

  assertMergeRequestReviewAssignment(assignment, mergeRequestId);

  if (assignment.state !== "succeeded") {
    throw new Error(
      `Review Assignment ${input.assignmentId} must succeed before recording review outcome.`,
    );
  }

  mergeRequest.reviewOutcome = input.outcome;
  mergeRequest.reviewReason = input.reason;

  rememberReviewAssignment(mergeRequest, input.assignmentId, now);

  if (input.outcome === "changes_requested") {
    await policyFlow.requestRepair(
      mergeRequest,
      input.reason ?? "Review requested changes",
    );
    return;
  }

  await policyFlow.evaluatePolicy(mergeRequest);
}
