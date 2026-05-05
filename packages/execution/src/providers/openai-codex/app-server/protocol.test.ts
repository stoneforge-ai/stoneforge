import { describe, expect, it } from "vitest"

import { createNodeCodexAppServerClient } from "./index.js"
import {
  codexAppServerCompletedItemScript,
  codexAppServerEarlyCompletionScript,
  codexAppServerFailedTurnScript,
  codexAppServerFailedTurnRawErrorScript,
  codexAppServerFixtureScript,
  codexAppServerInitializeErrorScript,
  codexAppServerInvalidJsonScript,
  codexAppServerMalformedThreadScript,
  codexAppServerMalformedTurnScript
} from "./test-support/index.js"
import {
  codexAppServerCompletionWithoutTurnStartResponseScript,
  codexAppServerExitDuringTurnScript,
  codexAppServerExitScript,
  codexAppServerHungTurnScript
} from "./test-support/index.js"

describe("Codex App Server JSON-RPC protocol", () => {
  it("drives a Codex App Server over stdio JSON-RPC", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerFixtureScript],
    })

    const result = await appServerClient.runTurn({
      cwd: "/workspaces/stoneforge",
      model: "gpt-5.5",
      prompt: "Summarize this repo.",
    })

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider.transcript.delta",
          role: "assistant",
          text: "Codex App Server completed task.",
        }),
        expect.objectContaining({
          kind: "provider.session.started",
          providerSessionId:
            "openai-codex:thread-from-app-server:turn-from-app-server",
        }),
        expect.objectContaining({
          kind: "provider.turn.started",
          turnId: "turn-from-app-server",
        }),
      ])
    )
    expect(result.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider.session.started",
          providerSessionId: "thread-from-app-server",
        }),
      ])
    )
    expect(result).toMatchObject({
      finalSummary: "Codex App Server completed task.",
      logs: [],
      status: "completed",
      transcript: [
        {
          role: "assistant",
          text: "Codex App Server completed task.",
        },
      ],
      threadId: "thread-from-app-server",
      turnId: "turn-from-app-server",
    })
  })

  it("rejects Codex App Server JSON-RPC error responses", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerInitializeErrorScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow("codex app-server request failed: not authenticated")
  })

  it("uses Codex App Server completed agent messages as the summary", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerCompletedItemScript],
    })

    const result = await appServerClient.runTurn({
      model: "gpt-5.5",
      prompt: "Summarize this repo.",
    })

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider.transcript.item.completed",
          providerItemId: "item-agent-message",
          role: "assistant",
          text: "Authoritative completed item summary.",
        }),
      ])
    )
    expect(result).toMatchObject({
      finalSummary: "Authoritative completed item summary.",
      status: "completed",
      transcript: [
        {
          providerItemId: "item-agent-message",
          role: "assistant",
          text: "Authoritative completed item summary.",
        },
      ],
      threadId: "thread-completed-item",
      turnId: "turn-completed-item",
    })
  })

  it("handles Codex App Server turn completion before turn/start response", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerEarlyCompletionScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).resolves.toMatchObject({
      finalSummary: "Early completion summary.",
      status: "completed",
      transcript: [
        {
          role: "assistant",
          text: "Early completion summary.",
        },
      ],
      threadId: "thread-early",
      turnId: "turn-early",
    })
  })

  it("handles Codex App Server turn completion without a turn/start response", async () => {
    const events: string[] = []
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: [
        "-e",
        codexAppServerCompletionWithoutTurnStartResponseScript,
      ],
      requestTimeoutMs: 500,
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        onEvent: (event) => events.push(event.kind),
        prompt: "Summarize this repo.",
      })
    ).resolves.toMatchObject({
      finalSummary: "Notification-only completion.",
      status: "completed",
      threadId: "thread-notify-only",
      transcript: [
        {
          role: "assistant",
          text: "Notification-only completion.",
        },
      ],
      turnId: "turn-notify-only",
    })
    expect(events).toEqual(
      expect.arrayContaining([
        "provider.session.started",
        "provider.transcript.delta",
        "provider.event",
      ])
    )
  })

  it("rejects invalid Codex App Server JSON-RPC messages", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerInvalidJsonScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow("codex app-server emitted invalid JSON-RPC message.")
  })

  it("rejects malformed Codex App Server thread responses", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerMalformedThreadScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow("codex app-server response missing object field thread.")
  })

  it("rejects failed Codex App Server turns", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerFailedTurnScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow(
      "codex app-server turn failed: model gpt-5.5 is not available"
    )
  })

  it("preserves raw Codex App Server turn failure messages", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerFailedTurnRawErrorScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow(
      "codex app-server turn failed: provider failure without JSON detail"
    )
  })

  it("rejects malformed Codex App Server turn responses", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerMalformedTurnScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow("codex app-server response missing string field id.")
  })

  it("rejects Codex App Server process exits while requests are pending", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerExitScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow("codex app-server exited with code 7: startup failed")
  })

  it("rejects Codex App Server process exits while a turn is active", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerExitDuringTurnScript],
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow("codex app-server exited with code 8: turn crashed")
  })

  it("times out hung Codex App Server protocol phases", async () => {
    const appServerClient = createNodeCodexAppServerClient({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerHungTurnScript],
      requestTimeoutMs: 200,
    })

    await expect(
      appServerClient.runTurn({
        model: "gpt-5.5",
        prompt: "Summarize this repo.",
      })
    ).rejects.toThrow("codex app-server turn/start timed out.")
  })

})
