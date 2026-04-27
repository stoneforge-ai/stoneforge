import type {
  VerificationRun,
  MergeRequest,
  MergeRequestServiceOptions,
  MergeRequestState,
  PolicyCheckState,
} from "./models.js"

export interface PolicyDecision {
  nextState?: MergeRequestState
  checkState: PolicyCheckState
  reason: string
}

export function evaluateMergePolicy(
  mergeRequest: MergeRequest,
  verificationRuns: VerificationRun[],
  options: MergeRequestServiceOptions
): PolicyDecision | null {
  if (isTerminalMergeRequest(mergeRequest)) {
    return null
  }

  if (!hasRequiredMergeSignals(mergeRequest, verificationRuns)) {
    return {
      checkState: "pending",
      reason: "A passing Verification Run and Review Approved are required.",
    }
  }

  if (requiresHumanApproval(mergeRequest, options)) {
    return {
      nextState: "policy_pending",
      checkState: "pending",
      reason: "A Human Approval Gate is required by supervised policy.",
    }
  }

  return {
    nextState: "merge_ready",
    checkState: "passed",
    reason: "Stoneforge policy gates are satisfied.",
  }
}

function isTerminalMergeRequest(mergeRequest: MergeRequest): boolean {
  return ["merged", "closed_unmerged"].includes(mergeRequest.state)
}

function hasRequiredMergeSignals(
  mergeRequest: MergeRequest,
  verificationRuns: VerificationRun[]
): boolean {
  if (!hasPassingVerificationRun(verificationRuns)) {
    return false
  }

  return hasReviewApproved(mergeRequest)
}

function requiresHumanApproval(
  mergeRequest: MergeRequest,
  options: MergeRequestServiceOptions
): boolean {
  if (options.policyPreset !== "supervised") {
    return false
  }

  return !hasReviewApproved(mergeRequest, "human")
}

function hasPassingVerificationRun(
  verificationRuns: VerificationRun[]
): boolean {
  return verificationRuns.some(
    (verificationRun) => verificationRun.state === "passed"
  )
}

function hasReviewApproved(
  mergeRequest: MergeRequest,
  reviewerKind?: "human" | "agent"
): boolean {
  return mergeRequest.reviewOutcomes.some((reviewOutcome) => {
    if (reviewOutcome.outcome !== "approved") {
      return false
    }

    return (
      reviewerKind === undefined || reviewOutcome.reviewerKind === reviewerKind
    )
  })
}
