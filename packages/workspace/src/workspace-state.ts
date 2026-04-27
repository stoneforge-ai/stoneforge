import { cloneOrg, cloneWorkspace } from "./cloning.js"
import type {
  AuditEvent,
  Org,
  Workspace,
  WorkspaceSetupSnapshot,
} from "./models.js"
import type { OrgId, WorkspaceId } from "./ids.js"
import { WorkspaceAuditLog } from "./audit-log.js"
import { WorkspaceNotFound } from "./workspace-errors.js"

type CounterName = "org" | "workspace" | "runtime" | "agent" | "roleDefinition"

export class WorkspaceSetupState {
  readonly orgs = new Map<OrgId, Org>()
  readonly workspaces = new Map<WorkspaceId, Workspace>()

  private readonly auditLog: WorkspaceAuditLog
  private readonly counters: Record<CounterName, number> = {
    org: 0,
    workspace: 0,
    runtime: 0,
    agent: 0,
    roleDefinition: 0,
  }

  constructor(snapshot?: WorkspaceSetupSnapshot) {
    this.auditLog = new WorkspaceAuditLog(snapshot?.auditEvents)

    if (snapshot) {
      this.restoreSnapshot(snapshot)
    }
  }

  requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.workspaces.get(workspaceId)

    if (!workspace) {
      throw new WorkspaceNotFound({ workspaceId })
    }

    return workspace
  }

  getWorkspace(workspaceId: WorkspaceId): Workspace | undefined {
    return this.workspaces.get(workspaceId)
  }

  appendAuditEvent(
    input: Omit<AuditEvent, "id" | "timestamp">,
    timestamp: string
  ): void {
    this.auditLog.append(input, timestamp)
  }

  listAuditEventsForWorkspace(workspaceId: WorkspaceId): AuditEvent[] {
    return this.auditLog.listForWorkspace(workspaceId)
  }

  exportSnapshot(): WorkspaceSetupSnapshot {
    return {
      orgs: Array.from(this.orgs.values()).map(cloneOrg),
      workspaces: Array.from(this.workspaces.values()).map(cloneWorkspace),
      auditEvents: this.auditLog.exportEvents(),
    }
  }

  nextId(counterName: CounterName): string {
    this.counters[counterName] += 1
    return `${counterName}_${this.counters[counterName]}`
  }

  private restoreSnapshot(snapshot: WorkspaceSetupSnapshot): void {
    for (const org of snapshot.orgs) {
      this.orgs.set(org.id, cloneOrg(org))
    }

    for (const workspace of snapshot.workspaces) {
      this.workspaces.set(workspace.id, cloneWorkspace(workspace))
    }

    this.counters.org = maxNumericSuffix(
      snapshot.orgs.map((org) => org.id),
      "org_"
    )
    this.counters.workspace = maxNumericSuffix(
      snapshot.workspaces.map((workspace) => workspace.id),
      "workspace_"
    )
    this.counters.runtime = maxWorkspaceChildSuffix(snapshot, "runtime_")
    this.counters.agent = maxWorkspaceChildSuffix(snapshot, "agent_")
    this.counters.roleDefinition = maxWorkspaceChildSuffix(
      snapshot,
      "roleDefinition_"
    )
  }
}

function maxWorkspaceChildSuffix(
  snapshot: WorkspaceSetupSnapshot,
  prefix: string
): number {
  const ids = snapshot.workspaces.flatMap((workspace) => {
    return [
      ...workspace.runtimes.map((runtime) => runtime.id),
      ...workspace.agents.map((agent) => agent.id),
      ...workspace.roleDefinitions.map((roleDefinition) => roleDefinition.id),
    ]
  })

  return maxNumericSuffix(ids, prefix)
}

function maxNumericSuffix(values: readonly string[], prefix: string): number {
  return values.reduce((max, value) => {
    const suffix = value.startsWith(prefix)
      ? Number(value.slice(prefix.length))
      : 0

    if (Number.isInteger(suffix) && suffix > max) {
      return suffix
    }

    return max
  }, 0)
}
