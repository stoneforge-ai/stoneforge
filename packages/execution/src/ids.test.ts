import { describe, expect, it } from "vitest";

import {
  asAssignmentId,
  asDispatchIntentId,
  asLeaseId,
  asSessionId,
  asTaskId,
  parseAssignmentId,
  parseDispatchIntentId,
  parseLeaseId,
  parseSessionId,
  parseTaskId,
} from "./ids.js";

describe("execution id constructors", () => {
  it("preserves the original string value at runtime", () => {
    expect(asTaskId("task_1")).toBe("task_1");
    expect(asDispatchIntentId("dispatch_intent_1")).toBe("dispatch_intent_1");
    expect(asAssignmentId("assignment_1")).toBe("assignment_1");
    expect(asSessionId("session_1")).toBe("session_1");
    expect(asLeaseId("lease_1")).toBe("lease_1");
  });

  it("validates external id values before branding", () => {
    expect(parseTaskId("task_1")).toBe("task_1");
    expect(parseDispatchIntentId("dispatch_intent_1")).toBe(
      "dispatch_intent_1",
    );
    expect(parseAssignmentId("assignment_1")).toBe("assignment_1");
    expect(parseSessionId("session_1")).toBe("session_1");
    expect(parseLeaseId("lease_1")).toBe("lease_1");
  });

  it("rejects empty, whitespace, and unsafe external id values", () => {
    expect(() => parseTaskId("")).toThrow(
      "TaskId must be a non-empty identifier",
    );
    expect(() => parseAssignmentId(" assignment_1")).toThrow(
      "AssignmentId must be a non-empty identifier",
    );
    expect(() => parseSessionId("session 1")).toThrow(
      "SessionId must be a non-empty identifier",
    );
  });
});
