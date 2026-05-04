import { describe, expect, it } from "vitest"

import {
  createClaudeCodeProviderRuntime,
  createOpenAICodexProviderRuntime,
  makeAgentId,
  makeAssignmentId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
} from "./index.js"
import type {
  ExecutionProviderInstance,
  ProviderKind,
  ProviderSessionStartContext,
} from "./index.js"

const describeProviderSmoke =
  process.env.STONEFORGE_PROVIDER_SMOKE === "1" ? describe : describe.skip
const CODEX_SMOKE_TIMEOUT_MS = 240_000

describeProviderSmoke("real provider smoke tests", () => {
  it("starts a real Claude Code no-code Session", async () => {
    const provider = createClaudeCodeProviderRuntime({
      id: "claude-code-smoke",
    })

    const result = await provider.startSession(
      startContext({
        model: process.env.STONEFORGE_CLAUDE_SMOKE_MODEL ?? "claude-sonnet-4-6",
        provider,
      })
    )

    expect(result.status).toBe("completed")
    expect(result.providerSession.provider).toBe("claude-code")
    expect(result.providerSession.providerSessionId.length).toBeGreaterThan(0)
    expect(result.terminalOutcome?.summary.length ?? 0).toBeGreaterThan(0)
  }, 120_000)

  it(
    "starts a real OpenAI Codex no-code Session",
    async () => {
      const provider = createOpenAICodexProviderRuntime({
        id: "openai-codex-smoke",
      })

      const result = await provider.startSession(
        startContext({
          model: process.env.STONEFORGE_CODEX_SMOKE_MODEL ?? "gpt-5.5",
          provider,
        })
      )

      expect(result.status).toBe("completed")
      expect(result.providerSession.provider).toBe("openai-codex")
      expect(result.providerSession.providerSessionId.length).toBeGreaterThan(0)
      expect(result.terminalOutcome?.summary.length ?? 0).toBeGreaterThan(0)
    },
    CODEX_SMOKE_TIMEOUT_MS
  )
})

function startContext(input: {
  readonly model: string
  readonly provider: ExecutionProviderInstance
}): ProviderSessionStartContext {
  return {
    agent: {
      acceptableRuntimes: [
        { id: makeRuntimeId("runtime-smoke"), priority: 10 },
      ],
      concurrencyLimit: 1,
      id: makeAgentId(`agent-${input.provider.provider}-smoke`),
      model: input.model,
      modelFamily: modelFamily(input.provider.provider),
      provider: input.provider.provider,
      providerInstanceId: input.provider.id,
    },
    assignmentId: makeAssignmentId(
      `assignment-${input.provider.provider}-smoke`
    ),
    noCode: true,
    runtime: {
      capacity: 1,
      id: makeRuntimeId("runtime-smoke"),
      state: "healthy",
      type: "local-worktree",
      worktreePath: process.cwd(),
    },
    sessionId: makeSessionId(`session-${input.provider.provider}-smoke`),
    task: {
      id: makeWorkspaceTaskId(input.provider.provider),
      intent:
        "Start the provider session and return a concise confirmation. Do not edit files.",
      title: "Provider smoke test",
    },
    workspace: {
      id: makeWorkspaceId("workspace-provider-smoke"),
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

function modelFamily(provider: ProviderKind): string {
  return provider === "claude-code" ? "claude" : "gpt"
}

function makeWorkspaceTaskId(provider: ProviderKind) {
  return makeTaskId(
    provider === "claude-code"
      ? "task-claude-code-smoke"
      : "task-openai-codex-smoke"
  )
}
