import {
  completeProviderSession,
  defineProviderInstance
} from "@stoneforge/execution"
import type {
  ExecutionProviderInstance,
  ProviderSessionStartContext
} from "@stoneforge/execution"

export function deterministicLocalProviders(): readonly ExecutionProviderInstance[] {
  return [deterministicClaudeLocalProvider(), deterministicCodexLocalProvider()]
}

function deterministicClaudeLocalProvider(): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity: "connectionless",
    id: "claude-local-web",
    provider: "claude-code",
    startSession: async (context) =>
      completeDeterministicSession(
        context,
        `Completed ${context.task.title} in deterministic local web mode.`
      )
  })
}

function deterministicCodexLocalProvider(): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity: "connectionful",
    id: "codex-local-web",
    provider: "openai-codex",
    startSession: async (context) =>
      completeDeterministicSession(
        context,
        `Completed ${context.task.title} with deterministic Codex local web mode.`
      )
  })
}

function completeDeterministicSession(
  context: ProviderSessionStartContext,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerSession = {
    external:
      context.agent.provider === "claude-code"
        ? [{ kind: "claude.session" as const, sessionId: "local-web-dev" }]
        : [
            {
              kind: "codex.thread" as const,
              threadId: "local-web-dev-thread"
            },
            {
              kind: "codex.turn" as const,
              threadId: "local-web-dev-thread",
              turnId: "local-web-dev-turn"
            }
          ],
    provider: context.agent.provider,
    providerInstanceId: context.agent.providerInstanceId,
    providerSessionId:
      context.agent.provider === "claude-code"
        ? "claude-code:local-web-dev"
        : "openai-codex:local-web-dev-thread:local-web-dev-turn"
  }

  return completeProviderSession({
    context,
    events: [
      {
        kind: "provider.session.started",
        providerSessionId: providerSession.providerSessionId
      },
      {
        kind: "provider.session.completed",
        status: "completed",
        summary
      }
    ],
    logs: [],
    providerSession,
    summary,
    transcript: [{ role: "assistant", text: summary }]
  })
}
