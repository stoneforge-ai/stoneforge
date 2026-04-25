import type { CIRun, MergeRequest } from "./models.js";

export function cloneMergeRequest(mergeRequest: MergeRequest): MergeRequest {
  return {
    ...mergeRequest,
    sourceOwner: { ...mergeRequest.sourceOwner },
    providerPullRequest: { ...mergeRequest.providerPullRequest },
    ciRunIds: [...mergeRequest.ciRunIds],
    reviewAssignmentIds: [...mergeRequest.reviewAssignmentIds],
    humanApproval: mergeRequest.humanApproval
      ? { ...mergeRequest.humanApproval }
      : undefined,
    policyCheck: mergeRequest.policyCheck
      ? { ...mergeRequest.policyCheck }
      : undefined,
  };
}

export function cloneCIRun(ciRun: CIRun): CIRun {
  return {
    ...ciRun,
  };
}
