import { asOrgId, asWorkspaceId } from "@stoneforge/core"
import { Effect } from "effect"

import { cloneOrg, cloneWorkspace } from "./cloning.js"
import type {
  AuditActor,
  CreateOrgInput,
  CreateWorkspaceInput,
  Org,
  Workspace,
} from "./models.js"
import type { OrgId } from "./ids.js"
import { createOrgRecord, createWorkspaceRecord } from "./workspace-records.js"
import type { WorkspaceSetupState } from "./workspace-state.js"
import { OrgNotFound } from "./workspace-errors.js"
import { now, type WorkspaceClockService } from "./workspace-runtime.js"

export function createOrgRecordInState(
  state: WorkspaceSetupState,
  input: CreateOrgInput
): Effect.Effect<Org, never, WorkspaceClockService> {
  return Effect.gen(function* () {
    const timestamp = yield* now()
    const org = createOrgRecord(
      asOrgId(state.nextId("org")),
      input.name,
      timestamp
    )

    state.orgs.set(org.id, org)

    return cloneOrg(org)
  }).pipe(Effect.withSpan("workspace.create_org"))
}

export function createWorkspaceRecordInState(
  state: WorkspaceSetupState,
  orgId: OrgId,
  input: CreateWorkspaceInput,
  actor: AuditActor
): Effect.Effect<Workspace, OrgNotFound, WorkspaceClockService> {
  return Effect.gen(function* () {
    const org = state.orgs.get(orgId)

    if (!org) {
      return yield* Effect.fail(new OrgNotFound({ orgId }))
    }

    const timestamp = yield* now()
    const workspace = createWorkspaceRecord(
      asWorkspaceId(state.nextId("workspace")),
      orgId,
      input,
      timestamp
    )

    state.workspaces.set(workspace.id, workspace)
    state.appendAuditEvent(
      {
        actor,
        action: "workspace.created",
        orgId,
        workspaceId: workspace.id,
        targetId: workspace.id,
        targetType: "workspace",
        outcome: "success",
      },
      timestamp
    )

    return cloneWorkspace(workspace)
  }).pipe(
    Effect.withSpan("workspace.create_workspace", {
      attributes: {
        "stoneforge.org.id": orgId,
      },
    })
  )
}
