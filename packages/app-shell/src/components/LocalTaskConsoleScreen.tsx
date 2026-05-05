import {
  Bot,
  Play,
  RefreshCw,
  Server,
  TerminalSquare
} from "lucide-react"
import { useState } from "react"
import type { FormEvent, ReactNode } from "react"

import type {
  LocalTaskConsoleView,
  LocalTaskProvider
} from "../lib/control-plane/index.js"
import {
  ExecutionInspector,
  TaskWorkspace
} from "./LocalTaskConsoleExecutionView.js"
import type {
  LocalTaskConsoleCopy,
  LocalTaskConsoleDraft,
  LocalTaskConsoleViewProps
} from "./types.js"

const fieldClassName =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-border-focus)] focus:shadow-[var(--shadow-focus)]"
const labelClassName =
  "text-[11px] font-medium uppercase tracking-[0.03em] text-[var(--color-text-tertiary)]"
const providerOptions = [
  { label: "Claude Code", value: "claude-code" },
  { label: "OpenAI Codex", value: "openai-codex" }
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
  submitting
}: LocalTaskConsoleViewProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSelectedTaskId(null)
    await onSubmit()
  }

  const latestTask = state.tasks.at(-1)
  const selectedTask =
    state.tasks.find((task) => task.id === selectedTaskId) ?? latestTask

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <TopBar copy={copy} state={state} />
      <section className="grid min-h-0 flex-1 grid-cols-[320px_minmax(420px,1fr)_390px] overflow-hidden max-[1120px]:grid-cols-[300px_minmax(0,1fr)] max-[780px]:grid-cols-1 max-[780px]:grid-rows-[minmax(0,0.95fr)_minmax(0,1.25fr)_minmax(0,0.9fr)]">
        <TaskComposer
          draft={draft}
          errorMessage={errorMessage}
          onDraftChange={onDraftChange}
          onSubmit={submitTask}
          submitting={submitting}
        />
        <TaskWorkspace
          copy={copy}
          onSelectTask={setSelectedTaskId}
          selectedTask={selectedTask}
          state={state}
        />
        <ExecutionInspector selectedTask={selectedTask} state={state} />
      </section>
    </main>
  )
}

function TopBar({
  copy,
  state
}: {
  readonly copy: LocalTaskConsoleCopy
  readonly state: LocalTaskConsoleView
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4">
      <div className="flex min-w-0 items-center gap-2">
        <TerminalSquare
          aria-hidden="true"
          className="text-[var(--color-primary)]"
          size={16}
          strokeWidth={1.7}
        />
        <h1 className="truncate text-[13px] font-semibold">{copy.heading}</h1>
      </div>
      <div className="h-4 w-px bg-[var(--color-border)]" />
      <span className="truncate text-[12px] text-[var(--color-text-secondary)]">
        {state.workspace.repository.owner}/{state.workspace.repository.repo}
      </span>
      <div className="flex-1" />
      <StatusPill icon={<Server size={12} />} text={state.connectionMode} />
      <StatusPill text={state.workspace.state} />
      <StatusPill text={state.humanPrincipal} />
    </header>
  )
}

function TaskComposer({
  draft,
  errorMessage,
  onDraftChange,
  onSubmit,
  submitting
}: {
  readonly draft: LocalTaskConsoleDraft
  readonly errorMessage: string | null
  readonly onDraftChange: (draft: LocalTaskConsoleDraft) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  readonly submitting: boolean
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] max-[780px]:border-r-0 max-[780px]:border-b">
      <div className="border-b border-[var(--color-border-subtle)] px-4 py-3">
        <h2 className="text-[13px] font-semibold">Create no-code Task</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
          Local single-user run through the shared control-plane command surface.
        </p>
      </div>
      <form className="grid min-h-0 gap-4 overflow-auto p-4" onSubmit={onSubmit}>
        <label className="grid gap-1.5">
          <span className={labelClassName}>Task title</span>
          <input
            className={fieldClassName}
            name="title"
            onChange={(event) =>
              onDraftChange({ ...draft, title: event.currentTarget.value })
            }
            required
            value={draft.title}
          />
        </label>
        <label className="grid gap-1.5">
          <span className={labelClassName}>Intent</span>
          <textarea
            className={`${fieldClassName} min-h-[150px] resize-y`}
            name="intent"
            onChange={(event) =>
              onDraftChange({ ...draft, intent: event.currentTarget.value })
            }
            required
            rows={5}
            value={draft.intent}
          />
        </label>
        <fieldset className="grid gap-1.5">
          <legend className={labelClassName}>Provider</legend>
          <div className="grid gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-1">
            {providerOptions.map((option) => (
              <ProviderOption
                draft={draft}
                key={option.value}
                onDraftChange={onDraftChange}
                option={option}
              />
            ))}
          </div>
        </fieldset>
        <button
          className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border-0 bg-[var(--color-primary)] px-3 text-[12px] font-medium text-[var(--color-text-inverted)] transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-progress disabled:opacity-70"
          disabled={submitting}
          type="submit"
        >
          {submitting ? <RefreshCw size={13} /> : <Play size={13} />}
          {submitting ? "Running Task" : "Run no-code Task"}
        </button>
        {errorMessage !== null ? (
          <p
            className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[12px] font-medium text-[var(--color-danger)]"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </form>
    </aside>
  )
}

function ProviderOption({
  draft,
  onDraftChange,
  option
}: {
  readonly draft: LocalTaskConsoleDraft
  readonly onDraftChange: (draft: LocalTaskConsoleDraft) => void
  readonly option: (typeof providerOptions)[number]
}) {
  const selected = draft.provider === option.value

  return (
    <label
      className={`flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-[12px] font-medium transition-colors ${
        selected
          ? "bg-[var(--color-surface-active)] text-[var(--color-text)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      <input
        checked={selected}
        className="sr-only"
        name="provider"
        onChange={() => onDraftChange({ ...draft, provider: option.value })}
        type="radio"
        value={option.value}
      />
      <Bot size={13} strokeWidth={1.6} />
      {option.label}
    </label>
  )
}


function StatusPill({
  icon,
  text
}: {
  readonly icon?: ReactNode
  readonly text: string
}) {
  return (
    <span className="flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)]">
      {icon}
      {text}
    </span>
  )
}
