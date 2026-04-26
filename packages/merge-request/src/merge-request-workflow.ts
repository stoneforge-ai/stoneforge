import { type VerificationRunId, type MergeRequestId } from "@stoneforge/core";
import type { TaskDispatchService, Task } from "@stoneforge/execution";
import { Data, Effect } from "effect";

import {
  type CreateOrUpdatePullRequestFailed,
  type MergePullRequestFailed,
  type MergeRequestAdapterService,
  type ObservePullRequestFailed,
  type PublishPolicyCheckFailed,
  createOrUpdateTaskPullRequest,
  mergePullRequest,
  observePullRequest,
} from "./merge-request-runtime.js";
import { cloneMergeRequest, cloneVerificationRun } from "./cloning.js";
import type { MergeRequestPolicyFlow } from "./merge-request-policy-flow.js";
import type { MergeRequestRecordStore } from "./merge-request-record-store.js";
import { recordReviewOutcomeOnMergeRequest } from "./merge-request-review-flow.js";
import {
  createTaskPullRequestInput,
  requireSucceededTaskAssignment,
  requireTaskAwaitingMergeRequest,
} from "./merge-request-task-flow.js";
import type {
  MergeRequest,
  MergeRequestServiceOptions,
  OpenTaskMergeRequestInput,
  ProviderPullRequest,
  RecordProviderCheckInput,
  RecordReviewOutcomeInput,
  VerificationRun,
} from "./models.js";
import { reconcileProviderPullRequestObservation } from "./provider-pull-request-observation.js";
import { rememberVerificationRun } from "./verification-runs.js";

class MergeRequestNotMergeReady extends Data.TaggedError(
  "MergeRequestNotMergeReady",
)<{
  readonly mergeRequestId: MergeRequestId;
}> {
  get message(): string {
    return `MergeRequest ${this.mergeRequestId} is not merge_ready.`;
  }
}

export class MergeRequestWorkflow {
  constructor(
    private readonly execution: TaskDispatchService,
    private readonly records: MergeRequestRecordStore,
    private readonly policyFlow: MergeRequestPolicyFlow,
    private readonly options: MergeRequestServiceOptions,
  ) {}

  openOrUpdateTaskMergeRequest(
    input: OpenTaskMergeRequestInput,
  ): Effect.Effect<
    MergeRequest,
    CreateOrUpdatePullRequestFailed,
    MergeRequestAdapterService
  > {
    const self = this;

    return Effect.gen(function* () {
      const assignment = requireSucceededTaskAssignment(self.execution, input);
      const task = requireTaskAwaitingMergeRequest(self.execution, assignment);
      const providerPullRequest = yield* self.upsertProviderPullRequest(task);

      return self.records.upsertMergeRequest(
        task,
        providerPullRequest,
        self.now(),
      );
    }).pipe(Effect.withSpan("merge_request.open_or_update"));
  }

  recordProviderCheck(
    mergeRequestId: MergeRequestId,
    input: RecordProviderCheckInput,
  ): Effect.Effect<
    VerificationRun,
    PublishPolicyCheckFailed,
    MergeRequestAdapterService
  > {
    const self = this;

    return Effect.gen(function* () {
      const mergeRequest = self.records.requireMergeRequest(mergeRequestId);
      const observedAt = input.observedAt ?? self.now();
      const verificationRun = self.records.upsertVerificationRun(
        mergeRequest,
        input,
        observedAt,
      );

      rememberVerificationRun(mergeRequest, verificationRun.id);
      yield* self.applyVerificationRunPolicy(mergeRequest, verificationRun);
      mergeRequest.updatedAt = self.now();

      return cloneVerificationRun(verificationRun);
    }).pipe(
      Effect.withSpan("verification_run.observe", {
        attributes: {
          "stoneforge.merge_request.id": mergeRequestId,
        },
      }),
    );
  }

