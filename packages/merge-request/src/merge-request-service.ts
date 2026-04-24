import {
  asCIRunId,
  asMergeRequestId,
  type CIRunId,
  type MergeRequestId,
} from "@stoneforge/core";
import { type Assignment, TaskDispatchService } from "@stoneforge/execution";

import type {
  CIRun,
  GitHubMergeRequestAdapter,
  MergeRequest,
  MergeRequestServiceOptions,
  OpenTaskMergeRequestInput,
  RecordCIRunInput,
  RecordReviewOutcomeInput,
  RequestReviewInput,
} from "./models.js";

type CounterName = "mergeRequest" | "ciRun";

const defaultOptions: MergeRequestServiceOptions = {
  policyPreset: "supervised",
  targetBranch: "main",
};

export class MergeRequestService {
  private readonly mergeRequests = new Map<MergeRequestId, MergeRequest>();
  private readonly mergeRequestIdsByTaskId = new Map<string, MergeRequestId>();
  private readonly ciRuns = new Map<CIRunId, CIRun>();
  private readonly counters: Record<CounterName, number> = {
    mergeRequest: 0,
    ciRun: 0,
  };

  constructor(
    private readonly execution: TaskDispatchService,
    private readonly gitHubAdapter: GitHubMergeRequestAdapter,
    private readonly options: MergeRequestServiceOptions = defaultOptions,
  ) {}

  async openOrUpdateTaskMergeRequest(
    input: OpenTaskMergeRequestInput,
  ): Promise<MergeRequest> {
    const assignment = this.execution.getAssignment(input.taskAssignmentId);

    if (assignment.owner.type !== "task" || !assignment.taskId) {
      throw new Error(
        `Assignment ${assignment.id} is not a Task-owned implementation Assignment.`,
      );
    }

    if (assignment.state !== "succeeded") {
      throw new Error(
        `Assignment ${assignment.id} must succeed before opening a task MergeRequest.`,
      );
    }

    const task = this.execution.getTask(assignment.taskId);

    if (!task.requiresMergeRequest || task.state !== "awaiting_review") {
      throw new Error(
        `Task ${task.id} is not waiting for a task MergeRequest.`,
      );
    }

    const existingId = this.mergeRequestIdsByTaskId.get(task.id);
    const providerPullRequest =
      await this.gitHubAdapter.createOrUpdateTaskPullRequest({
        workspaceId: task.workspaceId,
        taskId: task.id,
        title: task.title,
        body: task.intent,
        sourceBranch: `stoneforge/task/${task.id}`,
        targetBranch: this.options.targetBranch ?? "main",
      });

    if (existingId) {
      const existing = this.requireMergeRequest(existingId);
      existing.providerPullRequest = providerPullRequest;
      existing.state =
        existing.state === "draft" || existing.state === "changes_requested"
          ? "open"
          : existing.state;
      existing.updatedAt = this.now();

      return cloneMergeRequest(existing);
    }

    const now = this.now();
    const mergeRequest: MergeRequest = {
      id: asMergeRequestId(this.nextId("mergeRequest")),
      workspaceId: task.workspaceId,
      sourceOwner: {
        type: "task",
        taskId: task.id,
      },
      state: "open",
      providerPullRequest,
      ciRunIds: [],
      reviewAssignmentIds: [],
      createdAt: now,
      updatedAt: now,
    };

    this.mergeRequests.set(mergeRequest.id, mergeRequest);
    this.mergeRequestIdsByTaskId.set(task.id, mergeRequest.id);

    return cloneMergeRequest(mergeRequest);
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
    if (assignment.owner.type !== "merge_request" || !assignment.mergeRequestId) {
      throw new Error(`Assignment ${assignment.id} is not MergeRequest-owned.`);
    }

    const mergeRequest = this.requireMergeRequest(assignment.mergeRequestId);

    if (!mergeRequest.reviewAssignmentIds.includes(assignment.id)) {
      mergeRequest.reviewAssignmentIds.push(assignment.id);
      mergeRequest.updatedAt = this.now();
    }

    return cloneMergeRequest(mergeRequest);
  }

