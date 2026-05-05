import {
  createClaudeCodeProviderRuntime,
  createOpenAICodexProviderRuntime,
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
} from "@stoneforge/execution"
import type {
  CreateExecutionControlPlaneInput,
  ExecutionControlPlane,
  ExecutionProviderInstance,
  AgentId,
  ProviderKind,
  ProviderInstanceId,
  RuntimeId,
  WorkspaceId,
} from "@stoneforge/execution"

type IdSequence = NonNullable<CreateExecutionControlPlaneInput["idSequence"]>

export type LocalControlPlaneConnectionMode = "local" | "managed-by-desktop"
export type LocalTaskProvider = ProviderKind

export interface LocalTaskProviderConfig {
  readonly agentId?: AgentId
  readonly model: string
  readonly modelFamily: string
  readonly provider: LocalTaskProvider
  readonly providerInstanceId: ProviderInstanceId
}

export interface LocalTaskWorkspaceConfig {
  readonly providers: readonly LocalTaskProviderConfig[]
  readonly runtimeId: RuntimeId
  readonly workspaceId: WorkspaceId
}

export interface LocalTaskConsoleProfileInput {
  readonly connectionMode?: LocalControlPlaneConnectionMode
  readonly idPrefix?: string
  readonly workspaceLabel?: string
  readonly worktreePath?: string
}

export type LocalTaskConsoleProfile = Required<
  Pick<
    LocalTaskConsoleProfileInput,
    "connectionMode" | "idPrefix" | "workspaceLabel" | "worktreePath"
  >
>

export function localTaskConsoleProfile({
  connectionMode = "local",
  idPrefix = "local-web",
  workspaceLabel = "Local web Workspace",
  worktreePath = process.cwd(),
}: LocalTaskConsoleProfileInput): LocalTaskConsoleProfile {
  return {
    connectionMode,
    idPrefix,
    workspaceLabel,
    worktreePath,
  }
}

export function defaultProviderInstances(
  workspace: LocalTaskWorkspaceConfig,
  profile: LocalTaskConsoleProfile
) {
  return [
    createClaudeCodeProviderRuntime({
      id: providerConfig(workspace, "claude-code", profile).providerInstanceId,
    }),
    createOpenAICodexProviderRuntime({
      id: providerConfig(workspace, "openai-codex", profile).providerInstanceId,
    }),
  ] satisfies readonly ExecutionProviderInstance[]
}

export async function ensureConfigured(
  controlPlane: ExecutionControlPlane,
  workspace: LocalTaskWorkspaceConfig,
  configured: boolean,
  profile: LocalTaskConsoleProfile
) {
  if (configured) {
    return
  }

  await controlPlane.configureWorkspace({
    agents: workspace.providers.map((provider) => ({
      acceptableRuntimes: [{ id: workspace.runtimeId, priority: 10 }],
      concurrencyLimit: 1,
      id: provider.agentId,
      model: provider.model,
      modelFamily: provider.modelFamily,
      provider: provider.provider,
      providerInstanceId: provider.providerInstanceId,
    })),
    id: workspace.workspaceId,
    repository: {
      owner: "stoneforge-ai",
      provider: "github",
      repo: "stoneforge",
      targetBranch: "main",
    },
    runtimes: [
      {
        capacity: 1,
        id: workspace.runtimeId,
        state: "healthy",
        type: "local-worktree",
        worktreePath: profile.worktreePath,
      },
    ],
  })
}

export function defaultWorkspaceConfig(
  idPrefix: string
): LocalTaskWorkspaceConfig {
  return {
    providers: [
      {
        model: "claude-sonnet-4-6",
        modelFamily: "claude",
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId(`claude-${idPrefix}`),
      },
      {
        model: "gpt-5.5",
        modelFamily: "gpt",
        provider: "openai-codex",
        providerInstanceId: makeProviderInstanceId(`codex-${idPrefix}`),
      },
    ],
    runtimeId: makeRuntimeId(`runtime-${idPrefix}`),
    workspaceId: makeWorkspaceId(`workspace-${idPrefix}`),
  }
}

export function createLocalIdSequence(idPrefix: string): IdSequence {
  let agentCounter = 0
  let assignmentCounter = 0
  let sessionCounter = 0
  let taskCounter = 0

  return {
    nextAgentId: () =>
      makeAgentId(`agent-${idPrefix}-${String((agentCounter += 1))}`),
    nextAssignmentId: () =>
      makeAssignmentId(
        `assignment-${idPrefix}-${String((assignmentCounter += 1))}`
      ),
    nextSessionId: () =>
      makeSessionId(`session-${idPrefix}-${String((sessionCounter += 1))}`),
    nextTaskId: () =>
      makeTaskId(`task-${idPrefix}-${String((taskCounter += 1))}`),
  }
}

function providerConfig(
  workspace: LocalTaskWorkspaceConfig,
  provider: LocalTaskProvider,
  profile: LocalTaskConsoleProfile
): LocalTaskProviderConfig {
  const config = workspace.providers.find(
    (candidate) => candidate.provider === provider
  )

  if (config === undefined) {
    throw new Error(
      `${profile.workspaceLabel} is missing a ${provider} Provider.`
    )
  }

  return config
}
