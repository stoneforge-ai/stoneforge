import { useEffect, useState } from "react"

import {
  LocalTaskConsoleScreen,
  type LocalTaskConsoleDraft,
  type LocalTaskConsoleView
} from "@stoneforge/app-shell/local-task-console-view"

const initialDraft = {
  intent:
    "Confirm the Electron desktop shell can run a no-code Task through the local control plane.",
  provider: "claude-code",
  title: "Verify desktop local dispatch"
} satisfies LocalTaskConsoleDraft

export function HomePage({
  initialState
}: {
  readonly initialState: LocalTaskConsoleView
}) {
  const [state, setState] = useState(initialState)
  const [draft, setDraft] = useState<LocalTaskConsoleDraft>(initialDraft)
  const [dispatching, setDispatching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!dispatching) {
      return
    }

    const interval = window.setInterval(() => {
      void refreshTaskConsole()
    }, 1000)

    return () => window.clearInterval(interval)
  }, [dispatching])

  async function refreshTaskConsole() {
    setState(await window.stoneforgeDesktop.readTaskConsole())
  }

  async function submitTask() {
    setErrorMessage(null)
    setStarting(true)

    try {
      await window.stoneforgeDesktop.startNoCodeTask(draft)
      await refreshTaskConsole()
      setDispatching(true)
      void window.stoneforgeDesktop
        .dispatchNextTask()
        .then(refreshTaskConsole)
        .catch((cause) => {
          setErrorMessage(
            cause instanceof Error
              ? cause.message
              : "Task dispatch failed before the desktop bridge returned details."
          )
        })
        .finally(() => setDispatching(false))
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Task start failed before the desktop bridge returned Task details."
      )
    } finally {
      setStarting(false)
    }
  }

  return (
    <LocalTaskConsoleScreen
      copy={{
        emptyState: "No desktop Tasks have run in this app process.",
        fallbackError:
          "Task run failed before the desktop bridge returned details.",
        heading: "Desktop Task Console"
      }}
      draft={draft}
      errorMessage={errorMessage}
      onDraftChange={setDraft}
      onSubmit={submitTask}
      state={state}
      submitting={starting || dispatching}
    />
  )
}
