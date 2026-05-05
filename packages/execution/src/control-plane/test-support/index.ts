import {
  completeProviderSession,
  defineProviderInstance,
  makeAgentId,
  makeProviderInstanceId,
  makeRuntimeId
} from "../../index.js"
import type {
  AgentConfig,
  ExecutionControlPlane,
  RuntimeConfig
} from "../../models.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionStartContext
} from "../../providers/models.js"
import type { ProviderInstanceId, WorkspaceId } from "../../base-models.js"

export function claudeProviderInstanceFixture(
  providerInstanceId: ProviderInstanceId = makeProviderInstanceId("claude-test")
): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity: "connectionless",
    id: providerInstanceId,
    provider: "claude-code",
    startSession: async (context) =>
      completedProviderResult(
        context,
        "claude-provider-session-test",
        `Completed ${context.task.title}`
      )
  })
}

export function completedProviderResult(
  context: ProviderSessionStartContext,
  providerSessionId: string,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerSession = {
    external: [],
    provider: context.agent.provider,
    providerInstanceId: context.agent.providerInstanceId,
    providerSessionId
  }

  return completeProviderSession({
    events: [
      { kind: "provider.session.started", providerSessionId },
      { kind: "provider.session.completed", status: "completed", summary }
    ],
    context,
    logs: [],
    providerSession,
    summary,
    transcript: [{ role: "assistant", text: summary }]
  })
}

export async function configureClaudeWorkspace(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId,
  overrides: {
    readonly agents?: readonly AgentConfig[]
    readonly runtimes?: readonly RuntimeConfig[]
  } = {}
) {
  const runtimeId = makeRuntimeId("runtime-test")

  await controlPlane.configureWorkspace({
    agents:
      overrides.agents ??
      [
        {
          acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
          concurrencyLimit: 1,
          id: makeAgentId("agent-claude-test"),
          model: "claude-sonnet-4-6",
          modelFamily: "claude",
          provider: "claude-code",
          providerInstanceId: makeProviderInstanceId("claude-test")
        }
      ],
    repository: {
      owner: "stoneforge-ai",
      provider: "github",
      repo: "stoneforge",
      targetBranch: "main"
    },
    runtimes:
      overrides.runtimes ??
      [{ capacity: 1, id: runtimeId, state: "healthy", type: "local-worktree" }],
    id: workspaceId
  })
}
