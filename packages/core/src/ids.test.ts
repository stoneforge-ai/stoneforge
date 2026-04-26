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
  parseAgentId,
  parseAuditEventId,
  parseCIRunId,
  parseMergeRequestId,
  parseOrgId,
  parseRoleDefinitionId,
  parseRuntimeId,
  parseWorkspaceId,
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

  it("validates external id values before branding", () => {
    expect(parseOrgId("org_1")).toBe("org_1");
    expect(parseWorkspaceId("workspace:local")).toBe("workspace:local");
    expect(parseRuntimeId("runtime.local")).toBe("runtime.local");
    expect(parseAgentId("agent-local")).toBe("agent-local");
    expect(parseRoleDefinitionId("role_1")).toBe("role_1");
    expect(parseAuditEventId("audit_1")).toBe("audit_1");
    expect(parseMergeRequestId("merge_request_1")).toBe("merge_request_1");
    expect(parseCIRunId("ci_1")).toBe("ci_1");
  });

  it("rejects empty, whitespace, and unsafe external id values", () => {
    expect(() => parseOrgId("")).toThrow(
      "OrgId must be a non-empty identifier",
    );
    expect(() => parseWorkspaceId(" workspace_1")).toThrow(
      "WorkspaceId must be a non-empty identifier",
    );
    expect(() => parseRuntimeId("runtime 1")).toThrow(
      "RuntimeId must be a non-empty identifier",
    );
  });
});
