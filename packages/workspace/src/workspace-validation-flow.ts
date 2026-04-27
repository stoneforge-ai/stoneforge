import type { AuditActor, WorkspaceValidationResult } from "./models.js"
import { cloneValidationResult } from "./cloning.js"
import type { WorkspaceId } from "./ids.js"
import {
  buildValidationResult,
  computeValidatedState,
} from "./workspace-validation.js"
import type { WorkspaceSetupState } from "./workspace-state.js"

export function validateWorkspaceRecord(
  state: WorkspaceSetupState,
  workspaceId: WorkspaceId,
  actor: AuditActor
): WorkspaceValidationResult {
  const workspace = state.requireWorkspace(workspaceId)
  const validation = buildValidationResult(workspace, state.now())

  workspace.validation = validation
  workspace.updatedAt = validation.validatedAt
  workspace.state = computeValidatedState(workspace, validation)

  state.appendAuditEvent({
    actor,
    action: "workspace.validated",
    orgId: workspace.orgId,
    workspaceId: workspace.id,
    targetId: workspace.id,
    targetType: "workspace",
    outcome: validation.ready ? "success" : "failure",
    reason: validation.ready
      ? undefined
      : validation.issues.map((issue) => issue.code).join(", "),
    policyPreset: workspace.policyPreset,
  })

  return cloneValidationResult(validation)
}
