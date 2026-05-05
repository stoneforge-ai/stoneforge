import { createExecutionControlPlane } from "@stoneforge/execution"
import type {
  CreateExecutionControlPlaneInput,
  ExecutionControlPlane,
  ExecutionProviderInstance,
  SessionView,
  TaskView,
  WorkspaceExecutionSnapshot,
  WorkspaceView,
  WorkspaceId,
} from "@stoneforge/execution"

import {
  createLocalIdSequence,
  defaultProviderInstances,
  defaultWorkspaceConfig,
  ensureConfigured,
  localTaskConsoleProfile,
  type LocalControlPlaneConnectionMode,
  type LocalTaskProvider,
  type LocalTaskProviderConfig,
  type LocalTaskWorkspaceConfig,
} from "./config.js"

export type {
  LocalControlPlaneConnectionMode,
  LocalTaskProvider,
  LocalTaskProviderConfig,
  LocalTaskWorkspaceConfig,
} from "./config.js"

export type ControlPlaneConnectionMode =
  | LocalControlPlaneConnectionMode
  | "remote"
export type LocalHumanPrincipal = "local-human"
type AssignmentView = WorkspaceExecutionSnapshot["assignments"][number]
type LineageView = WorkspaceExecutionSnapshot["lineage"][number]

export interface RunNoCodeTaskInput {
  readonly intent: string
  readonly provider: LocalTaskProvider
  readonly title: string
}

export interface CreateLocalTaskConsoleInput {
  readonly connectionMode?: LocalControlPlaneConnectionMode
  readonly idPrefix?: string
  readonly idSequence?: NonNullable<CreateExecutionControlPlaneInput["idSequence"]>
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

export interface LocalTaskStartResult {
  readonly connectionMode: LocalControlPlaneConnectionMode
  readonly humanPrincipal: LocalHumanPrincipal
  readonly status: "started"
  readonly task: TaskView
}

export type LocalTaskDispatchResult =
  | {
      readonly run: LocalTaskRunResult
      readonly status: "completed"
    }
  | {
      readonly reason: "no_ready_task"
      readonly status: "queued"
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
  readonly dispatchNextTask: () => Promise<LocalTaskDispatchResult>
  readonly readTaskConsole: () => Promise<LocalTaskConsoleView>
  readonly runNoCodeTask: (
    input: RunNoCodeTaskInput
  ) => Promise<LocalTaskRunResult>
  readonly startNoCodeTask: (
    input: RunNoCodeTaskInput
  ) => Promise<LocalTaskStartResult>
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
    dispatchNextTask: async () => {
      await ensureConfigured(controlPlane, workspace, configured, profile)
      configured = true

      return dispatchNextLocalTask(
        controlPlane,
        workspace.workspaceId,
        profile.connectionMode
      )
    },
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

      await startLocalNoCodeTask(
        controlPlane,
        workspace.workspaceId,
        taskInput,
        profile.connectionMode
      )
      const dispatch = await dispatchNextLocalTask(
        controlPlane,
        workspace.workspaceId,
        profile.connectionMode
      )

      if (dispatch.status === "queued") {
        throw new Error("No ready Task was available for local dispatch.")
      }

      return dispatch.run
    },
    startNoCodeTask: async (taskInput) => {
      await ensureConfigured(controlPlane, workspace, configured, profile)
      configured = true

      return startLocalNoCodeTask(
        controlPlane,
        workspace.workspaceId,
        taskInput,
        profile.connectionMode
      )
    },
  }
}

async function startLocalNoCodeTask(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId,
  input: RunNoCodeTaskInput,
  connectionMode: LocalControlPlaneConnectionMode
): Promise<LocalTaskStartResult> {
  const task = await controlPlane.createNoCodeTask({
    intent: input.intent,
    requiredAgentTags: [`provider:${input.provider}`],
    title: input.title,
    workspaceId,
  })

  const activatedTask = await controlPlane.activateTask({
    taskId: task.id,
    workspaceId,
  })

  return {
    connectionMode,
    humanPrincipal: "local-human",
    status: "started",
    task: activatedTask,
  }
}

async function dispatchNextLocalTask(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId,
  connectionMode: LocalControlPlaneConnectionMode
): Promise<LocalTaskDispatchResult> {
  const dispatch = await controlPlane.dispatchNextTask({ workspaceId })

  if (dispatch.status === "queued") {
    return dispatch
  }

  const snapshot = await controlPlane.readWorkspaceExecution({ workspaceId })
  const completedTask = requireTask(snapshot.tasks, dispatch.taskId)
  const session = requireSession(snapshot.sessions, dispatch.sessionId)

  return {
    run: {
      connectionMode,
      finalSummary: session.finalSummary,
      humanPrincipal: "local-human",
      provider: session.provider,
      providerSessionId: session.providerSessionId,
      sessionId: session.id,
      status: "completed",
      task: completedTask,
    },
    status: "completed",
  }
}

function requireTask(
  tasks: readonly TaskView[],
  taskId: TaskView["id"]
): TaskView {
  const task = tasks.find((candidate) => candidate.id === taskId)

  if (task === undefined) {
    throw new Error(`Local Task ${taskId} was not found after dispatch.`)
  }

  return task
}

function requireSession(
  sessions: readonly SessionView[],
  sessionId: SessionView["id"]
): SessionView {
  const session = sessions.find((candidate) => candidate.id === sessionId)

  if (session === undefined) {
    throw new Error(`Local Session ${sessionId} was not found after dispatch.`)
  }

  return session
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
