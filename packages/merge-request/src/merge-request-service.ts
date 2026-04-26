import { type VerificationRunId, type MergeRequestId } from "@stoneforge/core";
import {
  type Assignment,
  type TaskDispatchService,
} from "@stoneforge/execution";
import type { Task } from "@stoneforge/execution";

import type {
  VerificationRun,
  GitHubMergeRequestAdapter,
  MergeRequest,
  MergeRequestSnapshot,
  MergeRequestServiceOptions,
  OpenTaskMergeRequestInput,
  ProviderPullRequest,
  RecordProviderCheckInput,
  RecordReviewOutcomeInput,
  RequestReviewInput,
} from "./models.js";
import { reconcileProviderPullRequestObservation } from "./provider-pull-request-observation.js";
import { cloneMergeRequest, cloneVerificationRun } from "./cloning.js";
import { MergeRequestRecordStore } from "./merge-request-record-store.js";
import { rememberVerificationRun } from "./verification-runs.js";
import { MergeRequestPolicyFlow } from "./merge-request-policy-flow.js";
import { recordReviewOutcomeOnMergeRequest } from "./merge-request-review-flow.js";
import {
  createTaskPullRequestInput,
  requireSucceededTaskAssignment,
  requireTaskAwaitingMergeRequest,
} from "./merge-request-task-flow.js";
import {
  rememberReviewAssignment,
  requireMergeRequestAssignmentId,
} from "./review-assignments.js";

const defaultOptions: MergeRequestServiceOptions = {
  policyPreset: "supervised",
  targetBranch: "main",
  sourceBranchPrefix: "stoneforge/task",
};

export class MergeRequestService {
  private readonly records: MergeRequestRecordStore;
  private readonly policyFlow: MergeRequestPolicyFlow;

  constructor(
    private readonly execution: TaskDispatchService,
    private readonly gitHubAdapter: GitHubMergeRequestAdapter,
    private readonly options: MergeRequestServiceOptions = defaultOptions,
    snapshot?: MergeRequestSnapshot,
  ) {
    this.records = new MergeRequestRecordStore(snapshot);
    this.policyFlow = new MergeRequestPolicyFlow(
      execution,
      gitHubAdapter,
      options,
      this.records.verificationRuns,
    );
  }

  async openOrUpdateTaskMergeRequest(
    input: OpenTaskMergeRequestInput,
  ): Promise<MergeRequest> {
    const assignment = requireSucceededTaskAssignment(this.execution, input);
    const task = requireTaskAwaitingMergeRequest(this.execution, assignment);
    const providerPullRequest = await this.upsertProviderPullRequest(task);

    return this.upsertMergeRequest(task, providerPullRequest);
  }

  requestReview(
    mergeRequestId: MergeRequestId,
    input: RequestReviewInput = {},
  ) {
    const mergeRequest = this.records.requireMergeRequest(mergeRequestId);
    const intent = this.execution.createMergeRequestDispatchIntent({
      workspaceId: mergeRequest.workspaceId,
      mergeRequest: {
        id: mergeRequest.id,
        title: `Review PR #${mergeRequest.providerPullRequest.number}`,
        providerPullRequestUrl: mergeRequest.providerPullRequest.url,
      },
      action: "review",
      roleDefinitionId: input.roleDefinitionId,
      requiredAgentTags: input.requiredAgentTags,
      requiredRuntimeTags: input.requiredRuntimeTags,
    });

    if (intent.assignmentId) {
      mergeRequest.reviewAssignmentIds.push(intent.assignmentId);
      mergeRequest.updatedAt = this.now();
    }

    return intent;
  }

  recordReviewAssignment(assignment: Assignment): MergeRequest {
    const mergeRequestId = requireMergeRequestAssignmentId(assignment);
    const mergeRequest = this.records.requireMergeRequest(mergeRequestId);
    rememberReviewAssignment(mergeRequest, assignment.id, this.now());

    return cloneMergeRequest(mergeRequest);
  }

  async recordProviderCheck(
    mergeRequestId: MergeRequestId,
    input: RecordProviderCheckInput,
  ): Promise<VerificationRun> {
    const mergeRequest = this.records.requireMergeRequest(mergeRequestId);
    const observedAt = input.observedAt ?? this.now();
    const verificationRun = this.records.upsertVerificationRun(
      mergeRequest,
      input,
      observedAt,
    );

    rememberVerificationRun(mergeRequest, verificationRun.id);
    await this.applyVerificationRunPolicy(mergeRequest, verificationRun);
    mergeRequest.updatedAt = this.now();

    return cloneVerificationRun(verificationRun);
  }

