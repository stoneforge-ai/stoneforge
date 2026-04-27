import { type VerificationRunId } from "@stoneforge/core"
import { type TaskDispatchService } from "@stoneforge/execution"
import { Effect } from "effect"

import { evaluateMergePolicy } from "./merge-policy.js"
import {
  type MergeRequestAdapterService,
  type PublishPolicyCheckFailed,
  publishPolicyCheck,
} from "./merge-request-runtime.js"
import type {
  VerificationRun,
  MergeRequest,
  MergeRequestServiceOptions,
  PolicyCheckState,
} from "./models.js"

export class MergeRequestPolicyFlow {
  constructor(
    private readonly execution: TaskDispatchService,
    private readonly options: MergeRequestServiceOptions,
    private readonly verificationRuns: Map<VerificationRunId, VerificationRun>
  ) {}

  requestRepair(
    mergeRequest: MergeRequest,
    reason: string
  ): Effect.Effect<void, PublishPolicyCheckFailed, MergeRequestAdapterService> {
    const self = this

    return Effect.gen(function* () {
      mergeRequest.state = "repair_required"
      mergeRequest.updatedAt = self.now()
      yield* self.publishPolicyCheck(mergeRequest, "failed", reason)
      self.execution.requireTaskRepair(mergeRequest.sourceOwner.taskId, reason)
    }).pipe(
      Effect.withSpan("policy.evaluate_merge_request", {
        attributes: policyAttributes(
          mergeRequest,
          this.options.policyPreset,
          "repair_required"
        ),
      })
    )
  }

  evaluatePolicy(
    mergeRequest: MergeRequest
  ): Effect.Effect<void, PublishPolicyCheckFailed, MergeRequestAdapterService> {
    const decision = evaluateMergePolicy(
      mergeRequest,
      this.verificationRunsForMergeRequest(mergeRequest),
      this.options
    )

    if (!decision) {
      return Effect.void
    }

    const self = this

    return Effect.gen(function* () {
      if (decision.nextState !== undefined) {
        mergeRequest.state = decision.nextState
      }

      yield* self.publishPolicyCheck(
        mergeRequest,
        decision.checkState,
        decision.reason
      )
    }).pipe(
      Effect.withSpan("policy.evaluate_merge_request", {
        attributes: policyAttributes(
          mergeRequest,
          this.options.policyPreset,
          decision.checkState
        ),
      })
    )
  }

  private verificationRunsForMergeRequest(
    mergeRequest: MergeRequest
  ): VerificationRun[] {
    return mergeRequest.verificationRunIds.flatMap((verificationRunId) => {
      const verificationRun = this.verificationRuns.get(verificationRunId)

      return verificationRun ? [verificationRun] : []
    })
  }

  private publishPolicyCheck(
    mergeRequest: MergeRequest,
    state: PolicyCheckState,
    reason: string
  ): Effect.Effect<void, PublishPolicyCheckFailed, MergeRequestAdapterService> {
    const publishedAt = this.now()

    mergeRequest.policyCheck = {
      state,
      reason,
      publishedAt,
    }

    return publishPolicyCheck({
      mergeRequestId: mergeRequest.id,
      providerPullRequest: mergeRequest.providerPullRequest,
      state,
      reason,
    })
  }

  private now(): string {
    return new Date().toISOString()
  }
}

function policyAttributes(
  mergeRequest: MergeRequest,
  policyPreset: string,
  decision: string
): Record<string, string> {
  return {
    "stoneforge.workspace.id": mergeRequest.workspaceId,
    "stoneforge.task.id": mergeRequest.sourceOwner.taskId,
    "stoneforge.merge_request.id": mergeRequest.id,
    "stoneforge.policy.preset": policyPreset,
    "stoneforge.policy.decision": decision,
  }
}
