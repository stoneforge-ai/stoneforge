import type {
  CIRun,
  MergeRequest,
  MergeRequestServiceOptions,
  MergeRequestState,
  PolicyCheckState,
} from "./models.js";

export interface PolicyDecision {
  nextState?: MergeRequestState;
  checkState: PolicyCheckState;
  reason: string;
}

export function evaluateMergePolicy(
  mergeRequest: MergeRequest,
  ciRuns: CIRun[],
  options: MergeRequestServiceOptions,
): PolicyDecision | null {
  if (isTerminalMergeRequest(mergeRequest)) {
    return null;
  }

  if (!hasRequiredMergeSignals(mergeRequest, ciRuns)) {
    return {
      checkState: "pending",
      reason: "CI and approved review are required.",
    };
  }

  if (requiresHumanApproval(mergeRequest, options)) {
    return {
      nextState: "policy_pending",
      checkState: "pending",
      reason: "Human approval is required by supervised policy.",
    };
  }

  return {
    nextState: "merge_ready",
    checkState: "passed",
    reason: "Stoneforge policy gates are satisfied.",
  };
}

function isTerminalMergeRequest(mergeRequest: MergeRequest): boolean {
  return ["merged", "closed_unmerged"].includes(mergeRequest.state);
}

function hasRequiredMergeSignals(
  mergeRequest: MergeRequest,
  ciRuns: CIRun[],
): boolean {
  if (!hasPassingCI(ciRuns)) {
    return false;
  }

  return mergeRequest.reviewOutcome === "approved";
}

function requiresHumanApproval(
  mergeRequest: MergeRequest,
  options: MergeRequestServiceOptions,
): boolean {
  if (options.policyPreset !== "supervised") {
    return false;
  }

  return mergeRequest.humanApproval === undefined;
}

function hasPassingCI(ciRuns: CIRun[]): boolean {
  return ciRuns.some((ciRun) => ciRun.state === "passed");
}
