import { asOrgId, asWorkspaceId } from "@stoneforge/core"

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

export function createOrgRecordInState(
  state: WorkspaceSetupState,
  input: CreateOrgInput
): Org {
  const now = state.now()
  const org = createOrgRecord(asOrgId(state.nextId("org")), input.name, now)

  state.orgs.set(org.id, org)

  return cloneOrg(org)
}

export function createWorkspaceRecordInState(
  state: WorkspaceSetupState,
  orgId: OrgId,
  input: CreateWorkspaceInput,
  actor: AuditActor
): Workspace {
  const org = state.orgs.get(orgId)

  if (!org) {
    throw new Error(`Org ${orgId} does not exist.`)
  }

  const workspace = createWorkspaceRecord(
    asWorkspaceId(state.nextId("workspace")),
    orgId,
    input,
    state.now()
  )

  state.workspaces.set(workspace.id, workspace)
  state.appendAuditEvent({
    actor,
    action: "workspace.created",
    orgId,
    workspaceId: workspace.id,
    targetId: workspace.id,
    targetType: "workspace",
    outcome: "success",
  })

  return cloneWorkspace(workspace)
}
