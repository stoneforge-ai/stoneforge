import type { MergeRequestId } from "@stoneforge/core"
import {
  type Assignment,
  type AssignmentId,
  type TaskDispatchService,
} from "@stoneforge/execution"
import { Effect } from "effect"

import type {
  MergeRequestAdapterService,
  PublishPolicyCheckFailed,
} from "./merge-request-runtime.js"
import type { MergeRequest, RecordReviewOutcomeInput } from "./models.js"
import { type MergeRequestPolicyFlow } from "./merge-request-policy-flow.js"
import {
  assertMergeRequestReviewAssignment,
  rememberReviewAssignment,
} from "./review-assignments.js"

export function recordReviewOutcomeOnMergeRequest(
  execution: TaskDispatchService,
  policyFlow: MergeRequestPolicyFlow,
  mergeRequestId: MergeRequestId,
  mergeRequest: MergeRequest,
  input: RecordReviewOutcomeInput,
  now: string
): Effect.Effect<void, PublishPolicyCheckFailed, MergeRequestAdapterService> {
  return Effect.sync(() => {
    rememberCompletedReviewAssignment(
      execution,
      mergeRequestId,
      mergeRequest,
      input.assignmentId,
      now
    )

    mergeRequest.reviewOutcomes.push({
      reviewerKind: input.reviewerKind,
      reviewerId: input.reviewerId,
      outcome: input.outcome,
      reason: input.reason,
      assignmentId: input.assignmentId,
      recordedAt: now,
    })
  }).pipe(
    Effect.flatMap(() => {
      if (input.outcome === "changes_requested") {
        return policyFlow.requestRepair(
          mergeRequest,
          input.reason ?? "Review requested changes"
        )
      }

      return policyFlow.evaluatePolicy(mergeRequest)
    }),
    Effect.withSpan("merge_request.record_review_outcome", {
      attributes: {
        "stoneforge.merge_request.id": mergeRequestId,
      },
    })
  )
}

function rememberCompletedReviewAssignment(
  execution: TaskDispatchService,
  mergeRequestId: MergeRequestId,
  mergeRequest: MergeRequest,
  assignmentId: AssignmentId | undefined,
  now: string
): void {
  if (!assignmentId) {
    return
  }

  const assignment = execution.getAssignment(assignmentId)

  assertMergeRequestReviewAssignment(assignment, mergeRequestId)
  assertReviewAssignmentSucceeded(assignment, assignmentId)
  rememberReviewAssignment(mergeRequest, assignmentId, now)
}

function assertReviewAssignmentSucceeded(
  assignment: Assignment,
  assignmentId: AssignmentId
): void {
  if (assignment.state === "succeeded") {
    return
  }

  throw new Error(
    `Review Assignment ${assignmentId} must succeed before recording review outcome.`
  )
}
