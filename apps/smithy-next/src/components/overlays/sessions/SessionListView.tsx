import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Filter, SlidersHorizontal, Bot, Clock, GitBranch, SquareKanban, ArrowDownLeft, ArrowUpRight, ArrowUp, ArrowDown, Check, X, Plus } from 'lucide-react'
import type { Session, SessionActiveFilter, SessionFilterField, SessionSortField } from './session-types'
import { SessionFilterPanel } from './SessionFilterPanel'
import { SessionStatusStrip } from './SessionStatusStrip'

interface SessionListViewProps {
  sessions: Session[]
  onSelectSession: (session: Session) => void
  selectedSessionId?: string | null
  compact?: boolean
  onCreateSession?: () => void
  /** Slot rendered after the active count and before the filter pills. */
  afterTitleSlot?: React.ReactNode
}

type SessionGroupField = 'status' | 'agent' | 'environment' | 'none'

const statusColors: Record<string, string> = {
  active: 'var(--color-success)',
  completed: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)',
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function parseDuration(d: string): number {
  let total = 0
  const m = d.match(/(\d+)m/)
  const s = d.match(/(\d+)s/)
  const h = d.match(/(\d+)h/)
  if (h) total += parseInt(h[1]) * 3600
  if (m) total += parseInt(m[1]) * 60
  if (s) total += parseInt(s[1])
  return total
}

/** Get the last N preview lines from session events */
function getPreviewLines(session: Session, count: number): string[] {
  const lines: string[] = []
  const events = session.events
  for (let i = events.length - 1; i >= 0 && lines.length < count; i--) {
    const e = events[i]
    if (e.type === 'tool_call') {
      lines.unshift(`${e.toolName}: ${e.toolInput || e.title}`)
    } else if (e.type === 'agent_message') {
      const firstLine = e.content.split('\n')[0]
      lines.unshift(firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine)
    } else if (e.type === 'user_message') {
      const firstLine = e.content.split('\n')[0]
      lines.unshift(`> ${firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine}`)
    } else if (e.type === 'system_message') {
      lines.unshift(e.content)
    }
  }
  return lines
}

