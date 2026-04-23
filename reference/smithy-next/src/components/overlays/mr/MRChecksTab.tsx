import { useState } from 'react'
import { Check, X, Loader, Clock, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { MRCheck, MRCheckJob } from './mr-types'

interface MRChecksTabProps {
  checks: MRCheck[]
}

export function MRChecksTab({ checks }: MRChecksTabProps) {
  const required = checks.filter(c => c.required)
  const optional = checks.filter(c => !c.required)

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '8px 0' }}>
      {required.length > 0 && (
        <CheckSection title="Required" icon={<ShieldCheck size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />} checks={required} />
      )}
      {optional.length > 0 && (
        <CheckSection title="Optional" icon={<ShieldAlert size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />} checks={optional} />
      )}
      {checks.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          No checks configured
        </div>
      )}
    </div>
  )
}

function CheckSection({ title, icon, checks }: {
  title: string; icon: React.ReactNode; checks: MRCheck[]
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="mr-pad" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 24px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
        {icon} {title}
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '0 5px' }}>{checks.length}</span>
      </div>
      {checks.map(action => (
        <ActionRow key={action.id} action={action} />
      ))}
    </div>
  )
}

const statusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Loader, queued: Clock,
}
const statusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)', queued: 'var(--color-text-tertiary)',
}

// Top-level action row (expandable to show jobs)
function ActionRow({ action }: { action: MRCheck }) {
  const [expanded, setExpanded] = useState(true)
  const Icon = statusIcon[action.status]
  const color = statusColor[action.status]
  const hasJobs = action.jobs.length > 0

  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      {/* Action header */}
      <div
        className="mr-pad"
        onClick={hasJobs ? () => setExpanded(!expanded) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px',
          cursor: hasJobs ? 'pointer' : 'default',
          transition: `background var(--duration-fast)`,
        }}
        onMouseEnter={e => { if (hasJobs) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon size={14} strokeWidth={2} style={{ color, flexShrink: 0, ...(action.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{action.name}</span>
        {action.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{action.duration}</span>}
        {hasJobs && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{action.jobs.length} job{action.jobs.length > 1 ? 's' : ''}</span>
        )}
        {hasJobs && (
          expanded ? <ChevronDown size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronRight size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </div>

      {/* Jobs (nested) */}
      {expanded && hasJobs && (
        <div style={{ paddingBottom: 4 }}>
          {action.jobs.map(job => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

// Job row within an action (expandable to show logs)
function JobRow({ job }: { job: MRCheckJob }) {
  const [logsExpanded, setLogsExpanded] = useState(false)
  const jStatus = job.status === 'skipped' ? 'success' : job.status
  const JIcon = statusIcon[jStatus] || Clock
  const jColor = job.status === 'skipped' ? 'var(--color-text-tertiary)' : (statusColor[jStatus] || 'var(--color-text-tertiary)')

  return (
    <div>
      <div
        onClick={job.logs ? () => setLogsExpanded(!logsExpanded) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 24px 6px 48px',
          cursor: job.logs ? 'pointer' : 'default',
          transition: `background var(--duration-fast)`,
        }}
        onMouseEnter={e => { if (job.logs) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <JIcon size={12} strokeWidth={2} style={{ color: jColor, flexShrink: 0, ...(job.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <span style={{ flex: 1, fontSize: 12, color: job.status === 'skipped' ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>
          {job.name}
          {job.status === 'skipped' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-tertiary)' }}>Skipped</span>}
        </span>
        {job.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{job.duration}</span>}
        {job.logs && (
          logsExpanded ? <ChevronDown size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronRight size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </div>

      {/* Log output */}
      {logsExpanded && job.logs && (
        <div style={{
          margin: '0 24px 8px 48px', padding: 12, background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7,
          maxHeight: 300, overflow: 'auto',
        }}>
          {job.logs.map((line, i) => {
            let lineColor = 'var(--color-text-tertiary)'
            if (line.includes('❌') || line.includes('FAIL') || line.includes('failed') || line.includes('Error')) lineColor = 'var(--color-danger)'
            else if (line.includes('✅') || line.includes('✓') || line.includes('passed') || line.includes('succeeded')) lineColor = 'var(--color-success)'
            else if (line.startsWith('▶') || line.startsWith('⚡') || line.startsWith('📦') || line.startsWith('🔨') || line.startsWith('🧪')) lineColor = 'var(--color-text-secondary)'
            return line === '' ? (
              <div key={i} style={{ height: 12 }} />
            ) : (
              <div key={i} style={{ color: lineColor, minHeight: 18 }}>{line}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
