import { asWorkspaceId } from "@stoneforge/core"
import { describe, expect, it } from "vitest"

import {
  createEmptyControlPlaneSnapshot,
  parseControlPlaneSnapshot,
} from "./control-plane-store.js"

describe("control-plane snapshot parsing", () => {
  it("re-parses persisted current ids through branded constructors", () => {
    const snapshot = createEmptyControlPlaneSnapshot()
    snapshot.current.workspaceId = asWorkspaceId("workspace_1")

    const parsed = parseControlPlaneSnapshot(
      JSON.stringify(snapshot),
      "test store"
    )

    expect(parsed.current.workspaceId).toBe("workspace_1")
  })

  it("rejects invalid persisted current ids", () => {
    const snapshot = {
      ...createEmptyControlPlaneSnapshot(),
      current: { workspaceId: "workspace 1" },
    }

    expect(() => {
      parseControlPlaneSnapshot(JSON.stringify(snapshot), "test store")
    }).toThrow("invalid current.workspaceId")
  })
})
