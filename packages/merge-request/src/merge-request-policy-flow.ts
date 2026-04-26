import { type VerificationRunId } from "@stoneforge/core";
import { type TaskDispatchService } from "@stoneforge/execution";

import { evaluateMergePolicy } from "./merge-policy.js";
import type {
  VerificationRun,
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
    private readonly verificationRuns: Map<VerificationRunId, VerificationRun>,
  ) {}

  async requestRepair(
    mergeRequest: MergeRequest,
    reason: string,
  ): Promise<void> {
    mergeRequest.state = "repair_required";
    mergeRequest.updatedAt = this.now();
    await this.publishPolicyCheck(mergeRequest, "failed", reason);
    this.execution.requireTaskRepair(mergeRequest.sourceOwner.taskId, reason);
  }

  async evaluatePolicy(mergeRequest: MergeRequest): Promise<void> {
    const decision = evaluateMergePolicy(
      mergeRequest,
      this.verificationRunsForMergeRequest(mergeRequest),
      this.options,
    );

    if (!decision) {
      return;
    }

    if (decision.nextState !== undefined) {
      mergeRequest.state = decision.nextState;
    }

    await this.publishPolicyCheck(
      mergeRequest,
      decision.checkState,
      decision.reason,
    );
  }

  private verificationRunsForMergeRequest(mergeRequest: MergeRequest): VerificationRun[] {
    return mergeRequest.verificationRunIds.flatMap((verificationRunId) => {
      const verificationRun = this.verificationRuns.get(verificationRunId);

      return verificationRun ? [verificationRun] : [];
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
