import { asMergeRequestId } from "@stoneforge/core";
import { asTaskId } from "@stoneforge/execution";
import { describe, expect, it } from "vitest";

import { evaluateMergePolicy } from "./merge-policy.js";
import type { CIRun, MergeRequest } from "./models.js";

describe("evaluateMergePolicy", () => {
  it("ignores terminal MergeRequests", () => {
    expect(evaluateMergePolicy(mergeRequest({ state: "merged" }), [], supervised)).toBeNull();
    expect(
      evaluateMergePolicy(mergeRequest({ state: "closed_unmerged" }), [], supervised),
    ).toBeNull();
  });

  it("requires passing CI and approved review before policy can pass", () => {
    expect(evaluateMergePolicy(mergeRequest(), [], supervised)).toEqual({
      checkState: "pending",
      reason: "CI and approved review are required.",
    });
    expect(
      evaluateMergePolicy(
        mergeRequest({ reviewOutcome: "approved" }),
        [ciRun("failed")],
        supervised,
      ),
    ).toEqual({
      checkState: "pending",
      reason: "CI and approved review are required.",
    });
  });

  it("requires human approval only for supervised policy", () => {
    const reviewed = mergeRequest({ reviewOutcome: "approved" });
    const passedCI = [ciRun("passed")];

    expect(evaluateMergePolicy(reviewed, passedCI, supervised)).toEqual({
      nextState: "policy_pending",
      checkState: "pending",
      reason: "Human approval is required by supervised policy.",
    });
    expect(evaluateMergePolicy(reviewed, passedCI, autonomous)).toEqual({
      nextState: "merge_ready",
      checkState: "passed",
      reason: "Stoneforge policy gates are satisfied.",
    });
  });

  it("passes supervised policy after human approval", () => {
    expect(
      evaluateMergePolicy(
        mergeRequest({
          reviewOutcome: "approved",
          humanApproval: {
            approvedBy: "user_1",
            approvedAt: "2026-04-24T00:00:00.000Z",
          },
        }),
        [ciRun("passed")],
        supervised,
      ),
    ).toEqual({
      nextState: "merge_ready",
      checkState: "passed",
      reason: "Stoneforge policy gates are satisfied.",
    });
  });
});

const supervised = {
  policyPreset: "supervised" as const,
  targetBranch: "main",
};

const autonomous = {
  policyPreset: "autonomous" as const,
  targetBranch: "main",
};

function mergeRequest(
  overrides: Partial<MergeRequest> = {},
): MergeRequest {
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
      sourceBranch: "stoneforge/task/task_1",
      targetBranch: "main",
    },
    ciRunIds: [],
    reviewAssignmentIds: [],
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
    ...overrides,
  };
}

function ciRun(state: CIRun["state"]): CIRun {
  return {
    id: "ci_run_1" as never,
    workspaceId: "workspace_1" as never,
    mergeRequestId: asMergeRequestId("merge_request_1"),
    providerCheckId: "check_1",
    name: "test",
    state,
    observedAt: "2026-04-24T00:00:00.000Z",
  };
}
