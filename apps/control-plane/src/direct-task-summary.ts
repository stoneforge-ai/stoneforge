import type {
  Assignment,
  Session,
  Task,
} from "@stoneforge/execution";
import type {
  VerificationRun,
  MergeRequest,
} from "@stoneforge/merge-request";
import type { Workspace } from "@stoneforge/workspace";

export interface DirectTaskRunSummary {
  orgId: string;
  workspaceId: string;
  taskId: string;
  implementationAssignmentId: string;
  implementationSessionId: string;
  reviewAssignmentId: string;
  reviewSessionId: string;
  mergeRequestId: string;
  verificationRunId: string;
  providerSessionIds: string[];
  providerPullRequestUrl: string;
  workspaceState: Workspace["state"];
  policyPreset: Workspace["policyPreset"];
  taskState: Task["state"];
  implementationAssignmentState: Assignment["state"];
  implementationSessionState: Session["state"];
  reviewAssignmentState: Assignment["state"];
  reviewSessionState: Session["state"];
  mergeRequestState: MergeRequest["state"];
  verificationState: VerificationRun["state"];
  policyCheckState: NonNullable<MergeRequest["policyCheck"]>["state"];
  approvalGateSatisfied: boolean;
  pullRequestMerged: boolean;
}

export interface DirectTaskRunResult {
  summary: DirectTaskRunSummary;
}

export interface DirectTaskRunSummaryInput {
  orgId: string;
  workspace: Workspace;
  task: Task;
  implementation: { assignment: Assignment; session: Session };
  review: { assignment: Assignment; session: Session };
  mergeRequest: MergeRequest;
  verificationRun: VerificationRun;
  providerSessionIds: string[];
}

export function buildSummary(
  input: DirectTaskRunSummaryInput,
): DirectTaskRunSummary {
  return {
    orgId: input.orgId,
    workspaceId: input.workspace.id,
    taskId: input.task.id,
    implementationAssignmentId: input.implementation.assignment.id,
    implementationSessionId: input.implementation.session.id,
    reviewAssignmentId: input.review.assignment.id,
    reviewSessionId: input.review.session.id,
    mergeRequestId: input.mergeRequest.id,
    verificationRunId: input.verificationRun.id,
    providerSessionIds: input.providerSessionIds,
    providerPullRequestUrl: input.mergeRequest.providerPullRequest.url,
    workspaceState: input.workspace.state,
    policyPreset: input.workspace.policyPreset,
    taskState: input.task.state,
    implementationAssignmentState: input.implementation.assignment.state,
    implementationSessionState: input.implementation.session.state,
    reviewAssignmentState: input.review.assignment.state,
    reviewSessionState: input.review.session.state,
    mergeRequestState: input.mergeRequest.state,
    verificationState: input.verificationRun.state,
    policyCheckState: input.mergeRequest.policyCheck?.state ?? "pending",
    approvalGateSatisfied: input.mergeRequest.reviewOutcomes.some((reviewOutcome) => {
      return reviewOutcome.outcome === "approved" && reviewOutcome.reviewerKind === "human";
    }),
    pullRequestMerged: input.mergeRequest.state === "merged",
  };
}

export function formatDirectTaskRunSummary(
  summary: DirectTaskRunSummary,
): string {
  return [
    "Stoneforge V2 direct-task scenario complete",
    `Workspace ${summary.workspaceId}: ${summary.workspaceState}`,
    `Policy preset: ${summary.policyPreset ?? "unconfigured"}`,
    `Task ${summary.taskId}: ${summary.taskState}`,
    `Implementation Assignment ${summary.implementationAssignmentId}: ${summary.implementationAssignmentState}`,
    `Implementation Session ${summary.implementationSessionId}: ${summary.implementationSessionState}`,
    `MergeRequest ${summary.mergeRequestId}: ${summary.mergeRequestState}`,
    `Verification Run ${summary.verificationRunId}: ${summary.verificationState}`,
    `Review Assignment ${summary.reviewAssignmentId}: ${summary.reviewAssignmentState}`,
    `Review Session ${summary.reviewSessionId}: ${summary.reviewSessionState}`,
    `Policy check: ${summary.policyCheckState}`,
    `Approval Gate satisfied: ${String(summary.approvalGateSatisfied)}`,
    `PR merged: ${String(summary.pullRequestMerged)}`,
    `Provider PR: ${summary.providerPullRequestUrl}`,
    `Provider Sessions: ${summary.providerSessionIds.join(", ")}`,
  ].join("\n");
}

export function expectDirectTaskRunComplete(summary: DirectTaskRunSummary): void {
  expectState(summary.workspaceState, "ready", "Workspace");
  expectState(summary.taskState, "completed", "Task");
  expectState(summary.implementationAssignmentState, "succeeded", "Assignment");
  expectState(summary.implementationSessionState, "ended", "Session");
  expectState(summary.reviewAssignmentState, "succeeded", "Review Assignment");
  expectState(summary.reviewSessionState, "ended", "Review Session");
  expectState(summary.mergeRequestState, "merged", "MergeRequest");
  expectState(summary.verificationState, "passed", "Verification Run");
  expectState(summary.policyCheckState, "passed", "Policy check");
  expectState(summary.approvalGateSatisfied, true, "Approval Gate");
  expectState(summary.pullRequestMerged, true, "Pull request merge");
}

export function expectState<TExpected>(
  actual: TExpected | undefined,
  expected: TExpected,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(`${label} expected ${String(expected)} but received ${String(actual)}.`);
  }
}
