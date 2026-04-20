import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Filter, SlidersHorizontal, Plus, Hash, Lock, Bot, X, Check, ArrowUp, ArrowDown } from 'lucide-react'
import type { MsgChannel, MsgEntity, ChannelActiveFilter, ChannelFilterField, ChannelSortField, ChannelGroupField } from './message-types'
import { CreateChannelDialog } from './CreateChannelDialog'

interface ChannelListViewProps {
  channels: MsgChannel[]
  entities: MsgEntity[]
  onSelectChannel: (channel: MsgChannel) => void
  selectedChannelId?: string | null
  compact?: boolean
}

function getChannelIcon(channel: MsgChannel) {
  if (channel.visibility === 'private') return Lock
  return Hash
}

export function ChannelListView({ channels, entities, onSelectChannel, selectedChannelId, compact }: ChannelListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<ChannelActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<ChannelGroupField>('none')
  const [sortField, setSortField] = useState<ChannelSortField>('recent')
  const [sortAsc, setSortAsc] = useState(false)

  const handleToggleFilter = (field: ChannelFilterField, value: string) => {
    setFilters(prev => {
      const idx = prev.findIndex(f => f.field === field && f.value === value)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [...prev, { field, value }]
    })
  }

  const removeFilter = (field: ChannelFilterField, value: string) => {
    setFilters(prev => prev.filter(f => !(f.field === field && f.value === value)))
  }

  const filtered = useMemo(() => {
    let result = channels

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(ch =>
        ch.name.toLowerCase().includes(q) ||
        (ch.description?.toLowerCase().includes(q)) ||
        ch.members.some(m => m.name.toLowerCase().includes(q))
      )
    }

    for (const f of filters) {
      switch (f.field) {
        case 'visibility':
          result = result.filter(ch => ch.visibility === f.value)
          break
        case 'hasUnread':
          result = result.filter(ch => ch.unreadCount > 0)
          break
      }
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'unread': cmp = a.unreadCount - b.unreadCount; break
        case 'recent':
        default: cmp = 0; break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [channels, searchQuery, filters, sortField, sortAsc])

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ label: 'All Channels', channels: filtered }]
    }
    // Group by visibility
    const pub = filtered.filter(ch => ch.visibility === 'public')
    const priv = filtered.filter(ch => ch.visibility === 'private')
    const result: { label: string; channels: MsgChannel[] }[] = []
    if (pub.length > 0) result.push({ label: 'Public Channels', channels: pub })
    if (priv.length > 0) result.push({ label: 'Private Channels', channels: priv })
    return result
  }, [filtered, groupBy])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header toolbar */}
      <div style={{
        padding: compact ? '8px 10px' : '8px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <h1 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
            Channels
          </h1>
          {!compact && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
              Multi-agent discussion spaces
            </span>
          )}
        </div>

        {/* Active filter pills */}
        {!compact && filters.map(f => (
          <span key={`${f.field}-${f.value}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', fontSize: 11,
            background: 'var(--color-primary-subtle)',
            color: 'var(--color-primary)',
            borderRadius: 'var(--radius-full)', fontWeight: 500,
          }}>
            <span style={{ textTransform: 'capitalize' }}>{f.value}</span>
            <button onClick={() => removeFilter(f.field, f.value)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-primary)', padding: 0, display: 'flex',
            }}>
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
            placeholder={compact ? 'Search...' : 'Search channels...'}
            style={{
              width: compact ? 110 : 200, padding: '5px 8px 5px 28px', fontSize: 12,
              background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
              outline: 'none', height: 26,
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
            <ChannelFilterPanel
              channels={channels}
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
            <ChannelDisplayPanel
              groupBy={groupBy} onGroupByChange={setGroupBy}
              sortField={sortField} onSortChange={setSortField}
              sortAsc={sortAsc} onSortDirChange={() => setSortAsc(!sortAsc)}
              onClose={() => setDisplayOpen(false)}
            />
          )}
        </div>
        )}

        {/* New channel */}
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            height: 26, padding: '0 10px',
            display: 'flex', alignItems: 'center', gap: 4,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}
        >
          <Plus size={12} strokeWidth={2} /> New
        </button>
      </div>

      {/* Channel list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {groups.length === 0 || groups.every(g => g.channels.length === 0) ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--color-text-tertiary)', fontSize: 13, gap: 12,
          }}>
            {searchQuery || filters.length > 0 ? 'No channels match your filters' : 'No channels yet'}
            {!searchQuery && filters.length === 0 && (
              <button onClick={() => setCreateOpen(true)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 500,
                background: 'var(--color-primary)', border: 'none',
                borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer',
              }}>
                Create a channel
              </button>
            )}
          </div>
        ) : (
          groups.map(group => group.channels.length > 0 && (
            <div key={group.label}>
              {/* Group header */}
              <div style={{
                padding: '10px 16px 4px',
                fontSize: 11, fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {group.label}
                <span style={{ fontWeight: 400 }}>{group.channels.length}</span>
              </div>

              {group.channels.map(channel => {
                const Icon = getChannelIcon(channel)
                const hasUnread = channel.unreadCount > 0
                const isSelected = channel.id === selectedChannelId
                const agentCount = channel.members.filter(m => m.entityType === 'agent').length

                return (
                  <div
                    key={channel.id}
                    onClick={() => onSelectChannel(channel)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: compact ? 8 : 10,
                      padding: compact ? '8px 10px' : '10px 16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      borderLeft: isSelected ? '2px solid var(--color-primary)' : '2px solid transparent',
                      background: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
                      transition: 'background var(--duration-fast)',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--color-primary-subtle)' : 'transparent' }}
                  >
                    {/* Channel icon */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                      background: agentCount > 0
                        ? 'rgba(167, 139, 250, 0.1)' : 'var(--color-surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--color-text-tertiary)',
                    }}>
                      {agentCount > 0
                        ? <Bot size={16} style={{ color: '#a78bfa' }} />
                        : <Icon size={15} />
                      }
                    </div>

                    {/* Name + preview */}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 13, fontWeight: hasUnread ? 600 : 500,
                          color: 'var(--color-text)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {channel.name}
                        </span>
                        {agentCount > 0 && (
                          <span style={{
                            fontSize: 10, padding: '1px 5px',
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(167, 139, 250, 0.12)',
                            color: '#a78bfa',
                          }}>
                            {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
                          </span>
                        )}
                      </div>
                      {!compact && (
                      <div style={{
                        fontSize: 12, color: 'var(--color-text-tertiary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginTop: 2,
                      }}>
                        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          {channel.lastMessageSender.name}:
                        </span>
                        {' '}{channel.lastMessagePreview}
                      </div>
                      )}
                    </div>

                    {/* Right side: time + unread */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                      gap: 4, flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {channel.lastMessageAt}
                      </span>
                      {hasUnread && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            minWidth: 18, height: 18, padding: '0 5px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 'var(--radius-full)',
                            background: channel.unreadHumanCount > 0 ? 'var(--color-primary)' : 'var(--color-surface-active)',
                            color: channel.unreadHumanCount > 0 ? 'white' : 'var(--color-text-secondary)',
                            fontSize: 10, fontWeight: 600,
                          }}
                            title={channel.unreadHumanCount > 0
                              ? `${channel.unreadHumanCount} human, ${channel.unreadCount - channel.unreadHumanCount} agent`
                              : `${channel.unreadCount} unread`
                            }
                          >
                            {channel.unreadCount}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Create channel dialog */}
      {createOpen && (
        <CreateChannelDialog
          entities={entities}
          onClose={() => setCreateOpen(false)}
          onCreate={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}

// ── Filter Panel ──
function ChannelFilterPanel({ channels, filters, onToggleFilter, onClose }: {
  channels: MsgChannel[]
  filters: ChannelActiveFilter[]
  onToggleFilter: (field: ChannelFilterField, value: string) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<ChannelFilterField>('visibility')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const tabs: { field: ChannelFilterField; label: string }[] = [
    { field: 'visibility', label: 'Visibility' },
    { field: 'hasUnread', label: 'Unread' },
  ]

  let values: { value: string; label: string; count: number }[] = []
  if (activeTab === 'visibility') {
    const pub = channels.filter(ch => ch.visibility === 'public').length
    const priv = channels.filter(ch => ch.visibility === 'private').length
    values = [
      { value: 'public', label: 'Public', count: pub },
      { value: 'private', label: 'Private', count: priv },
    ]
  } else {
    const unread = channels.filter(ch => ch.unreadCount > 0).length
    values = [
      { value: 'true', label: 'Has unread', count: unread },
    ]
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 32, right: 0, width: 240,
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
      zIndex: 1060, overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map(tab => (
          <button key={tab.field} onClick={() => setActiveTab(tab.field)} style={{
            flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 500,
            border: 'none', cursor: 'pointer',
            background: activeTab === tab.field ? 'var(--color-surface-active)' : 'transparent',
            color: activeTab === tab.field ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            borderBottom: activeTab === tab.field ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Values */}
      <div style={{ padding: '8px' }}>
        {values.map(v => {
          const isActive = filters.some(f => f.field === activeTab && f.value === v.value)
          return (
            <button key={v.value} onClick={() => onToggleFilter(activeTab, v.value)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: isActive ? 'var(--color-primary-subtle)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer', fontSize: 12,
            }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--color-primary-subtle)' : 'transparent' }}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{v.label}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{v.count}</span>
              {isActive && <Check size={12} strokeWidth={2} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Display Options Panel ──
function ChannelDisplayPanel({ groupBy, onGroupByChange, sortField, onSortChange, sortAsc, onSortDirChange, onClose }: {
  groupBy: ChannelGroupField; onGroupByChange: (v: ChannelGroupField) => void
  sortField: ChannelSortField; onSortChange: (v: ChannelSortField) => void
  sortAsc: boolean; onSortDirChange: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const groupOptions: { value: ChannelGroupField; label: string }[] = [
    { value: 'none', label: 'No grouping' },
    { value: 'type', label: 'Visibility' },
  ]
  const sortOptions: { value: ChannelSortField; label: string }[] = [
    { value: 'recent', label: 'Recent activity' },
    { value: 'name', label: 'Name' },
    { value: 'unread', label: 'Unread count' },
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
    </div>
  )
}
