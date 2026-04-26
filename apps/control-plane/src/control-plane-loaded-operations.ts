import type { ControlPlaneCommandStatus } from "./control-plane-store.js";
import {
  rememberCompletedAssignment,
  requireLatestSession,
  requireMergeRequestId,
  requireRoleDefinition,
  requireRuntimeId,
  requireStartedAssignment,
  requireValue,
  requireWorkspaceId,
  operator,
  scheduler,
  type LoadedControlPlane,
} from "./persistent-control-plane-context.js";
import { recordWorkerProgress } from "./persistent-worker.js";
import { requireObservedProviderVerificationPassed } from "./provider-verification-gate.js";

type LoadedOperationResult = Omit<ControlPlaneCommandStatus, "command">;

export function initializeWorkspace(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const org = loaded.setup.createOrg({ name: "Toolco" });
  const workspace = loaded.setup.createWorkspace(
    org.id,
    { name: "stoneforge", targetBranch: "main" },
    operator,
  );

  loaded.snapshot.current.orgId = org.id;
  loaded.snapshot.current.workspaceId = workspace.id;

  return { id: workspace.id, state: workspace.state };
}

export function configureRepository(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const repository = loaded.options.repository ?? {
    installationId: "github-installation-local",
    owner: "toolco",
    repository: "stoneforge",
    defaultBranch: "main",
  };
  const workspace = loaded.setup.connectGitHubRepository(
    requireWorkspaceId(loaded.snapshot.current),
    repository,
    operator,
  );

  return { id: workspace.id, state: workspace.state };
}

export function configureRuntime(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const runtime = loaded.setup.registerRuntime(
    requireWorkspaceId(loaded.snapshot.current),
    {
      name: "local-worktree-runtime",
      location: "customer_host",
      mode: "local_worktree",
      tags: ["local"],
    },
    operator,
  );

  loaded.snapshot.current.runtimeId = runtime.id;

  return { id: runtime.id, state: runtime.healthStatus };
}

export function configureAgent(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const agent = loaded.setup.registerAgent(
    requireWorkspaceId(loaded.snapshot.current),
    {
      name: "local-codex-agent",
      runtimeId: requireRuntimeId(loaded.snapshot.current),
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: 1,
      launcher: "fake-local-agent-adapter",
      tags: ["local"],
    },
    operator,
  );

  loaded.snapshot.current.agentId = agent.id;

  return { id: agent.id, state: agent.healthStatus };
}

export function configureRole(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const roleDefinition = loaded.setup.registerRoleDefinition(
    requireWorkspaceId(loaded.snapshot.current),
    {
      name: "direct-task-worker",
      category: "worker",
      prompt: "Implement or review assigned control-plane work.",
      toolAccess: ["git", "shell"],
      tags: ["local"],
    },
    operator,
  );

  loaded.snapshot.current.roleDefinitionId = roleDefinition.id;

  return { id: roleDefinition.id, state: roleDefinition.category };
}

export function configurePolicy(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const workspace = loaded.setup.selectPolicyPreset(
    requireWorkspaceId(loaded.snapshot.current),
    "supervised",
    operator,
  );

  return { id: workspace.id, state: workspace.policyPreset };
}

export function evaluateReadiness(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const workspaceId = requireWorkspaceId(loaded.snapshot.current);
  const validation = loaded.setup.validateWorkspace(workspaceId, scheduler);
  const workspace = loaded.setup.getWorkspace(workspaceId);

  if (!validation.ready) {
    throw new Error(
      "Workspace is not ready. Configure repository, policy, runtime, agent, and role before validation.",
    );
  }

  loaded.execution.configureWorkspace(workspace);

  return { id: workspace.id, state: workspace.state };
}

export function createDirectTask(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const roleDefinition = requireRoleDefinition(loaded);
  const task = loaded.execution.createTask({
    workspaceId: requireWorkspaceId(loaded.snapshot.current),
    title: "Control-plane direct task smoke flow",
    intent: "Prove the durable control-plane command boundary and state.",
    acceptanceCriteria: [
      "The task dispatches, opens a MergeRequest, records gates, and merges.",
    ],
    priority: "normal",
    requiresMergeRequest: true,
    dispatchConstraints: {
      roleDefinitionId: roleDefinition.id,
      requiredAgentTags: ["local"],
      requiredRuntimeTags: ["local"],
    },
  });

  loaded.snapshot.current.taskId = task.id;

  return { id: task.id, state: task.state };
}

