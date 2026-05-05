import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDot,
  GitBranch,
  History,
  Layers3,
  Link2,
  ListChecks
} from "lucide-react"
import type { ReactNode } from "react"

import type { LocalTaskConsoleView } from "../lib/control-plane/index.js"
import {
  sessionActivityItems,
  taskExecutionProjection
} from "../lib/projections/index.js"
import type { LocalTaskConsoleCopy } from "./types.js"

type Assignment = LocalTaskConsoleView["assignments"][number]
type LineageEvent = LocalTaskConsoleView["lineage"][number]
type Session = LocalTaskConsoleView["sessions"][number]
type Task = LocalTaskConsoleView["tasks"][number]

const labelClassName =
  "text-[11px] font-medium uppercase tracking-[0.03em] text-[var(--color-text-tertiary)]"
export function TaskWorkspace({
  copy,
  onSelectTask,
  selectedTask,
  state
}: {
  readonly copy: LocalTaskConsoleCopy
  readonly onSelectTask: (taskId: string) => void
  readonly selectedTask: Task | undefined
  readonly state: LocalTaskConsoleView
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-border-subtle)] px-4">
        <ListChecks size={14} strokeWidth={1.6} />
        <h2 className="text-[13px] font-semibold">Tasks</h2>
        <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-tertiary)]">
          {state.tasks.length}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.85fr)_minmax(320px,1fr)] overflow-hidden max-[1120px]:grid-cols-1">
        <TaskList
          copy={copy}
          onSelectTask={onSelectTask}
          selectedTask={selectedTask}
          state={state}
        />
        <TaskDetail selectedTask={selectedTask} state={state} />
      </div>
    </section>
  )
}