  async recordCIRun(
    mergeRequestId: MergeRequestId,
    input: RecordCIRunInput,
  ): Promise<CIRun> {
    const mergeRequest = this.requireMergeRequest(mergeRequestId);
    const existing = Array.from(this.ciRuns.values()).find((ciRun) => {
      return (
        ciRun.mergeRequestId === mergeRequestId &&
        ciRun.providerCheckId === input.providerCheckId
      );
    });
    const observedAt = input.observedAt ?? this.now();
    const ciRun: CIRun =
      existing ??
      {
        id: asCIRunId(this.nextId("ciRun")),
        workspaceId: mergeRequest.workspaceId,
        mergeRequestId,
        providerCheckId: input.providerCheckId,
        name: input.name,
        state: input.state,
        observedAt,
      };

    ciRun.name = input.name;
    ciRun.state = input.state;
    ciRun.observedAt = observedAt;
    this.ciRuns.set(ciRun.id, ciRun);

    if (!mergeRequest.ciRunIds.includes(ciRun.id)) {
      mergeRequest.ciRunIds.push(ciRun.id);
    }

    if (ciRun.state === "failed") {
      await this.requestRepair(mergeRequest, "CI failed");
    } else {
      await this.evaluatePolicy(mergeRequest);
    }

    mergeRequest.updatedAt = this.now();

    return cloneCIRun(ciRun);
  }

  async recordReviewOutcome(
    mergeRequestId: MergeRequestId,
    input: RecordReviewOutcomeInput,
  ): Promise<MergeRequest> {
    const mergeRequest = this.requireMergeRequest(mergeRequestId);
    const assignment = this.execution.getAssignment(input.assignmentId);

    if (
      assignment.owner.type !== "merge_request" ||
      assignment.mergeRequestId !== mergeRequestId
    ) {
      throw new Error(
        `Assignment ${input.assignmentId} does not belong to MergeRequest ${mergeRequestId}.`,
      );
    }

    if (assignment.state !== "succeeded") {
      throw new Error(
        `Review Assignment ${input.assignmentId} must succeed before recording review outcome.`,
      );
    }

    mergeRequest.reviewOutcome = input.outcome;
    mergeRequest.reviewReason = input.reason;

    if (!mergeRequest.reviewAssignmentIds.includes(input.assignmentId)) {
      mergeRequest.reviewAssignmentIds.push(input.assignmentId);
    }

    if (input.outcome === "changes_requested") {
      await this.requestRepair(mergeRequest, input.reason ?? "Review requested changes");
    } else {
      await this.evaluatePolicy(mergeRequest);
    }

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
    await this.evaluatePolicy(mergeRequest);
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

  private async requestRepair(
    mergeRequest: MergeRequest,
    reason: string,
  ): Promise<void> {
    mergeRequest.state = "changes_requested";
    mergeRequest.updatedAt = this.now();
    await this.publishPolicyCheck(mergeRequest, "failed", reason);
    this.execution.reopenTaskForRepair(mergeRequest.sourceOwner.taskId, reason);
  }

  private async evaluatePolicy(mergeRequest: MergeRequest): Promise<void> {
    if (mergeRequest.state === "merged" || mergeRequest.state === "closed_unmerged") {
      return;
    }

    if (!this.hasPassingCI(mergeRequest) || mergeRequest.reviewOutcome !== "approved") {
      await this.publishPolicyCheck(
        mergeRequest,
        "pending",
        "CI and approved review are required.",
      );
      return;
    }

    if (
      this.options.policyPreset === "supervised" &&
      mergeRequest.humanApproval === undefined
    ) {
      mergeRequest.state = "policy_pending";
      await this.publishPolicyCheck(
        mergeRequest,
        "pending",
        "Human approval is required by supervised policy.",
      );
      return;
    }

    mergeRequest.state = "merge_ready";
    await this.publishPolicyCheck(
      mergeRequest,
      "passed",
      "Stoneforge policy gates are satisfied.",
    );
  }

  private hasPassingCI(mergeRequest: MergeRequest): boolean {
    return mergeRequest.ciRunIds.some((ciRunId) => {
      return this.ciRuns.get(ciRunId)?.state === "passed";
    });
  }

  private async publishPolicyCheck(
    mergeRequest: MergeRequest,
    state: "pending" | "passed" | "failed",
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
}

function cloneMergeRequest(mergeRequest: MergeRequest): MergeRequest {
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

function cloneCIRun(ciRun: CIRun): CIRun {
  return {
    ...ciRun,
  };
}
