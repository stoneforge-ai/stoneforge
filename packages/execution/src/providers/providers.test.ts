import { describe, expect, expectTypeOf, it } from "vitest"

import type { Options as ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk"

import {
  createClaudeCodeProviderRuntime,
  createNodeCodexAppServerClient,
  createOpenAICodexProviderRuntime,
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  ProviderOperationUnsupportedError,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
} from "../index.js"
import {
  codexAppServerFixtureScript
} from "./openai-codex/app-server/test-support/index.js"
import type {
  CodexAppServerClient,
  CodexAppServerTurnInput,
  ProviderSessionStartContext,
} from "../index.js"
import type { ProviderSessionEvent } from "./models.js"

describe("production provider adapters", () => {
  it("constructs default production provider runtimes without starting sessions", () => {
    expect(createClaudeCodeProviderRuntime()).toMatchObject({
      capabilities: {
        connectivity: "connectionless",
        supportsCancel: false,
        supportsInterrupt: false,
        supportsResume: false,
      },
      provider: "claude-code",
    })
    expect(createOpenAICodexProviderRuntime()).toMatchObject({
      capabilities: {
        connectivity: "connectionful",
        supportsCancel: false,
        supportsInterrupt: false,
        supportsResume: false,
      },
      provider: "openai-codex",
    })
    expect(typeof createNodeCodexAppServerClient().runTurn).toBe("function")
    expectTypeOf(
      createNodeCodexAppServerClient()
    ).toMatchTypeOf<CodexAppServerClient>()
  })

  it("runs Claude Code for a no-code Assignment through the Agent SDK", async () => {
    const calls: ClaudeAgentQueryInput[] = []
    const adapter = createClaudeCodeProviderRuntime({
      pathToClaudeCodeExecutable: "/opt/stoneforge/bin/claude",
      query: (input) => {
        calls.push(input)
        return claudeAgentMessages([
          {
            result: "Claude checked the task and no code changes were needed.",
            session_id: "claude-session",
            subtype: "success",
            type: "result",
          },
        ])
      },
    })

    await expect(
      adapter.startSession(startContext("claude-code"))
    ).resolves.toMatchObject({
      providerSession: {
        external: [{ kind: "claude.session", sessionId: "claude-session" }],
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId("claude-code-default"),
        providerSessionId: "claude-code:claude-session",
      },
      sessionId: makeSessionId("session-provider"),
      status: "completed",
      terminalOutcome: {
        status: "completed",
        summary: "Claude checked the task and no code changes were needed.",
      },
      transcript: [
        {
          role: "assistant",
          text: "Claude checked the task and no code changes were needed.",
        },
      ],
    })
    expect(calls).toEqual([
      {
        options: {
          model: "claude-sonnet-4-6",
          pathToClaudeCodeExecutable: "/opt/stoneforge/bin/claude",
          permissionMode: "dontAsk",
          tools: [],
        },
        prompt:
          "Stoneforge no-code Task\n\nTitle: Verify no-code provider path\n\nIntent:\nConfirm provider dispatch without repository edits.\n\nReturn a concise completion summary and do not edit files.",
      },
    ])
  })

  it("runs OpenAI Codex for a no-code Assignment through Codex App Server", async () => {
    const calls: CodexAppServerTurnInput[] = []
    const adapter = createOpenAICodexProviderRuntime({
      appServerClient: {
        runTurn: async (input) => {
          calls.push(input)
          return {
            events: [
              {
                kind: "provider.turn.started",
                turnId: "turn-codex",
              },
            ],
            finalSummary: "Codex verified the task without code changes.",
            logs: [],
            status: "completed",
            transcript: [
              {
                role: "assistant",
                text: "Codex verified the task without code changes.",
              },
            ],
            threadId: "thread-codex",
            turnId: "turn-codex",
          }
        },
      },
    })

    const result = await adapter.startSession(startContext("openai-codex"))

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider.turn.started",
          turnId: "turn-codex",
        }),
      ])
    )
    expect(result).toMatchObject({
      providerSession: {
        external: [
          { kind: "codex.thread", threadId: "thread-codex" },
          {
            kind: "codex.turn",
            threadId: "thread-codex",
            turnId: "turn-codex",
          },
        ],
        provider: "openai-codex",
        providerInstanceId: makeProviderInstanceId("openai-codex-default"),
        providerSessionId: "openai-codex:thread-codex:turn-codex",
      },
      sessionId: makeSessionId("session-provider"),
      status: "completed",
      terminalOutcome: {
        status: "completed",
        summary: "Codex verified the task without code changes.",
      },
    })
    expect(calls).toEqual([
      {
        cwd: "/workspaces/stoneforge",
        model: "gpt-5.5",
        prompt:
          "Stoneforge no-code Task\n\nTitle: Verify no-code provider path\n\nIntent:\nConfirm provider dispatch without repository edits.\n\nReturn a concise completion summary and do not edit files.",
      },
    ])
  })

  it("surfaces Claude Agent SDK failures with result context", async () => {
    const adapter = createClaudeCodeProviderRuntime({
      query: () =>
        claudeAgentMessages([
          {
            errors: ["not authenticated"],
            subtype: "error_during_execution",
            type: "result",
          },
        ]),
    })

    await expect(
      adapter.startSession(startContext("claude-code"))
    ).rejects.toThrow("claude-code Agent SDK failed: not authenticated")
  })

  it("waits for the Claude Agent SDK result message", async () => {
    const liveEvents: ProviderSessionEvent[] = []
    const adapter = createClaudeCodeProviderRuntime({
      query: () =>
        claudeAgentMessages([
          { type: "system" },
          {
            event: {
              delta: { text: "Streaming ", type: "text_delta" },
              type: "content_block_delta",
            },
            type: "stream_event",
            uuid: "claude-stream-1",
          },
          {
            event: { type: "message_stop" },
            type: "stream_event",
            uuid: "claude-stream-ignored",
          },
          {
            message: {
              content: [
                { text: "Completed assistant text.", type: "text" },
                { type: "tool_use" },
              ],
            },
            type: "assistant",
            uuid: "claude-assistant-1",
          },
          {
            result: "Claude completed after setup.",
            session_id: "claude-session",
            subtype: "success",
            type: "result",
          },
        ]),
    })

    const result = await adapter.startSession({
      ...startContext("claude-code"),
      onEvent: (event) => liveEvents.push(event),
    })

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider.event",
          name: "claude.system",
        }),
        expect.objectContaining({
          kind: "provider.event",
          name: "claude.result",
        }),
        expect.objectContaining({
          kind: "provider.transcript.delta",
          providerItemId: "claude-stream-1",
          role: "assistant",
          text: "Streaming ",
        }),
        expect.objectContaining({
          kind: "provider.transcript.item.completed",
          providerItemId: "claude-assistant-1",
          role: "assistant",
          text: "Completed assistant text.",
        }),
      ])
    )
    expect(result.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider.event",
          name: "claude.assistant",
        }),
        expect.objectContaining({
          kind: "provider.event",
          name: "claude.stream_event",
        }),
      ])
    )
    expect(liveEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "provider.transcript.delta",
          text: "Streaming ",
        }),
        expect.objectContaining({
          kind: "provider.transcript.item.completed",
          text: "Completed assistant text.",
        }),
      ])
    )
    expect(result).toMatchObject({
      providerSession: {
        providerSessionId: "claude-code:claude-session",
      },
      sessionId: makeSessionId("session-provider"),
      status: "completed",
      terminalOutcome: {
        status: "completed",
        summary: "Claude completed after setup.",
      },
      transcript: [
        {
          providerItemId: "claude-assistant-1",
          role: "assistant",
          text: "Completed assistant text.",
        },
      ],
    })
  })

  it("rejects Claude Agent SDK streams that finish without a result", async () => {
    const adapter = createClaudeCodeProviderRuntime({
      query: () => claudeAgentMessages([{ type: "system" }]),
    })

    await expect(
      adapter.startSession(startContext("claude-code"))
    ).rejects.toThrow(
      "claude-code Agent SDK completed without a result message."
    )
  })

  it("surfaces Codex App Server turn failures", async () => {
    const adapter = createOpenAICodexProviderRuntime({
      appServerClient: {
        runTurn: async () => {
          throw new Error("codex app-server request failed: not authenticated")
        },
      },
    })

    await expect(
      adapter.startSession(startContext("openai-codex"))
    ).rejects.toThrow("codex app-server request failed: not authenticated")
  })

  it("represents provider lifecycle capabilities and typed unsupported operations", async () => {
    const adapter = createOpenAICodexProviderRuntime()
    const providerSession = {
      external: [
        { kind: "codex.thread", threadId: "thread-codex" },
        { kind: "codex.turn", threadId: "thread-codex", turnId: "turn-codex" },
      ],
      provider: "openai-codex",
      providerInstanceId: makeProviderInstanceId("openai-codex-default"),
      providerSessionId: "openai-codex:thread-codex:turn-codex",
    } as const

    expect(adapter.capabilities).toMatchObject({
      connectivity: "connectionful",
      supportsCancel: false,
      supportsInterrupt: false,
      supportsResume: false,
    })
    await expect(
      adapter.resumeSession({
        ...startContext("openai-codex"),
        previousSession: providerSession,
        resumePrompt: "Continue the task.",
      })
    ).rejects.toBeInstanceOf(ProviderOperationUnsupportedError)
    await expect(
      adapter.interruptSession({
        assignmentId: makeAssignmentId("assignment-provider"),
        providerSession,
        sessionId: makeSessionId("session-provider"),
      })
    ).rejects.toThrow(
      "openai-codex provider instance openai-codex-default does not support interrupt."
    )
  })

  it("allows Codex app-server command paths to be configured per Runtime environment", async () => {
    const adapter = createOpenAICodexProviderRuntime({
      command: process.execPath,
      commandArgs: ["-e", codexAppServerFixtureScript],
    })

    await adapter.startSession(startContext("openai-codex"))
  })

  it("uses the environment Codex app-server command when no command is configured", async () => {
    const previousCommand = process.env.STONEFORGE_CODEX_COMMAND
    process.env.STONEFORGE_CODEX_COMMAND = process.execPath

    try {
      const appServerClient = createNodeCodexAppServerClient({
        commandArgs: ["-e", codexAppServerFixtureScript],
      })

      await expect(
        appServerClient.runTurn({
          model: "gpt-5.5",
          prompt: "Summarize this repo.",
        })
      ).resolves.toMatchObject({
        finalSummary: "Codex App Server completed task.",
        status: "completed",
      })
    } finally {
      if (previousCommand === undefined) {
        delete process.env.STONEFORGE_CODEX_COMMAND
      } else {
        process.env.STONEFORGE_CODEX_COMMAND = previousCommand
      }
    }
  })
})

