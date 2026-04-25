import { asAuditEventId } from "@stoneforge/core";

import { cloneAuditEvent } from "./cloning.js";
import type { AuditEvent } from "./models.js";

export class WorkspaceAuditLog {
  private readonly events: AuditEvent[];
  private counter: number;

  constructor(events: AuditEvent[] = []) {
    this.events = events.map(cloneAuditEvent);
    this.counter = maxNumericSuffix(events.map((event) => event.id), "audit_");
  }

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

  exportEvents(): AuditEvent[] {
    return this.events.map(cloneAuditEvent);
  }

  private nextId(): string {
    this.counter += 1;
    return `audit_${this.counter}`;
  }
}

function maxNumericSuffix(values: readonly string[], prefix: string): number {
  return values.reduce((max, value) => {
    if (!value.startsWith(prefix)) {
      return max;
    }

    const numericSuffix = Number(value.slice(prefix.length));

    if (Number.isInteger(numericSuffix) && numericSuffix > max) {
      return numericSuffix;
    }

    return max;
  }, 0);
}
