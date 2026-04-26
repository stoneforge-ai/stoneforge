import { type VerificationRunId, type MergeRequestId } from "@stoneforge/core";
import { runLayeredProgram } from "@stoneforge/core/internal/program-runtime";
import {
  type Assignment,
  type TaskDispatchService,
} from "@stoneforge/execution";
import type { Layer } from "effect";

import type {
  VerificationRun,
  GitHubMergeRequestAdapter,
  MergeRequest,
  MergeRequestSnapshot,
  MergeRequestServiceOptions,
  OpenTaskMergeRequestInput,
  RecordProviderCheckInput,
  RecordReviewOutcomeInput,
  RequestReviewInput,
} from "./models.js";
import {
  type MergeRequestAdapterService,
  mergeRequestRuntime,
} from "./merge-request-runtime.js";
import { cloneMergeRequest } from "./cloning.js";
import { MergeRequestWorkflow } from "./merge-request-workflow.js";
import { MergeRequestRecordStore } from "./merge-request-record-store.js";
import { MergeRequestPolicyFlow } from "./merge-request-policy-flow.js";
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
  private readonly workflow: MergeRequestWorkflow;
  private readonly runtime: Layer.Layer<MergeRequestAdapterService>;

  constructor(
    private readonly execution: TaskDispatchService,
    gitHubAdapter: GitHubMergeRequestAdapter,
    private readonly options: MergeRequestServiceOptions = defaultOptions,
    snapshot?: MergeRequestSnapshot,
  ) {
    this.records = new MergeRequestRecordStore(snapshot);
    this.runtime = mergeRequestRuntime(gitHubAdapter);
    this.policyFlow = new MergeRequestPolicyFlow(
      execution,
      options,
      this.records.verificationRuns,
    );
    this.workflow = new MergeRequestWorkflow(
      execution,
      this.records,
      this.policyFlow,
      options,
    );
  }

  async openOrUpdateTaskMergeRequest(
    input: OpenTaskMergeRequestInput,
  ): Promise<MergeRequest> {
    return runLayeredProgram(
      this.workflow.openOrUpdateTaskMergeRequest(input),
      this.runtime,
    );
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
    return runLayeredProgram(
      this.workflow.recordProviderCheck(mergeRequestId, input),
      this.runtime,
    );
  }

  async observeProviderPullRequest(
    mergeRequestId: MergeRequestId,
  ): Promise<VerificationRun[]> {
    return runLayeredProgram(
      this.workflow.observeProviderPullRequest(mergeRequestId),
      this.runtime,
    );
  }

  async recordReviewOutcome(
    mergeRequestId: MergeRequestId,
    input: RecordReviewOutcomeInput,
  ): Promise<MergeRequest> {
    return runLayeredProgram(
      this.workflow.recordReviewOutcome(mergeRequestId, input),
      this.runtime,
    );
  }

  async publishPolicyStatus(
    mergeRequestId: MergeRequestId,
  ): Promise<MergeRequest> {
    return runLayeredProgram(
      this.workflow.publishPolicyStatus(mergeRequestId),
      this.runtime,
    );
  }

  async merge(mergeRequestId: MergeRequestId): Promise<MergeRequest> {
    return runLayeredProgram(this.workflow.merge(mergeRequestId), this.runtime);
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
}
