import { useMemo, useState } from 'react'
import type { TimeRange, LayoutSize, ModelMetrics, Insight } from './metrics-types'
import { mockMetricsTasks, computeModelMetrics, computeInsights } from './metrics-mock-data'
import { HorizontalBar } from './MetricsCharts'
import { TrendingUp, AlertTriangle, Zap, ArrowUpDown, X } from 'lucide-react'

// ── Design tokens ──

const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 8 }
const colHeader: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }
const cell: React.CSSProperties = { fontSize: 13, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }

type SortField = 'tasksCompleted' | 'avgTaskDurationHours' | 'costPerCompletedTask' | 'costPerMergedMR' | 'ciPassRateFirstAttempt' | 'reopenRate' | 'handoffRate' | 'avgTestRunCount' | 'cacheHitRate'

interface MetricsProvidersTabProps {
  timeRange: TimeRange
  layout: LayoutSize
}

export function MetricsProvidersTab({ timeRange, layout }: MetricsProvidersTabProps) {
  const models = useMemo(() => computeModelMetrics(mockMetricsTasks, timeRange), [timeRange])
  const insights = useMemo(() => computeInsights(models), [models])
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('tasksCompleted')
  const [sortAsc, setSortAsc] = useState(false)

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const av = a[sortField] as number
      const bv = b[sortField] as number
      return sortAsc ? av - bv : bv - av
    })
  }, [models, sortField, sortAsc])

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(false) }
  }

  const maxRework = Math.max(...models.map(m => Math.max(m.avgTestRunCount, m.avgReconciliationCount, m.avgResumeCount)), 1)
  const maxCost = Math.max(...models.map(m => Math.max(m.costPerCompletedTask, m.costPerMergedMR)), 1)

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Insight Banners */}
      {insights.filter(i => !dismissedInsights.has(i.id)).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insights.filter(i => !dismissedInsights.has(i.id)).map(insight => (
            <InsightBanner key={insight.id} insight={insight} onDismiss={() => setDismissedInsights(prev => new Set(prev).add(insight.id))} />
          ))}
        </div>
      )}

      {/* Model Summary Cards: 3 → 2 → 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: layout === 'narrow' ? '1fr' : layout === 'medium' ? 'repeat(2, 1fr)' : `repeat(${Math.min(models.length, 3)}, 1fr)`, gap: 12 }}>
        {models.map(m => (
          <ModelCard key={m.model} model={m} />
        ))}
      </div>

      {/* Model Comparison Table */}
      <section>
        <div style={sectionLabel}>Model Comparison</div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 800 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(8, 1fr)', gap: 4, padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span style={colHeader}>Model</span>
              <SortableHeader label="Tasks" field="tasksCompleted" current={sortField} onSort={handleSort} />
              <SortableHeader label="Avg Time" field="avgTaskDurationHours" current={sortField} onSort={handleSort} />
              <SortableHeader label="$/Task" field="costPerCompletedTask" current={sortField} onSort={handleSort} />
              <SortableHeader label="$/MR" field="costPerMergedMR" current={sortField} onSort={handleSort} />
              <SortableHeader label="CI Pass %" field="ciPassRateFirstAttempt" current={sortField} onSort={handleSort} />
              <SortableHeader label="Re-open" field="reopenRate" current={sortField} onSort={handleSort} />
              <SortableHeader label="Handoff" field="handoffRate" current={sortField} onSort={handleSort} />
              <SortableHeader label="Cache %" field="cacheHitRate" current={sortField} onSort={handleSort} />
            </div>
            {sortedModels.map(m => (
              <div key={m.model} style={{ display: 'grid', gridTemplateColumns: '120px repeat(8, 1fr)', gap: 4, padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>{shortModel(m.model)}</span>
                <span style={cell}>{m.tasksCompleted}</span>
                <span style={cell}>{m.avgTaskDurationHours.toFixed(1)}h</span>
                <ColorCell value={m.costPerCompletedTask} format={v => `$${v.toFixed(2)}`} all={models} field="costPerCompletedTask" lowerBetter />
                <ColorCell value={m.costPerMergedMR} format={v => `$${v.toFixed(2)}`} all={models} field="costPerMergedMR" lowerBetter />
                <ColorCell value={m.ciPassRateFirstAttempt} format={v => `${(v * 100).toFixed(0)}%`} all={models} field="ciPassRateFirstAttempt" />
                <ColorCell value={m.reopenRate} format={v => `${(v * 100).toFixed(0)}%`} all={models} field="reopenRate" lowerBetter />
                <ColorCell value={m.handoffRate} format={v => `${(v * 100).toFixed(0)}%`} all={models} field="handoffRate" lowerBetter />
                <span style={cell}>{(m.cacheHitRate * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rework + Cost Efficiency: side by side on wide, stacked otherwise */}
      <div style={{ display: 'grid', gridTemplateColumns: layout === 'wide' ? '1fr 1fr' : '1fr', gap: 20 }}>
        <section>
          <div style={sectionLabel}>Rework Indicators by Model</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {models.map(m => (
              <div key={m.model} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{shortModel(m.model)}</span>
                <BarRow label="Test runs" value={m.avgTestRunCount} max={maxRework} rework />
                <BarRow label="Reconciliations" value={m.avgReconciliationCount} max={maxRework} rework />
                <BarRow label="Resumes" value={m.avgResumeCount} max={maxRework} rework />
              </div>
            ))}
          </div>
        </section>

        <section>
          <div style={sectionLabel}>Cost Efficiency by Model</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {models.map(m => (
              <div key={m.model} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{shortModel(m.model)}</span>
                <BarRow label="Per task" value={m.costPerCompletedTask} max={maxCost} color="var(--color-primary)" format={v => `$${v.toFixed(2)}`} />
                <BarRow label="Per MR" value={m.costPerMergedMR} max={maxCost} color="#8b5cf6" format={v => `$${v.toFixed(2)}`} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Helpers ──

function shortModel(model: string) {
  return model.replace('claude-', '').replace('-4-6', ' 4.6').replace('-4-5', ' 4.5')
}

function reworkColor(value: number, max: number) {
  const ratio = max > 0 ? value / max : 0
  if (ratio < 0.33) return 'var(--color-primary)'
  if (ratio < 0.66) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

// ── Sub-components ──

function BarRow({ label, value, max, color, rework, format }: {
  label: string; value: number; max: number; color?: string; rework?: boolean; format?: (v: number) => string
}) {
  const barColor = rework ? reworkColor(value, max) : color || 'var(--color-primary)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <HorizontalBar value={value} max={max} color={barColor} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>
          {format ? format(value) : value}
        </span>
      </div>
    </div>
  )
}

function InsightBanner({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const borderColor = insight.severity === 'warning' ? 'var(--color-warning)' : insight.severity === 'success' ? 'var(--color-success)' : 'var(--color-primary)'
  const Icon = insight.severity === 'warning' ? AlertTriangle : insight.severity === 'success' ? Zap : TrendingUp
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderLeft: `3px solid ${borderColor}`, background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <Icon size={12} style={{ color: borderColor, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{insight.message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
        <X size={12} style={{ color: 'var(--color-text-tertiary)' }} />
      </button>
    </div>
  )
}

function ModelCard({ model: m }: { model: ModelMetrics }) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{shortModel(m.model)}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>{m.provider}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <MiniStat label="Tasks" value={String(m.tasksCompleted)} />
        <MiniStat label="Avg Speed" value={`${m.avgTaskDurationHours.toFixed(1)}h`} />
        <MiniStat label="Cost/Task" value={`$${m.costPerCompletedTask.toFixed(2)}`} />
        <MiniStat label="CI Pass %" value={`${(m.ciPassRateFirstAttempt * 100).toFixed(0)}%`} />
        <MiniStat label="Re-open %" value={`${(m.reopenRate * 100).toFixed(0)}%`} />
        <MiniStat label="Cache Hit" value={`${(m.cacheHitRate * 100).toFixed(0)}%`} />
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function SortableHeader({ label, field, current, onSort }: {
  label: string; field: SortField; current: SortField; asc?: boolean; onSort: (f: SortField) => void
}) {
  const isActive = current === field
  return (
    <span onClick={() => onSort(field)}
      style={{ ...colHeader, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, userSelect: 'none', color: isActive ? 'var(--color-text-secondary)' : colHeader.color }}>
      {label}
      {isActive && <ArrowUpDown size={9} style={{ opacity: 0.6 }} />}
    </span>
  )
}

function ColorCell({ value, format, all, field, lowerBetter }: {
  value: number; format: (v: number) => string; all: ModelMetrics[]; field: keyof ModelMetrics; lowerBetter?: boolean
}) {
  const values = all.map(m => m[field] as number).filter(v => v > 0)
  if (values.length < 2) return <span style={cell}>{format(value)}</span>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const isBest = lowerBetter ? value <= min : value >= max
  const isWorst = lowerBetter ? value >= max : value <= min
  const color = isBest ? 'var(--color-success)' : isWorst ? 'var(--color-danger)' : 'var(--color-text)'
  return <span style={{ ...cell, color }}>{format(value)}</span>
}
