import { Effect } from "effect"

import type {
  ReadWorkspaceExecutionInput,
  WorkspaceExecutionSnapshot
} from "../../models.js"
import type { ExecutionState } from "./state.js"
import {
  agentView,
  taskView,
  workspaceTaskIds
} from "./view.js"
import { makeWorkspaceId } from "../../ids.js"
import { requireWorkspace } from "./selection.js"
import { placementEffect } from "./placement-effect.js"

export function readWorkspaceExecutionProgram(
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
    const sessionIds = new Set(
      assignments.map((assignment) => assignment.sessionId)
    )
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
      case "session.failed":
        return sessionIds.has(event.sessionId)
    }
  })
}
