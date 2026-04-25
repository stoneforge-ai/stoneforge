import { describe, expect, it } from "vitest";

import {
  asAgentId,
  asAuditEventId,
  asCIRunId,
  asMergeRequestId,
  asOrgId,
  asRoleDefinitionId,
  asRuntimeId,
  asWorkspaceId,
} from "./ids.js";

describe("branded id constructors", () => {
  it("preserves the original string value at runtime", () => {
    expect(asOrgId("org_1")).toBe("org_1");
    expect(asWorkspaceId("workspace_1")).toBe("workspace_1");
    expect(asRuntimeId("runtime_1")).toBe("runtime_1");
    expect(asAgentId("agent_1")).toBe("agent_1");
    expect(asRoleDefinitionId("role_1")).toBe("role_1");
    expect(asAuditEventId("audit_1")).toBe("audit_1");
    expect(asMergeRequestId("mr_1")).toBe("mr_1");
    expect(asCIRunId("ci_1")).toBe("ci_1");
  });
});
