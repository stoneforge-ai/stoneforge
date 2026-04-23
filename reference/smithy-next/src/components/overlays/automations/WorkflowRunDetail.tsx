import { useState } from 'react'
import { Check, X, Loader, Clock, SkipForward, ChevronDown, ChevronRight, Bot, Terminal, RotateCcw, CircleDot, GitPullRequest, ExternalLink, Zap, Globe } from 'lucide-react'
import type { WFRun, WFStepRun } from './wf-types'
import { useTeamContext } from '../../../TeamContext'

interface WorkflowRunDetailProps {
  run: WFRun
  defaultExpanded?: boolean
  onNavigateToCI?: (runId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onOpenRun?: (run: WFRun) => void
}

const statusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Loader, pending: Clock, skipped: SkipForward,
}
const statusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
  pending: 'var(--color-text-tertiary)', skipped: 'var(--color-text-tertiary)',
}

const triggerLabels: Record<string, string> = {
  schedule: 'Scheduled', manual: 'Manual', event: 'Event', webhook: 'Webhook',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 6px',
  borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
}

export function WorkflowRunDetail({ run, defaultExpanded, onNavigateToCI, onNavigateToMR, onNavigateToTask, onOpenRun }: WorkflowRunDetailProps) {
  const { getUserById } = useTeamContext()
  const [expanded, setExpanded] = useState(defaultExpanded || false)

  const RunIcon = statusIcon[run.status] || Clock
  const color = statusColor[run.status] || 'var(--color-text-tertiary)'

  const completedSteps = run.steps.filter(s => s.status === 'success' || s.status === 'failure').length
  const totalSteps = run.steps.length

  // Resolve triggering user for audit attribution
  const triggerUser = run.triggeredByUserId ? getUserById(run.triggeredByUserId) : undefined

  return (
    <div style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)', overflow: 'hidden' }}>
      {/* Run header */}
      <div
        onClick={() => onOpenRun ? onOpenRun(run) : setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          cursor: 'pointer', transition: `all var(--duration-fast)`,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {!onOpenRun && (expanded
          ? <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          : <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        )}
        <RunIcon size={14} strokeWidth={2} style={{ color, flexShrink: 0, ...(run.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>#{run.runNumber}</span>
            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
              {triggerLabels[run.triggeredBy] || run.triggeredBy}
            </span>
            {/* Audit attribution: only manual runs show user */}
            {run.triggeredBy === 'manual' && triggerUser ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 600, flexShrink: 0,
                }}>
                  {triggerUser.avatar}
                </span>
                {triggerUser.name}
              </span>
            ) : run.triggeredBy === 'event' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                <Zap size={10} strokeWidth={1.5} />
              </span>
            ) : run.triggeredBy === 'webhook' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                <Globe size={10} strokeWidth={1.5} />
              </span>
            ) : null}
            {/* Cross-reference chips */}
            {run.linkedTaskId && (
              <button onClick={e => { e.stopPropagation(); onNavigateToTask?.(run.linkedTaskId!) }} style={chipStyle}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-accent)' }}>{run.linkedTaskId}</span>
                <ExternalLink size={9} strokeWidth={1.5} style={{ opacity: 0.5 }} />
              </button>
            )}
            {run.linkedMRId && (
              <button onClick={e => { e.stopPropagation(); onNavigateToMR?.(run.linkedMRId!) }} style={chipStyle}>
                <GitPullRequest size={10} strokeWidth={1.5} />
                <span style={{ fontFamily: 'var(--font-mono)' }}>{run.linkedMRId}</span>
              </button>
            )}
            {run.linkedCIRunIds && run.linkedCIRunIds.length > 0 && (
              <button onClick={e => { e.stopPropagation(); onNavigateToCI?.(run.linkedCIRunIds![0]) }} style={chipStyle}>
                <CircleDot size={10} strokeWidth={1.5} />
                <span>CI run</span>
              </button>
            )}
          </div>
        </div>

        {/* Step progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{ width: 40, height: 3, borderRadius: 1.5, background: 'var(--color-surface-active)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 1.5,
              width: `${totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0}%`,
              background: run.status === 'failure' ? 'var(--color-danger)' : 'var(--color-success)',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {completedSteps}/{totalSteps}
          </span>
        </div>

        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{run.startedAt}</span>
        {run.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{run.duration}</span>}
      </div>

      {/* Expanded: step details (only when not navigating to run page) */}
      {expanded && !onOpenRun && (
        <div style={{ padding: '0 12px 12px 36px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {run.error && (
            <div style={{
              fontSize: 12, color: 'var(--color-danger)', padding: '6px 10px', marginBottom: 4,
              background: 'var(--color-danger-subtle)', borderRadius: 'var(--radius-sm)', lineHeight: 1.5,
            }}>
              {run.error}
            </div>
          )}
          {run.steps.map(step => (
            <StepRunRow key={step.stepId} step={step} onNavigateToCI={onNavigateToCI} />
          ))}
        </div>
      )}
    </div>
  )
}

function StepRunRow({ step, onNavigateToCI }: { step: WFStepRun; onNavigateToCI?: (runId: string) => void }) {
  const [showOutput, setShowOutput] = useState(false)
  const Icon = statusIcon[step.status] || Clock
  const color = statusColor[step.status] || 'var(--color-text-tertiary)'
  const TypeIcon = step.stepType === 'agent' ? Bot : Terminal
  const hasOutput = !!(step.output || step.error)

  return (
    <div>
      <div
        onClick={() => hasOutput && setShowOutput(!showOutput)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          cursor: hasOutput ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasOutput) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon size={12} strokeWidth={2} style={{ color, flexShrink: 0 }} />
        <TypeIcon size={11} strokeWidth={1.5} style={{ color: step.stepType === 'agent' ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1 }}>{step.stepName}</span>
        {step.retryAttempt > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--color-warning)' }}>
            <RotateCcw size={9} strokeWidth={2} /> {step.retryAttempt}
          </span>
        )}
        {step.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{step.duration}</span>}
        {step.linkedCIRunId && (
          <button onClick={e => { e.stopPropagation(); onNavigateToCI?.(step.linkedCIRunId!) }} style={{ ...chipStyle, fontSize: 9 }}>
            <CircleDot size={9} strokeWidth={1.5} /> CI
          </button>
        )}
      </div>

      {showOutput && (step.output || step.error) && (
        <div style={{
          margin: '2px 0 4px 28px', padding: '6px 10px',
          background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
          fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
          color: step.error ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {step.error || step.output}
        </div>
      )}
    </div>
  )
}