  async observeProviderPullRequest(
    mergeRequestId: MergeRequestId,
  ): Promise<VerificationRun[]> {
    const mergeRequest = this.records.requireMergeRequest(mergeRequestId);
    const previousHeadSha = mergeRequest.providerPullRequest.headSha;
    const observedAt = this.now();
    const observation = await this.gitHubAdapter.observePullRequest({
      mergeRequestId,
      providerPullRequest: mergeRequest.providerPullRequest,
    });
    const providerState = reconcileProviderPullRequestObservation({
      execution: this.execution,
      mergeRequest,
      observation,
      observedAt,
    });

    if (providerState === "terminal") {
      return [];
    }

    this.records.markStaleVerificationRuns(
      mergeRequest,
      previousHeadSha,
      observedAt,
    );

    const verificationRuns = new Map<VerificationRunId, VerificationRun>();

    for (const check of observation.checks) {
      const verificationRun = await this.recordProviderCheck(mergeRequestId, {
        providerCheckId: check.providerCheckId,
        name: check.name,
        state: check.state,
        observedAt: check.observedAt,
      });
      verificationRuns.set(verificationRun.id, verificationRun);
    }

    return Array.from(verificationRuns.values()).map(cloneVerificationRun);
  }

  async recordReviewOutcome(
    mergeRequestId: MergeRequestId,
    input: RecordReviewOutcomeInput,
  ): Promise<MergeRequest> {
    const mergeRequest = this.records.requireMergeRequest(mergeRequestId);
    await recordReviewOutcomeOnMergeRequest(
      this.execution,
      this.policyFlow,
      mergeRequestId,
      mergeRequest,
      input,
      this.now(),
    );

    mergeRequest.updatedAt = this.now();

    return cloneMergeRequest(mergeRequest);
  }

  async publishPolicyStatus(
    mergeRequestId: MergeRequestId,
  ): Promise<MergeRequest> {
    const mergeRequest = this.records.requireMergeRequest(mergeRequestId);

    await this.policyFlow.evaluatePolicy(mergeRequest);
    mergeRequest.updatedAt = this.now();

    return cloneMergeRequest(mergeRequest);
  }

  async merge(mergeRequestId: MergeRequestId): Promise<MergeRequest> {
    const mergeRequest = this.records.requireMergeRequest(mergeRequestId);

    if (mergeRequest.state !== "merge_ready") {
      throw new Error(`MergeRequest ${mergeRequestId} is not merge_ready.`);
    }

    const result = await this.gitHubAdapter.mergePullRequest({
      mergeRequestId,
      providerPullRequest: mergeRequest.providerPullRequest,
    });

    mergeRequest.state = "merged";
    mergeRequest.mergedAt = result.mergedAt;
    mergeRequest.updatedAt = result.mergedAt;
    this.execution.completeTaskAfterMerge(mergeRequest.sourceOwner.taskId);

    return cloneMergeRequest(mergeRequest);
  }

  getMergeRequest(mergeRequestId: MergeRequestId): MergeRequest {
    return this.records.getMergeRequest(mergeRequestId);
  }

  getVerificationRun(verificationRunId: VerificationRunId): VerificationRun {
    return this.records.getVerificationRun(verificationRunId);
  }

  listMergeRequests(): MergeRequest[] {
    return this.records.listMergeRequests();
  }

  listVerificationRuns(): VerificationRun[] {
    return this.records.listVerificationRuns();
  }

  exportSnapshot(): MergeRequestSnapshot {
    return this.records.exportSnapshot();
  }

  private now(): string {
    return new Date().toISOString();
  }

  private async upsertProviderPullRequest(
    task: Task,
  ): Promise<ProviderPullRequest> {
    return this.gitHubAdapter.createOrUpdateTaskPullRequest(
      createTaskPullRequestInput(
        task,
        this.options.targetBranch ?? "main",
        this.options.sourceBranchPrefix ?? "stoneforge/task",
      ),
    );
  }

  private upsertMergeRequest(
    task: Task,
    providerPullRequest: ProviderPullRequest,
  ): MergeRequest {
    return this.records.upsertMergeRequest(
      task,
      providerPullRequest,
      this.now(),
    );
  }

  private async applyVerificationRunPolicy(
    mergeRequest: MergeRequest,
    verificationRun: VerificationRun,
  ): Promise<void> {
    if (verificationRun.state === "failed") {
      await this.policyFlow.requestRepair(
        mergeRequest,
        "Verification Run failed",
      );
      return;
    }

    await this.policyFlow.evaluatePolicy(mergeRequest);
  }
}
