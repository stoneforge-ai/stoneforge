import type { ControlPlaneCommandStatus } from "./control-plane-store.js";
import type { ControlPlaneOperationInputs } from "./control-plane-operation-inputs.js";
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
  const inputs = operationInputs(loaded);
  const org = loaded.setup.createOrg({ name: inputs.workspace.orgName });
  const workspace = loaded.setup.createWorkspace(
    org.id,
    {
      name: inputs.workspace.workspaceName,
      targetBranch: inputs.workspace.targetBranch,
    },
    operator,
  );

  loaded.snapshot.current.orgId = org.id;
  loaded.snapshot.current.workspaceId = workspace.id;

  return { id: workspace.id, state: workspace.state };
}

export function configureRepository(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const inputs = operationInputs(loaded);
  const workspace = loaded.setup.connectGitHubRepository(
    requireWorkspaceId(loaded.snapshot.current),
    inputs.repository,
    operator,
  );

  return { id: workspace.id, state: workspace.state };
}

export function configureRuntime(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const inputs = operationInputs(loaded);
  const runtime = loaded.setup.registerRuntime(
    requireWorkspaceId(loaded.snapshot.current),
    inputs.runtime,
    operator,
  );

  loaded.snapshot.current.runtimeId = runtime.id;

  return { id: runtime.id, state: runtime.healthStatus };
}

export function configureAgent(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const inputs = operationInputs(loaded);
  const agent = loaded.setup.registerAgent(
    requireWorkspaceId(loaded.snapshot.current),
    {
      ...inputs.agent,
      runtimeId: requireRuntimeId(loaded.snapshot.current),
    },
    operator,
  );

  loaded.snapshot.current.agentId = agent.id;

  return { id: agent.id, state: agent.healthStatus };
}

export function configureRole(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const inputs = operationInputs(loaded);
  const roleDefinition = loaded.setup.registerRoleDefinition(
    requireWorkspaceId(loaded.snapshot.current),
    inputs.roleDefinition,
    operator,
  );

  loaded.snapshot.current.roleDefinitionId = roleDefinition.id;

  return { id: roleDefinition.id, state: roleDefinition.category };
}

export function configurePolicy(
  loaded: LoadedControlPlane,
): LoadedOperationResult {
  const inputs = operationInputs(loaded);
  const workspace = loaded.setup.selectPolicyPreset(
    requireWorkspaceId(loaded.snapshot.current),
    inputs.policyPreset,
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
  const inputs = operationInputs(loaded);
  const roleDefinition = requireRoleDefinition(loaded);
  const task = loaded.execution.createTask({
    workspaceId: requireWorkspaceId(loaded.snapshot.current),
    title: inputs.task.title,
    intent: inputs.task.intent,
    acceptanceCriteria: inputs.task.acceptanceCriteria,
    priority: inputs.task.priority,
    requiresMergeRequest: inputs.task.requiresMergeRequest,
    dispatchConstraints: {
      roleDefinitionId: roleDefinition.id,
      requiredAgentTags: inputs.task.requiredAgentTags,
      requiredRuntimeTags: inputs.task.requiredRuntimeTags,
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
  const inputs = operationInputs(loaded);
  const verificationRun = await loaded.mergeRequests.recordProviderCheck(
    requireMergeRequestId(loaded.snapshot.current),
    {
      providerCheckId: inputs.localVerificationCheck.providerCheckId,
      name: inputs.localVerificationCheck.name,
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
  const inputs = operationInputs(loaded);
  const roleDefinition = requireRoleDefinition(loaded);
  const intent = loaded.mergeRequests.requestReview(
    requireMergeRequestId(loaded.snapshot.current),
    {
      roleDefinitionId: roleDefinition.id,
      requiredAgentTags: inputs.task.requiredAgentTags,
      requiredRuntimeTags: inputs.task.requiredRuntimeTags,
    },
  );

  return { id: intent.id, state: intent.state };
}

export async function completeAgentReview(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const inputs = operationInputs(loaded);
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
      reason: inputs.review.agentApprovalReason,
    },
  );

  return { id: mergeRequest.id, state: mergeRequest.state };
}

export async function recordHumanApproval(
  loaded: LoadedControlPlane,
): Promise<LoadedOperationResult> {
  const inputs = operationInputs(loaded);
  const mergeRequest = await loaded.mergeRequests.recordReviewOutcome(
    requireMergeRequestId(loaded.snapshot.current),
    {
      reviewerKind: "human",
      reviewerId: inputs.review.humanReviewerId,
      outcome: "approved",
      reason: inputs.review.humanApprovalReason,
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

function operationInputs(
  loaded: LoadedControlPlane,
): ControlPlaneOperationInputs {
  return requireValue(
    loaded.options.operationInputs,
    "Control-plane operation inputs are required for workspace setup and smoke/e2e commands.",
  );
}
