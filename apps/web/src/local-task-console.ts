import {
  createClaudeCodeProviderRuntime,
  createExecutionControlPlane,
} from "@stoneforge/execution"
import type {
  AgentId,
  CreateExecutionControlPlaneInput,
  ExecutionControlPlane,
  ExecutionProviderInstance,
  ProviderInstanceId,
  RuntimeId,
  SessionView,
  TaskView,
  WorkspaceExecutionSnapshot,
  WorkspaceId,
  WorkspaceView,
} from "@stoneforge/execution"
import {
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
} from "@stoneforge/execution"

export type ControlPlaneConnectionMode = "local"
export type LocalHumanPrincipal = "local-human"
type AssignmentView = WorkspaceExecutionSnapshot["assignments"][number]
type IdSequence = NonNullable<CreateExecutionControlPlaneInput["idSequence"]>

export interface RunNoCodeTaskInput {
  readonly intent: string
  readonly title: string
}

export interface LocalWebWorkspaceConfig {
  readonly agentId: AgentId
  readonly providerInstanceId: ProviderInstanceId
  readonly runtimeId: RuntimeId
  readonly workspaceId: WorkspaceId
}

export interface CreateLocalTaskConsoleInput {
  readonly idSequence?: IdSequence
  readonly providerInstances?: readonly ExecutionProviderInstance[]
  readonly workspace?: LocalWebWorkspaceConfig
}

export interface LocalTaskRunResult {
  readonly connectionMode: ControlPlaneConnectionMode
  readonly finalSummary: string
  readonly humanPrincipal: LocalHumanPrincipal
  readonly providerSessionId: string
  readonly sessionId: string
  readonly status: "completed"
  readonly task: TaskView
}

export interface LocalTaskConsoleView {
  readonly assignments: readonly AssignmentView[]
  readonly connectionMode: ControlPlaneConnectionMode
  readonly humanPrincipal: LocalHumanPrincipal
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
  const workspace = input.workspace ?? defaultWorkspaceConfig()
  const controlPlane = createExecutionControlPlane({
    idSequence: input.idSequence ?? createLocalWebIdSequence(),
    providerInstances: input.providerInstances ?? [
      createClaudeCodeProviderRuntime({ id: workspace.providerInstanceId }),
    ],
  })
  let configured = false

  return {
    readTaskConsole: async () => {
      await ensureConfigured(controlPlane, workspace, configured)
      configured = true

      return taskConsoleView(controlPlane, workspace.workspaceId)
    },
    runNoCodeTask: async (taskInput) => {
      await ensureConfigured(controlPlane, workspace, configured)
      configured = true

      return runLocalNoCodeTask(controlPlane, workspace.workspaceId, taskInput)
    },
  }
}

async function runLocalNoCodeTask(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId,
  input: RunNoCodeTaskInput
): Promise<LocalTaskRunResult> {
  const task = await controlPlane.createNoCodeTask({
    intent: input.intent,
    requiredAgentTags: ["provider:claude-code"],
    title: input.title,
    workspaceId,
  })

  await controlPlane.activateTask({ taskId: task.id, workspaceId })
  await controlPlane.dispatchNextTask({ workspaceId })

  const snapshot = await controlPlane.readWorkspaceExecution({ workspaceId })
  const completedTask = snapshot.tasks[snapshot.tasks.length - 1]
  const session = snapshot.sessions[snapshot.sessions.length - 1]

  return {
    connectionMode: "local",
    finalSummary: session.finalSummary,
    humanPrincipal: "local-human",
    providerSessionId: session.providerSessionId,
    sessionId: session.id,
    status: "completed",
    task: completedTask,
  }
}

async function taskConsoleView(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId
): Promise<LocalTaskConsoleView> {
  const snapshot = await controlPlane.readWorkspaceExecution({ workspaceId })

  return {
    assignments: snapshot.assignments,
    connectionMode: "local",
    humanPrincipal: "local-human",
    sessions: snapshot.sessions,
    tasks: snapshot.tasks,
    workspace: snapshot.workspace,
  }
}

async function ensureConfigured(
  controlPlane: ExecutionControlPlane,
  workspace: LocalWebWorkspaceConfig,
  configured: boolean
) {
  if (configured) {
    return
  }

  await controlPlane.configureWorkspace({
    agents: [
      {
        acceptableRuntimes: [{ id: workspace.runtimeId, priority: 10 }],
        concurrencyLimit: 1,
        id: workspace.agentId,
        model: "claude-sonnet-4-6",
        modelFamily: "claude",
        provider: "claude-code",
        providerInstanceId: workspace.providerInstanceId,
      },
    ],
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
        worktreePath: process.cwd(),
      },
    ],
  })
}

function defaultWorkspaceConfig(): LocalWebWorkspaceConfig {
  return {
    agentId: makeAgentId("agent-claude-local-web"),
    providerInstanceId: makeProviderInstanceId("claude-local-web"),
    runtimeId: makeRuntimeId("runtime-local-web"),
    workspaceId: makeWorkspaceId("workspace-local-web"),
  }
}

function createLocalWebIdSequence(): IdSequence {
  let assignmentCounter = 0
  let sessionCounter = 0
  let taskCounter = 0

  return {
    nextAgentId: () => makeAgentId("agent-local-web-generated"),
    nextAssignmentId: () =>
      makeAssignmentId(
        `assignment-local-web-${String((assignmentCounter += 1))}`
      ),
    nextSessionId: () =>
      makeSessionId(`session-local-web-${String((sessionCounter += 1))}`),
    nextTaskId: () =>
      makeTaskId(`task-local-web-${String((taskCounter += 1))}`),
  }
}
