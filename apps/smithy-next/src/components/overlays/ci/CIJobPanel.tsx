import { useState } from 'react'
import { Check, X, Clock, Loader, Ban, SkipForward, ChevronDown, ChevronRight, Wrench, Server } from 'lucide-react'
import type { CIJob, CIStep, CIHandoffContext } from './ci-types'
import { CILogViewer } from './CILogViewer'

interface CIJobPanelProps {
  jobs: CIJob[]
  onHandoff?: (context: CIHandoffContext) => void
  highlightJobId?: string | null
}

const statusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Loader, queued: Clock, cancelled: Ban, skipped: SkipForward,
}
const statusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
  queued: 'var(--color-text-tertiary)', cancelled: 'var(--color-text-tertiary)', skipped: 'var(--color-text-tertiary)',
}

export function CIJobPanel({ jobs, onHandoff, highlightJobId }: CIJobPanelProps) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        Jobs
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '0 5px' }}>
          {jobs.length}
        </span>
      </div>
      <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
        {jobs.map((job, i) => (
          <JobRow
            key={job.id}
            job={job}
            isLast={i === jobs.length - 1}
            onHandoff={onHandoff}
            highlight={highlightJobId === job.id}
          />
        ))}
      </div>
    </div>
  )
}

function JobRow({ job, isLast, onHandoff, highlight }: {
  job: CIJob; isLast: boolean; onHandoff?: (ctx: CIHandoffContext) => void; highlight: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = statusIcon[job.status] || Clock
  const color = statusColor[job.status] || 'var(--color-text-tertiary)'
  const hasSteps = job.steps.length > 0

  const handleHandoff = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onHandoff) return

    // Build handoff context from failed steps
    const failedStep = job.steps.find(s => s.status === 'failure')
    const errorLogs = failedStep?.logs?.filter(l =>
      l.includes('FAIL') || l.includes('Error') || l.includes('❌') || l.includes('Expected') || l.includes('Received')
    ) || []
    const relatedFiles = job.annotations?.filter(a => a.file).map(a => a.file!) || []

    onHandoff({
      jobId: job.id,
      jobName: job.name,
      errorSummary: errorLogs[0] || `${job.name} failed`,
      failedStep: failedStep?.name,
      logExcerpt: errorLogs.slice(0, 6),
      relatedFiles,
    })
  }

  return (
    <div
      id={`ci-job-${job.id}`}
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--color-border-subtle)',
        background: highlight ? 'var(--color-surface-hover)' : undefined,
        transition: 'background 0.3s',
      }}
    >
      {/* Job header */}
      <div
        onClick={hasSteps ? () => setExpanded(!expanded) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          cursor: hasSteps ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasSteps) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon size={14} strokeWidth={2} style={{ color, flexShrink: 0, ...(job.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: job.status === 'skipped' ? 'var(--color-text-tertiary)' : 'var(--color-text)' }}>
          {job.name}
        </span>
        {job.runnerName && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', padding: '1px 6px', borderRadius: 'var(--radius-sm)' }}>
            <Server size={9} strokeWidth={1.5} /> {job.runnerName}
          </span>
        )}
        {job.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{job.duration}</span>}
        {hasSteps && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{job.steps.length} step{job.steps.length > 1 ? 's' : ''}</span>
        )}
        {job.status === 'failure' && onHandoff && (
          <button onClick={handleHandoff} style={handoffBtnStyle} title="Handoff to fix">
            <Wrench size={11} strokeWidth={1.5} /> Fix
          </button>
        )}
        {hasSteps && (
          expanded ? <ChevronDown size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronRight size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </div>

      {/* Steps */}
      {expanded && hasSteps && (
        <div style={{ paddingBottom: 4 }}>
          {job.steps.map(step => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  )
}

function StepRow({ step }: { step: CIStep }) {
  const [logsExpanded, setLogsExpanded] = useState(false)
  const Icon = statusIcon[step.status] || Clock
  const color = statusColor[step.status] || 'var(--color-text-tertiary)'
  const hasLogs = step.logs && step.logs.length > 0

  return (
    <div>
      <div
        onClick={hasLogs ? () => setLogsExpanded(!logsExpanded) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 40px',
          cursor: hasLogs ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasLogs) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon size={12} strokeWidth={2} style={{ color, flexShrink: 0, ...(step.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <span style={{ flex: 1, fontSize: 12, color: step.status === 'skipped' ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>
          {step.name}
        </span>
        {step.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{step.duration}</span>}
        {hasLogs && (
          logsExpanded ? <ChevronDown size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronRight size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </div>

      {/* Log viewer */}
      {logsExpanded && hasLogs && (
        <div style={{ margin: '4px 12px 8px 40px' }}>
          <CILogViewer logs={step.logs!} isRunning={step.status === 'running'} />
        </div>
      )}
    </div>
  )
}

const handoffBtnStyle: React.CSSProperties = {
  height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
  background: 'var(--color-danger-subtle)', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-danger)', cursor: 'pointer', fontSize: 11, fontWeight: 500, flexShrink: 0,
}
