import { useState, useRef, useMemo } from 'react'
import {
  Search, Filter, SlidersHorizontal, X, Plus,
  GitBranch, Container, Box, Server as ServerIcon,
  ArrowUpDown, ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2, Star, Copy,
  AlertTriangle, Cpu,
} from 'lucide-react'
import type {
  Runtime, Host, RuntimeMode, RuntimeFilterField, RuntimeActiveFilter, RuntimeSortField, RuntimeGroupField,
} from './runtime-types'
import { runtimeModeLabels, runtimeStatusColors, hostStatusColors } from './runtime-types'
import type { WorkspaceDaemonState } from '../../../mock-data'

interface RuntimeListViewProps {
  runtimes: Runtime[]
  hosts: Host[]
  onSelectRuntime: (rt: Runtime) => void
  onCreate: () => void
  onEdit: (rt: Runtime) => void
  daemonState?: WorkspaceDaemonState | null
  onChangeDaemonHost?: (hostId: string) => void
}

const modeIcons: Record<RuntimeMode, typeof GitBranch> = {
  worktrees: GitBranch,
  docker: Container,
  sandbox: Box,
}

export function RuntimeListView({ runtimes, hosts, onSelectRuntime, onCreate, onEdit, daemonState, onChangeDaemonHost }: RuntimeListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [filters, setFilters] = useState<RuntimeActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<RuntimeGroupField>('none')
  const [sortField, setSortField] = useState<RuntimeSortField>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [daemonHostDropdownOpen, setDaemonHostDropdownOpen] = useState(false)
  const [daemonConfirmTarget, setDaemonConfirmTarget] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const getHost = (hostId: string) => hosts.find(h => h.id === hostId)

  const toggleFilter = (field: RuntimeFilterField, value: string) => {
    setFilters(prev => {
      const exists = prev.find(f => f.field === field && f.value === value)
      if (exists) return prev.filter(f => !(f.field === field && f.value === value))
      return [...prev, { field, value }]
    })
  }

  const filtered = useMemo(() => {
    let result = runtimes

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(rt => {
        const host = getHost(rt.hostId)
        return rt.name.toLowerCase().includes(q) ||
          runtimeModeLabels[rt.mode].toLowerCase().includes(q) ||
          (host?.name || '').toLowerCase().includes(q) ||
          (rt.statusMessage || '').toLowerCase().includes(q)
      })
    }

    for (const f of filters) {
      switch (f.field) {
        case 'mode': result = result.filter(rt => rt.mode === f.value); break
        case 'status': result = result.filter(rt => rt.status === f.value); break
        case 'host': result = result.filter(rt => rt.hostId === f.value); break
      }
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'status': cmp = a.status.localeCompare(b.status); break
        case 'agents': cmp = a.assignedAgentCount - b.assignedAgentCount; break
        case 'created': cmp = a.createdAt.localeCompare(b.createdAt); break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [runtimes, searchQuery, filters, sortField, sortAsc])

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All runtimes', items: filtered }]
    if (groupBy === 'mode') {
      const groups = new Map<string, Runtime[]>()
      filtered.forEach(rt => {
        const key = runtimeModeLabels[rt.mode]
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(rt)
      })
      return Array.from(groups.entries()).map(([key, items]) => ({ key, label: key, items }))
    }
    if (groupBy === 'host') {
      const groups = new Map<string, Runtime[]>()
      filtered.forEach(rt => {
        const hostName = getHost(rt.hostId)?.name || 'Unknown'
        if (!groups.has(hostName)) groups.set(hostName, [])
        groups.get(hostName)!.push(rt)
      })
      return Array.from(groups.entries()).map(([key, items]) => ({ key, label: key, items }))
    }
    // group by status
    const online = filtered.filter(rt => rt.status === 'online')
    const provisioning = filtered.filter(rt => rt.status === 'provisioning')
    const offline = filtered.filter(rt => rt.status === 'offline')
    const errored = filtered.filter(rt => rt.status === 'error')
    const groups: { key: string; label: string; items: Runtime[] }[] = []
    if (online.length) groups.push({ key: 'online', label: 'Online', items: online })
    if (provisioning.length) groups.push({ key: 'provisioning', label: 'Provisioning', items: provisioning })
    if (offline.length) groups.push({ key: 'offline', label: 'Offline', items: offline })
    if (errored.length) groups.push({ key: 'error', label: 'Error', items: errored })
    return groups
  }, [filtered, groupBy])

  const daemonHost = daemonState ? getHost(daemonState.hostId) : null
  const daemonDotColor = daemonState?.status === 'running' ? 'var(--color-success)' : daemonState?.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'
  const confirmTargetHost = daemonConfirmTarget ? getHost(daemonConfirmTarget) : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Runtimes</span>

        {/* Active filter pills */}
        {filters.map(f => {
          const label = f.field === 'host' ? (getHost(f.value)?.name || f.value) : f.value
          return (
            <span key={`${f.field}-${f.value}`} style={{
              height: 22, padding: '0 6px 0 8px', display: 'flex', alignItems: 'center', gap: 4,
              borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 500,
            }}>
              {f.field}: {label}
              <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => toggleFilter(f.field, f.value)} />
            </span>
          )
        })}
        {filters.length > 0 && (
          <button onClick={() => setFilters([])} style={{ height: 22, padding: '0 6px', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>Clear all</button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search — desktop */}
        <div className="rt-search-container" style={{ position: 'relative' }}>
          <div className="rt-search-desktop" style={{ display: 'flex' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26,
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', padding: '0 8px',
            }}>
              <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search runtimes..."
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={11} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
          <div className="rt-search-mobile" style={{ display: 'none' }}>
            {searchExpanded ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, width: 180, height: 26,
                background: 'var(--color-surface)', border: '1px solid var(--color-border-focus)',
                borderRadius: 'var(--radius-sm)', padding: '0 8px',
              }}>
                <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                <input ref={searchInputRef} autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  onBlur={() => { if (!searchQuery) setSearchExpanded(false) }}
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 12, fontFamily: 'inherit' }} />
                <button onClick={() => { setSearchQuery(''); setSearchExpanded(false) }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button onClick={() => setSearchExpanded(true)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <Search size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* Filter */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
            color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <Filter size={12} strokeWidth={1.5} /> Filter {filters.length > 0 && `(${filters.length})`}
          </button>
          {filterOpen && (
            <RuntimeFilterPanel runtimes={runtimes} hosts={hosts} filters={filters} onToggleFilter={toggleFilter} onClose={() => setFilterOpen(false)} />
          )}
        </div>

        {/* Display */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
            color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
          </button>
          {displayOpen && (
            <DisplayPanel groupBy={groupBy} onGroupBy={setGroupBy} sortField={sortField} onSortField={setSortField}
              sortAsc={sortAsc} onSortAsc={setSortAsc} onClose={() => setDisplayOpen(false)} />
          )}
        </div>

        {/* New runtime */}
        <button onClick={onCreate} style={{
          height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          <Plus size={12} strokeWidth={2} /> New runtime
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>
        {/* Dispatch Daemon section */}
        {daemonState && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Cpu size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-secondary)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>Dispatch Daemon</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500,
                padding: '1px 7px', borderRadius: 'var(--radius-full)',
                background: `color-mix(in srgb, ${daemonDotColor} 15%, transparent)`, color: daemonDotColor,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: daemonDotColor }} />
                {daemonState.status === 'running' ? 'Running' : daemonState.status === 'error' ? 'Error' : 'Stopped'}
              </span>
              {daemonState.startedAt && daemonState.status === 'running' && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Up {daemonState.startedAt}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Host:</span>
              {daemonHost ? (
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{daemonHost.name}</span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Not configured</span>
              )}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setDaemonHostDropdownOpen(!daemonHostDropdownOpen)} style={{
                  height: 22, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface)', color: 'var(--color-text-tertiary)',
                  cursor: 'pointer', fontSize: 11, fontWeight: 500,
                }}>
                  Change host
                </button>
                {daemonHostDropdownOpen && (
                  <>
                    <div onClick={() => setDaemonHostDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
                    <div style={{
                      position: 'absolute', top: 26, left: 0, zIndex: 1060, width: 220,
                      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4,
                    }}>
                      {hosts.map(host => (
                        <button key={host.id} onClick={() => {
                          if (host.id !== daemonState.hostId) setDaemonConfirmTarget(host.id)
                          setDaemonHostDropdownOpen(false)
                        }} style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                          background: host.id === daemonState.hostId ? 'var(--color-surface-active)' : 'transparent',
                          border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          color: host.id === daemonState.hostId ? 'var(--color-text)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
                        }}
                          onMouseEnter={e => { if (host.id !== daemonState.hostId) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                          onMouseLeave={e => { if (host.id !== daemonState.hostId) e.currentTarget.style.background = 'transparent' }}
                        >
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: hostStatusColors[host.status], flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{host.name}</span>
                          {host.os && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{host.os}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.4 }}>
              The daemon orchestrates agent lifecycles. It runs on a host machine and is not tied to any specific runtime.
            </div>
          </div>
        )}

        {grouped.map(group => (
          <div key={group.key} style={{ marginBottom: 20 }}>
            {groupBy !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{group.label}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px' }}>{group.items.length}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map(rt => (
                <RuntimeRow key={rt.id} runtime={rt} host={getHost(rt.hostId)} onClick={() => onSelectRuntime(rt)} onEdit={() => onEdit(rt)} isDaemonHost={daemonState?.hostId === rt.hostId} />
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            {searchQuery || filters.length > 0 ? (
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>No runtimes match your filters</div>
            ) : (
              <div>
                <ServerIcon size={32} strokeWidth={1} style={{ color: 'var(--color-text-tertiary)', marginBottom: 12 }} />
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 4 }}>No runtimes configured</div>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginBottom: 16 }}>Create a runtime to define where your agents run.</div>
                <button onClick={onCreate} style={{
                  height: 30, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
                  color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}>
                  <Plus size={13} strokeWidth={2} /> Create runtime
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Daemon host change confirmation dialog */}
      {daemonConfirmTarget && confirmTargetHost && (
        <>
          <div onClick={() => setDaemonConfirmTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2010,
            width: 400, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={16} strokeWidth={2} style={{ color: 'var(--color-warning)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Change daemon host?</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 6px' }}>
              Moving the dispatch daemon from <strong>{daemonHost?.name}</strong> to <strong>{confirmTargetHost.name}</strong> will restart it and temporarily interrupt all running autonomous workflows.
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4, margin: '0 0 16px' }}>
              Active directors and workers will pause until the daemon is back online on the new host.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDaemonConfirmTarget(null)} style={{
                height: 30, padding: '0 14px', border: '1px solid var(--color-border)',
                background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>Cancel</button>
              <button onClick={() => { onChangeDaemonHost?.(daemonConfirmTarget); setDaemonConfirmTarget(null) }} style={{
                height: 30, padding: '0 14px', border: 'none',
                background: 'var(--color-warning)', borderRadius: 'var(--radius-sm)',
                color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>Move daemon</button>
            </div>
          </div>
        </>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .rt-search-desktop { display: none !important; }
          .rt-search-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .rt-search-desktop { display: flex !important; }
          .rt-search-mobile { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function RuntimeRow({ runtime: rt, host, onClick, onEdit, isDaemonHost }: {
  runtime: Runtime; host?: Host; onClick: () => void; onEdit: () => void; isDaemonHost?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ModeIcon = modeIcons[rt.mode] || ServerIcon
  const dotColor = runtimeStatusColors[rt.status]

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)',
        cursor: 'pointer', transition: `all var(--duration-fast)`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
    >
      {/* Icon + status dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <ModeIcon size={16} strokeWidth={1.5} style={{ color: rt.status === 'online' ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }} />
        <div style={{
          position: 'absolute', bottom: -2, right: -2, width: 7, height: 7, borderRadius: '50%',
          background: dotColor, border: '1.5px solid var(--color-bg-elevated)',
        }} />
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{rt.name}</span>
          {rt.isDefault && (
            <span style={{
              fontSize: 10, fontWeight: 500, color: 'var(--color-text-accent)',
              background: 'var(--color-primary-subtle)', padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
            }}>default</span>
          )}
          {isDaemonHost && (
            <span style={{
              fontSize: 10, fontWeight: 500, color: 'var(--color-success)',
              background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
              padding: '1px 6px', borderRadius: 'var(--radius-full)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <Cpu size={9} strokeWidth={2} /> Daemon
            </span>
          )}
          {rt.status === 'error' && <AlertTriangle size={12} strokeWidth={2} style={{ color: 'var(--color-danger)' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <span style={{
            padding: '0 5px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', fontSize: 10, fontWeight: 500,
          }}>{runtimeModeLabels[rt.mode]}</span>
          {host && <span>{host.name}</span>}
          <span>{rt.assignedAgentCount} agent{rt.assignedAgentCount !== 1 ? 's' : ''}</span>
          {rt.statusMessage ? (
            <span style={{ color: rt.status === 'error' ? 'var(--color-danger)' : undefined }}>{rt.statusMessage}</span>
          ) : rt.lastHealthCheck ? (
            <span>Checked {rt.lastHealthCheck}</span>
          ) : null}
        </div>
      </div>

      {/* Status dot (large, right side) */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0,
      }} />

      {/* More menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-active)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <MoreHorizontal size={14} strokeWidth={1.5} />
        </button>
        {menuOpen && (
          <>
            <div onClick={e => { e.stopPropagation(); setMenuOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
            <div onClick={e => e.stopPropagation()} style={{
              position: 'absolute', top: 28, right: 0, zIndex: 1060, width: 180,
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4,
            }}>
              <MenuItem icon={Pencil} label="Edit" onClick={() => { setMenuOpen(false); onEdit() }} />
              <MenuItem icon={Copy} label="Duplicate" onClick={() => setMenuOpen(false)} />
              {!rt.isDefault && <MenuItem icon={Star} label="Set as default" onClick={() => setMenuOpen(false)} />}
              <MenuItem icon={Trash2} label="Delete" color="var(--color-danger)" onClick={() => setMenuOpen(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, color, onClick }: { icon: typeof Pencil; label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
      color: color || 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, textAlign: 'left' as const,
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={12} strokeWidth={1.5} /> {label}
    </button>
  )
}

function RuntimeFilterPanel({ runtimes, hosts, filters, onToggleFilter, onClose }: {
  runtimes: Runtime[]
  hosts: Host[]
  filters: RuntimeActiveFilter[]
  onToggleFilter: (field: RuntimeFilterField, value: string) => void
  onClose: () => void
}) {
  const modes = [...new Set(runtimes.map(rt => rt.mode))]
  const statuses = [...new Set(runtimes.map(rt => rt.status))]
  const hostIds = [...new Set(runtimes.map(rt => rt.hostId))]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
      <div style={{
        position: 'absolute', top: 36, right: 0, zIndex: 1060,
        width: 220, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 8,
      }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mode</div>
          {modes.map(m => {
            const active = filters.some(f => f.field === 'mode' && f.value === m)
            return (
              <button key={m} onClick={() => onToggleFilter('mode', m)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
                background: active ? 'var(--color-primary-subtle)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: active ? 'var(--color-text-accent)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
              }}>
                {runtimeModeLabels[m]}
              </button>
            )
          })}
        </div>
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Host</div>
          {hostIds.map(hId => {
            const host = hosts.find(h => h.id === hId)
            const active = filters.some(f => f.field === 'host' && f.value === hId)
            return (
              <button key={hId} onClick={() => onToggleFilter('host', hId)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
                background: active ? 'var(--color-primary-subtle)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: active ? 'var(--color-text-accent)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: hostStatusColors[host?.status || 'offline'] }} />
                {host?.name || hId}
              </button>
            )
          })}
        </div>
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
          {statuses.map(s => {
            const active = filters.some(f => f.field === 'status' && f.value === s)
            return (
              <button key={s} onClick={() => onToggleFilter('status', s)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
                background: active ? 'var(--color-primary-subtle)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: active ? 'var(--color-text-accent)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: runtimeStatusColors[s] }} />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function DisplayPanel({ groupBy, onGroupBy, sortField, onSortField, sortAsc, onSortAsc, onClose }: {
  groupBy: RuntimeGroupField; onGroupBy: (v: RuntimeGroupField) => void
  sortField: RuntimeSortField; onSortField: (v: RuntimeSortField) => void
  sortAsc: boolean; onSortAsc: (v: boolean) => void
  onClose: () => void
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
      <div style={{
        position: 'absolute', top: 36, right: 0, zIndex: 1060,
        width: 220, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 8,
      }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group by</div>
          {(['mode', 'host', 'status', 'none'] as RuntimeGroupField[]).map(g => (
            <button key={g} onClick={() => { onGroupBy(g); onClose() }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
              background: groupBy === g ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: groupBy === g ? 'var(--color-text)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
            }}>
              {g === 'none' ? 'None' : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort by</div>
          {([['name', 'Name'], ['status', 'Status'], ['agents', 'Agents'], ['created', 'Created']] as [RuntimeSortField, string][]).map(([field, label]) => (
            <button key={field} onClick={() => {
              if (sortField === field) onSortAsc(!sortAsc)
              else { onSortField(field); onSortAsc(true) }
            }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
              background: sortField === field ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: sortField === field ? 'var(--color-text)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
            }}>
              {sortField === field
                ? (sortAsc ? <ArrowUp size={11} strokeWidth={1.5} /> : <ArrowDown size={11} strokeWidth={1.5} />)
                : <ArrowUpDown size={11} strokeWidth={1.5} style={{ opacity: 0.3 }} />
              }
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
