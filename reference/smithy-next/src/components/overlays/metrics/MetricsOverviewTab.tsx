import { useMemo } from 'react'
import type { TimeRange, LayoutSize } from './metrics-types'
import {
  mockUsageStats, mockActivityHeatmap, mockAgentTokenSplit,
  mockModelTokenUsage, mockCodeChurn, mockUsageInsights,
  tasksCompletedSeries, mrsMergedSeries, cycleTimeSeries, costSeries,
  filterSeries, computeTrend,
} from './metrics-mock-data'
import { Sparkline, AreaChart, TrendBadge, ActivityHeatmap } from './MetricsCharts'
import { CheckCircle2, GitMerge, Clock, DollarSign } from 'lucide-react'

const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 8 }

interface MetricsOverviewTabProps {
  timeRange: TimeRange
  layout: LayoutSize
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function MetricsOverviewTab({ timeRange, layout }: MetricsOverviewTabProps) {
  const tasksTrend = useMemo(() => computeTrend(tasksCompletedSeries, timeRange), [timeRange])
  const mrsTrend = useMemo(() => computeTrend(mrsMergedSeries, timeRange), [timeRange])
  const cycleTrend = useMemo(() => {
    const s = filterSeries(cycleTimeSeries, timeRange)
    const avg = s.length > 0 ? s.reduce((sum, p) => sum + p.value, 0) / s.length : 0
    const prevS = cycleTimeSeries.slice(-(timeRange === '7d' ? 14 : timeRange === '14d' ? 28 : 60), -(timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30))
    const prevAvg = prevS.length > 0 ? prevS.reduce((sum, p) => sum + p.value, 0) / prevS.length : avg
    const delta = prevAvg > 0 ? Math.round(((avg - prevAvg) / prevAvg) * 100) : 0
    return { current: +avg.toFixed(1), delta }
  }, [timeRange])
  const costTrend = useMemo(() => computeTrend(costSeries, timeRange), [timeRange])
  const throughputSeries = useMemo(() => {
    const ts = filterSeries(tasksCompletedSeries, timeRange)
    const mrs = filterSeries(mrsMergedSeries, timeRange)
    return {
      series: [
        { data: ts.map(p => p.value), color: 'var(--color-primary)', label: 'Tasks completed' },
        { data: mrs.map(p => p.value), color: 'var(--color-success)', label: 'MRs merged' },
      ],
      labels: ts.map(p => p.date),
    }
  }, [timeRange])

  const isNarrow = layout === 'narrow'
  const isMedium = layout === 'medium'

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI Strip: 4 → 2 at medium/narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: isNarrow || isMedium ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
        <KPICard icon={<CheckCircle2 size={12} />} label="Tasks Completed" value={String(tasksTrend.current)} trend={tasksTrend.delta} sparkData={filterSeries(tasksCompletedSeries, timeRange).map(p => p.value)} color="var(--color-primary)" />
        <KPICard icon={<GitMerge size={12} />} label="MRs Merged" value={String(mrsTrend.current)} trend={mrsTrend.delta} sparkData={filterSeries(mrsMergedSeries, timeRange).map(p => p.value)} color="var(--color-success)" />
        <KPICard icon={<Clock size={12} />} label="Avg Cycle Time" value={`${cycleTrend.current}h`} trend={cycleTrend.delta} inverted sparkData={filterSeries(cycleTimeSeries, timeRange).map(p => p.value)} color="var(--color-warning)" />
        <KPICard icon={<DollarSign size={12} />} label="Total Cost" value={`$${costTrend.current}`} subtitle={tasksTrend.current > 0 ? `$${(costTrend.current / tasksTrend.current).toFixed(2)}/task` : ''} trend={costTrend.delta} inverted sparkData={filterSeries(costSeries, timeRange).map(p => p.value)} color="#8b5cf6" />
      </div>

      {/* Usage stats + Activity heatmap: side-by-side on wide, stacked on medium/narrow */}
      {layout === 'wide' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'start' }}>
          <div>
            <div style={sectionLabel}>Usage</div>
            <StatRow label="Total tokens" value={formatTokens(mockUsageStats.totalTokens)} />
            <StatRow label="Estimated cost" value={`$${formatNumber(mockUsageStats.estimatedCost)}`} />
            <StatRow label="Sessions" value={formatNumber(mockUsageStats.totalSessions)} />
            <StatRow label="Tool calls" value={formatNumber(mockUsageStats.totalToolCalls)} />
          </div>
          <div>
            <div style={sectionLabel}>Activity</div>
            <ActivityHeatmap data={mockActivityHeatmap} />
          </div>
        </div>
      ) : (
        <>
          <div>
            <div style={sectionLabel}>Usage</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 20px' }}>
              <StatRow label="Total tokens" value={formatTokens(mockUsageStats.totalTokens)} />
              <StatRow label="Estimated cost" value={`$${formatNumber(mockUsageStats.estimatedCost)}`} />
              <StatRow label="Sessions" value={formatNumber(mockUsageStats.totalSessions)} />
              <StatRow label="Tool calls" value={formatNumber(mockUsageStats.totalToolCalls)} />
            </div>
          </div>
          <div>
            <div style={sectionLabel}>Activity</div>
            <div style={{ overflowX: 'auto', marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20 }}>
              <div style={{ minWidth: 540 }}>
                <ActivityHeatmap data={mockActivityHeatmap} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Throughput Chart */}
      <section>
        <div style={sectionLabel}>Throughput</div>
        <AreaChart series={throughputSeries.series} labels={throughputSeries.labels} height={100} />
      </section>

      {/* Agent split / Top models / Code churn: 3 → 1 at narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(3, 1fr)', gap: 20 }}>
        <div>
          <div style={sectionLabel}>Agent split</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mockAgentTokenSplit.map(a => (
              <DotRow key={a.role} color={a.color} label={a.label} value={formatTokens(a.tokens)} />
            ))}
          </div>
        </div>
        <div>
          <div style={sectionLabel}>Top models</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mockModelTokenUsage.map(m => (
              <DotRow key={m.model} color={m.color} label={m.model} value={formatTokens(m.tokens)} />
            ))}
          </div>
        </div>
        <div>
          <div style={sectionLabel}>Code churn</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <DotRow color="var(--color-success)" label="Lines added" value={formatNumber(mockCodeChurn.linesAdded)} />
            <DotRow color="var(--color-danger)" label="Lines removed" value={formatNumber(mockCodeChurn.linesRemoved)} />
            <DotRow color="var(--color-text-tertiary)" label="Total changed" value={formatNumber(mockCodeChurn.totalChanged)} />
          </div>
        </div>
      </div>

      {/* Insight cards: 3 → 2 at medium/narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12 }}>
        {mockUsageInsights.map((card, i) => (
          <div key={i} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{card.subtitle}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ──

function KPICard({ icon, label, value, subtitle, trend, inverted, sparkData, color }: {
  icon: React.ReactNode; label: string; value: string; subtitle?: string
  trend: number; inverted?: boolean; sparkData: number[]; color: string
}) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{label}</span>
        </div>
        <TrendBadge value={trend} inverted={inverted} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <Sparkline data={sparkData} color={color} fill width={56} height={20} />
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}

function DotRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}
