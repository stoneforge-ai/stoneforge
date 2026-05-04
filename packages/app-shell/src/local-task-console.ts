import {
  createClaudeCodeProviderRuntime,
  createExecutionControlPlane,
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
  AgentId,
  CreateExecutionControlPlaneInput,
  ExecutionControlPlane,
  ExecutionProviderInstance,
  ProviderKind,
  ProviderInstanceId,
  RuntimeId,
  SessionView,
  TaskView,
  WorkspaceExecutionSnapshot,
  WorkspaceId,
  WorkspaceView,
} from "@stoneforge/execution"

export type ControlPlaneConnectionMode =
  | LocalControlPlaneConnectionMode
  | "remote"
export type LocalControlPlaneConnectionMode = "local" | "managed-by-desktop"
export type LocalHumanPrincipal = "local-human"
export type LocalTaskProvider = ProviderKind
type AssignmentView = WorkspaceExecutionSnapshot["assignments"][number]
type IdSequence = NonNullable<CreateExecutionControlPlaneInput["idSequence"]>
type LineageView = WorkspaceExecutionSnapshot["lineage"][number]

export interface LocalTaskProviderConfig {
  readonly agentId?: AgentId
  readonly model: string
  readonly modelFamily: string
  readonly provider: LocalTaskProvider
  readonly providerInstanceId: ProviderInstanceId
}

export interface RunNoCodeTaskInput {
  readonly intent: string
  readonly provider: LocalTaskProvider
  readonly title: string
}

export interface LocalTaskWorkspaceConfig {
  readonly providers: readonly LocalTaskProviderConfig[]
  readonly runtimeId: RuntimeId
  readonly workspaceId: WorkspaceId
}

export interface CreateLocalTaskConsoleInput {
  readonly connectionMode?: LocalControlPlaneConnectionMode
  readonly idPrefix?: string
  readonly idSequence?: IdSequence
  readonly providerInstances?: readonly ExecutionProviderInstance[]
  readonly workspace?: LocalTaskWorkspaceConfig
  readonly workspaceLabel?: string
  readonly worktreePath?: string
}

export interface LocalTaskRunResult {
  readonly connectionMode: LocalControlPlaneConnectionMode
  readonly finalSummary: string
  readonly humanPrincipal: LocalHumanPrincipal
  readonly provider: LocalTaskProvider
  readonly providerSessionId: string
  readonly sessionId: string
  readonly status: "completed"
  readonly task: TaskView
}

export interface LocalTaskConsoleView {
  readonly assignments: readonly AssignmentView[]
  readonly connectionMode: LocalControlPlaneConnectionMode
  readonly humanPrincipal: LocalHumanPrincipal
  readonly lineage: readonly LineageView[]
  readonly sessions: readonly SessionView[]
  readonly tasks: readonly TaskView[]
  readonly workspace: WorkspaceView
}

export interface LocalTaskConsole {
  readonly readTaskConsole: () => Promise<LocalTaskConsoleView>
  readonly runNoCodeTask: (
    input: RunNoCodeTaskInput
  ) => Promise<LocalTaskRunResult>
}

export function createLocalTaskConsole(
  input: CreateLocalTaskConsoleInput = {}
): LocalTaskConsole {
  const profile = localTaskConsoleProfile(input)
  const workspace = input.workspace ?? defaultWorkspaceConfig(profile.idPrefix)
  const controlPlane = createExecutionControlPlane({
    idSequence: input.idSequence ?? createLocalIdSequence(profile.idPrefix),
    providerInstances:
      input.providerInstances ?? defaultProviderInstances(workspace, profile),
  })
  let configured = false

  return {
    readTaskConsole: async () => {
      await ensureConfigured(controlPlane, workspace, configured, profile)
      configured = true

      return taskConsoleView(
        controlPlane,
        workspace.workspaceId,
        profile.connectionMode
      )
    },
    runNoCodeTask: async (taskInput) => {
      await ensureConfigured(controlPlane, workspace, configured, profile)
      configured = true

      return runLocalNoCodeTask(
        controlPlane,
        workspace.workspaceId,
        taskInput,
        profile.connectionMode
      )
    },
  }
}

function localTaskConsoleProfile({
  connectionMode = "local",
  idPrefix = "local-web",
  workspaceLabel = "Local web Workspace",
  worktreePath = process.cwd(),
}: CreateLocalTaskConsoleInput) {
  return {
    connectionMode,
    idPrefix,
    workspaceLabel,
    worktreePath,
  } satisfies Required<
    Pick<
      CreateLocalTaskConsoleInput,
      "connectionMode" | "idPrefix" | "workspaceLabel" | "worktreePath"
    >
  >
}

function defaultProviderInstances(
  workspace: LocalTaskWorkspaceConfig,
  profile: ReturnType<typeof localTaskConsoleProfile>
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

async function runLocalNoCodeTask(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId,
  input: RunNoCodeTaskInput,
  connectionMode: LocalControlPlaneConnectionMode
): Promise<LocalTaskRunResult> {
  const task = await controlPlane.createNoCodeTask({
    intent: input.intent,
    requiredAgentTags: [`provider:${input.provider}`],
    title: input.title,
    workspaceId,
  })

  await controlPlane.activateTask({ taskId: task.id, workspaceId })
  await controlPlane.dispatchNextTask({ workspaceId })

  const snapshot = await controlPlane.readWorkspaceExecution({ workspaceId })
  const completedTask = snapshot.tasks[snapshot.tasks.length - 1]
  const session = snapshot.sessions[snapshot.sessions.length - 1]

  return {
    connectionMode,
    finalSummary: session.finalSummary,
    humanPrincipal: "local-human",
    provider: session.provider,
    providerSessionId: session.providerSessionId,
    sessionId: session.id,
    status: "completed",
    task: completedTask,
  }
}

async function taskConsoleView(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId,
  connectionMode: LocalControlPlaneConnectionMode
): Promise<LocalTaskConsoleView> {
  const snapshot = await controlPlane.readWorkspaceExecution({ workspaceId })

  return {
    assignments: snapshot.assignments,
    connectionMode,
    humanPrincipal: "local-human",
    lineage: snapshot.lineage,
    sessions: snapshot.sessions,
    tasks: snapshot.tasks,
    workspace: snapshot.workspace,
  }
}

async function ensureConfigured(
  controlPlane: ExecutionControlPlane,
  workspace: LocalTaskWorkspaceConfig,
  configured: boolean,
  profile: ReturnType<typeof localTaskConsoleProfile>
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

function defaultWorkspaceConfig(idPrefix: string): LocalTaskWorkspaceConfig {
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

function providerConfig(
  workspace: LocalTaskWorkspaceConfig,
  provider: LocalTaskProvider,
  profile: ReturnType<typeof localTaskConsoleProfile>
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

function createLocalIdSequence(idPrefix: string): IdSequence {
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
