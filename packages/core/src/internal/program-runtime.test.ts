import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { runLayeredProgram } from "./program-runtime.js"

describe("runLayeredProgram", () => {
  it("resolves successful Effect programs", async () => {
    await expect(
      runLayeredProgram(Effect.succeed("ready"), Layer.empty)
    ).resolves.toBe("ready")
  })

  it("rejects with the expected failure object", async () => {
    const failure = new Error("expected failure")

    await expect(
      runLayeredProgram(Effect.fail(failure), Layer.empty)
    ).rejects.toBe(failure)
  })

  it("squashes defects into ordinary thrown errors", async () => {
    await expect(
      runLayeredProgram(
        Effect.sync(() => {
          throw new TypeError("defect")
        }),
        Layer.empty
      )
    ).rejects.toThrow("defect")
  })
})