interface ClaudeAgentQueryInput {
  readonly options?: ClaudeAgentOptions
  readonly prompt: string
}

type TestClaudeAgentMessage =
  | {
      readonly result: string
      readonly session_id: string
      readonly subtype: "success"
      readonly type: "result"
    }
  | {
      readonly errors: readonly string[]
      readonly subtype: "error_during_execution"
      readonly type: "result"
    }
  | {
      readonly type: "system"
    }
  | {
      readonly event:
        | {
            readonly delta: {
              readonly text: string
              readonly type: "text_delta"
            }
            readonly type: "content_block_delta"
          }
        | {
            readonly type: "message_stop"
          }
      readonly type: "stream_event"
      readonly uuid: string
    }
  | {
      readonly message: {
        readonly content: readonly (
          | {
              readonly text: string
              readonly type: "text"
            }
          | {
              readonly type: "tool_use"
            }
        )[]
      }
      readonly type: "assistant"
      readonly uuid: string
    }

async function* claudeAgentMessages(
  messages: readonly TestClaudeAgentMessage[]
): AsyncGenerator<TestClaudeAgentMessage, void, void> {
  for (const message of messages) {
    yield message
  }
}

function startContext(
  provider: "claude-code" | "openai-codex"
): ProviderSessionStartContext {
  return {
    agent: {
      acceptableRuntimes: [{ id: makeRuntimeId("runtime"), priority: 10 }],
      concurrencyLimit: 1,
      id: makeAgentId("agent"),
      model: provider === "claude-code" ? "claude-sonnet-4-6" : "gpt-5.5",
      modelFamily: provider === "claude-code" ? "claude" : "gpt",
      provider,
      providerInstanceId:
        provider === "claude-code"
          ? makeProviderInstanceId("claude-code-default")
          : makeProviderInstanceId("openai-codex-default"),
    },
    assignmentId: makeAssignmentId("assignment-provider"),
    noCode: true,
    runtime: {
      capacity: 1,
      id: makeRuntimeId("runtime"),
      state: "healthy",
      type: "local-worktree",
      worktreePath: "/workspaces/stoneforge",
    },
    sessionId: makeSessionId("session-provider"),
    task: {
      id: makeTaskId("task-provider"),
      intent: "Confirm provider dispatch without repository edits.",
      title: "Verify no-code provider path",
    },
    workspace: {
      id: makeWorkspaceId("workspace-provider"),
      repository: {
        owner: "stoneforge-ai",
        provider: "github",
        repo: "stoneforge",
        targetBranch: "main",
      },
      state: "ready",
    },
  }
}
