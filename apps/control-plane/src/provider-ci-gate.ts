import type { ControlPlaneCommandStatus } from "./control-plane-store.js";
import {
  requireMergeRequestId,
  type LoadedControlPlane,
} from "./persistent-control-plane-context.js";

export function requireObservedProviderCiPassed(
  loaded: LoadedControlPlane,
): Omit<ControlPlaneCommandStatus, "command"> {
  const mergeRequestId = requireMergeRequestId(loaded.snapshot.current);
  const mergeRequest = loaded.mergeRequests.getMergeRequest(mergeRequestId);
  const ciRuns = mergeRequest.ciRunIds.map((ciRunId) => {
    return loaded.mergeRequests.getCIRun(ciRunId);
  });
  const passing = ciRuns.find((ciRun) => {
    return ciRun.state === "passed";
  });

  if (passing !== undefined) {
    loaded.snapshot.current.ciRunId = passing.id;
    return { id: passing.id, state: passing.state };
  }

  const latest = ciRuns.at(-1);

  if (latest !== undefined) {
    throw new Error(
      `No passing provider check/status was observed for MergeRequest ${mergeRequestId}. Latest provider check ${latest.name} is ${latest.state}. Wait for GitHub checks/statuses to pass, then run observe-provider-state again.`,
    );
  }

  throw new Error(
    `No provider check/status was observed for MergeRequest ${mergeRequestId}. Wait for GitHub checks/statuses to report, then run observe-provider-state again.`,
  );
}
