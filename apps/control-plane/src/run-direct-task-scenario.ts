import type {
  Assignment,
  Checkpoint,
  Session,
  Task,
} from "@stoneforge/execution";
import { TaskDispatchService } from "@stoneforge/execution";
import type {
  CIRun,
  MergeRequest,
} from "@stoneforge/merge-request";
import { MergeRequestService } from "@stoneforge/merge-request";
import type {
  AuditActor,
  PolicyPreset,
  RoleDefinition,
  Workspace,
} from "@stoneforge/workspace";
import { WorkspaceSetupService } from "@stoneforge/workspace";

import { createFakeAgentFixture } from "./fake-agent-adapter.js";
import { createFakeGitHubMergeRequestFixture } from "./fake-github-merge-request-adapter.js";
import {
  buildSummary,
  expectState,
  expectDirectTaskRunComplete,
  type DirectTaskRunResult,
} from "./direct-task-summary.js";
export {
  formatDirectTaskRunSummary,
  type DirectTaskRunResult,
  type DirectTaskRunSummary,
} from "./direct-task-summary.js";

interface ReadyWorkspaceSetup {
  orgId: string;
  workspace: Workspace;
  roleDefinition: RoleDefinition;
}

const operator: AuditActor = {
  kind: "human",
  id: "user_operator",
  displayName: "Scenario Operator",
};

const scheduler: AuditActor = {
  kind: "service",
  id: "scheduler_local",
  displayName: "Local Scheduler",
};

export async function runDirectTaskScenario(): Promise<DirectTaskRunResult> {
  const policyPreset: PolicyPreset = "supervised";
  const setup = new WorkspaceSetupService();
  const agentAdapter = createFakeAgentFixture();
  const gitHubAdapter = createFakeGitHubMergeRequestFixture();
  const readySetup = createReadyWorkspace(setup, policyPreset);
  const execution = new TaskDispatchService(agentAdapter);

  execution.configureWorkspace(readySetup.workspace);

  const mergeRequests = new MergeRequestService(execution, gitHubAdapter, {
    policyPreset,
    targetBranch: readySetup.workspace.targetBranch,
  });
  const task = createDirectTask(execution, readySetup);
  const implementation = await runImplementationAssignment(execution);
  const mergeRequest = await mergeRequests.openOrUpdateTaskMergeRequest({
    taskAssignmentId: implementation.assignment.id,
  });
  const ciRun = await mergeRequests.recordCIRun(mergeRequest.id, {
    providerCheckId: "local-check-1",
    name: "local quality",
    state: "passed",
  });
  const review = await runReviewAssignment(
    execution,
    mergeRequests,
    mergeRequest,
    readySetup.roleDefinition,
  );
  const reviewed = await mergeRequests.recordReviewOutcome(mergeRequest.id, {
    assignmentId: review.assignment.id,
    outcome: "approved",
    reason: "Local review approved the deterministic scenario change.",
  });

  expectState(reviewed.state, "policy_pending", "MergeRequest");

  const approved = await mergeRequests.recordHumanApproval(
    mergeRequest.id,
    "user_approver",
  );
  const merged = await mergeRequests.merge(approved.id);
  const summary = buildSummary({
    orgId: readySetup.orgId,
    workspace: setup.getWorkspace(readySetup.workspace.id),
    task: execution.getTask(task.id),
    implementation,
    review,
    mergeRequest: merged,
    ciRun: mergeRequests.getCIRun(ciRun.id),
    providerSessionIds: agentAdapter.starts.map((start) => {
      return start.providerSessionId;
    }),
  });

  expectDirectTaskRunComplete(summary);

  return { summary };
}

