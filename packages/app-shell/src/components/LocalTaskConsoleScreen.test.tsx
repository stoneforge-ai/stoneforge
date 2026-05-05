// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
} from "@stoneforge/execution"

import {
  LocalTaskConsoleScreen,
  type LocalTaskConsoleDraft,
} from "./index.js"
import type { LocalTaskConsoleView } from "../lib/control-plane/index.js"

const draft = {
  intent: "Confirm shared rendering.",
  provider: "claude-code",
  title: "Shared Task",
} satisfies LocalTaskConsoleDraft

afterEach(() => {
  cleanup()
})

describe("shared local Task console view", () => {
  it("renders shell-specific copy through one React surface", () => {
    renderSharedConsole({ state: emptyConsoleState() })

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Shared Task Console"
    )
    expect(screen.getAllByText("managed-by-desktop").length).toBeGreaterThan(0)
    expect(screen.getByText("No Tasks have run.")).toBeDefined()
    expect(screen.getByText("Claude Code")).toBeDefined()
    expect(screen.getByText("OpenAI Codex")).toBeDefined()
    expect(screen.getByText("Create no-code Task")).toBeDefined()
    expect(screen.getByText("Execution inspector")).toBeDefined()
    expect(screen.queryByText("Execution lineage")).toBeNull()
  })

  it("renders Task status, Assignment, Session, and lineage details", () => {
    renderSharedConsole({
      draft: { ...draft, provider: "openai-codex" },
      errorMessage: "Provider failed.",
      state: completedConsoleState(),
      submitting: true,
    })

    expect(screen.getAllByText("Completed Task").length).toBeGreaterThan(0)
    expect(screen.getAllByText("openai-codex").length).toBeGreaterThan(0)
    expect(screen.getByText("Completed through shared UI.")).toBeDefined()
    expect(screen.getByText("Task status")).toBeDefined()
    expect(screen.getByText("Assignment ID")).toBeDefined()
    expect(screen.getAllByText("assignment-shared-render").length).toBeGreaterThan(0)
    expect(screen.getByText("Session ID")).toBeDefined()
    expect(screen.getAllByText("session-shared-render").length).toBeGreaterThan(0)
    expect(screen.getAllByText("task.completed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("assignment.started").length).toBeGreaterThan(0)
    expect(screen.getAllByText("session.completed").length).toBeGreaterThan(0)
    expect(screen.getByText("Claude session shared-render-claude")).toBeDefined()
    expect(screen.getByText("Codex turn shared-render-turn")).toBeDefined()
    expect(screen.getByText("Session activity")).toBeDefined()
    expect(
      screen.getByText("session completed: Completed through shared UI.")
    ).toBeDefined()
    expect(screen.getAllByLabelText("Lineage events").length).toBeGreaterThan(0)
    expect(screen.getByRole("alert").textContent).toBe("Provider failed.")
    expect(screen.getByRole("button", { name: /Running Task/ })).toBeDefined()
  })

  it("lets users select between existing Tasks", () => {
    renderSharedConsole({ state: multipleTaskConsoleState() })

    expect(screen.getByRole("heading", { name: "Newest Task" })).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Older Task/ }))

    expect(screen.getByRole("heading", { name: "Older Task" })).toBeDefined()
    expect(screen.getAllByText("assignment-older-render").length).toBeGreaterThan(0)
  })

  it("renders failed dispatch state and provider activity", () => {
    renderSharedConsole({ state: failedConsoleState() })

    expect(screen.getByRole("heading", { name: "Failed Task" })).toBeDefined()
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0)
    expect(screen.getByText("Provider launch failed.")).toBeDefined()
    expect(screen.getByText("event: provider-heartbeat")).toBeDefined()
    expect(screen.getByText("info: provider warmed up")).toBeDefined()
    expect(screen.getByText("turn started: turn-failed-render")).toBeDefined()
    expect(screen.getByText("assistant: partial output")).toBeDefined()
    expect(screen.getAllByText("assistant: partial output").length).toBe(1)
    expect(screen.queryByText("assistant: partial ")).toBeNull()
    expect(screen.queryByText("assistant: output")).toBeNull()
    expect(screen.queryByText("assistant: final item")).toBeNull()
    expect(screen.getByText("error: provider launch failed")).toBeDefined()
    expect(
      screen.getByText("session-failed-render failed: Provider launch failed.")
    ).toBeDefined()
  })

  it("does not reuse an open assistant activity row for another provider item", () => {
    renderSharedConsole({ state: overlappingAssistantItemsConsoleState() })

    expect(screen.getByText("assistant: First assistant message")).toBeDefined()
    expect(screen.getByText("assistant: Second assistant message")).toBeDefined()
    expect(screen.getAllByText("assistant: First assistant message").length).toBe(1)
    expect(screen.getAllByText("assistant: Second assistant message").length).toBe(1)
    expect(
      screen.queryByText("assistant: First assistant messageSecond ")
    ).toBeNull()
  })

  it("reports draft edits and submit actions to the shell owner", async () => {
    const changes: LocalTaskConsoleDraft[] = []
    let submitted = false

    renderSharedConsole({
      onDraftChange: (nextDraft) => changes.push(nextDraft),
      onSubmit: async () => {
        submitted = true
      },
      state: emptyConsoleState(),
    })

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Updated title" },
    })
    fireEvent.change(screen.getByLabelText("Intent"), {
      target: { value: "Updated intent" },
    })
    fireEvent.click(screen.getByLabelText("OpenAI Codex"))
    fireEvent.click(screen.getByRole("button"))

    expect(changes).toContainEqual({ ...draft, title: "Updated title" })
    expect(changes).toContainEqual({ ...draft, intent: "Updated intent" })
    expect(changes).toContainEqual({ ...draft, provider: "openai-codex" })
    await expect.poll(() => submitted).toBe(true)
  })
})

