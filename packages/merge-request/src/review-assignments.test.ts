import {
  asMergeRequestId,
  asRoleDefinitionId,
  asRuntimeId,
} from "@stoneforge/core";
import {
  asAssignmentId,
  asDispatchIntentId,
  asLeaseId,
  asTaskId,
  type Assignment,
} from "@stoneforge/execution";
import { describe, expect, it } from "vitest";

import {
  assertMergeRequestReviewAssignment,
  rememberReviewAssignment,
  requireMergeRequestAssignmentId,
  type MergeRequest,
} from "./index.js";

describe("review assignment guards", () => {
  it("accepts assignments owned by the expected MergeRequest", () => {
    const assignment = assignmentForMergeRequest("merge_request_1");

    expect(() =>
      assertMergeRequestReviewAssignment(
        assignment,
        asMergeRequestId("merge_request_1"),
      ),
    ).not.toThrow();
    expect(requireMergeRequestAssignmentId(assignment)).toBe("merge_request_1");
  });

  it("rejects task-owned and wrong-MergeRequest assignments", () => {
    expect(() =>
      assertMergeRequestReviewAssignment(
        assignmentForTask(),
        asMergeRequestId("merge_request_1"),
      ),
    ).toThrow(/does not belong/i);
    expect(() =>
      assertMergeRequestReviewAssignment(
        assignmentForMergeRequest("merge_request_2"),
        asMergeRequestId("merge_request_1"),
      ),
    ).toThrow(/does not belong/i);
    expect(() => requireMergeRequestAssignmentId(assignmentForTask())).toThrow(
      /not MergeRequest-owned/i,
    );
  });

  it("remembers a review assignment once", () => {
    const mergeRequest = mergeRequestRecord();

    rememberReviewAssignment(
      mergeRequest,
      asAssignmentId("assignment_1"),
      "2026-04-24T01:00:00.000Z",
    );
    rememberReviewAssignment(
      mergeRequest,
      asAssignmentId("assignment_1"),
      "2026-04-24T02:00:00.000Z",
    );

    expect(mergeRequest.reviewAssignmentIds).toEqual(["assignment_1"]);
    expect(mergeRequest.updatedAt).toBe("2026-04-24T01:00:00.000Z");
  });
});

function assignmentForMergeRequest(mergeRequestId: string): Assignment {
  return assignment({
    owner: {
      type: "merge_request",
      mergeRequestId: asMergeRequestId(mergeRequestId),
    },
    mergeRequestId: asMergeRequestId(mergeRequestId),
  });
}

function assignmentForTask(): Assignment {
  return assignment({
    owner: {
      type: "task",
      taskId: asTaskId("task_1"),
    },
    taskId: asTaskId("task_1"),
  });
}

function assignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: asAssignmentId("assignment_1"),
    workspaceId: "workspace_1" as never,
    owner: {
      type: "merge_request",
      mergeRequestId: asMergeRequestId("merge_request_1"),
    },
    mergeRequestId: asMergeRequestId("merge_request_1"),
    dispatchIntentId: asDispatchIntentId("dispatch_intent_1"),
    roleDefinitionId: asRoleDefinitionId("role_definition_1"),
    agentId: "agent_1" as never,
    runtimeId: asRuntimeId("runtime_1"),
    leaseId: asLeaseId("lease_1"),
    state: "running",
    sessionIds: [],
    recoveryFailureCount: 0,
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
    ...overrides,
  };
}

function mergeRequestRecord(): MergeRequest {
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
  };
}
