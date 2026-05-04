import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { CheckCircle2, Clock3, Play, RefreshCw, Server } from "lucide-react"

import {
  readLocalTaskConsole,
  runLocalNoCodeTask,
} from "../local-task-server.js"
import type {
  LocalTaskConsoleView,
  LocalWebProvider,
} from "../local-task-console.js"

const panelClassName =
  "border-2 border-[#17211c] bg-[rgba(250,248,240,0.92)] shadow-[8px_8px_0_#17211c] max-[800px]:shadow-[5px_5px_0_#17211c]"
const labelClassName = "text-[0.78rem] font-extrabold uppercase text-[#687264]"
const fieldClassName =
  "w-full rounded-none border border-[#17211c] bg-[#fffdf4] text-[#17211c] focus:outline-[3px] focus:outline-offset-2 focus:outline-[#d83c1f]"
const providerOptions = [
  { label: "Claude Code", value: "claude-code" },
  { label: "OpenAI Codex", value: "openai-codex" },
] satisfies readonly {
  readonly label: string
  readonly value: LocalWebProvider
}[]

export const Route = createFileRoute("/")({
  component: LocalWebConsole,
  loader: () => readLocalTaskConsole(),
})

function LocalWebConsole() {
  const router = useRouter()
  const state = Route.useLoaderData()
  const [title, setTitle] = useState("Verify local web dispatch")
  const [intent, setIntent] = useState(
    "Confirm the TanStack Start local web shell can run a no-code Task through the control plane."
  )
  const [provider, setProvider] = useState<LocalWebProvider>("claude-code")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSubmitting(true)

    try {
      const result = await runLocalNoCodeTask({
        data: { intent, provider, title },
      })

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
    <main className="mx-auto w-[min(1120px,calc(100vw_-_32px))] py-12 max-[800px]:w-[min(calc(100%_-_24px),620px)] max-[800px]:py-7">
      <section
        className="flex items-end justify-between gap-6 border-b-2 border-[#17211c] pb-6 max-[800px]:grid"
        aria-label="Workspace status"
      >
        <div>
          <p className="m-0 mb-1.5 text-[0.78rem] font-extrabold tracking-[0.08em] text-[#687264] uppercase">
            Stoneforge V2
          </p>
          <h1 className="m-0 text-[clamp(2.25rem,8vw,6.25rem)] leading-[0.88]">
            Local Task Console
          </h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2 max-[800px]:justify-start">
          <StatusPill icon={<Server size={16} />} text={state.connectionMode} />
          <StatusPill text={state.humanPrincipal} />
          <StatusPill text={state.workspace.state} />
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] gap-7 pt-8 max-[800px]:grid-cols-1">
        <form
          className={`${panelClassName} grid gap-[18px] p-6`}
          onSubmit={submitTask}
        >
          <label className="grid gap-2">
            <span className={labelClassName}>Task title</span>
            <input
              className={`${fieldClassName} min-h-12 px-3.5`}
              name="title"
              onChange={(event) => setTitle(event.currentTarget.value)}
              required
              value={title}
            />
          </label>
          <label className="grid gap-2">
            <span className={labelClassName}>Intent</span>
            <textarea
              className={`${fieldClassName} min-h-[150px] resize-y px-3.5 py-3`}
              name="intent"
              onChange={(event) => setIntent(event.currentTarget.value)}
              required
              rows={5}
              value={intent}
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className={labelClassName}>Provider</legend>
            <div className="grid grid-cols-2 gap-2">
              {providerOptions.map((option) => (
                <label
                  className={`grid min-h-12 cursor-pointer place-items-center border border-[#17211c] px-3 text-center text-[0.82rem] font-extrabold uppercase ${
                    provider === option.value
                      ? "bg-[#17211c] text-[#fffdf4]"
                      : "bg-[#e3dfd1] text-[#17211c]"
                  }`}
                  key={option.value}
                >
                  <input
                    checked={provider === option.value}
                    className="sr-only"
                    name="provider"
                    onChange={() => setProvider(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="flex min-h-12 cursor-pointer items-center justify-center gap-[9px] border-2 border-[#17211c] bg-[#d83c1f] font-black text-[#fffdf4] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#d83c1f] disabled:cursor-progress disabled:opacity-70"
            disabled={submitting}
            type="submit"
          >
            {submitting ? <RefreshCw size={17} /> : <Play size={17} />}
            {submitting ? "Running Task" : "Run No-Code Task"}
          </button>
          {errorMessage !== null ? (
            <p
              className="m-0 border border-[#d83c1f] bg-[#fff0ec] px-3 py-2.5 font-bold text-[#8d210f]"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </form>

        <TaskSummary state={state} />
      </section>
    </main>
  )
}

function StatusPill({
  icon,
  text,
}: {
  readonly icon?: React.ReactNode
  readonly text: string
}) {
  return (
    <span className="flex min-h-[34px] items-center gap-[7px] border border-[#17211c] bg-[#e3dfd1] px-2.5 py-1.5 text-[0.82rem] font-extrabold uppercase">
      {icon}
      {text}
    </span>
  )
}

function TaskSummary({ state }: { readonly state: LocalTaskConsoleView }) {
  const latestTask = state.tasks.at(-1)
  const latestSession = state.sessions.at(-1)

  return (
    <section className={`${panelClassName} p-6`} aria-label="Latest Task run">
      <div className="mb-[18px] flex items-center gap-[9px]">
        <Clock3 size={18} />
        <h2 className="m-0 text-xl">Execution</h2>
      </div>
      <dl className="mb-6 grid grid-cols-4 gap-3 max-[800px]:grid-cols-2">
        <div className="border border-[#17211c] bg-[#e3dfd1] p-3">
          <dt className={labelClassName}>Tasks</dt>
          <dd className="mt-0.5 mb-0 text-[1.75rem] font-black">
            {state.tasks.length}
          </dd>
        </div>
        <div className="border border-[#17211c] bg-[#e3dfd1] p-3">
          <dt className={labelClassName}>Assignments</dt>
          <dd className="mt-0.5 mb-0 text-[1.75rem] font-black">
            {state.assignments.length}
          </dd>
        </div>
        <div className="border border-[#17211c] bg-[#e3dfd1] p-3">
          <dt className={labelClassName}>Sessions</dt>
          <dd className="mt-0.5 mb-0 text-[1.75rem] font-black">
            {state.sessions.length}
          </dd>
        </div>
        <div className="border border-[#17211c] bg-[#e3dfd1] p-3">
          <dt className={labelClassName}>Lineage</dt>
          <dd className="mt-0.5 mb-0 text-[1.75rem] font-black">
            {state.lineage.length}
          </dd>
        </div>
      </dl>

      {latestTask === undefined ? (
        <p className="m-0 text-[#687264]">
          No local Tasks have run in this server process.
        </p>
      ) : (
        <article className="grid gap-3">
          <div className="flex items-center gap-[9px]">
            <CheckCircle2 size={18} />
            <h3 className="m-0 text-base">{latestTask.title}</h3>
          </div>
          <p className="m-0 w-fit bg-[#17211c] px-2 py-[5px] text-[0.78rem] font-extrabold text-[#fffdf4] uppercase">
            {latestTask.state}
          </p>
          {latestSession === undefined ? null : (
            <p className="m-0 w-fit border border-[#17211c] bg-[#e3dfd1] px-2 py-[5px] text-[0.78rem] font-extrabold text-[#17211c] uppercase">
              {latestSession.provider}
            </p>
          )}
          <blockquote className="m-0 border-l-4 border-[#d83c1f] pl-3.5 text-[#304039]">
            {latestSession?.finalSummary ?? "Session summary is not available."}
          </blockquote>
        </article>
      )}
    </section>
  )
}