function renderSharedConsole({
  draft: renderedDraft = draft,
  errorMessage = null,
  onDraftChange = () => undefined,
  onSubmit = async () => undefined,
  state,
  submitting = false,
}: {
  readonly draft?: LocalTaskConsoleDraft
  readonly errorMessage?: string | null
  readonly onDraftChange?: (draft: LocalTaskConsoleDraft) => void
  readonly onSubmit?: () => Promise<void>
  readonly state: LocalTaskConsoleView
  readonly submitting?: boolean
}) {
  render(
    <LocalTaskConsoleScreen
      copy={{
        emptyState: "No Tasks have run.",
        fallbackError: "Task run failed.",
        heading: "Shared Task Console",
      }}
      draft={renderedDraft}
      errorMessage={errorMessage}
      onDraftChange={onDraftChange}
      onSubmit={onSubmit}
      state={state}
      submitting={submitting}
    />
  )
}

function multipleTaskConsoleState(): LocalTaskConsoleView {
  return {
    ...completedConsoleState(),
    assignments: [
      {
        agentId: makeAgentId("agent-older-render"),
        id: makeAssignmentId("assignment-older-render"),
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId("claude-older-render"),
        runtimeId: makeRuntimeId("runtime-shared-render"),
        sessionId: makeSessionId("session-older-render"),
        status: "completed",
        taskId: makeTaskId("task-older-render"),
      },
      ...completedConsoleState().assignments,
    ],
    lineage: [
      { event: "task.created", taskId: makeTaskId("task-older-render") },
      { event: "task.completed", taskId: makeTaskId("task-older-render") },
      ...completedConsoleState().lineage,
    ],
    sessions: [
      {
        assignmentId: makeAssignmentId("assignment-older-render"),
        connectivity: "connectionless",
        events: [],
        finalSummary: "Older Task completed.",
        id: makeSessionId("session-older-render"),
        logs: [],
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId("claude-older-render"),
        providerSession: {
          external: [],
          provider: "claude-code",
          providerInstanceId: makeProviderInstanceId("claude-older-render"),
          providerSessionId: "claude-code:older-render",
        },
        providerSessionId: "claude-code:older-render",
        status: "completed",
        transcript: [],
      },
      ...completedConsoleState().sessions,
    ],
    tasks: [
      {
        id: makeTaskId("task-older-render"),
        requiredAgentTags: ["provider:claude-code"],
        state: "completed",
        title: "Older Task",
      },
      {
        id: makeTaskId("task-shared-render"),
        requiredAgentTags: ["provider:openai-codex"],
        state: "completed",
        title: "Newest Task",
      },
    ],
  }
}

function failedConsoleState(): LocalTaskConsoleView {
  return {
    ...emptyConsoleState(),
    assignments: [
      {
        agentId: makeAgentId("agent-failed-render"),
        id: makeAssignmentId("assignment-failed-render"),
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId("claude-failed-render"),
        runtimeId: makeRuntimeId("runtime-shared-render"),
        sessionId: makeSessionId("session-failed-render"),
        status: "failed",
        taskId: makeTaskId("task-failed-render"),
      },
    ],
    lineage: [
      { event: "task.created", taskId: makeTaskId("task-failed-render") },
      { event: "task.activated", taskId: makeTaskId("task-failed-render") },
      {
        assignmentId: makeAssignmentId("assignment-failed-render"),
        event: "assignment.started",
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId("claude-failed-render"),
        taskId: makeTaskId("task-failed-render"),
      },
      {
        event: "session.failed",
        message: "Provider launch failed.",
        providerInstanceId: makeProviderInstanceId("claude-failed-render"),
        providerSessionId: "claude-code:pending:session-failed-render",
        sessionId: makeSessionId("session-failed-render"),
      },
    ],
    sessions: [
      {
        assignmentId: makeAssignmentId("assignment-failed-render"),
        connectivity: "connectionless",
        events: [
          {
            kind: "provider.session.started",
            providerSessionId: "claude-code:pending:session-failed-render",
          },
          {
            kind: "provider.event",
            name: "provider-heartbeat",
          },
          {
            kind: "provider.log",
            level: "info",
            message: "provider warmed up",
          },
          {
            kind: "provider.turn.started",
            turnId: "turn-failed-render",
          },
          {
            kind: "provider.transcript.delta",
            role: "assistant",
            text: "partial ",
          },
          {
            kind: "provider.transcript.delta",
            role: "assistant",
            text: "output",
          },
          {
            kind: "provider.transcript.item.completed",
            role: "assistant",
            text: "partial output",
          },
        ],
        finalSummary: "Provider launch failed.",
        id: makeSessionId("session-failed-render"),
        logs: [{ level: "error", message: "provider launch failed" }],
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId("claude-failed-render"),
        providerSession: {
          external: [],
          provider: "claude-code",
          providerInstanceId: makeProviderInstanceId("claude-failed-render"),
          providerSessionId: "claude-code:pending:session-failed-render",
        },
        providerSessionId: "claude-code:pending:session-failed-render",
        status: "failed",
        transcript: [{ role: "assistant", text: "partial output" }],
      },
    ],
    tasks: [
      {
        id: makeTaskId("task-failed-render"),
        requiredAgentTags: ["provider:claude-code"],
        state: "ready",
        title: "Failed Task",
      },
    ],
  }
}