function TaskList({
  copy,
  onSelectTask,
  selectedTask,
  state
}: {
  readonly copy: LocalTaskConsoleCopy
  readonly onSelectTask: (taskId: string) => void
  readonly selectedTask: Task | undefined
  readonly state: LocalTaskConsoleView
}) {
  return (
    <div className="min-h-0 overflow-auto border-r border-[var(--color-border-subtle)] max-[1120px]:border-r-0 max-[1120px]:border-b">
      {state.tasks.length === 0 ? (
        <p className="p-4 text-[13px] text-[var(--color-text-tertiary)]">
          {copy.emptyState}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)]">
          {state.tasks.map((task) => (
            <TaskRow
              key={task.id}
              onSelectTask={onSelectTask}
              selected={task.id === selectedTask?.id}
              state={state}
              task={task}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskRow({
  onSelectTask,
  selected,
  state,
  task
}: {
  readonly onSelectTask: (taskId: string) => void
  readonly selected: boolean
  readonly state: LocalTaskConsoleView
  readonly task: Task
}) {
  const execution = taskExecutionProjection(state, task)
  const assignment = execution.currentAssignment
  const session = execution.currentSession

  return (
    <li
      className={`grid gap-2 px-4 py-3 ${
        selected ? "bg-[var(--color-primary-subtle)]" : "bg-[var(--color-bg)]"
      }`}
    >
      <button
        aria-pressed={selected}
        className="grid cursor-pointer gap-2 border-0 bg-transparent p-0 text-left"
        onClick={() => onSelectTask(task.id)}
        type="button"
      >
        <span className="flex items-start gap-2">
          <TaskStateIcon state={task.state} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                {task.id}
              </span>
              <StateBadge label="Task status" value={task.state} />
            </span>
            <span className="mt-1 block truncate text-[13px] font-medium text-[var(--color-text)]">
              {task.title}
            </span>
          </span>
        </span>
        <span className="grid gap-1 pl-5 text-[12px] text-[var(--color-text-secondary)]">
          <InlineFact
            label="Assignment"
            value={assignment?.id ?? "Not assigned yet"}
          />
          <InlineFact label="Session" value={session?.id ?? "No Session yet"} />
        </span>
      </button>
    </li>
  )
}

function TaskDetail({
  selectedTask,
  state
}: {
  readonly selectedTask: Task | undefined
  readonly state: LocalTaskConsoleView
}) {
  if (selectedTask === undefined) {
    return (
      <section
        aria-label="Task detail"
        className="min-h-0 overflow-auto p-6 text-[13px] text-[var(--color-text-tertiary)]"
      >
        Select or run a Task to inspect its execution details.
      </section>
    )
  }

  const execution = taskExecutionProjection(state, selectedTask)
  const assignment = execution.currentAssignment
  const session = execution.currentSession

  return (
    <section aria-label="Task detail" className="min-h-0 overflow-auto p-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
          {selectedTask.id}
        </span>
        <StateBadge label="Task status" value={selectedTask.state} />
      </div>
      <h2 className="mb-3 text-[18px] font-semibold leading-tight">
        {selectedTask.title}
      </h2>
      <PanelSection
        icon={<Activity size={14} />}
        title="Task status"
        value={selectedTask.state}
      >
        <DetailGrid>
          <DetailRow label="Required agents" value={selectedTask.requiredAgentTags.join(", ")} />
          <DetailRow label="Workspace" value={state.workspace.id} />
          <DetailRow label="Branch" value={state.workspace.repository.targetBranch} />
        </DetailGrid>
      </PanelSection>
      <PanelSection
        icon={<Layers3 size={14} />}
        title="Assignment"
        value={assignment?.status ?? "Not assigned"}
      >
        {assignment === undefined ? (
          <EmptyDetail text="No Assignment has been created for this Task." />
        ) : (
          <>
            <AssignmentDetail assignment={assignment} />
            <AssignmentHistory assignments={execution.assignments} />
          </>
        )}
      </PanelSection>
      <PanelSection
        icon={<Bot size={14} />}
        title="Session"
        value={session?.status ?? "No Session"}
      >
        {session === undefined ? (
          <EmptyDetail text="No provider Session has been started yet." />
        ) : (
          <>
            <SessionDetail session={session} />
            <SessionHistory sessions={execution.sessions} />
          </>
        )}
      </PanelSection>
      <PanelSection
        icon={<History size={14} />}
        title="Lineage"
        value={`${execution.lineage.length} events`}
      >
        <LineageList events={execution.lineage} />
      </PanelSection>
    </section>
  )
}

export function ExecutionInspector({
  selectedTask,
  state
}: {
  readonly selectedTask: Task | undefined
  readonly state: LocalTaskConsoleView
}) {
  const execution =
    selectedTask === undefined
      ? undefined
      : taskExecutionProjection(state, selectedTask)
  const assignment = execution?.currentAssignment
  const session = execution?.currentSession

  return (
    <aside className="min-h-0 overflow-auto border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] max-[1120px]:col-span-2 max-[1120px]:border-l-0 max-[1120px]:border-t">
      <div className="border-b border-[var(--color-border-subtle)] px-4 py-3">
        <h2 className="text-[13px] font-semibold">Execution inspector</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
          Local control-plane output visible to web and desktop renderers.
        </p>
      </div>
      <div className="grid gap-3 p-4">
        <InspectorCard
          icon={<Layers3 size={14} />}
          label="Assignment"
          primary={assignment?.id ?? "Waiting for dispatch"}
          secondary={assignment?.provider ?? "Provider will appear after run"}
          tone={assignment?.status === "completed" ? "success" : "muted"}
        />
        <InspectorCard
          icon={<Bot size={14} />}
          label="Session"
          primary={session?.id ?? "No Session"}
          secondary={session?.providerSessionId ?? "Provider Session not started"}
          tone={session?.status === "completed" ? "success" : "muted"}
        />
        <InspectorCard
          icon={<GitBranch size={14} />}
          label="Runtime"
          primary={assignment?.runtimeId ?? "Local worktree"}
          secondary={state.connectionMode}
          tone="local"
        />
      </div>
    </aside>
  )
}


function TaskStateIcon({ state }: { readonly state: Task["state"] }) {
  if (state === "completed") {
    return (
      <CheckCircle2
        className="mt-0.5 text-[var(--color-success)]"
        size={14}
        strokeWidth={1.7}
      />
    )
  }

  return (
    <CircleDot
      className="mt-0.5 text-[var(--color-primary)]"
      size={14}
      strokeWidth={1.7}
    />
  )
}

function StateBadge({
  label,
  value
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <span
      aria-label={label}
      className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${statusToneClass(value)}`}
    >
      {formatLabel(value)}
    </span>
  )
}

function InlineFact({
  label,
  value
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <span className="grid grid-cols-[82px_minmax(0,1fr)] gap-2">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="truncate font-mono text-[11px]">{value}</span>
    </span>
  )
}

function PanelSection({
  children,
  icon,
  title,
  value
}: {
  readonly children: ReactNode
  readonly icon: ReactNode
  readonly title: string
  readonly value: string
}) {
  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2">
        <span className="text-[var(--color-text-tertiary)]">{icon}</span>
        <h3 className="text-[12px] font-semibold">{title}</h3>
        <div className="flex-1" />
        <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
          {value}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function DetailGrid({ children }: { readonly children: ReactNode }) {
  return <dl className="grid gap-2 text-[12px]">{children}</dl>
}

function DetailRow({
  label,
  value
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
      <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-[11px] text-[var(--color-text-secondary)]">
        {value}
      </dd>
    </div>
  )
}

function AssignmentDetail({ assignment }: { readonly assignment: Assignment }) {
  return (
    <DetailGrid>
      <DetailRow label="Assignment ID" value={assignment.id} />
      <DetailRow label="Status" value={assignment.status} />
      <DetailRow label="Agent" value={assignment.agentId} />
      <DetailRow label="Runtime" value={assignment.runtimeId} />
      <DetailRow label="Provider" value={assignment.provider} />
      <DetailRow label="Provider instance" value={assignment.providerInstanceId} />
      <DetailRow label="Session" value={assignment.sessionId} />
    </DetailGrid>
  )
}

function AssignmentHistory({
  assignments
}: {
  readonly assignments: readonly Assignment[]
}) {
  if (assignments.length <= 1) {
    return null
  }

  return (
    <HistoryList
      label="Assignment history"
      rows={assignments.map((assignment) => ({
        id: assignment.id,
        meta: `${assignment.status} via ${assignment.provider}`
      }))}
    />
  )
}

function SessionDetail({ session }: { readonly session: Session }) {
  return (
    <div className="grid gap-3">
      <DetailGrid>
        <DetailRow label="Session ID" value={session.id} />
        <DetailRow label="Status" value={session.status} />
        <DetailRow label="Connectivity" value={session.connectivity} />
        <DetailRow label="Provider" value={session.provider} />
        <DetailRow label="Provider Session" value={session.providerSessionId} />
      </DetailGrid>
      <ExternalIdentityList session={session} />
      <blockquote className="border-l-2 border-[var(--color-primary)] pl-3 text-[12px] leading-5 text-[var(--color-text-secondary)]">
        {session.finalSummary || "Provider Session is running."}
      </blockquote>
      <SessionActivity session={session} />
    </div>
  )
}

function SessionHistory({ sessions }: { readonly sessions: readonly Session[] }) {
  if (sessions.length <= 1) {
    return null
  }

  return (
    <HistoryList
      label="Session history"
      rows={sessions.map((session) => ({
        id: session.id,
        meta: `${session.status} as ${session.providerSessionId}`
      }))}
    />
  )
}

function HistoryList({
  label,
  rows
}: {
  readonly label: string
  readonly rows: readonly { readonly id: string; readonly meta: string }[]
}) {
  return (
    <div className="grid gap-2">
      <h4 className={labelClassName}>{label}</h4>
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li
            className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-1"
            key={row.id}
          >
            <span className="block font-mono text-[11px] text-[var(--color-text-secondary)]">
              {row.id}
            </span>
            <span className="block text-[11px] text-[var(--color-text-tertiary)]">
              {row.meta}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SessionActivity({ session }: { readonly session: Session }) {
  const items = sessionActivityItems(session)

  return (
    <section className="grid gap-2">
      <h4 className={labelClassName}>Session activity</h4>
      {items.length === 0 ? (
        <EmptyDetail text="Waiting for provider events and logs." />
      ) : (
        <ol className="grid max-h-48 gap-1 overflow-auto rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-2">
          {items.map((item) => (
            <li
              className="font-mono text-[11px] leading-5 text-[var(--color-text-secondary)]"
              key={item.key}
            >
              {item.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function ExternalIdentityList({ session }: { readonly session: Session }) {
  if (session.providerSession.external.length === 0) {
    return null
  }

  return (
    <ul className="grid gap-1">
      {session.providerSession.external.map((identity) => (
        <li
          className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-secondary)]"
          key={externalIdentityKey(identity)}
        >
          <Link2 size={11} strokeWidth={1.6} />
          <span>{externalIdentityLabel(identity)}</span>
        </li>
      ))}
    </ul>
  )
}

function LineageList({
  events
}: {
  readonly events: readonly LineageEvent[]
}) {
  if (events.length === 0) {
    return <EmptyDetail text="No lineage events yet." />
  }

  return (
    <ol className="grid gap-2" aria-label="Lineage events">
      {events.map((event, index) => (
        <LineageItem
          event={event}
          index={index}
          key={`${event.event}-${index}`}
        />
      ))}
    </ol>
  )
}

function LineageItem({
  event,
  index
}: {
  readonly event: LineageEvent
  readonly index: number
}) {
  const details = lineageDetails(event)

  return (
    <li
      className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-2"
    >
      <span className="mt-1 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[12px] font-medium">{event.event}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-text-secondary)]">
          {details}
        </p>
      </div>
    </li>
  )
}

function InspectorCard({
  icon,
  label,
  primary,
  secondary,
  tone
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly primary: string
  readonly secondary: string
  readonly tone: "local" | "muted" | "success"
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={inspectorToneClass(tone)}>{icon}</span>
        <h3 className="text-[12px] font-semibold">{label}</h3>
      </div>
      <p className="break-all font-mono text-[11px] text-[var(--color-text)]">
        {primary}
      </p>
      <p className="mt-1 break-all text-[12px] text-[var(--color-text-tertiary)]">
        {secondary}
      </p>
    </section>
  )
}

function EmptyDetail({ text }: { readonly text: string }) {
  return <p className="text-[12px] text-[var(--color-text-tertiary)]">{text}</p>
}

function lineageDetails(event: LineageEvent): string {
  switch (event.event) {
    case "assignment.started":
      return `${event.taskId} assigned to ${event.provider} via ${event.providerInstanceId}`
    case "session.completed":
      return `${event.sessionId} completed as ${event.providerSessionId}`
    case "session.failed":
      return `${event.sessionId} failed: ${event.message}`
    case "task.activated":
    case "task.completed":
    case "task.created":
      return event.taskId
  }
}

function externalIdentityKey(
  identity: Session["providerSession"]["external"][number]
): string {
  switch (identity.kind) {
    case "claude.session":
      return `${identity.kind}:${identity.sessionId}`
    case "codex.thread":
      return `${identity.kind}:${identity.threadId}`
    case "codex.turn":
      return `${identity.kind}:${identity.threadId}:${identity.turnId}`
  }
}

function externalIdentityLabel(
  identity: Session["providerSession"]["external"][number]
): string {
  switch (identity.kind) {
    case "claude.session":
      return `Claude session ${identity.sessionId}`
    case "codex.thread":
      return `Codex thread ${identity.threadId}`
    case "codex.turn":
      return `Codex turn ${identity.turnId}`
  }
}

function inspectorToneClass(tone: "local" | "muted" | "success"): string {
  switch (tone) {
    case "local":
      return "text-[var(--color-connection-local)]"
    case "muted":
      return "text-[var(--color-text-tertiary)]"
    case "success":
      return "text-[var(--color-success)]"
  }
}

function statusToneClass(value: string): string {
  if (value === "completed") {
    return "bg-[var(--color-success-subtle)] text-[var(--color-success)]"
  }

  if (value === "failed") {
    return "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]"
  }

  return "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
}

function formatLabel(value: string): string {
  return value.replace(/[-_]/g, " ")
}