function createReadyWorkspace(
  service: WorkspaceSetupService,
  policyPreset: PolicyPreset,
): ReadyWorkspaceSetup {
  const org = service.createOrg({ name: "Toolco" });
  const workspace = service.createWorkspace(
    org.id,
    { name: "stoneforge", targetBranch: "main" },
    operator,
  );

  service.connectGitHubRepository(
    workspace.id,
    {
      installationId: "github-installation-local",
      owner: "toolco",
      repository: "stoneforge",
      defaultBranch: "main",
    },
    operator,
  );
  const runtime = service.registerRuntime(
    workspace.id,
    {
      name: "local-worktree-runtime",
      location: "customer_host",
      mode: "local_worktree",
      tags: ["local"],
    },
    operator,
  );

  service.registerAgent(
    workspace.id,
    {
      name: "local-codex-agent",
      runtimeId: runtime.id,
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: 1,
      launcher: "fake-local-agent-adapter",
      tags: ["local"],
    },
    operator,
  );

  const roleDefinition = service.registerRoleDefinition(
    workspace.id,
    {
      name: "direct-task-worker",
      category: "worker",
      prompt: "Implement or review the assigned control-plane work.",
      toolAccess: ["git", "shell"],
      tags: ["local"],
    },
    operator,
  );

  service.selectPolicyPreset(workspace.id, policyPreset, operator);

  const validation = service.validateWorkspace(workspace.id, scheduler);
  expectState(validation.ready, true, "Workspace validation");

  return {
    orgId: org.id,
    workspace: service.getWorkspace(workspace.id),
    roleDefinition,
  };
}

function createDirectTask(
  execution: TaskDispatchService,
  setup: ReadyWorkspaceSetup,
): Task {
  const task = execution.createTask({
    workspaceId: setup.workspace.id,
    title: "Direct task scenario code change",
    intent: "Prove one unplanned code-changing task reaches review and merge.",
    acceptanceCriteria: [
      "The task dispatches to a local fake AgentAdapter.",
      "The task opens a local fake GitHub MergeRequest.",
      "CI, review, supervised approval, and merge complete.",
    ],
    priority: "normal",
    requiresMergeRequest: true,
    dispatchConstraints: {
      roleDefinitionId: setup.roleDefinition.id,
      requiredAgentTags: ["local"],
      requiredRuntimeTags: ["local"],
    },
  });

  expectState(task.state, "ready", "Task");

  return task;
}

async function runImplementationAssignment(
  execution: TaskDispatchService,
): Promise<{ assignment: Assignment; session: Session }> {
  await expectSchedulerStarted(execution, "implementation");
  const assignment = requireLast(execution.listAssignments());
  const session = requireLast(execution.listSessions());

  execution.recordHeartbeat(session.id, "local worker online");
  execution.recordCheckpoint(session.id, createCheckpoint());

  return {
    assignment: execution.completeAssignment(assignment.id),
    session: execution.getSession(session.id),
  };
}

async function runReviewAssignment(
  execution: TaskDispatchService,
  mergeRequests: MergeRequestService,
  mergeRequest: MergeRequest,
  roleDefinition: RoleDefinition,
): Promise<{ assignment: Assignment; session: Session }> {
  mergeRequests.requestReview(mergeRequest.id, {
    roleDefinitionId: roleDefinition.id,
    requiredAgentTags: ["local"],
    requiredRuntimeTags: ["local"],
  });
  await expectSchedulerStarted(execution, "review");

  const assignment = requireLast(execution.listAssignments());
  const session = requireLast(execution.listSessions());

  mergeRequests.recordReviewAssignment(assignment);
  execution.recordHeartbeat(session.id, "local reviewer online");

  return {
    assignment: execution.completeAssignment(assignment.id),
    session: execution.getSession(session.id),
  };
}

async function expectSchedulerStarted(
  execution: TaskDispatchService,
  label: string,
): Promise<void> {
  const intent = await execution.runSchedulerOnce();

  expectState(intent?.state, "starting", `${label} dispatch intent`);
}

function createCheckpoint(): Checkpoint {
  return {
    completedWork: ["Implemented the deterministic direct-task scenario path."],
    remainingWork: ["Open the task MergeRequest and run gates."],
    importantContext: ["This task requires the MergeRequest flow."],
    capturedAt: "2026-04-24T10:00:00.000Z",
  };
}

function requireLast<TItem>(items: TItem[]): TItem {
  return items[items.length - 1];
}
