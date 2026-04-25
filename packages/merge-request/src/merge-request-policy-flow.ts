import { type CIRunId } from "@stoneforge/core";
import { TaskDispatchService } from "@stoneforge/execution";

import { evaluateMergePolicy } from "./merge-policy.js";
import type {
  CIRun,
  GitHubMergeRequestAdapter,
  MergeRequest,
  MergeRequestServiceOptions,
  PolicyCheckState,
} from "./models.js";

export class MergeRequestPolicyFlow {
  constructor(
    private readonly execution: TaskDispatchService,
    private readonly gitHubAdapter: GitHubMergeRequestAdapter,
    private readonly options: MergeRequestServiceOptions,
    private readonly ciRuns: Map<CIRunId, CIRun>,
  ) {}

  async requestRepair(
    mergeRequest: MergeRequest,
    reason: string,
  ): Promise<void> {
    mergeRequest.state = "repair_required";
    mergeRequest.updatedAt = this.now();
    await this.publishPolicyCheck(mergeRequest, "failed", reason);
    this.execution.reopenTaskForRepair(mergeRequest.sourceOwner.taskId, reason);
  }

  async evaluatePolicy(mergeRequest: MergeRequest): Promise<void> {
    const decision = evaluateMergePolicy(
      mergeRequest,
      this.ciRunsForMergeRequest(mergeRequest),
      this.options,
    );

    if (!decision) {
      return;
    }

    if (decision.nextState) {
      mergeRequest.state = decision.nextState;
    }

    await this.publishPolicyCheck(
      mergeRequest,
      decision.checkState,
      decision.reason,
    );
  }

  private ciRunsForMergeRequest(mergeRequest: MergeRequest): CIRun[] {
    return mergeRequest.ciRunIds.flatMap((ciRunId) => {
      const ciRun = this.ciRuns.get(ciRunId);

      return ciRun ? [ciRun] : [];
    });
  }

  private async publishPolicyCheck(
    mergeRequest: MergeRequest,
    state: PolicyCheckState,
    reason: string,
  ): Promise<void> {
    const publishedAt = this.now();

    mergeRequest.policyCheck = {
      state,
      reason,
      publishedAt,
    };
    await this.gitHubAdapter.publishPolicyCheck({
      mergeRequestId: mergeRequest.id,
      providerPullRequest: mergeRequest.providerPullRequest,
      state,
      reason,
    });
  }

  private now(): string {
    return new Date().toISOString();
  }
}
