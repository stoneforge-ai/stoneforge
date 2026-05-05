import {
  completeProviderSession,
  defineProviderInstance,
} from "@stoneforge/execution"
import type {
  ExecutionProviderInstance,
  ProviderSessionStartContext,
} from "@stoneforge/execution"

export function deterministicDesktopProviders(): readonly ExecutionProviderInstance[] {
  return [
    defineProviderInstance({
      connectivity: "connectionless",
      id: "claude-desktop-local",
      provider: "claude-code",
      startSession: async (context) =>
        completeDeterministicSession(
          context,
          `Completed ${context.task.title} in deterministic desktop mode.`
        ),
    }),
    defineProviderInstance({
      connectivity: "connectionful",
      id: "codex-desktop-local",
      provider: "openai-codex",
      startSession: async (context) =>
        completeDeterministicSession(
          context,
          `Completed ${context.task.title} with deterministic Codex desktop mode.`
        ),
    }),
  ]
}

function completeDeterministicSession(
  context: ProviderSessionStartContext,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerSession = {
    external:
      context.agent.provider === "claude-code"
        ? [{ kind: "claude.session" as const, sessionId: "desktop-dev" }]
        : [
            {
              kind: "codex.thread" as const,
              threadId: "desktop-dev-thread",
            },
            {
              kind: "codex.turn" as const,
              threadId: "desktop-dev-thread",
              turnId: "desktop-dev-turn",
            },
          ],
    provider: context.agent.provider,
    providerInstanceId: context.agent.providerInstanceId,
    providerSessionId:
      context.agent.provider === "claude-code"
        ? "claude-code:desktop-dev"
        : "openai-codex:desktop-dev-thread:desktop-dev-turn",
  }

  return completeProviderSession({
    context,
    events: [
      {
        kind: "provider.session.started",
        providerSessionId: providerSession.providerSessionId,
      },
      {
        kind: "provider.session.completed",
        status: "completed",
        summary,
      },
    ],
    logs: [],
    providerSession,
    summary,
    transcript: [{ role: "assistant", text: summary }],
  })
}
