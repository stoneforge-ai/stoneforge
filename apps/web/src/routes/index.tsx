import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"

import {
  LocalTaskConsoleScreen,
  type LocalTaskConsoleDraft,
} from "@stoneforge/app-shell/local-task-console-view"

import {
  readLocalTaskConsole,
  runLocalNoCodeTask,
} from "../local-task-server.js"

export const Route = createFileRoute("/")({
  component: LocalWebConsole,
  loader: () => readLocalTaskConsole(),
})

const initialDraft = {
  intent:
    "Confirm the TanStack Start local web shell can run a no-code Task through the control plane.",
  provider: "claude-code",
  title: "Verify local web dispatch",
} satisfies LocalTaskConsoleDraft

function LocalWebConsole() {
  const router = useRouter()
  const state = Route.useLoaderData()
  const [draft, setDraft] = useState(initialDraft)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submitTask() {
    setErrorMessage(null)
    setSubmitting(true)

    try {
      const result = await runLocalNoCodeTask({ data: draft })

      if (result.status === "completed") {
        await router.invalidate()
        return
      }

      setErrorMessage(result.message)
    } catch {
      setErrorMessage(
        "Task run failed before the local server returned provider details."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <LocalTaskConsoleScreen
      copy={{
        emptyState: "No local Tasks have run in this server process.",
        fallbackError:
          "Task run failed before the local server returned provider details.",
        heading: "Local Task Console",
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
