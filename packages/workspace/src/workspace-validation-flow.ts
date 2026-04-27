import type { AuditActor, WorkspaceValidationResult } from "./models.js"
import { Effect } from "effect"

import { cloneValidationResult } from "./cloning.js"
import type { WorkspaceId } from "./ids.js"
import {
  buildValidationResult,
  computeValidatedState,
} from "./workspace-validation.js"
import type { WorkspaceSetupState } from "./workspace-state.js"
import { WorkspaceNotFound } from "./workspace-errors.js"
import { now, type WorkspaceClockService } from "./workspace-runtime.js"

export function validateWorkspaceRecord(
  state: WorkspaceSetupState,
  workspaceId: WorkspaceId,
  actor: AuditActor
): Effect.Effect<
  WorkspaceValidationResult,
  WorkspaceNotFound,
  WorkspaceClockService
> {
  return Effect.gen(function* () {
    const workspace = state.getWorkspace(workspaceId)

    if (!workspace) {
      return yield* Effect.fail(new WorkspaceNotFound({ workspaceId }))
    }

    const timestamp = yield* now()
    const validation = buildValidationResult(workspace, timestamp)
    workspace.validation = validation
    workspace.updatedAt = validation.validatedAt
    workspace.state = computeValidatedState(workspace, validation)

    state.appendAuditEvent(
      {
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
      },
      timestamp
    )

    return cloneValidationResult(validation)
  }).pipe(
    Effect.withSpan("workspace.validate", {
      attributes: {
        "stoneforge.workspace.id": workspaceId,
      },
    })
  )
}
