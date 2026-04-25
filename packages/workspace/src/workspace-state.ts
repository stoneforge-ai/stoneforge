import type { AuditEvent, Org, Workspace } from "./models.js";
import type { OrgId, WorkspaceId } from "./ids.js";
import { WorkspaceAuditLog } from "./audit-log.js";

type CounterName =
  | "org"
  | "workspace"
  | "runtime"
  | "agent"
  | "roleDefinition";

export class WorkspaceSetupState {
  readonly orgs = new Map<OrgId, Org>();
  readonly workspaces = new Map<WorkspaceId, Workspace>();

  private readonly auditLog = new WorkspaceAuditLog();
  private readonly counters: Record<CounterName, number> = {
    org: 0,
    workspace: 0,
    runtime: 0,
    agent: 0,
    roleDefinition: 0,
  };

  requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} does not exist.`);
    }

    return workspace;
  }

  appendAuditEvent(input: Omit<AuditEvent, "id" | "timestamp">): void {
    this.auditLog.append(input);
  }

  listAuditEventsForWorkspace(workspaceId: WorkspaceId): AuditEvent[] {
    return this.auditLog.listForWorkspace(workspaceId);
  }

  nextId(counterName: CounterName): string {
    this.counters[counterName] += 1;
    return `${counterName}_${this.counters[counterName]}`;
  }

  now(): string {
    return new Date().toISOString();
  }
}
