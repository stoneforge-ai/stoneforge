import { Effect } from "effect"

import {
  createExecutionState,
  recordCompletedDispatch,
  type ExecutionState,
  type TaskRecord
} from "./internal/state.js"
import {
  agentView,
  taskView,
  workspaceState,
  workspaceTaskIds
} from "./internal/view.js"
import {
  nextReadyTask,
  requireEligibleAgent,
  requireProviderRuntime,
  requireRuntime,
  requireTask,
  requireWorkspace
} from "./internal/selection.js"
import { PlacementFailure, ProviderStartFailure } from "./internal/errors.js"
import {
  makeAgentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeTaskId,
  makeWorkspaceId
} from "./ids.js"
import type {
  ActivateTaskInput,
  ConfigureWorkspaceInput,
  CreateExecutionControlPlaneInput,
  CreateNoCodeTaskInput,
  DispatchNextTaskInput,
  DispatchNextTaskResult,
  ExecutionControlPlane,
  ReadWorkspaceExecutionInput,
  TaskView,
  WorkspaceExecutionSnapshot,
  WorkspaceView
} from "./models.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionStartContext
} from "./provider-models.js"

export function createExecutionControlPlane(
  input: CreateExecutionControlPlaneInput
): ExecutionControlPlane {
  return new InMemoryExecutionControlPlane(input)
}

class InMemoryExecutionControlPlane implements ExecutionControlPlane {
  private readonly state: ExecutionState

  constructor(input: CreateExecutionControlPlaneInput) {
    this.state = createExecutionState(input)
  }

  async configureWorkspace(
    input: ConfigureWorkspaceInput
  ): Promise<WorkspaceView> {
    return Effect.runPromise(configureWorkspaceProgram(this.state, input))
  }

  async createNoCodeTask(input: CreateNoCodeTaskInput): Promise<TaskView> {
    return Effect.runPromise(createNoCodeTaskProgram(this.state, input))
  }

  async activateTask(input: ActivateTaskInput): Promise<TaskView> {
    return Effect.runPromise(activateTaskProgram(this.state, input))
  }

  async dispatchNextTask(
    input: DispatchNextTaskInput
  ): Promise<DispatchNextTaskResult> {
    return Effect.runPromise(dispatchNextTaskProgram(this.state, input))
  }

  async readWorkspaceExecution(
    input: ReadWorkspaceExecutionInput
  ): Promise<WorkspaceExecutionSnapshot> {
    return Effect.runPromise(readWorkspaceExecutionProgram(this.state, input))
  }
}

function configureWorkspaceProgram(
  state: ExecutionState,
  input: ConfigureWorkspaceInput
) {
  return Effect.sync(() => {
    const workspaceId = makeWorkspaceId(input.id)
    const runtimes = input.runtimes.map((runtime) => ({
      ...runtime,
      id: makeRuntimeId(runtime.id)
    }))
    const agents = input.agents.map((agent) => ({
      ...agent,
      acceptableRuntimes: agent.acceptableRuntimes.map((runtime) => ({
        ...runtime,
        id: makeRuntimeId(runtime.id)
      })),
      id:
        agent.id === undefined
          ? state.idSequence.nextAgentId()
          : makeAgentId(agent.id),
      providerInstanceId: makeProviderInstanceId(agent.providerInstanceId)
    }))
    const workspace = {
      id: workspaceId,
      repository: input.repository,
      state: workspaceState(runtimes, agents)
    } satisfies WorkspaceView

    state.workspaces.set(workspaceId, {
      agents,
      runtimes,
      workspace
    })

    return workspace
  }).pipe(Effect.withSpan("workspace.configure"))
}

function createNoCodeTaskProgram(
  state: ExecutionState,
  input: CreateNoCodeTaskInput
) {
  return Effect.gen(function* () {
    const workspaceId = makeWorkspaceId(input.workspaceId)
    const taskId =
      input.id === undefined
        ? state.idSequence.nextTaskId()
        : makeTaskId(input.id)

    yield* placementEffect(() => requireWorkspace(state, workspaceId))

    const task = {
      id: taskId,
      intent: input.intent,
      requiredAgentTags: input.requiredAgentTags,
      state: "draft",
      title: input.title,
      workspaceId
    } satisfies TaskRecord

    state.tasks.set(taskId, task)
    state.lineage.push({ event: "task.created", taskId })

    return taskView(task)
  }).pipe(Effect.withSpan("task.create_no_code"))
}

function activateTaskProgram(state: ExecutionState, input: ActivateTaskInput) {
  return Effect.gen(function* () {
    const workspaceId = makeWorkspaceId(input.workspaceId)
    const taskId = makeTaskId(input.taskId)
    const task = yield* placementEffect(() =>
      requireTask(state, workspaceId, taskId)
    )
    const activated = { ...task, state: "ready" } satisfies typeof task

    state.tasks.set(taskId, activated)
    state.lineage.push({ event: "task.activated", taskId })

    return taskView(activated)
  }).pipe(Effect.withSpan("task.activate"))
}

