import { useState, useRef, useEffect } from 'react'
import { AlertCircle, AlertTriangle, Info, Bot, Cpu, Zap, Activity, Search, ChevronDown, ChevronRight } from 'lucide-react'
import type { TimeRange, LayoutSize } from './metrics/metrics-types'
import { MetricsOverviewTab } from './metrics/MetricsOverviewTab'
import { MetricsProvidersTab } from './metrics/MetricsProvidersTab'
import { MetricsQualityTab } from './metrics/MetricsQualityTab'

type MetricsTab = 'overview' | 'providers' | 'quality' | 'event-log'

const tabs: { id: MetricsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'providers', label: 'Providers & Models' },
  { id: 'quality', label: 'Quality' },
  { id: 'event-log', label: 'Event Log' },
]

const timeRanges: { id: TimeRange; label: string }[] = [
  { id: '7d', label: '7d' },
  { id: '14d', label: '14d' },
  { id: '30d', label: '30d' },
]

interface MetricsOverlayProps {
  onBack: () => void
  initialTab?: string | null
  onTabChange?: (tab: string) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToCIRun?: (runId: string) => void
  onNavigateToAgent?: (agentId: string) => void
}

export function MetricsOverlay({ initialTab, onTabChange, onNavigateToTask }: MetricsOverlayProps) {
  const [activeTab, setActiveTab] = useState<MetricsTab>(() => {
    if (initialTab && tabs.some(t => t.id === initialTab)) return initialTab as MetricsTab
    return 'overview'
  })
  const [timeRange, setTimeRange] = useState<TimeRange>('14d')
  const contentRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<LayoutSize>('wide')

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      setLayout(w > 900 ? 'wide' : w > 600 ? 'medium' : 'narrow')
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleTabChange = (tab: MetricsTab) => {
    setActiveTab(tab)
    onTabChange?.(tab)
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <MetricsOverviewTab timeRange={timeRange} layout={layout} />
      case 'providers':
        return <MetricsProvidersTab timeRange={timeRange} layout={layout} />
      case 'quality':
        return <MetricsQualityTab timeRange={timeRange} layout={layout} onNavigateToTask={onNavigateToTask} />
      case 'event-log':
        return <EventLogTab />
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginRight: 8 }}>Metrics</span>

        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => handleTabChange(tab.id)}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.1s',
                background: activeTab === tab.id ? 'var(--color-surface-active)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              }}
              onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.background = 'transparent' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 2, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          {timeRanges.map(tr => (
            <button key={tr.id} onClick={() => setTimeRange(tr.id)}
              style={{
                padding: '3px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.1s',
                background: timeRange === tr.id ? 'var(--color-surface-active)' : 'transparent',
                color: timeRange === tr.id ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              }}>
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={contentRef} style={{ flex: 1, overflow: 'auto' }}>
        {renderTab()}
      </div>
    </div>
  )
}

// ── Event Log Tab ──

type EventSeverity = 'info' | 'warning' | 'error'
type EventSource = 'system' | 'agent' | 'automation' | 'daemon'

interface EventLogEntry {
  id: string
  timestamp: string
  severity: EventSeverity
  source: EventSource
  message: string
  detail?: string
  linkedEntity?: { type: 'task' | 'agent' | 'session' | 'automation'; id: string; label: string }
}

const mockEventLog: EventLogEntry[] = [
  { id: 'ev-1', timestamp: '2 min ago', severity: 'info', source: 'agent', message: 'Agent Alpha started working on task SF-142', linkedEntity: { type: 'task', id: 'SF-142', label: 'SF-142' } },
  { id: 'ev-2', timestamp: '5 min ago', severity: 'info', source: 'agent', message: 'Agent Beta completed code review for MR-43', linkedEntity: { type: 'agent', id: 'a-2', label: 'Agent Beta' } },
  { id: 'ev-3', timestamp: '8 min ago', severity: 'warning', source: 'daemon', message: 'Dispatch daemon memory usage above 80% threshold', detail: 'Current: 82.4% (1.32 GB / 1.6 GB). Consider restarting the daemon or closing unused agent sessions.' },
  { id: 'ev-4', timestamp: '12 min ago', severity: 'error', source: 'agent', message: 'Agent Gamma encountered runtime error in task SF-138', detail: 'TypeError: Cannot read properties of undefined (reading \'map\') at UserList.tsx:42', linkedEntity: { type: 'task', id: 'SF-138', label: 'SF-138' } },
  { id: 'ev-5', timestamp: '15 min ago', severity: 'info', source: 'automation', message: 'Automation "Nightly E2E Suite" triggered by schedule', linkedEntity: { type: 'automation', id: 'wf-1', label: 'Nightly E2E Suite' } },
  { id: 'ev-6', timestamp: '18 min ago', severity: 'info', source: 'system', message: 'Workspace settings updated: autopilot mode enabled' },
  { id: 'ev-7', timestamp: '22 min ago', severity: 'info', source: 'agent', message: 'Agent Alpha delegated sub-task to Agent Delta', detail: 'Cross-agent coordination: Alpha requested Delta to handle database migration scaffolding for SF-142.' },
  { id: 'ev-8', timestamp: '25 min ago', severity: 'warning', source: 'agent', message: 'Agent Delta approaching context limit (87% used)', linkedEntity: { type: 'agent', id: 'a-4', label: 'Agent Delta' } },
  { id: 'ev-9', timestamp: '30 min ago', severity: 'info', source: 'daemon', message: 'Dispatch daemon started on adam-macbook' },
  { id: 'ev-10', timestamp: '35 min ago', severity: 'error', source: 'automation', message: 'Automation "Deploy Staging" failed at step 3: health check timeout', detail: 'Step "wait-for-healthy" timed out after 120s. The staging deployment did not respond to health checks.', linkedEntity: { type: 'automation', id: 'wf-2', label: 'Deploy Staging' } },
  { id: 'ev-11', timestamp: '42 min ago', severity: 'info', source: 'agent', message: 'Agent Beta escalated review finding to human operator', detail: 'Potential security concern: user input is passed to eval() in utils/dynamic-loader.ts:28' },
  { id: 'ev-12', timestamp: '1 hr ago', severity: 'info', source: 'system', message: 'Branch switched from feature/auth to main' },
  { id: 'ev-13', timestamp: '1 hr ago', severity: 'info', source: 'agent', message: 'Agent Alpha completed task SF-140 successfully', linkedEntity: { type: 'task', id: 'SF-140', label: 'SF-140' } },
  { id: 'ev-15', timestamp: '1.5 hr ago', severity: 'info', source: 'agent', message: 'Agent Alpha sent message to Agent Beta in channel "Architecture Review"', linkedEntity: { type: 'agent', id: 'a-1', label: 'Agent Alpha' } },
  { id: 'ev-16', timestamp: '1.5 hr ago', severity: 'info', source: 'agent', message: 'Agent Beta acknowledged migration plan from Agent Alpha — proceeding with schema changes', linkedEntity: { type: 'agent', id: 'a-2', label: 'Agent Beta' } },
  { id: 'ev-17', timestamp: '2 hr ago', severity: 'info', source: 'agent', message: 'Agent Delta requested clarification from Agent Alpha on migration approach', linkedEntity: { type: 'agent', id: 'a-4', label: 'Agent Delta' } },
  { id: 'ev-14', timestamp: '2 hr ago', severity: 'info', source: 'system', message: 'Workspace "stoneforge" opened' },
]

const severityConfig: Record<EventSeverity, { icon: typeof Info; color: string; bg: string }> = {
  info: { icon: Info, color: 'var(--color-text-tertiary)', bg: 'transparent' },
  warning: { icon: AlertTriangle, color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.06)' },
  error: { icon: AlertCircle, color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.06)' },
}

const sourceConfig: Record<EventSource, { icon: typeof Bot; label: string; color: string }> = {
  system: { icon: Activity, label: 'System', color: 'var(--color-text-tertiary)' },
  agent: { icon: Bot, label: 'Agent', color: 'var(--color-primary)' },
  automation: { icon: Zap, label: 'Automation', color: '#a855f7' },
  daemon: { icon: Cpu, label: 'Daemon', color: 'var(--color-success)' },
}

function EventLogTab() {
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<EventSeverity | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<EventSource | 'all'>('all')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const filtered = mockEventLog.filter(ev => {
    if (severityFilter !== 'all' && ev.severity !== severityFilter) return false
    if (sourceFilter !== 'all' && ev.source !== sourceFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return ev.message.toLowerCase().includes(q) || ev.detail?.toLowerCase().includes(q) || ev.linkedEntity?.label.toLowerCase().includes(q)
    }
    return true
  })

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search events..."
            style={{ width: '100%', padding: '5px 8px 5px 28px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12, outline: 'none' }}
          />
        </div>
        <select
          value={severityFilter} onChange={e => setSeverityFilter(e.target.value as EventSeverity | 'all')}
          style={{ padding: '5px 8px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12, cursor: 'pointer' }}
        >
          <option value="all">All severities</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </select>
        <select
          value={sourceFilter} onChange={e => setSourceFilter(e.target.value as EventSource | 'all')}
          style={{ padding: '5px 8px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12, cursor: 'pointer' }}
        >
          <option value="all">All sources</option>
          <option value="agent">Agent</option>
          <option value="daemon">Daemon</option>
          <option value="automation">Automation</option>
          <option value="system">System</option>
        </select>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{filtered.length} events</span>
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.map(ev => {
          const sev = severityConfig[ev.severity]
          const src = sourceConfig[ev.source]
          const SevIcon = sev.icon
          const SrcIcon = src.icon
          const expanded = expandedIds.has(ev.id)
          return (
            <div key={ev.id}
              style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', background: sev.bg, cursor: ev.detail ? 'pointer' : 'default' }}
              onClick={() => ev.detail && toggleExpand(ev.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {ev.detail && (
                  expanded
                    ? <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    : <ChevronRight size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                )}
                <SevIcon size={13} style={{ color: sev.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: `color-mix(in srgb, ${src.color} 12%, transparent)`, color: src.color, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <SrcIcon size={10} />
                  {src.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text)', flex: 1 }}>{ev.message}</span>
                {ev.linkedEntity && (
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }}
                    onClick={e => { e.stopPropagation() }}
                  >
                    {ev.linkedEntity.label}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>{ev.timestamp}</span>
              </div>
              {expanded && ev.detail && (
                <div style={{ marginTop: 6, marginLeft: ev.detail ? 20 : 0, padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {ev.detail}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No events match the current filters
          </div>
        )}
      </div>
    </div>
  )
}
