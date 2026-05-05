import { describe, expect, it } from "vitest"

import {
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId
} from "@stoneforge/execution"

import type { LocalTaskConsoleView } from "../../index.js"
import {
  sessionActivityItems,
  taskExecutionProjection
} from "./index.js"

describe("local Task console projections", () => {
  it("preserves repeated provider log and event activity", () => {
    const session = sessionView("session-one", "assignment-one", {
      events: [
        { kind: "provider.event", name: "codex.account/rateLimits/updated" },
        { kind: "provider.event", name: "codex.account/rateLimits/updated" }
      ],
      logs: [
        { level: "info", message: "provider retrying" },
        { level: "info", message: "provider retrying" }
      ]
    })

    expect(sessionActivityItems(session).map((item) => item.text)).toEqual([
      "event: codex.account/rateLimits/updated",
      "event: codex.account/rateLimits/updated",
      "info: provider retrying",
      "info: provider retrying"
    ])
  })

  it("does not duplicate provider logs mirrored in Session logs", () => {
    const session = sessionView("session-one", "assignment-one", {
      events: [
        {
          kind: "provider.log",
          level: "info",
          message: "provider retrying"
        }
      ],
      logs: [
        { level: "info", message: "provider retrying" },
        { level: "warn", message: "provider waiting" }
      ]
    })

    expect(sessionActivityItems(session).map((item) => item.text)).toEqual([
      "info: provider retrying",
      "warn: provider waiting"
    ])
  })

  it("coalesces transcript deltas only by provider item identity", () => {
    const session = sessionView("session-one", "assignment-one", {
      events: [
        {
          kind: "provider.transcript.delta",
          providerItemId: "first-provider-item",
          role: "assistant",
          text: "First assistant message"
        },
        {
          kind: "provider.transcript.delta",
          providerItemId: "second-provider-item",
          role: "assistant",
          text: "Second "
        },
        {
          kind: "provider.transcript.item.completed",
          providerItemId: "second-provider-item",
          role: "assistant",
          text: "Second assistant message"
        }
      ]
    })

    expect(sessionActivityItems(session).map((item) => item.text)).toEqual([
      "assistant: First assistant message",
      "assistant: Second assistant message"
    ])
  })

  it("projects all Task-owned Assignments, Sessions, and lineage", () => {
    const state = consoleView({
      assignments: [
        assignmentView("assignment-first", "task-one", "session-first"),
        assignmentView("assignment-repair", "task-one", "session-repair")
      ],
      lineage: [
        { event: "task.created", taskId: makeTaskId("task-one") },
        {
          event: "session.completed",
          providerInstanceId: makeProviderInstanceId("provider-first"),
          providerSessionId: "provider:first",
          sessionId: makeSessionId("session-first")
        },
        {
          event: "session.completed",
          providerInstanceId: makeProviderInstanceId("provider-repair"),
          providerSessionId: "provider:repair",
          sessionId: makeSessionId("session-repair")
        }
      ],
      sessions: [
        sessionView("session-first", "assignment-first"),
        sessionView("session-repair", "assignment-repair")
      ]
    })

    const projection = taskExecutionProjection(state, state.tasks[0])

    expect(projection.assignments.map((assignment) => assignment.id)).toEqual([
      makeAssignmentId("assignment-first"),
      makeAssignmentId("assignment-repair")
    ])
    expect(projection.sessions.map((session) => session.id)).toEqual([
      makeSessionId("session-first"),
      makeSessionId("session-repair")
    ])
    expect(projection.currentAssignment?.id).toBe(
      makeAssignmentId("assignment-repair")
    )
    expect(projection.currentSession?.id).toBe(makeSessionId("session-repair"))
    expect(projection.lineage.map((event) => event.event)).toEqual([
      "task.created",
      "session.completed",
      "session.completed"
    ])
  })
})

function consoleView(
  input: Partial<LocalTaskConsoleView> = {}
): LocalTaskConsoleView {
  return {
    assignments: [],
    connectionMode: "local",
    humanPrincipal: "local-human",
    lineage: [],
    sessions: [],
    tasks: [
      {
        id: makeTaskId("task-one"),
        requiredAgentTags: ["provider:claude-code"],
        state: "completed",
        title: "Task one"
      }
    ],
    workspace: {
      id: makeWorkspaceId("workspace-one"),
      repository: {
        owner: "stoneforge-ai",
        provider: "github",
        repo: "stoneforge",
        targetBranch: "main"
      },
      state: "ready"
    },
    ...input
  }
}

function assignmentView(
  id: string,
  taskId: string,
  sessionId: string
): LocalTaskConsoleView["assignments"][number] {
  return {
    agentId: makeAgentId(`agent-${id}`),
    id: makeAssignmentId(id),
    provider: "claude-code",
    providerInstanceId: makeProviderInstanceId(`provider-${id}`),
    runtimeId: makeRuntimeId("runtime-one"),
    sessionId: makeSessionId(sessionId),
    status: "completed",
    taskId: makeTaskId(taskId)
  }
}

function sessionView(
  id: string,
  assignmentId: string,
  input: Partial<LocalTaskConsoleView["sessions"][number]> = {}
): LocalTaskConsoleView["sessions"][number] {
  return {
    assignmentId: makeAssignmentId(assignmentId),
    connectivity: "connectionless",
    events: [],
    finalSummary: "",
    id: makeSessionId(id),
    logs: [],
    provider: "claude-code",
    providerInstanceId: makeProviderInstanceId(`provider-${assignmentId}`),
    providerSession: {
      external: [],
      provider: "claude-code",
      providerInstanceId: makeProviderInstanceId(`provider-${assignmentId}`),
      providerSessionId: `claude-code:${id}`
    },
    providerSessionId: `claude-code:${id}`,
    status: "completed",
    transcript: [],
    ...input
  }
}
