import { Bot, Terminal } from 'lucide-react'
import type { WFStepRun } from './wf-types'
import { Tooltip } from '../../Tooltip'

interface WorkflowRunTimelineProps {
  steps: WFStepRun[]
  totalDuration: string
}

const statusBarColor: Record<string, string> = {
  success: 'var(--color-success)',
  failure: 'var(--color-danger)',
  running: 'var(--color-warning)',
  pending: 'var(--color-text-tertiary)',
  skipped: 'var(--color-text-tertiary)',
}

function parseDuration(d?: string): number {
  if (!d) return 0
  let total = 0
  const mMatch = d.match(/(\d+)m/)
  const sMatch = d.match(/(\d+)s/)
  if (mMatch) total += parseInt(mMatch[1]) * 60
  if (sMatch) total += parseInt(sMatch[1])
  return total || 1
}

const LABEL_W = 140
const ROW_H = 32
const BAR_H = 20
const BAR_GAP = 4

export function WorkflowRunTimeline({ steps, totalDuration }: WorkflowRunTimelineProps) {
  const totalSec = parseDuration(totalDuration) || 1

  // Build bar data with start/end percentages
  const bars = steps.filter(s => s.status !== 'skipped').map(step => {
    const startSec = parseDuration(step.startedAt)
    const durSec = parseDuration(step.duration)
    const startPct = (startSec / totalSec) * 100
    const widthPct = Math.max((durSec / totalSec) * 100, 1.5)
    return { step, startSec, durSec, startPct, widthPct: Math.min(widthPct, 100 - startPct) }
  })

  // Each step gets its own row — parallel steps appear on adjacent rows at the same horizontal position
  const numRows = bars.length || 1

  // Time markers
  const markers: { pct: number; label: string }[] = []
  const markerCount = 5
  for (let i = 0; i <= markerCount; i++) {
    const s = Math.round((i / markerCount) * totalSec)
    const pct = (s / totalSec) * 100
    const mins = Math.floor(s / 60)
    const secs = s % 60
    markers.push({
      pct,
      label: i === 0 ? 'Start' : i === markerCount ? 'End' : mins > 0 ? `${mins}m${secs > 0 ? ` ${secs}s` : ''}` : `${secs}s`,
    })
  }

  const chartHeight = numRows * (ROW_H + BAR_GAP)

  return (
    <div style={{ width: '100%' }}>
      {/* Top axis: labels + time markers */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 20 }}>
          {markers.map((m, i) => (
            <span key={i} style={{
              position: 'absolute',
              left: `${m.pct}%`,
              transform: i === markers.length - 1 ? 'translateX(-100%)' : i === 0 ? 'none' : 'translateX(-50%)',
              fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
            }}>
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div style={{ display: 'flex' }}>
        {/* Row labels — step name + type icon per row */}
        <div style={{ width: LABEL_W, flexShrink: 0, position: 'relative', height: chartHeight }}>
          {bars.map(({ step }, i) => {
            const isAgent = step.stepType === 'agent'
            const Icon = isAgent ? Bot : Terminal
            return (
              <Tooltip key={step.stepId} label={step.stepName} placement="right">
                <div style={{
                  position: 'absolute', top: i * (ROW_H + BAR_GAP),
                  height: ROW_H, display: 'flex', alignItems: 'center', gap: 5,
                  paddingRight: 8, width: LABEL_W, overflow: 'hidden',
                }}>
                  <Icon size={10} strokeWidth={1.5} style={{ color: isAgent ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {step.stepName}
                  </span>
                </div>
              </Tooltip>
            )
          })}
        </div>

        {/* Grid + bars */}
        <div style={{ flex: 1, position: 'relative', height: chartHeight, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {/* Vertical grid lines */}
          {markers.map((m, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${m.pct}%`, top: 0, bottom: 0,
              width: 1, background: 'var(--color-border-subtle)',
            }} />
          ))}

          {/* Bars */}
          {bars.map(({ step, startPct, widthPct }, i) => {
            const barColor = statusBarColor[step.status] || 'var(--color-text-tertiary)'
            const isAgent = step.stepType === 'agent'
            const top = i * (ROW_H + BAR_GAP) + (ROW_H - BAR_H) / 2
            const tooltipLabel = `${step.stepName} · ${step.duration || '—'}${step.startedAt ? ` · ${step.startedAt}` : ''}${step.endedAt ? ` → ${step.endedAt}` : ''}`

            return (
              <Tooltip key={step.stepId} label={tooltipLabel} placement="top" style={{
                position: 'absolute',
                left: `${startPct}%`,
                width: `${widthPct}%`,
                top,
                height: BAR_H,
              }}>
                <div
                  style={{
                    width: '100%', height: '100%',
                    borderRadius: 4,
                    background: barColor,
                    opacity: step.status === 'pending' ? 0.3 : 0.75,
                    border: isAgent ? '1px solid var(--color-primary)' : 'none',
                    display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden',
                    ...(step.status === 'running' ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
                  }}
                >
                  <span style={{ fontSize: 9, color: 'white', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                    {step.stepName}
                  </span>
                </div>
              </Tooltip>
            )
          })}
        </div>
      </div>
    </div>
  )
}
