import { useMemo } from 'react'
import type { TimeRange, LayoutSize } from './metrics-types'
import {
  mockMetricsTasks, reopenRateSeries, ciPassRateSeries,
  computeAgentPerformance, filterSeries, computeTrend,
} from './metrics-mock-data'
import { Sparkline, AreaChart, HorizontalBar, TrendBadge } from './MetricsCharts'
import { ShieldCheck, RotateCcw, GitMerge, ArrowLeftRight } from 'lucide-react'

// ── Design tokens ──

const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 8 }
const colHeader: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }
const cell: React.CSSProperties = { fontSize: 13, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }

interface MetricsQualityTabProps {
  timeRange: TimeRange
  layout: LayoutSize
  onNavigateToTask?: (taskId: string) => void
}

export function MetricsQualityTab({ timeRange, layout, onNavigateToTask }: MetricsQualityTabProps) {
  const tasks = mockMetricsTasks
  const completedTasks = tasks.filter(t => t.status === 'done')
  const ciFirstPass = completedTasks.length > 0
    ? completedTasks.filter(t => t.ciPassOnFirstAttempt).length / completedTasks.length : 0
  const reopenRate = completedTasks.length > 0
    ? completedTasks.filter(t => t.events.some(e => e.type === 'reopened')).length / completedTasks.length : 0
  const mergeSuccessRate = tasks.filter(t => t.mergeStatus === 'merged').length /
    Math.max(tasks.filter(t => t.mergeStatus !== 'pending').length, 1)
  const avgHandoffs = tasks.length > 0
    ? tasks.reduce((s, t) => s + t.handoffHistory.length, 0) / tasks.length : 0

  const ciTrend = useMemo(() => computeTrend(ciPassRateSeries, timeRange), [timeRange])
  const reopenTrend = useMemo(() => computeTrend(reopenRateSeries, timeRange), [timeRange])

  const ciChartData = useMemo(() => {
    const s = filterSeries(ciPassRateSeries, timeRange)
    return { series: [{ data: s.map(p => p.value * 100), color: 'var(--color-success)', label: 'CI First-Pass Rate %' }], labels: s.map(p => p.date) }
  }, [timeRange])

  const reopenChartData = useMemo(() => {
    const s = filterSeries(reopenRateSeries, timeRange)
    return { series: [{ data: s.map(p => p.value * 100), color: 'var(--color-danger)', label: 'Re-open Rate %' }], labels: s.map(p => p.date) }
  }, [timeRange])

  const handoffDist = useMemo(() => {
    const dist = [0, 0, 0, 0]
    tasks.forEach(t => { const h = t.handoffHistory.length; dist[h >= 3 ? 3 : h]++ })
    return dist
  }, [])

  const agentPerf = useMemo(() => computeAgentPerformance(tasks, timeRange), [timeRange])
  const agentRework = useMemo(() => {
    return agentPerf.map(a => {
      const agentTasks = tasks.filter(t => t.assignee === a.agentName)
      const n = agentTasks.length || 1
      return {
        ...a,
        avgTestRuns: +(agentTasks.reduce((s, t) => s + t.testRunCount, 0) / n).toFixed(1),
        avgReconciliations: +(agentTasks.reduce((s, t) => s + t.reconciliationCount, 0) / n).toFixed(1),
        avgResumes: +(agentTasks.reduce((s, t) => s + t.resumeCount, 0) / n).toFixed(1),
        stewardRecoveries: agentTasks.reduce((s, t) => s + t.stewardRecoveryCount, 0),
      }
    })
  }, [agentPerf])

  const topRework = useMemo(() => {
    return [...tasks]
      .map(t => ({ ...t, reworkScore: t.handoffHistory.length * 3 + t.testRunCount + t.reconciliationCount + t.resumeCount }))
      .sort((a, b) => b.reworkScore - a.reworkScore)
      .slice(0, 8)
  }, [])

  const maxHandoff = Math.max(...handoffDist, 1)

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Quality KPIs: 4 → 2 at medium/narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: layout === 'wide' ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 12 }}>
        <QualityKPI icon={<ShieldCheck size={12} />} label="CI First-Pass Rate" value={`${(ciFirstPass * 100).toFixed(0)}%`} trend={ciTrend.delta} sparkData={filterSeries(ciPassRateSeries, timeRange).map(p => p.value)} color="var(--color-success)" />
        <QualityKPI icon={<RotateCcw size={12} />} label="Re-open Rate" value={`${(reopenRate * 100).toFixed(0)}%`} trend={reopenTrend.delta} inverted sparkData={filterSeries(reopenRateSeries, timeRange).map(p => p.value)} color="var(--color-danger)" />
        <QualityKPI icon={<GitMerge size={12} />} label="Merge Success Rate" value={`${(mergeSuccessRate * 100).toFixed(0)}%`} color="var(--color-primary)" sparkData={[]} />
        <QualityKPI icon={<ArrowLeftRight size={12} />} label="Avg Handoffs/Task" value={avgHandoffs.toFixed(2)} color="var(--color-warning)" sparkData={[]} />
      </div>

      {/* Trend Charts: side by side on wide, stacked otherwise */}
      <div style={{ display: 'grid', gridTemplateColumns: layout === 'wide' ? '1fr 1fr' : '1fr', gap: 20 }}>
        <section>
          <div style={sectionLabel}>CI First-Pass Rate</div>
          <AreaChart series={ciChartData.series} labels={ciChartData.labels} height={160} />
        </section>
        <section>
          <div style={sectionLabel}>Re-open Rate</div>
          <AreaChart series={reopenChartData.series} labels={reopenChartData.labels} height={160} />
        </section>
      </div>

      {/* Handoff Distribution */}
      <section>
        <div style={sectionLabel}>Handoff Distribution</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['0 handoffs', '1 handoff', '2 handoffs', '3+ handoffs'].map((label, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 32px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
              <HorizontalBar value={handoffDist[i]} max={maxHandoff}
                color={i === 0 ? 'var(--color-success)' : i === 1 ? 'var(--color-primary)' : i === 2 ? 'var(--color-warning)' : 'var(--color-danger)'} height={6} />
              <span style={{ ...cell, textAlign: 'right' }}>{handoffDist[i]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Rework by Agent: scrollable at narrow */}
      <section>
        <div style={sectionLabel}>Rework by Agent</div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: layout === 'narrow' ? 500 : undefined }}>
            {(() => {
              const colW = layout === 'medium' ? '60px' : '80px'
              const cols = `1fr ${colW} ${colW} ${colW} ${colW}`
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <span style={colHeader}>Agent</span>
                    <span style={colHeader}>Test Runs</span>
                    <span style={colHeader}>Reconcile</span>
                    <span style={colHeader}>Resumes</span>
                    <span style={colHeader}>Recoveries</span>
                  </div>
                  {agentRework.map(a => (
                    <div key={a.agentId} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={cell}>{a.agentName}</span>
                        <RoleBadge role={a.role} />
                      </div>
                      <ReworkCell value={a.avgTestRuns} threshold={2.5} />
                      <ReworkCell value={a.avgReconciliations} threshold={0.5} />
                      <ReworkCell value={a.avgResumes} threshold={1.0} />
                      <ReworkCell value={a.stewardRecoveries} threshold={1} />
                    </div>
                  ))}
                </>
              )
            })()}
          </div>
        </div>
      </section>

      {/* Top Rework Tasks */}
      <section>
        <div style={sectionLabel}>Top Rework Tasks</div>
        {topRework.map(t => (
          <div key={t.id}
            onClick={() => onNavigateToTask?.(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 44 }}>{t.id}</span>
            <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {t.events.some(e => e.type === 'reopened') && <Badge label="reopened" color="var(--color-danger)" />}
              {layout !== 'narrow' && t.testRunCount > 2 && <Badge label={`${t.testRunCount} CI runs`} color="var(--color-danger)" />}
              {layout !== 'narrow' && t.handoffHistory.length > 0 && <Badge label={`${t.handoffHistory.length} handoff${t.handoffHistory.length > 1 ? 's' : ''}`} color="var(--color-warning)" />}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

// ── Sub-components ──

function QualityKPI({ icon, label, value, trend, inverted, sparkData, color }: {
  icon: React.ReactNode; label: string; value: string; trend?: number; inverted?: boolean; sparkData: number[]; color: string
}) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{label}</span>
        </div>
        {trend !== undefined && <TrendBadge value={trend} inverted={inverted} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
        {sparkData.length > 1 && <Sparkline data={sparkData} color={color} fill width={56} height={20} />}
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const bg = role === 'director' ? 'rgba(139,92,246,0.12)' : role === 'steward' ? 'rgba(34,197,94,0.12)' : 'var(--color-primary-subtle)'
  const color = role === 'director' ? '#8b5cf6' : role === 'steward' ? 'var(--color-success)' : 'var(--color-primary)'
  return <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: bg, color }}>{role}</span>
}

function ReworkCell({ value, threshold }: { value: number; threshold: number }) {
  const isHigh = value > threshold
  return <span style={{ ...cell, color: isHigh ? 'var(--color-danger)' : cell.color, fontWeight: isHigh ? 600 : 400 }}>{value}</span>
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface)', color, whiteSpace: 'nowrap' }}>{label}</span>
}
