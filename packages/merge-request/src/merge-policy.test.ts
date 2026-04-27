import { asMergeRequestId } from "@stoneforge/core"
import { asTaskId } from "@stoneforge/execution"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  evaluateMergePolicy,
  type VerificationRun,
  type MergeRequest,
} from "./index.js"

describe("evaluateMergePolicy", () => {
  it("ignores terminal MergeRequests", () => {
    expect(
      evaluateMergePolicy(mergeRequest({ state: "merged" }), [], supervised)
    ).toBeNull()
    expect(
      evaluateMergePolicy(
        mergeRequest({ state: "closed_unmerged" }),
        [],
        supervised
      )
    ).toBeNull()
  })

  it("requires a passing Verification Run and Review Approved before policy can pass", () => {
    expect(evaluateMergePolicy(mergeRequest(), [], supervised)).toEqual({
      checkState: "pending",
      reason: "A passing Verification Run and Review Approved are required.",
    })
    expect(
      evaluateMergePolicy(
        mergeRequest({ reviewOutcomes: [approvedReview("agent", "agent_1")] }),
        [verificationRun("failed")],
        supervised
      )
    ).toEqual({
      checkState: "pending",
      reason: "A passing Verification Run and Review Approved are required.",
    })
  })

  it("requires a human Approval Gate only for supervised policy", () => {
    const reviewed = mergeRequest({
      reviewOutcomes: [approvedReview("agent", "agent_1")],
    })
    const passedVerificationRun = [verificationRun("passed")]

    expect(
      evaluateMergePolicy(reviewed, passedVerificationRun, supervised)
    ).toEqual({
      nextState: "policy_pending",
      checkState: "pending",
      reason: "A Human Approval Gate is required by supervised policy.",
    })
    expect(
      evaluateMergePolicy(reviewed, passedVerificationRun, autonomous)
    ).toEqual({
      nextState: "merge_ready",
      checkState: "passed",
      reason: "Stoneforge policy gates are satisfied.",
    })
  })

  it("passes supervised policy after a human Review Approved satisfies the Approval Gate", () => {
    expect(
      evaluateMergePolicy(
        mergeRequest({
          reviewOutcomes: [
            approvedReview("agent", "agent_1"),
            approvedReview("human", "user_1"),
          ],
        }),
        [verificationRun("passed")],
        supervised
      )
    ).toEqual({
      nextState: "merge_ready",
      checkState: "passed",
      reason: "Stoneforge policy gates are satisfied.",
    })
  })

  it("returns the policy state implied by terminal, verification, review, preset, and approval signals", () => {
    fc.assert(
      fc.property(policyCaseArbitrary, (policyCase) => {
        const result = evaluateMergePolicy(
          mergeRequest({
            state: policyCase.state,
            reviewOutcomes: reviewOutcomesFor(
              policyCase.reviewApproved,
              policyCase.humanApprovalGateSatisfied
            ),
          }),
          policyCase.verificationPassed
            ? [verificationRun("passed")]
            : [verificationRun("failed")],
          {
            policyPreset: policyCase.supervised ? "supervised" : "autonomous",
            targetBranch: "main",
          }
        )

        if (["merged", "closed_unmerged"].includes(policyCase.state)) {
          expect(result).toBeNull()
          return
        }

        if (!policyCase.verificationPassed || !policyCase.reviewApproved) {
          expect(result).toEqual(
            expect.objectContaining({ checkState: "pending" })
          )
          return
        }

        if (policyCase.supervised && !policyCase.humanApprovalGateSatisfied) {
          expect(result).toEqual(
            expect.objectContaining({
              checkState: "pending",
              nextState: "policy_pending",
            })
          )
          return
        }

        expect(result).toEqual(
          expect.objectContaining({
            checkState: "passed",
            nextState: "merge_ready",
          })
        )
      })
    )
  })
})

const policyCaseArbitrary = fc.record({
  state: fc.constantFrom(
    "draft" as const,
    "open" as const,
    "repair_required" as const,
    "policy_pending" as const,
    "merge_ready" as const,
    "merged" as const,
    "closed_unmerged" as const
  ),
  verificationPassed: fc.boolean(),
  reviewApproved: fc.boolean(),
  supervised: fc.boolean(),
  humanApprovalGateSatisfied: fc.boolean(),
})

const supervised = {
  policyPreset: "supervised" as const,
  targetBranch: "main",
}

const autonomous = {
  policyPreset: "autonomous" as const,
  targetBranch: "main",
}

function mergeRequest(overrides: Partial<MergeRequest> = {}): MergeRequest {
  return {
    id: asMergeRequestId("merge_request_1"),
    workspaceId: "workspace_1" as never,
    sourceOwner: {
      type: "task",
      taskId: asTaskId("task_1"),
    },
    state: "open",
    providerPullRequest: {
      provider: "github",
      providerPullRequestId: "github_pr_1",
      number: 1,
      url: "https://github.example/pull/1",
      headSha: "provider-head-sha",
      sourceBranch: "stoneforge/task/task_1",
      targetBranch: "main",
    },
    verificationRunIds: [],
    reviewAssignmentIds: [],
    reviewOutcomes: [],
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
    ...overrides,
  }
}

function reviewOutcomesFor(
  hasApprovedReview: boolean,
  hasHumanApprovalGateSatisfied: boolean
): MergeRequest["reviewOutcomes"] {
  if (!hasApprovedReview) {
    return [
      {
        reviewerKind: "agent",
        reviewerId: "agent_1",
        outcome: "changes_requested",
        recordedAt: "2026-04-24T00:00:00.000Z",
      },
    ]
  }

  return [
    approvedReview("agent", "agent_1"),
    ...(hasHumanApprovalGateSatisfied
      ? [approvedReview("human", "user_1")]
      : []),
  ]
}

function approvedReview(
  reviewerKind: "human" | "agent",
  reviewerId: string
): MergeRequest["reviewOutcomes"][number] {
  return {
    reviewerKind,
    reviewerId,
    outcome: "approved",
    recordedAt: "2026-04-24T00:00:00.000Z",
  }
}

function verificationRun(state: VerificationRun["state"]): VerificationRun {
  return {
    id: "verification_run_1" as never,
    workspaceId: "workspace_1" as never,
    mergeRequestId: asMergeRequestId("merge_request_1"),
    headSha: "head-sha",
    state,
    providerChecks: [
      {
        providerCheckId: "check_1",
        name: "test",
        state: state === "stale" ? "passed" : state,
        required: true,
        observedAt: "2026-04-24T00:00:00.000Z",
      },
    ],
    observedAt: "2026-04-24T00:00:00.000Z",
  }
}
