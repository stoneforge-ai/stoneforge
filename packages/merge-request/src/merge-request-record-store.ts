import type { VerificationRunId, MergeRequestId } from "@stoneforge/core";
import type { Task } from "@stoneforge/execution";

import { cloneMergeRequest, cloneVerificationRun } from "./cloning.js";
import type {
  VerificationRun,
  MergeRequest,
  MergeRequestSnapshot,
  ProviderPullRequest,
  RecordProviderCheckInput,
} from "./models.js";
import { upsertTaskMergeRequest } from "./task-merge-requests.js";
import { upsertVerificationRunRecord } from "./verification-runs.js";

type CounterName = "mergeRequest" | "verificationRun";

export class MergeRequestRecordStore {
  readonly mergeRequests = new Map<MergeRequestId, MergeRequest>();
  readonly mergeRequestIdsByTaskId = new Map<string, MergeRequestId>();
  readonly verificationRuns = new Map<VerificationRunId, VerificationRun>();

  private readonly counters: Record<CounterName, number> = {
    mergeRequest: 0,
    verificationRun: 0,
  };

  constructor(snapshot?: MergeRequestSnapshot) {
    if (snapshot) {
      this.restoreSnapshot(snapshot);
    }
  }

  requireMergeRequest(mergeRequestId: MergeRequestId): MergeRequest {
    const mergeRequest = this.mergeRequests.get(mergeRequestId);

    if (!mergeRequest) {
      throw new Error(`MergeRequest ${mergeRequestId} does not exist.`);
    }

    return mergeRequest;
  }

  getMergeRequest(mergeRequestId: MergeRequestId): MergeRequest {
    return cloneMergeRequest(this.requireMergeRequest(mergeRequestId));
  }

  getVerificationRun(verificationRunId: VerificationRunId): VerificationRun {
    const verificationRun = this.verificationRuns.get(verificationRunId);

    if (!verificationRun) {
      throw new Error(`VerificationRun ${verificationRunId} does not exist.`);
    }

    return cloneVerificationRun(verificationRun);
  }

  listMergeRequests(): MergeRequest[] {
    return Array.from(this.mergeRequests.values()).map(cloneMergeRequest);
  }

  listVerificationRuns(): VerificationRun[] {
    return Array.from(this.verificationRuns.values()).map(cloneVerificationRun);
  }

  exportSnapshot(): MergeRequestSnapshot {
    return {
      mergeRequests: this.listMergeRequests(),
      verificationRuns: this.listVerificationRuns(),
    };
  }

  upsertMergeRequest(
    task: Task,
    providerPullRequest: ProviderPullRequest,
    observedAt: string,
  ): MergeRequest {
    return upsertTaskMergeRequest(
      {
        mergeRequests: this.mergeRequests,
        mergeRequestIdsByTaskId: this.mergeRequestIdsByTaskId,
        nextId: () => this.nextId("mergeRequest"),
        now: () => observedAt,
      },
      task,
      providerPullRequest,
    );
  }

  upsertVerificationRun(
    mergeRequest: MergeRequest,
    input: RecordProviderCheckInput,
    observedAt: string,
  ): VerificationRun {
    return upsertVerificationRunRecord(
      this.verificationRuns,
      mergeRequest,
      input,
      observedAt,
      () => this.nextId("verificationRun"),
    );
  }

  markStaleVerificationRuns(
    mergeRequest: MergeRequest,
    previousHeadSha: string,
    observedAt: string,
  ): void {
    if (mergeRequest.providerPullRequest.headSha === previousHeadSha) {
      return;
    }

    const staleRuns = mergeRequest.verificationRunIds
      .map((verificationRunId) => this.verificationRuns.get(verificationRunId))
      .filter(isVerificationRunForHead(previousHeadSha));

    for (const verificationRun of staleRuns) {
      verificationRun.state = "stale";
      verificationRun.observedAt = observedAt;
    }
  }

  private nextId(counterName: CounterName): string {
    this.counters[counterName] += 1;
    return `${counterName}_${this.counters[counterName]}`;
  }

  private restoreSnapshot(snapshot: MergeRequestSnapshot): void {
    for (const mergeRequest of snapshot.mergeRequests) {
      this.mergeRequests.set(mergeRequest.id, cloneMergeRequest(mergeRequest));
      this.mergeRequestIdsByTaskId.set(
        mergeRequest.sourceOwner.taskId,
        mergeRequest.id,
      );
    }

    for (const verificationRun of snapshot.verificationRuns) {
      this.verificationRuns.set(
        verificationRun.id,
        cloneVerificationRun(verificationRun),
      );
    }

    this.counters.mergeRequest = maxNumericSuffix(
      snapshot.mergeRequests.map((mergeRequest) => mergeRequest.id),
      "mergeRequest_",
    );
    this.counters.verificationRun = maxNumericSuffix(
      snapshot.verificationRuns.map((verificationRun) => verificationRun.id),
      "verificationRun_",
    );
  }
}

function maxNumericSuffix(values: readonly string[], prefix: string): number {
  return values.reduce((max, value) => {
    const suffix = value.startsWith(prefix)
      ? Number(value.slice(prefix.length))
      : 0;

    if (Number.isInteger(suffix) && suffix > max) {
      return suffix;
    }

    return max;
  }, 0);
}

function isVerificationRunForHead(
  headSha: string,
): (
  verificationRun: VerificationRun | undefined,
) => verificationRun is VerificationRun {
  return (
    verificationRun: VerificationRun | undefined,
  ): verificationRun is VerificationRun => verificationRun?.headSha === headSha;
}
