import { type CIRunId, type MergeRequestId } from "@stoneforge/core";
import { type Assignment, TaskDispatchService } from "@stoneforge/execution";
import type { Task } from "@stoneforge/execution";

import type {
  CIRun,
  GitHubMergeRequestAdapter,
  MergeRequest,
  MergeRequestServiceOptions,
  OpenTaskMergeRequestInput,
  ProviderPullRequest,
  RecordCIRunInput,
  RecordReviewOutcomeInput,
  RequestReviewInput,
} from "./models.js";
import { cloneCIRun, cloneMergeRequest } from "./cloning.js";
import { rememberCIRun, upsertCIRunRecord } from "./ci-runs.js";
import { MergeRequestPolicyFlow } from "./merge-request-policy-flow.js";
import { recordReviewOutcomeOnMergeRequest } from "./merge-request-review-flow.js";
import {
  createTaskPullRequestInput,
  requireSucceededTaskAssignment,
  requireTaskAwaitingMergeRequest,
} from "./merge-request-task-flow.js";
import { rememberReviewAssignment, requireMergeRequestAssignmentId } from "./review-assignments.js";
import { upsertTaskMergeRequest } from "./task-merge-requests.js";

type CounterName = "mergeRequest" | "ciRun";

const defaultOptions: MergeRequestServiceOptions = {
  policyPreset: "supervised",
  targetBranch: "main",
};

export class MergeRequestService {
  private readonly mergeRequests = new Map<MergeRequestId, MergeRequest>();
  private readonly mergeRequestIdsByTaskId = new Map<string, MergeRequestId>();
  private readonly ciRuns = new Map<CIRunId, CIRun>();
  private readonly policyFlow: MergeRequestPolicyFlow;
  private readonly counters: Record<CounterName, number> = {
    mergeRequest: 0,
    ciRun: 0,
  };

  constructor(
    private readonly execution: TaskDispatchService,
    private readonly gitHubAdapter: GitHubMergeRequestAdapter,
    private readonly options: MergeRequestServiceOptions = defaultOptions,
  ) {
    this.policyFlow = new MergeRequestPolicyFlow(execution, gitHubAdapter, options, this.ciRuns);
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
    const mergeRequest = this.requireMergeRequest(mergeRequestId);
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
    const mergeRequest = this.requireMergeRequest(mergeRequestId);
    rememberReviewAssignment(mergeRequest, assignment.id, this.now());

    return cloneMergeRequest(mergeRequest);
  }

  async recordCIRun(
    mergeRequestId: MergeRequestId,
    input: RecordCIRunInput,
  ): Promise<CIRun> {
    const mergeRequest = this.requireMergeRequest(mergeRequestId);
    const observedAt = input.observedAt ?? this.now();
    const ciRun = this.upsertCIRun(mergeRequest, input, observedAt);

    rememberCIRun(mergeRequest, ciRun.id);
    await this.applyCIRunPolicy(mergeRequest, ciRun);
    mergeRequest.updatedAt = this.now();

    return cloneCIRun(ciRun);
  }

  async recordReviewOutcome(
    mergeRequestId: MergeRequestId,
    input: RecordReviewOutcomeInput,
  ): Promise<MergeRequest> {
    const mergeRequest = this.requireMergeRequest(mergeRequestId);
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

  async recordHumanApproval(
    mergeRequestId: MergeRequestId,
    approvedBy: string,
  ): Promise<MergeRequest> {
    const mergeRequest = this.requireMergeRequest(mergeRequestId);

    mergeRequest.humanApproval = {
      approvedBy,
      approvedAt: this.now(),
    };
    await this.policyFlow.evaluatePolicy(mergeRequest);
    mergeRequest.updatedAt = this.now();

    return cloneMergeRequest(mergeRequest);
  }

  async merge(mergeRequestId: MergeRequestId): Promise<MergeRequest> {
    const mergeRequest = this.requireMergeRequest(mergeRequestId);

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
    return cloneMergeRequest(this.requireMergeRequest(mergeRequestId));
  }

  getCIRun(ciRunId: CIRunId): CIRun {
    const ciRun = this.ciRuns.get(ciRunId);

    if (!ciRun) {
      throw new Error(`CIRun ${ciRunId} does not exist.`);
    }

    return cloneCIRun(ciRun);
  }

  listMergeRequests(): MergeRequest[] {
    return Array.from(this.mergeRequests.values()).map(cloneMergeRequest);
  }

  listCIRuns(): CIRun[] {
    return Array.from(this.ciRuns.values()).map(cloneCIRun);
  }

  private requireMergeRequest(mergeRequestId: MergeRequestId): MergeRequest {
    const mergeRequest = this.mergeRequests.get(mergeRequestId);

    if (!mergeRequest) {
      throw new Error(`MergeRequest ${mergeRequestId} does not exist.`);
    }

    return mergeRequest;
  }

  private nextId(counterName: CounterName): string {
    this.counters[counterName] += 1;
    return `${counterName}_${this.counters[counterName]}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private async upsertProviderPullRequest(
    task: Task,
  ): Promise<ProviderPullRequest> {
    return this.gitHubAdapter.createOrUpdateTaskPullRequest(
      createTaskPullRequestInput(task, this.options.targetBranch ?? "main"),
    );
  }

  private upsertMergeRequest(
    task: Task,
    providerPullRequest: ProviderPullRequest,
  ): MergeRequest {
    return upsertTaskMergeRequest(
      {
        mergeRequests: this.mergeRequests,
        mergeRequestIdsByTaskId: this.mergeRequestIdsByTaskId,
        nextId: () => this.nextId("mergeRequest"),
        now: () => this.now(),
      },
      task,
      providerPullRequest,
    );
  }

  private upsertCIRun(
    mergeRequest: MergeRequest,
    input: RecordCIRunInput,
    observedAt: string,
  ): CIRun {
    return upsertCIRunRecord(
      this.ciRuns,
      mergeRequest,
      input,
      observedAt,
      () => this.nextId("ciRun"),
    );
  }

  private async applyCIRunPolicy(
    mergeRequest: MergeRequest,
    ciRun: CIRun,
  ): Promise<void> {
    if (ciRun.state === "failed") {
      await this.policyFlow.requestRepair(mergeRequest, "CI failed");
      return;
    }

    await this.policyFlow.evaluatePolicy(mergeRequest);
  }
}
