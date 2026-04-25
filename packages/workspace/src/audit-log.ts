import { asAuditEventId } from "@stoneforge/core";

import { cloneAuditEvent } from "./cloning.js";
import type { AuditEvent } from "./models.js";

export class WorkspaceAuditLog {
  private readonly events: AuditEvent[] = [];
  private counter = 0;

  append(input: Omit<AuditEvent, "id" | "timestamp">): void {
    const event: AuditEvent = {
      ...input,
      id: asAuditEventId(this.nextId()),
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);
  }

  listForWorkspace(workspaceId: AuditEvent["workspaceId"]): AuditEvent[] {
    return this.events
      .filter((event) => event.workspaceId === workspaceId)
      .map(cloneAuditEvent);
  }

  private nextId(): string {
    this.counter += 1;
    return `audit_${this.counter}`;
  }
}