function dispatchNextTaskProgram(
  state: ExecutionState,
  input: DispatchNextTaskInput
) {
  return Effect.gen(function* () {
    const workspaceId = makeWorkspaceId(input.workspaceId)
    const workspace = yield* placementEffect(() =>
      requireWorkspace(state, workspaceId)
    )
    const task = nextReadyTask(state, workspaceId)

    if (task === undefined) {
      return queuedDispatch()
    }

    const { agent, providerInstance, runtime } = yield* placementEffect(() =>
      selectDispatchPlacement(state, workspace, task)
    ).pipe(Effect.withSpan("scheduler.select_runtime"))
    const assignmentId = state.idSequence.nextAssignmentId()
    const sessionId = state.idSequence.nextSessionId()

    const result = yield* startProviderSession(providerInstance, {
      agent,
      assignmentId,
      noCode: true,
      runtime,
      sessionId,
      task: {
        id: task.id,
        intent: task.intent,
        title: task.title
      },
      workspace: workspace.workspace
    })

    state.tasks.set(task.id, { ...task, state: "in_progress" })
    state.lineage.push({
      assignmentId,
      event: "assignment.started",
      provider: agent.provider,
      providerInstanceId: agent.providerInstanceId,
      taskId: task.id
    })
    recordCompletedDispatch(state, {
      agent,
      assignmentId,
      providerInstance,
      providerResult: result,
      runtime,
      task
    })

    return {
      assignmentId,
      provider: agent.provider,
      providerInstanceId: agent.providerInstanceId,
      sessionId: result.sessionId,
      status: "completed",
      taskId: task.id
    } satisfies DispatchNextTaskResult
  }).pipe(Effect.withSpan("scheduler.dispatch_next_task"))
}

function selectDispatchPlacement(
  state: ExecutionState,
  workspace: ReturnType<typeof requireWorkspace>,
  task: TaskRecord
) {
  const agent = requireEligibleAgent(workspace.agents, task.requiredAgentTags)
  const runtime = requireRuntime(workspace.runtimes, agent.acceptableRuntimes)
  const providerInstance = requireProviderRuntime(state, agent.providerInstanceId)

  if (providerInstance.provider !== agent.provider) {
    throw new PlacementFailure({
      message: `Provider instance ${agent.providerInstanceId} is not a ${agent.provider} instance.`
    })
  }

  return {
    agent,
    providerInstance,
    runtime
  }
}

function startProviderSession(
  providerInstance: ExecutionProviderInstance,
  context: ProviderSessionStartContext
) {
  return Effect.tryPromise({
    try: () => providerInstance.startSession(context),
    catch: (cause) =>
      new ProviderStartFailure({
        message:
          cause instanceof Error
            ? cause.message
            : "Provider Session failed to start."
      })
  }).pipe(Effect.withSpan("assignment.start_session"))
}

function readWorkspaceExecutionProgram(
  state: ExecutionState,
  input: ReadWorkspaceExecutionInput
) {
  return Effect.gen(function* () {
    const workspaceId = makeWorkspaceId(input.workspaceId)
    const workspace = yield* placementEffect(() =>
      requireWorkspace(state, workspaceId)
    )
    const taskIds = workspaceTaskIds(state, workspaceId)
    const assignments = state.assignments.filter((assignment) =>
      taskIds.has(assignment.taskId)
    )
    const sessionIds = new Set(assignments.map((assignment) => assignment.sessionId))
    const sessions = state.sessions.filter((session) =>
      sessionIds.has(session.id)
    )

    return {
      agents: workspace.agents.map(agentView),
      assignments,
      lineage: workspaceLineage(state, taskIds, sessionIds),
      sessions,
      tasks: [...state.tasks.values()]
        .filter((task) => task.workspaceId === workspaceId)
        .map(taskView),
      workspace: workspace.workspace
    } satisfies WorkspaceExecutionSnapshot
  }).pipe(Effect.withSpan("workspace.read_execution"))
}

function queuedDispatch(): DispatchNextTaskResult {
  return { reason: "no_ready_task", status: "queued" }
}

function workspaceLineage(
  state: ExecutionState,
  taskIds: ReadonlySet<string>,
  sessionIds: ReadonlySet<string>
) {
  return state.lineage.filter((event) => {
    switch (event.event) {
      case "assignment.started":
      case "task.activated":
      case "task.completed":
      case "task.created":
        return taskIds.has(event.taskId)
      case "session.completed":
        return sessionIds.has(event.sessionId)
    }
  })
}

function placementEffect<A>(evaluate: () => A) {
  return Effect.try({
    try: evaluate,
    catch: (cause) =>
      new PlacementFailure({
        message: cause instanceof Error ? cause.message : "Placement failed."
      })
  })
}
