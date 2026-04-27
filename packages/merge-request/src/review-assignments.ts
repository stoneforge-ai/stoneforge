import type { MergeRequestId } from "@stoneforge/core"
import type { Assignment, AssignmentId } from "@stoneforge/execution"

import type { MergeRequest } from "./models.js"

export function assertMergeRequestReviewAssignment(
  assignment: Assignment,
  mergeRequestId: MergeRequestId
): void {
  if (
    assignment.owner.type !== "merge_request" ||
    assignment.mergeRequestId !== mergeRequestId
  ) {
    throw new Error(
      `Assignment ${assignment.id} does not belong to MergeRequest ${mergeRequestId}.`
    )
  }
}

export function requireMergeRequestAssignmentId(
  assignment: Assignment
): MergeRequestId {
  if (assignment.owner.type !== "merge_request" || !assignment.mergeRequestId) {
    throw new Error(`Assignment ${assignment.id} is not MergeRequest-owned.`)
  }

  return assignment.mergeRequestId
}

export function rememberReviewAssignment(
  mergeRequest: MergeRequest,
  assignmentId: AssignmentId,
  updatedAt: string
): void {
  if (mergeRequest.reviewAssignmentIds.includes(assignmentId)) {
    return
  }

  mergeRequest.reviewAssignmentIds.push(assignmentId)
  mergeRequest.updatedAt = updatedAt
}
