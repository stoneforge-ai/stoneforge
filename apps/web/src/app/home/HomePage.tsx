import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"

import {
  LocalTaskConsoleScreen,
  type LocalTaskConsoleDraft,
  type LocalTaskConsoleView
} from "@stoneforge/app-shell/local-task-console-view"

import { dispatchLocalTask, startLocalNoCodeTask } from "./server-functions.js"

const initialDraft = {
  intent:
    "Confirm the TanStack Start local web shell can run a no-code Task through the control plane.",
  provider: "claude-code",
  title: "Verify local web dispatch"
} satisfies LocalTaskConsoleDraft

export function HomePage({
  state
}: {
  readonly state: LocalTaskConsoleView
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<LocalTaskConsoleDraft>(initialDraft)
  const [dispatching, setDispatching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!dispatching) {
      return
    }

    const interval = window.setInterval(() => {
      void router.invalidate()
    }, 1000)

    return () => window.clearInterval(interval)
  }, [dispatching, router])

  async function submitTask() {
    setErrorMessage(null)
    setStarting(true)

    try {
      const result = await startLocalNoCodeTask({ data: draft })

      if (result.status === "failed") {
        setErrorMessage(result.message)
        return
      }

      await router.invalidate()
      setDispatching(true)
      void dispatchLocalTask()
        .then(async (dispatchResult) => {
          if (dispatchResult.status === "failed") {
            setErrorMessage(dispatchResult.message)
          }

          await router.invalidate()
        })
        .catch(() => {
          setErrorMessage(
            "Task dispatch failed before the local server returned provider details."
          )
        })
        .finally(() => setDispatching(false))
    } catch {
      setErrorMessage(
        "Task start failed before the local server returned Task details."
      )
    } finally {
      setStarting(false)
    }
  }

  return (
    <LocalTaskConsoleScreen
      copy={{
        emptyState: "No local Tasks have run in this server process.",
        fallbackError:
          "Task run failed before the local server returned provider details.",
        heading: "Local Task Console"
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
