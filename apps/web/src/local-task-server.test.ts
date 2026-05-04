import { describe, expect, it } from "vitest"

import { taskRunFailureMessage } from "./index.js"

describe("local web Task server errors", () => {
  it("preserves the provider failure message for the UI", () => {
    expect(
      taskRunFailureMessage(
        new Error("Provider Session failed to start: model is unavailable.")
      )
    ).toBe("Provider Session failed to start: model is unavailable.")
  })

  it("uses a fallback when no provider error message is available", () => {
    expect(taskRunFailureMessage(undefined)).toBe(
      "Task run failed before the provider returned an error message."
    )
  })
})