  observeProviderPullRequest(
    mergeRequestId: MergeRequestId,
  ): Effect.Effect<
    VerificationRun[],
    ObservePullRequestFailed | PublishPolicyCheckFailed,
    MergeRequestAdapterService
  > {
    const self = this;

    return Effect.gen(function* () {
      const mergeRequest = self.records.requireMergeRequest(mergeRequestId);
      const previousHeadSha = mergeRequest.providerPullRequest.headSha;
      const observedAt = self.now();
      const observation = yield* observePullRequest({
        mergeRequestId,
        providerPullRequest: mergeRequest.providerPullRequest,
      });
      const providerState = reconcileProviderPullRequestObservation({
        execution: self.execution,
        mergeRequest,
        observation,
        observedAt,
      });

      if (providerState === "terminal") {
        return [];
      }

      self.records.markStaleVerificationRuns(
        mergeRequest,
        previousHeadSha,
        observedAt,
      );

      const verificationRuns = new Map<VerificationRunId, VerificationRun>();

      for (const check of observation.checks) {
        const verificationRun = yield* self.recordProviderCheck(
          mergeRequestId,
          {
            providerCheckId: check.providerCheckId,
            name: check.name,
            state: check.state,
            observedAt: check.observedAt,
          },
        );
        verificationRuns.set(verificationRun.id, verificationRun);
      }

      return Array.from(verificationRuns.values()).map(cloneVerificationRun);
    }).pipe(
      Effect.withSpan("merge_request.observe_provider_pull_request", {
        attributes: {
          "stoneforge.merge_request.id": mergeRequestId,
        },
      }),
    );
  }

  recordReviewOutcome(
    mergeRequestId: MergeRequestId,
    input: RecordReviewOutcomeInput,
  ): Effect.Effect<
    MergeRequest,
    PublishPolicyCheckFailed,
    MergeRequestAdapterService
  > {
    const self = this;

    return Effect.gen(function* () {
      const mergeRequest = self.records.requireMergeRequest(mergeRequestId);
      yield* recordReviewOutcomeOnMergeRequest(
        self.execution,
        self.policyFlow,
        mergeRequestId,
        mergeRequest,
        input,
        self.now(),
      );

      mergeRequest.updatedAt = self.now();

      return cloneMergeRequest(mergeRequest);
    });
  }

  publishPolicyStatus(
    mergeRequestId: MergeRequestId,
  ): Effect.Effect<
    MergeRequest,
    PublishPolicyCheckFailed,
    MergeRequestAdapterService
  > {
    const self = this;

    return Effect.gen(function* () {
      const mergeRequest = self.records.requireMergeRequest(mergeRequestId);

      yield* self.policyFlow.evaluatePolicy(mergeRequest);
      mergeRequest.updatedAt = self.now();

      return cloneMergeRequest(mergeRequest);
    });
  }

  merge(
    mergeRequestId: MergeRequestId,
  ): Effect.Effect<
    MergeRequest,
    MergePullRequestFailed | MergeRequestNotMergeReady,
    MergeRequestAdapterService
  > {
    const self = this;

    return Effect.gen(function* () {
      const mergeRequest = self.records.requireMergeRequest(mergeRequestId);

      if (mergeRequest.state !== "merge_ready") {
        return yield* Effect.fail(
          new MergeRequestNotMergeReady({ mergeRequestId }),
        );
      }

      const result = yield* mergePullRequest({
        mergeRequestId,
        providerPullRequest: mergeRequest.providerPullRequest,
      });

      mergeRequest.state = "merged";
      mergeRequest.mergedAt = result.mergedAt;
      mergeRequest.updatedAt = result.mergedAt;
      self.execution.completeTaskAfterMerge(mergeRequest.sourceOwner.taskId);

      return cloneMergeRequest(mergeRequest);
    }).pipe(
      Effect.withSpan("merge_request.merge_evaluation", {
        attributes: {
          "stoneforge.merge_request.id": mergeRequestId,
        },
      }),
    );
  }

  private upsertProviderPullRequest(
    task: Task,
  ): Effect.Effect<
    ProviderPullRequest,
    CreateOrUpdatePullRequestFailed,
    MergeRequestAdapterService
  > {
    return createOrUpdateTaskPullRequest(
      createTaskPullRequestInput(
        task,
        this.options.targetBranch ?? "main",
        this.options.sourceBranchPrefix ?? "stoneforge/task",
      ),
    );
  }

  private applyVerificationRunPolicy(
    mergeRequest: MergeRequest,
    verificationRun: VerificationRun,
  ): Effect.Effect<void, PublishPolicyCheckFailed, MergeRequestAdapterService> {
    if (verificationRun.state === "failed") {
      return this.policyFlow.requestRepair(
        mergeRequest,
        "Verification Run failed",
      );
    }

    return this.policyFlow.evaluatePolicy(mergeRequest);
  }

  private now(): string {
    return new Date().toISOString();
  }
}
