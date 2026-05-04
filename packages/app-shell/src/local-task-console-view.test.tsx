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
} from "./local-task-console-view.js"
import type { LocalTaskConsoleView } from "./local-task-console.js"

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
    expect(screen.getByText("managed-by-desktop")).toBeDefined()
    expect(screen.getByText("No Tasks have run.")).toBeDefined()
    expect(screen.getByText("Claude Code")).toBeDefined()
    expect(screen.getByText("OpenAI Codex")).toBeDefined()
  })

  it("renders latest Task progress and provider summary", () => {
    renderSharedConsole({
      draft: { ...draft, provider: "openai-codex" },
      errorMessage: "Provider failed.",
      state: completedConsoleState(),
      submitting: true,
    })

    expect(screen.getByText("Completed Task")).toBeDefined()
    expect(screen.getByText("openai-codex")).toBeDefined()
    expect(screen.getByText("Completed through shared UI.")).toBeDefined()
    expect(screen.getByText("assignment-shared-render")).toBeDefined()
    expect(screen.getByText("session-shared-render")).toBeDefined()
    expect(screen.getByText("task.completed")).toBeDefined()
    expect(screen.getByRole("alert").textContent).toBe("Provider failed.")
    expect(screen.getByRole("button").textContent).toContain("Running Task")
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
      { event: "task.completed", taskId: makeTaskId("task-shared-render") },
    ],
    sessions: [
      {
        assignmentId: makeAssignmentId("assignment-shared-render"),
        connectivity: "connectionful",
        events: [],
        finalSummary: "Completed through shared UI.",
        id: makeSessionId("session-shared-render"),
        logs: [],
        provider: "openai-codex",
        providerInstanceId: makeProviderInstanceId("codex-shared-render"),
        providerSession: {
          external: [
            {
              kind: "codex.thread",
              threadId: "shared-render-thread",
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
