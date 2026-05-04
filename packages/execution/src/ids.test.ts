import { describe, expect, it } from "vitest"

import {
  makeAssignmentId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId
} from "./index.js"

describe("execution id helpers", () => {
  it("trims valid ids and rejects empty ids", () => {
    expect(makeRuntimeId(" runtime-trimmed ")).toBe("runtime-trimmed")
    expect(makeAssignmentId(" assignment-trimmed ")).toBe("assignment-trimmed")
    expect(makeSessionId(" session-trimmed ")).toBe("session-trimmed")
    expect(() => makeTaskId("   ")).toThrow("TaskId cannot be empty.")
  })
})
