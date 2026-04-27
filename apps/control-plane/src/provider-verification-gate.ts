import type { ControlPlaneCommandStatus } from "./control-plane-store.js"
import {
  requireMergeRequestId,
  type LoadedControlPlane,
} from "./persistent-control-plane-context.js"

export function requireObservedProviderVerificationPassed(
  loaded: LoadedControlPlane
): Omit<ControlPlaneCommandStatus, "command"> {
  const mergeRequestId = requireMergeRequestId(loaded.snapshot.current)
  const mergeRequest = loaded.mergeRequests.getMergeRequest(mergeRequestId)
  const verificationRuns = mergeRequest.verificationRunIds.map(
    (verificationRunId) => {
      return loaded.mergeRequests.getVerificationRun(verificationRunId)
    }
  )
  const passing = verificationRuns.find((verificationRun) => {
    return verificationRun.state === "passed"
  })

  if (passing !== undefined) {
    loaded.snapshot.current.verificationRunId = passing.id
    return { id: passing.id, state: passing.state }
  }

  const latest = verificationRuns.at(-1)

  if (latest !== undefined) {
    const latestProviderCheck = latest.providerChecks.at(-1)
    const latestProviderCheckName = latestProviderCheck?.name ?? latest.headSha
    throw new Error(
      `No passing provider check/status was observed for MergeRequest ${mergeRequestId}. Latest provider check ${latestProviderCheckName} is ${latest.state}. Wait for GitHub checks/statuses to pass, then run observe-provider-state again.`
    )
  }

  throw new Error(
    `No provider check/status was observed for MergeRequest ${mergeRequestId}. Wait for GitHub checks/statuses to report, then run observe-provider-state again.`
  )
}
