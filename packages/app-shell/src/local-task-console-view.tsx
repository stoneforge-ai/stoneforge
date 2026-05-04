import { CheckCircle2, Clock3, Play, RefreshCw, Server } from "lucide-react"
import type { FormEvent, ReactNode } from "react"

import type {
  LocalTaskConsoleView,
  LocalTaskProvider,
} from "./local-task-console.js"

export interface LocalTaskConsoleDraft {
  readonly intent: string
  readonly provider: LocalTaskProvider
  readonly title: string
}

export interface LocalTaskConsoleCopy {
  readonly emptyState: string
  readonly fallbackError: string
  readonly heading: string
}

export interface LocalTaskConsoleViewProps {
  readonly copy: LocalTaskConsoleCopy
  readonly draft: LocalTaskConsoleDraft
  readonly errorMessage: string | null
  readonly onDraftChange: (draft: LocalTaskConsoleDraft) => void
  readonly onSubmit: () => Promise<void>
  readonly state: LocalTaskConsoleView
  readonly submitting: boolean
}

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
  readonly value: LocalTaskProvider
}[]

export function LocalTaskConsoleScreen({
  copy,
  draft,
  errorMessage,
  onDraftChange,
  onSubmit,
  state,
  submitting,
}: LocalTaskConsoleViewProps) {
  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit()
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
            {copy.heading}
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
              onChange={(event) =>
                onDraftChange({ ...draft, title: event.currentTarget.value })
              }
              required
              value={draft.title}
            />
          </label>
          <label className="grid gap-2">
            <span className={labelClassName}>Intent</span>
            <textarea
              className={`${fieldClassName} min-h-[150px] resize-y px-3.5 py-3`}
              name="intent"
              onChange={(event) =>
                onDraftChange({ ...draft, intent: event.currentTarget.value })
              }
              required
              rows={5}
              value={draft.intent}
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className={labelClassName}>Provider</legend>
            <div className="grid grid-cols-2 gap-2">
              {providerOptions.map((option) => (
                <label
                  className={`grid min-h-12 cursor-pointer place-items-center border border-[#17211c] px-3 text-center text-[0.82rem] font-extrabold uppercase ${
                    draft.provider === option.value
                      ? "bg-[#17211c] text-[#fffdf4]"
                      : "bg-[#e3dfd1] text-[#17211c]"
                  }`}
                  key={option.value}
                >
                  <input
                    checked={draft.provider === option.value}
                    className="sr-only"
                    name="provider"
                    onChange={() =>
                      onDraftChange({ ...draft, provider: option.value })
                    }
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

        <TaskSummary copy={copy} state={state} />
      </section>
    </main>
  )
}

function StatusPill({
  icon,
  text,
}: {
  readonly icon?: ReactNode
  readonly text: string
}) {
  return (
    <span className="flex min-h-[34px] items-center gap-[7px] border border-[#17211c] bg-[#e3dfd1] px-2.5 py-1.5 text-[0.82rem] font-extrabold uppercase">
      {icon}
      {text}
    </span>
  )
}

function TaskSummary({
  copy,
  state,
}: {
  readonly copy: LocalTaskConsoleCopy
  readonly state: LocalTaskConsoleView
}) {
  const latestAssignment = state.assignments.at(-1)
  const latestLineage = state.lineage.at(-1)
  const latestTask = state.tasks.at(-1)
  const latestSession = state.sessions.at(-1)

  return (
    <section className={`${panelClassName} p-6`} aria-label="Latest Task run">
      <div className="mb-[18px] flex items-center gap-[9px]">
        <Clock3 size={18} />
        <h2 className="m-0 text-xl">Execution</h2>
      </div>
      <dl className="mb-6 grid grid-cols-4 gap-3 max-[800px]:grid-cols-2">
        <Metric label="Tasks" value={state.tasks.length} />
        <Metric label="Assignments" value={state.assignments.length} />
        <Metric label="Sessions" value={state.sessions.length} />
        <Metric label="Lineage" value={state.lineage.length} />
      </dl>

      {latestTask === undefined ? (
        <p className="m-0 text-[#687264]">{copy.emptyState}</p>
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
          <dl className="grid gap-2 border border-[#17211c] bg-[#fffdf4] p-3 text-sm">
            {latestAssignment === undefined ? null : (
              <RunDetail label="Assignment" value={latestAssignment.id} />
            )}
            {latestSession === undefined ? null : (
              <RunDetail label="Session" value={latestSession.id} />
            )}
            {latestLineage === undefined ? null : (
              <RunDetail label="Lineage" value={latestLineage.event} />
            )}
          </dl>
          <blockquote className="m-0 border-l-4 border-[#d83c1f] pl-3.5 text-[#304039]">
            {latestSession?.finalSummary ?? "Session summary is not available."}
          </blockquote>
        </article>
      )}
    </section>
  )
}

function RunDetail({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="grid gap-0.5">
      <dt className={labelClassName}>{label}</dt>
      <dd className="m-0 break-all font-bold text-[#17211c]">{value}</dd>
    </div>
  )
}

function Metric({
  label,
  value,
}: {
  readonly label: string
  readonly value: number
}) {
  return (
    <div className="border border-[#17211c] bg-[#e3dfd1] p-3">
      <dt className={labelClassName}>{label}</dt>
      <dd className="mt-0.5 mb-0 text-[1.75rem] font-black">{value}</dd>
    </div>
  )
}
