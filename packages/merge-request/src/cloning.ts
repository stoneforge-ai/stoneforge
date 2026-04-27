import type { VerificationRun, MergeRequest } from "./models.js"

export function cloneMergeRequest(mergeRequest: MergeRequest): MergeRequest {
  return {
    ...mergeRequest,
    sourceOwner: { ...mergeRequest.sourceOwner },
    providerPullRequest: { ...mergeRequest.providerPullRequest },
    verificationRunIds: [...mergeRequest.verificationRunIds],
    reviewAssignmentIds: [...mergeRequest.reviewAssignmentIds],
    reviewOutcomes: mergeRequest.reviewOutcomes.map((outcome) => ({
      ...outcome,
    })),
    policyCheck: mergeRequest.policyCheck
      ? { ...mergeRequest.policyCheck }
      : undefined,
  }
}

export function cloneVerificationRun(
  verificationRun: VerificationRun
): VerificationRun {
  return {
    ...verificationRun,
    providerChecks: verificationRun.providerChecks.map((providerCheck) => ({
      ...providerCheck,
    })),
  }
}