function overlappingAssistantItemsConsoleState(): LocalTaskConsoleView {
  return {
    ...failedConsoleState(),
    sessions: [
      {
        ...failedConsoleState().sessions[0],
        events: [
          {
            kind: "provider.transcript.delta",
            providerItemId: "first-provider-item",
            role: "assistant",
            text: "First assistant message",
          },
          {
            kind: "provider.transcript.delta",
            providerItemId: "second-provider-item",
            role: "assistant",
            text: "Second ",
          },
          {
            kind: "provider.transcript.item.completed",
            providerItemId: "second-provider-item",
            role: "assistant",
            text: "Second assistant message",
          },
        ],
        transcript: [],
      },
    ],
  }
}

function emptyConsoleState(): LocalTaskConsoleView {
  return {
    assignments: [],
    connectionMode: "managed-by-desktop",
    humanPrincipal: "local-human",
    lineage: [],
    sessions: [],
    tasks: [],
    workspace: {
      id: makeWorkspaceId("workspace-shared-render"),
      repository: {
        owner: "stoneforge-ai",
        provider: "github",
        repo: "stoneforge",
        targetBranch: "main",
      },
      state: "ready",
    },
  }
}

function completedConsoleState(): LocalTaskConsoleView {
  return {
    ...emptyConsoleState(),
    assignments: [
      {
        agentId: makeAgentId("agent-shared-render"),
        id: makeAssignmentId("assignment-shared-render"),
        provider: "openai-codex",
        providerInstanceId: makeProviderInstanceId("codex-shared-render"),
        runtimeId: makeRuntimeId("runtime-shared-render"),
        sessionId: makeSessionId("session-shared-render"),
        status: "completed",
        taskId: makeTaskId("task-shared-render"),
      },
    ],
    lineage: [
      { event: "task.created", taskId: makeTaskId("task-shared-render") },
      { event: "task.activated", taskId: makeTaskId("task-shared-render") },
      {
        assignmentId: makeAssignmentId("assignment-shared-render"),
        event: "assignment.started",
        provider: "openai-codex",
        providerInstanceId: makeProviderInstanceId("codex-shared-render"),
        taskId: makeTaskId("task-shared-render"),
      },
      {
        event: "session.completed",
        providerInstanceId: makeProviderInstanceId("codex-shared-render"),
        providerSessionId: "openai-codex:shared-render",
        sessionId: makeSessionId("session-shared-render"),
      },
      { event: "task.completed", taskId: makeTaskId("task-shared-render") },
    ],
    sessions: [
      {
        assignmentId: makeAssignmentId("assignment-shared-render"),
        connectivity: "connectionful",
        events: [
          {
            kind: "provider.session.completed",
            status: "completed",
            summary: "Completed through shared UI.",
          },
        ],
        finalSummary: "Completed through shared UI.",
        id: makeSessionId("session-shared-render"),
        logs: [],
        provider: "openai-codex",
        providerInstanceId: makeProviderInstanceId("codex-shared-render"),
        providerSession: {
          external: [
            {
              kind: "claude.session",
              sessionId: "shared-render-claude",
            },
            {
              kind: "codex.thread",
              threadId: "shared-render-thread",
            },
            {
              kind: "codex.turn",
              threadId: "shared-render-thread",
              turnId: "shared-render-turn",
            },
          ],
          provider: "openai-codex",
          providerInstanceId: makeProviderInstanceId("codex-shared-render"),
          providerSessionId: "openai-codex:shared-render",
        },
        providerSessionId: "openai-codex:shared-render",
        status: "completed",
        transcript: [],
      },
    ],
    tasks: [
      {
        id: makeTaskId("task-shared-render"),
        requiredAgentTags: ["provider:openai-codex"],
        state: "completed",
        title: "Completed Task",
      },
    ],
  }
}