export function SessionListView({ sessions, onSelectSession, selectedSessionId, compact, onCreateSession, afterTitleSlot }: SessionListViewProps) {
  const activeCount = sessions.filter(s => s.status === 'active').length
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<SessionActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<SessionGroupField>('status')
  const [sortField, setSortField] = useState<SessionSortField>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [previewLines, setPreviewLines] = useState(2)

  const handleToggleFilter = (field: SessionFilterField, value: string) => {
    setFilters(prev => {
      const idx = prev.findIndex(f => f.field === field && f.value === value)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [...prev, { field, value }]
    })
  }

  const removeFilter = (field: SessionFilterField, value: string) => {
    setFilters(prev => prev.filter(f => !(f.field === field && f.value === value)))
  }

  const filtered = useMemo(() => {
    let result = sessions

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.agent.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.linkedBranch?.toLowerCase().includes(q))
      )
    }

    for (const filter of filters) {
      result = result.filter(s => {
        if (filter.field === 'status') return s.status === filter.value
        if (filter.field === 'agent') return s.agent.name === filter.value
        if (filter.field === 'environment') return s.environment === filter.value
        return true
      })
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'duration': cmp = parseDuration(a.duration) - parseDuration(b.duration); break
        case 'tokens': cmp = (a.tokensIn + a.tokensOut) - (b.tokensIn + b.tokensOut); break
        case 'status': cmp = a.status.localeCompare(b.status); break
        case 'date':
        default: cmp = 0; break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [sessions, searchQuery, filters, sortField, sortAsc])

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ label: 'All', dotColor: 'var(--color-text-tertiary)', sessions: filtered }]
    }
    if (groupBy === 'agent') {
      const byAgent = new Map<string, Session[]>()
      filtered.forEach(s => {
        if (!byAgent.has(s.agent.name)) byAgent.set(s.agent.name, [])
        byAgent.get(s.agent.name)!.push(s)
      })
      return Array.from(byAgent.entries()).map(([name, items]) => ({
        label: name, dotColor: 'var(--color-text-secondary)', sessions: items,
      }))
    }
    if (groupBy === 'environment') {
      const byEnv = new Map<string, Session[]>()
      filtered.forEach(s => {
        if (!byEnv.has(s.environment)) byEnv.set(s.environment, [])
        byEnv.get(s.environment)!.push(s)
      })
      return Array.from(byEnv.entries()).map(([env, items]) => ({
        label: env, dotColor: 'var(--color-text-secondary)', sessions: items,
      }))
    }
    // Default: group by status
    const active = filtered.filter(s => s.status === 'active')
    const error = filtered.filter(s => s.status === 'error')
    const completed = filtered.filter(s => s.status === 'completed')
    const result: { label: string; dotColor: string; sessions: Session[] }[] = []
    if (active.length > 0) result.push({ label: 'Active', dotColor: statusColors.active, sessions: active })
    if (error.length > 0) result.push({ label: 'Error', dotColor: statusColors.error, sessions: error })
    if (completed.length > 0) result.push({ label: 'Completed', dotColor: statusColors.completed, sessions: completed })
    return result
  }, [filtered, groupBy])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header toolbar */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <h1 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          Sessions
        </h1>
        <span
          className="hidden md:inline"
          style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}
        >
          {activeCount} active
        </span>
        {afterTitleSlot}

        {/* Active filter pills */}
        {filters.map(f => (
          <span
            key={`${f.field}-${f.value}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '0 6px 0 8px', fontSize: 11, height: 22,
              background: 'var(--color-primary-subtle)',
              color: 'var(--color-text-accent)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 500,
            }}
          >
            <span style={{ textTransform: 'capitalize' }}>{f.value}</span>
            <button
              onClick={() => removeFilter(f.field, f.value)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-primary)', padding: 0, display: 'flex',
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--color-text-tertiary)',
          }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            style={{
              width: compact ? 140 : 200,
              padding: '5px 8px 5px 28px',
              fontSize: 12,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text)',
              outline: 'none',
              height: 26,
              transition: 'width var(--duration-fast)',
            }}
          />
        </div>

        {/* Filter button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }}
            style={{
              height: 26, padding: '0 8px',
              display: 'flex', alignItems: 'center', gap: 4,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
              color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500,
            }}
          >
            <Filter size={12} strokeWidth={1.5} /> {!compact && <>Filter {filters.length > 0 && `(${filters.length})`}</>}
          </button>
          {filterOpen && (
            <SessionFilterPanel
              sessions={sessions}
              filters={filters}
              onToggleFilter={handleToggleFilter}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>

        {/* Display options */}
        {!compact && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }}
              style={{
                height: 26, padding: '0 8px',
                display: 'flex', alignItems: 'center', gap: 4,
                border: 'none', borderRadius: 'var(--radius-sm)',
                background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
                color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                cursor: 'pointer', fontSize: 11, fontWeight: 500,
              }}
            >
              <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
            </button>
            {displayOpen && (
              <SessionDisplayPanel
                groupBy={groupBy} onGroupByChange={setGroupBy}
                sortField={sortField} onSortChange={setSortField}
                sortAsc={sortAsc} onSortDirChange={() => setSortAsc(!sortAsc)}
                previewLines={previewLines} onPreviewLinesChange={setPreviewLines}
                onClose={() => setDisplayOpen(false)}
              />
            )}
          </div>
        )}

        {onCreateSession && (
          <button onClick={onCreateSession} style={{
            height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            <Plus size={12} strokeWidth={2} /> New Session
          </button>
        )}
      </div>

      {/* Status strip */}
      <SessionStatusStrip sessions={sessions} />

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {groups.length === 0 || groups.every(g => g.sessions.length === 0) ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--color-text-tertiary)', fontSize: 13,
          }}>
            {searchQuery || filters.length > 0 ? 'No sessions match your filters' : 'No sessions yet'}
          </div>
        ) : (
          groups.map(group => group.sessions.length > 0 && (
            <div key={group.label}>
              {/* Group header */}
              <div style={{
                padding: '10px 16px 4px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                {groupBy === 'status' && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: group.dotColor }} />
                )}
                {group.label}
                <span style={{ fontWeight: 400 }}>{group.sessions.length}</span>
              </div>

              {group.sessions.map(session => {
                const isSelected = session.id === selectedSessionId
                const lines = getPreviewLines(session, previewLines)

                return (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: compact ? '8px 12px' : '8px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      borderLeft: isSelected ? '2px solid var(--color-primary)' : '2px solid transparent',
                      background: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
                      transition: 'background var(--duration-fast)',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--color-primary-subtle)' : 'transparent' }}
                  >
                    {/* Status dot */}
                    <span className={session.status === 'active' ? 'session-status-pulse' : undefined} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: statusColors[session.status],
                      flexShrink: 0,
                      marginTop: 5,
                    }} />

                    {/* Title + preview lines */}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: session.status === 'active' ? 600 : 500,
                        color: 'var(--color-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {session.title}
                      </div>
                      {lines.map((line, li) => (
                        <div key={li} style={{
                          fontSize: 11, color: 'var(--color-text-tertiary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          marginTop: li === 0 ? 2 : 1,
                          fontFamily: line.startsWith('>') ? undefined : 'var(--font-mono)',
                        }}>
                          {line}
                        </div>
                      ))}
                    </div>

                    {/* Right-side metadata */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      flexShrink: 0,
                    }}>
                      {/* In compact mode: just agent badge + duration */}
                      {compact ? (
                        <>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '2px 6px',
                            background: 'var(--color-surface)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 10, color: 'var(--color-text-secondary)',
                          }}>
                            <Bot size={10} /> {session.agent.name}
                          </span>
                          <span style={{
                            fontSize: 11, fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-tertiary)',
                          }}>
                            {session.duration}
                          </span>
                        </>
                      ) : (
                        <>
                          {/* Task badge */}
                          {session.linkedTaskId && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px',
                              background: 'var(--color-surface)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11, color: 'var(--color-text-accent)',
                              fontFamily: 'var(--font-mono)',
                            }}>
                              <SquareKanban size={11} /> {session.linkedTaskId}
                            </span>
                          )}

                          {/* Agent badge */}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px',
                            background: 'var(--color-surface)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11, color: 'var(--color-text-secondary)',
                          }}>
                            <Bot size={11} /> {session.agent.name}
                          </span>

                          {/* Branch badge */}
                          {session.linkedBranch && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px',
                              background: 'var(--color-surface)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11, color: 'var(--color-text-tertiary)',
                              fontFamily: 'var(--font-mono)',
                              maxWidth: 160,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              <GitBranch size={11} style={{ flexShrink: 0 }} /> {session.linkedBranch}
                            </span>
                          )}

                          {/* Duration */}
                          <span style={{
                            fontSize: 12, fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-tertiary)',
                            minWidth: 52, textAlign: 'right',
                          }}>
                            {session.duration}
                          </span>

                          {/* Time ago */}
                          <span style={{
                            fontSize: 12, color: 'var(--color-text-tertiary)',
                            minWidth: 80, textAlign: 'right',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <Clock size={11} /> {session.startedAt}
                          </span>

                          {/* Tokens */}
                          <span style={{
                            fontSize: 11, fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-tertiary)',
                            minWidth: 80, textAlign: 'right',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <ArrowDownLeft size={10} />{formatTokens(session.tokensIn)}
                            {' / '}
                            <ArrowUpRight size={10} />{formatTokens(session.tokensOut)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Display Options Panel ──
function SessionDisplayPanel({ groupBy, onGroupByChange, sortField, onSortChange, sortAsc, onSortDirChange, previewLines, onPreviewLinesChange, onClose }: {
  groupBy: SessionGroupField; onGroupByChange: (v: SessionGroupField) => void
  sortField: SessionSortField; onSortChange: (v: SessionSortField) => void
  sortAsc: boolean; onSortDirChange: () => void
  previewLines: number; onPreviewLinesChange: (v: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const groupOptions: { value: SessionGroupField; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'agent', label: 'Agent' },
    { value: 'environment', label: 'Environment' },
    { value: 'none', label: 'No grouping' },
  ]
  const sortOptions: { value: SessionSortField; label: string }[] = [
    { value: 'date', label: 'Date' },
    { value: 'duration', label: 'Duration' },
    { value: 'tokens', label: 'Tokens' },
    { value: 'status', label: 'Status' },
  ]

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 32, right: 0, width: 240,
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
      zIndex: 1060, padding: '8px 0',
    }}>
      {/* Group by */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Group by
        </div>
        {groupOptions.map(opt => (
          <button key={opt.value} onClick={() => onGroupByChange(opt.value)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: groupBy === opt.value ? 'var(--color-surface-active)' : 'transparent',
            color: groupBy === opt.value ? 'var(--color-text)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12,
          }}
            onMouseEnter={e => { if (groupBy !== opt.value) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = groupBy === opt.value ? 'var(--color-surface-active)' : 'transparent' }}
          >
            {groupBy === opt.value && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />}
            <span style={{ marginLeft: groupBy === opt.value ? 0 : 20 }}>{opt.label}</span>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />

      {/* Sort by */}
      <div style={{ padding: '8px 12px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sort by
          </span>
          <button onClick={onSortDirChange} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
          }}>
            {sortAsc ? <ArrowUp size={10} strokeWidth={2} /> : <ArrowDown size={10} strokeWidth={2} />}
            {sortAsc ? 'Asc' : 'Desc'}
          </button>
        </div>
        {sortOptions.map(opt => (
          <button key={opt.value} onClick={() => onSortChange(opt.value)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: sortField === opt.value ? 'var(--color-surface-active)' : 'transparent',
            color: sortField === opt.value ? 'var(--color-text)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12,
          }}
            onMouseEnter={e => { if (sortField !== opt.value) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = sortField === opt.value ? 'var(--color-surface-active)' : 'transparent' }}
          >
            {sortField === opt.value && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />}
            <span style={{ marginLeft: sortField === opt.value ? 0 : 20 }}>{opt.label}</span>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />

      {/* Preview lines */}
      <div style={{ padding: '8px 12px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Preview lines
          </span>
          <input
            type="number"
            min={0}
            max={10}
            value={previewLines}
            onChange={e => {
              const v = parseInt(e.target.value)
              if (!isNaN(v) && v >= 0 && v <= 10) onPreviewLinesChange(v)
            }}
            style={{
              width: 40, height: 24, textAlign: 'center',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
              fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 4 }}>
          Number of recent messages shown per session
        </div>
      </div>
    </div>
  )
}
