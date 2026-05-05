import { describe, expect, it } from "vitest"

import {
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
} from "@stoneforge/execution"
import type { LocalTaskConsole } from "@stoneforge/app-shell"

import { createDesktopTaskBridge } from "../../index.js"

describe("Electron preload Task bridge", () => {
  it("exposes only the shared local Task command surface to the renderer", async () => {
    const calls: string[] = []
    const client = {
      readTaskConsole: async () => {
        calls.push("read")

        return {
          assignments: [],
          connectionMode: "managed-by-desktop",
          humanPrincipal: "local-human",
          lineage: [],
          sessions: [],
          tasks: [],
          workspace: {
            id: makeWorkspaceId("workspace-desktop-local"),
            repository: {
              owner: "stoneforge-ai",
              provider: "github",
              repo: "stoneforge",
              targetBranch: "main",
            },
            state: "ready",
          },
        }
      },
      dispatchNextTask: async () => {
        calls.push("dispatch")

        return { reason: "no_ready_task", status: "queued" }
      },
      runNoCodeTask: async (input) => {
        calls.push(input.title)

        return {
          connectionMode: "managed-by-desktop",
          finalSummary: "Desktop bridge completed the Task.",
          humanPrincipal: "local-human",
          provider: input.provider,
          providerSessionId: "claude-code:desktop-local",
          sessionId: makeSessionId("session-desktop-local"),
          status: "completed",
          task: {
            id: makeTaskId("task-desktop-local"),
            requiredAgentTags: [`provider:${input.provider}`],
            state: "completed",
            title: input.title,
          },
        }
      },
      startNoCodeTask: async (input) => {
        calls.push(`start:${input.title}`)

        return {
          connectionMode: "managed-by-desktop",
          humanPrincipal: "local-human",
          status: "started",
          task: {
            id: makeTaskId("task-desktop-local"),
            requiredAgentTags: [`provider:${input.provider}`],
            state: "ready",
            title: input.title,
          },
        }
      },
    } satisfies LocalTaskConsole

    const bridge = createDesktopTaskBridge(client)

    expect(Object.keys(bridge)).toEqual([
      "dispatchNextTask",
      "readTaskConsole",
      "runNoCodeTask",
      "startNoCodeTask",
    ])
    await expect(bridge.readTaskConsole()).resolves.toMatchObject({
      connectionMode: "managed-by-desktop",
      workspace: { state: "ready" },
    })
    await expect(
      bridge.startNoCodeTask({
        intent: "Confirm Electron preload starts through the shared command surface.",
        provider: "claude-code",
        title: "Started Bridge Task",
      })
    ).resolves.toMatchObject({
      connectionMode: "managed-by-desktop",
      status: "started",
      task: { state: "ready" },
    })
    await expect(bridge.dispatchNextTask()).resolves.toEqual({
      reason: "no_ready_task",
      status: "queued",
    })
    await expect(
      bridge.runNoCodeTask({
        intent: "Confirm Electron preload uses the shared command surface.",
        provider: "claude-code",
        title: "Bridge Task",
      })
    ).resolves.toMatchObject({
      connectionMode: "managed-by-desktop",
      finalSummary: "Desktop bridge completed the Task.",
      status: "completed",
    })
    expect(calls).toEqual([
      "read",
      "start:Started Bridge Task",
      "dispatch",
      "Bridge Task",
    ])
  })

  it("can create the default bridge in deterministic desktop mode", async () => {
    const previousMode = process.env.STONEFORGE_DESKTOP_PROVIDER_MODE
    process.env.STONEFORGE_DESKTOP_PROVIDER_MODE = "deterministic"

    try {
      const bridge = createDesktopTaskBridge()

      await expect(
        bridge.runNoCodeTask({
          intent: "Confirm deterministic bridge mode runs locally.",
          provider: "claude-code",
          title: "Default Bridge Task",
        })
      ).resolves.toMatchObject({
        connectionMode: "managed-by-desktop",
        finalSummary:
          "Completed Default Bridge Task in deterministic desktop mode.",
        status: "completed",
      })
      await expect(
        bridge.runNoCodeTask({
          intent: "Confirm deterministic bridge mode runs Codex locally.",
          provider: "openai-codex",
          title: "Default Codex Bridge Task",
        })
      ).resolves.toMatchObject({
        connectionMode: "managed-by-desktop",
        finalSummary:
          "Completed Default Codex Bridge Task with deterministic Codex desktop mode.",
        status: "completed",
      })
    } finally {
      if (previousMode === undefined) {
        delete process.env.STONEFORGE_DESKTOP_PROVIDER_MODE
      } else {
        process.env.STONEFORGE_DESKTOP_PROVIDER_MODE = previousMode
      }
    }
  })
})