export async function executeNextDispatch(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const intent = await loaded.execution.runSchedulerOnce();
  const assignment = requireStartedAssignment(loaded.execution, intent);
  const session = requireLatestSession(loaded.execution, assignment);

  recordWorkerProgress(loaded, assignment, session);
  const completed = loaded.execution.completeAssignment(assignment.id);

  rememberCompletedAssignment(loaded.snapshot.current, completed, session);

  return { id: completed.id, state: completed.state };
}

export async function openMergeRequest(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const mergeRequest = await loaded.mergeRequests.openOrUpdateTaskMergeRequest({
    taskAssignmentId: requireValue(
      loaded.snapshot.current.implementationAssignmentId,
      "Run the implementation worker before opening a MergeRequest.",
    ),
  });

  loaded.snapshot.current.mergeRequestId = mergeRequest.id;

  return { id: mergeRequest.id, state: mergeRequest.state };
}

export async function recordLocalVerificationPassed(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const verificationRun = await loaded.mergeRequests.recordProviderCheck(
    requireMergeRequestId(loaded.snapshot.current),
    {
      providerCheckId: "local-check-1",
      name: "local quality",
      state: "passed",
    },
  );

  loaded.snapshot.current.verificationRunId = verificationRun.id;

  return { id: verificationRun.id, state: verificationRun.state };
}

export async function observeProviderState(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const mergeRequestId = requireMergeRequestId(loaded.snapshot.current);
  const verificationRuns =
    await loaded.mergeRequests.observeProviderPullRequest(mergeRequestId);
  const latest = verificationRuns.at(-1);

  if (latest === undefined) {
    return { id: mergeRequestId, state: "observed" };
  }

  loaded.snapshot.current.verificationRunId = latest.id;

  return { id: latest.id, state: latest.state };
}

export { requireObservedProviderVerificationPassed };

export async function publishPolicyStatus(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const mergeRequest = await loaded.mergeRequests.publishPolicyStatus(
    requireMergeRequestId(loaded.snapshot.current),
  );

  return {
    id: mergeRequest.id,
    state: mergeRequest.policyCheck?.state ?? mergeRequest.state,
  };
}

export function requestReview(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const roleDefinition = requireRoleDefinition(loaded);
  const intent = loaded.mergeRequests.requestReview(
    requireMergeRequestId(loaded.snapshot.current),
    {
      roleDefinitionId: roleDefinition.id,
      requiredAgentTags: ["local"],
      requiredRuntimeTags: ["local"],
    },
  );

  return { id: intent.id, state: intent.state };
}

export async function completeAgentReview(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const mergeRequest = await loaded.mergeRequests.recordReviewOutcome(
    requireMergeRequestId(loaded.snapshot.current),
    {
      assignmentId: requireValue(
        loaded.snapshot.current.reviewAssignmentId,
        "Run the review worker before completing review.",
      ),
      reviewerKind: "agent",
      reviewerId: requireValue(
        loaded.snapshot.current.agentId,
        "Configure an agent before completing review.",
      ),
      outcome: "approved",
      reason: "Local review approved the deterministic scenario change.",
    },
  );

  return { id: mergeRequest.id, state: mergeRequest.state };
}

export async function recordHumanApproval(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const mergeRequest = await loaded.mergeRequests.recordReviewOutcome(
    requireMergeRequestId(loaded.snapshot.current),
    {
      reviewerKind: "human",
      reviewerId: "user_approver",
      outcome: "approved",
      reason: "Human reviewer approved the MergeRequest.",
    },
  );

  return { id: mergeRequest.id, state: mergeRequest.state };
}

export async function mergeWhenReady(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const mergeRequest = await loaded.mergeRequests.merge(
    requireMergeRequestId(loaded.snapshot.current),
  );

  return { id: mergeRequest.id, state: mergeRequest.state };
}
