import type { LocalTaskConsoleView } from "../control-plane/index.js"
export { sessionActivityItems } from "./session-activity.js"
export type { SessionActivityItem } from "./session-activity.js"

type Assignment = LocalTaskConsoleView["assignments"][number]
type LineageEvent = LocalTaskConsoleView["lineage"][number]
type Session = LocalTaskConsoleView["sessions"][number]
type Task = LocalTaskConsoleView["tasks"][number]

export interface TaskExecutionProjection {
  readonly assignments: readonly Assignment[]
  readonly currentAssignment?: Assignment
  readonly currentSession?: Session
  readonly lineage: readonly LineageEvent[]
  readonly sessions: readonly Session[]
}

export function taskExecutionProjection(
  state: LocalTaskConsoleView,
  task: Task
): TaskExecutionProjection {
  const assignments = assignmentsForTask(state.assignments, task)
  const sessions = sessionsForAssignments(state.sessions, assignments)

  return {
    assignments,
    currentAssignment: assignments.at(-1),
    currentSession: sessions.at(-1),
    lineage: lineageForTask(state.lineage, task, sessions),
    sessions
  }
}

function assignmentsForTask(
  assignments: readonly Assignment[],
  task: Task
): readonly Assignment[] {
  return assignments.filter((assignment) => assignment.taskId === task.id)
}

function sessionsForAssignments(
  sessions: readonly Session[],
  assignments: readonly Assignment[]
): readonly Session[] {
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id))

  return sessions.filter((session) => assignmentIds.has(session.assignmentId))
}

function lineageForTask(
  lineage: readonly LineageEvent[],
  task: Task,
  sessions: readonly Session[]
): readonly LineageEvent[] {
  return lineage.filter((event) => lineageBelongsToTask(event, task, sessions))
}

function lineageBelongsToTask(
  event: LineageEvent,
  task: Task,
  sessions: readonly Session[]
): boolean {
  if ("taskId" in event) {
    return event.taskId === task.id
  }

  return sessions.some((session) => session.id === event.sessionId)
}
