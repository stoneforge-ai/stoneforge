import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"

import {
  LocalTaskConsoleScreen,
  type LocalTaskConsoleDraft,
  type LocalTaskConsoleView,
} from "@stoneforge/app-shell/local-task-console-view"

import "./styles.css"

const initialDraft = {
  intent:
    "Confirm the Electron desktop shell can run a no-code Task through the local control plane.",
  provider: "claude-code",
  title: "Verify desktop local dispatch",
} satisfies LocalTaskConsoleDraft

const initialState = await window.stoneforgeDesktop.readTaskConsole()

createRoot(document.querySelector("#root") as HTMLElement).render(
  <StrictMode>
    <DesktopTaskConsole initialState={initialState} />
  </StrictMode>
)

function DesktopTaskConsole({
  initialState,
}: {
  readonly initialState: LocalTaskConsoleView
}) {
  const [state, setState] = useState(initialState)
  const [draft, setDraft] = useState(initialDraft)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submitTask() {
    setErrorMessage(null)
    setSubmitting(true)

    try {
      await window.stoneforgeDesktop.runNoCodeTask(draft)
      setState(await window.stoneforgeDesktop.readTaskConsole())
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Task run failed before the desktop bridge returned details."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <LocalTaskConsoleScreen
      copy={{
        emptyState: "No desktop Tasks have run in this app process.",
        fallbackError:
          "Task run failed before the desktop bridge returned details.",
        heading: "Desktop Task Console",
      }}
      draft={draft}
      errorMessage={errorMessage}
      onDraftChange={setDraft}
      onSubmit={submitTask}
      state={state}
      submitting={submitting}
    />
  )
}
