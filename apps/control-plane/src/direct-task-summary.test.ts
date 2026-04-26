import {
  asCIRunId,
  asAgentId,
  asMergeRequestId,
  asRoleDefinitionId,
  asRuntimeId,
} from "@stoneforge/core";
import {
  asAssignmentId,
  asDispatchIntentId,
  asLeaseId,
  asSessionId,
  asTaskId,
} from "@stoneforge/execution";
import {
  asOrgId,
  asWorkspaceId,
} from "@stoneforge/workspace";
import { describe, expect, it } from "vitest";

import type {
  DirectTaskRunSummaryInput,
} from "./index.js";
import {
  buildSummary,
  expectState,
} from "./index.js";

describe("direct-task scenario summary assertions", () => {
  it("throws a clear error when a required state is not reached", () => {
    expect(() => {
      expectState("ready", "completed", "Task");
    }).toThrow("Task expected completed but received ready.");
  });

  it("uses pending and false defaults before merge policy succeeds", () => {
    const summary = buildSummary(summaryInputWithoutPolicyCheck());

    expect(summary.policyCheckState).toBe("pending");
    expect(summary.humanApprovalRecorded).toBe(false);
    expect(summary.pullRequestMerged).toBe(false);
  });
});

function summaryInputWithoutPolicyCheck(): DirectTaskRunSummaryInput {
  return {
    orgId: "org_1",
    workspace: workspace(),
    task: task(),
    implementation: {
      assignment: assignment("assign_implementation"),
      session: session("session_implementation"),
    },
    review: {
      assignment: assignment("assign_review"),
      session: session("session_review"),
    },
    mergeRequest: {
      id: asMergeRequestId("mr_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      sourceOwner: {
        type: "task",
        taskId: asTaskId("task_1"),
      },
      state: "policy_pending",
      providerPullRequest: {
        provider: "github",
        providerPullRequestId: "github-pr-task_1",
        number: 100,
        url: "https://github.example/toolco/stoneforge/pull/100",
        headSha: "provider-head-sha",
        sourceBranch: "stoneforge/task_1",
        targetBranch: "main",
      },
      ciRunIds: [asCIRunId("ci_1")],
      reviewAssignmentIds: [asAssignmentId("assign_review")],
      createdAt: "2026-04-24T10:00:00.000Z",
      updatedAt: "2026-04-24T10:00:00.000Z",
    },
    ciRun: {
      id: asCIRunId("ci_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      mergeRequestId: asMergeRequestId("mr_1"),
      providerCheckId: "local-check-1",
      name: "local quality",
      state: "passed",
      observedAt: "2026-04-24T10:00:00.000Z",
    },
    providerSessionIds: [],
  };
}

function workspace(): DirectTaskRunSummaryInput["workspace"] {
  return {
    id: asWorkspaceId("workspace_1"),
    orgId: asOrgId("org_1"),
    name: "stoneforge",
    targetBranch: "main",
    state: "ready",
    runtimes: [],
    agents: [],
    roleDefinitions: [],
    createdAt: "2026-04-24T10:00:00.000Z",
    updatedAt: "2026-04-24T10:00:00.000Z",
  };
}

function task(): DirectTaskRunSummaryInput["task"] {
  return {
    id: asTaskId("task_1"),
    workspaceId: asWorkspaceId("workspace_1"),
    title: "Direct-task scenario",
    intent: "Summarize pre-merge state.",
    acceptanceCriteria: ["Summary defaults are explicit."],
    priority: "normal",
    dependencyIds: [],
    state: "awaiting_review",
    requiresMergeRequest: true,
    dispatchConstraints: {
      roleDefinitionId: asRoleDefinitionId("role_1"),
      requiredAgentTags: [],
      requiredRuntimeTags: [],
    },
    progressRecord: {
      checkpoints: [],
      repairContext: [],
    },
    createdAt: "2026-04-24T10:00:00.000Z",
    updatedAt: "2026-04-24T10:00:00.000Z",
  };
}

function assignment(id: string): DirectTaskRunSummaryInput["implementation"]["assignment"] {
  return {
    id: asAssignmentId(id),
    workspaceId: asWorkspaceId("workspace_1"),
    owner: {
      type: "task",
      taskId: asTaskId("task_1"),
    },
    taskId: asTaskId("task_1"),
    dispatchIntentId: asDispatchIntentId("intent_1"),
    roleDefinitionId: asRoleDefinitionId("role_1"),
    agentId: asAgentId("agent_1"),
    runtimeId: asRuntimeId("runtime_1"),
    leaseId: asLeaseId("lease_1"),
    state: "succeeded",
    sessionIds: [],
    recoveryFailureCount: 0,
    createdAt: "2026-04-24T10:00:00.000Z",
    updatedAt: "2026-04-24T10:00:00.000Z",
  };
}

function session(id: string): DirectTaskRunSummaryInput["implementation"]["session"] {
  return {
    id: asSessionId(id),
    workspaceId: asWorkspaceId("workspace_1"),
    assignmentId: asAssignmentId("assign_implementation"),
    providerSessionId: `provider-${id}`,
    state: "ended",
    heartbeats: [],
    checkpoints: [],
    createdAt: "2026-04-24T10:00:00.000Z",
    updatedAt: "2026-04-24T10:00:00.000Z",
  };
}
