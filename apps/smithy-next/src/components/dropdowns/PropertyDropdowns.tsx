import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Check, Circle, CircleDot, CircleDashed, CheckCircle2, Clock,
  AlertTriangle, ArrowUp, ArrowDown, Minus, BarChart3,
  User, Tag, Hash, X, Search,
} from 'lucide-react'
import { KANBAN_COLUMNS, ASSIGNEES, LABELS, PRIORITIES, COMPLEXITY_LEVELS, TEAM_MEMBERS, getAssignees, type Task, type AppMode } from '../../mock-data'
import { PresenceDot } from '../PresenceDot'

// ── Shared dropdown wrapper (renders via portal to avoid clipping) ──
function DropdownWrapper({ children, onClose, style }: { children: React.ReactNode; onClose: () => void; style?: React.CSSProperties }) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Compute fixed position from anchor element
  useEffect(() => {
    if (!anchorRef.current) return
    const anchorRect = anchorRef.current.getBoundingClientRect()
    // Extract relative offsets from the style prop (e.g. { position: 'absolute', top: 26, right: 0 })
    const relTop = typeof style?.top === 'number' ? style.top : 0
    const relRight = typeof style?.right === 'number' ? style.right : undefined
    const relLeft = typeof style?.left === 'number' ? style.left : undefined

    let top = anchorRect.top + relTop
    let left: number
    if (relRight !== undefined) {
      // right-aligned: anchor right edge minus offset
      left = anchorRect.right - relRight
    } else {
      left = anchorRect.left + (relLeft ?? 0)
    }
    setPos({ top, left })
  }, [style])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Clamp to viewport after render
  useEffect(() => {
    if (!dropdownRef.current || !pos) return
    const el = dropdownRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    // If right-aligned style, anchor from right edge
    const isRightAligned = typeof style?.right === 'number'
    if (isRightAligned) {
      // Position so right edge aligns with computed left
      const adjustedLeft = pos.left - rect.width
      el.style.left = `${Math.max(8, Math.min(adjustedLeft, vw - rect.width - 8))}px`
    } else {
      if (rect.right > vw - 8) el.style.left = `${vw - rect.width - 8}px`
      if (rect.left < 8) el.style.left = '8px'
    }
    if (rect.bottom > vh - 8) {
      el.style.maxHeight = `${vh - rect.top - 8}px`
    }
  }, [pos, style])

  const dropdown = pos ? createPortal(
    <div ref={dropdownRef} style={{
      position: 'fixed',
      top: pos.top,
      left: typeof style?.right === 'number' ? pos.left - 220 : pos.left,
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: 4, minWidth: 220,
      maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
      boxShadow: 'var(--shadow-float)', zIndex: 9999, fontSize: 12,
    }} onClick={e => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  ) : null

  // Render an invisible anchor in-place + portal the dropdown to body
  return (
    <>
      <span ref={anchorRef} style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none' }} />
      {dropdown}
    </>
  )
}

function DropdownItem({ label, icon, isActive, shortcut, count, onClick, color, destructive }: {
  label: string; icon?: React.ReactNode; isActive?: boolean; shortcut?: string; count?: number; onClick: () => void; color?: string; destructive?: boolean
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      padding: '7px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
      background: isActive ? 'var(--color-primary-subtle)' : 'transparent',
      color: destructive ? 'var(--color-danger)' : color || 'var(--color-text-secondary)',
      cursor: 'pointer', fontSize: 12, textAlign: 'left',
      transition: `background var(--duration-fast)`,
    }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--color-primary-subtle)' : 'transparent' }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {isActive && <Check size={14} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />}
      {shortcut && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{shortcut}</span>}
      {count !== undefined && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{count}</span>}
    </button>
  )
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 4 }}>
      <Search size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus
        style={{ flex: 1, background: 'none', border: 'none', color: 'var(--color-text)', fontSize: 12, outline: 'none' }} />
      {value && <X size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', cursor: 'pointer' }} onClick={() => onChange('')} />}
    </div>
  )
}

// ── Status icons ──
const STATUS_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  backlog: { icon: <CircleDashed size={16} strokeWidth={1.5} />, color: 'var(--color-text-tertiary)' },
  todo: { icon: <Circle size={16} strokeWidth={1.5} />, color: 'var(--color-text-secondary)' },
  in_progress: { icon: <Clock size={16} strokeWidth={1.5} />, color: 'var(--color-warning)' },
  in_review: { icon: <CircleDot size={16} strokeWidth={1.5} />, color: 'var(--color-primary)' },
  done: { icon: <CheckCircle2 size={16} strokeWidth={1.5} />, color: 'var(--color-success)' },
}

// ── Priority icons ──
function PriorityBarIcon({ level }: { level: string }) {
  const bars = level === 'urgent' ? 4 : level === 'high' ? 3 : level === 'medium' ? 2 : 1
  const color = level === 'urgent' ? 'var(--color-danger)' : level === 'high' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 14, width: 16 }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ width: 2.5, height: 3 + i * 2.5, borderRadius: 1, background: i <= bars ? color : 'var(--color-border)' }} />
      ))}
    </div>
  )
}

// ═══════════════════════════════════
// ── Status Dropdown ──
// ═══════════════════════════════════
export function StatusDropdown({ current, onSelect, onClose, position, disabledStatuses }: {
  current: Task['status']; onSelect: (s: Task['status']) => void; onClose: () => void; position?: React.CSSProperties
  disabledStatuses?: Record<string, string>
}) {
  const [search, setSearch] = useState('')
  const filtered = KANBAN_COLUMNS.filter(c => c.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <DropdownWrapper onClose={onClose} style={{ position: 'absolute', ...position }}>
      <SearchInput value={search} onChange={setSearch} placeholder="Change status..." />
      {filtered.map((col, i) => {
        const si = STATUS_ICONS[col.id] || STATUS_ICONS.todo
        const disabledReason = disabledStatuses?.[col.id]
        if (disabledReason) {
          return (
            <div key={col.id} title={disabledReason} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '7px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12,
              opacity: 0.45, cursor: 'not-allowed',
            }}>
              <span style={{ color: si.color }}>{si.icon}</span>
              <span style={{ flex: 1, color: 'var(--color-text-tertiary)' }}>{col.label}</span>
              <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 500 }}>Gated</span>
            </div>
          )
        }
        return (
          <DropdownItem
            key={col.id}
            label={col.label}
            icon={<span style={{ color: si.color }}>{si.icon}</span>}
            isActive={current === col.id}
            shortcut={String(i + 1)}
            onClick={() => { onSelect(col.id as Task['status']); onClose() }}
          />
        )
      })}
    </DropdownWrapper>
  )
}

// ═══════════════════════════════════
// ── Priority Dropdown ──
// ═══════════════════════════════════
export function PriorityDropdown({ current, onSelect, onClose, position }: {
  current: Task['priority']; onSelect: (p: Task['priority']) => void; onClose: () => void; position?: React.CSSProperties
}) {
  return (
    <DropdownWrapper onClose={onClose} style={{ position: 'absolute', ...position }}>
      {PRIORITIES.map(p => (
        <DropdownItem
          key={p}
          label={p.charAt(0).toUpperCase() + p.slice(1)}
          icon={<PriorityBarIcon level={p} />}
          isActive={current === p}
          onClick={() => { onSelect(p); onClose() }}
        />
      ))}
    </DropdownWrapper>
  )
}

// ═══════════════════════════════════
// ── Assignee Dropdown ──
// ═══════════════════════════════════
export function AssigneeDropdown({ current, taskCounts, onSelect, onClose, position, appMode }: {
  current: string | undefined; taskCounts?: Record<string, number>; onSelect: (name: string | undefined) => void; onClose: () => void; position?: React.CSSProperties; appMode?: AppMode
}) {
  const assignees = appMode ? getAssignees(appMode) : ASSIGNEES
  const isTeam = appMode === 'team'
  return (
    <DropdownWrapper onClose={onClose} style={{ position: 'absolute', ...position }}>
      <DropdownItem
        label="No assignee"
        icon={<User size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
        isActive={!current}
        count={taskCounts?.['_none']}
        onClick={() => { onSelect(undefined); onClose() }}
      />
      {assignees.map(a => {
        const teamMember = isTeam ? TEAM_MEMBERS.find(m => m.name === a.name) : undefined
        const isHuman = !!teamMember && !a.name.startsWith('Director ')
        return (
          <DropdownItem
            key={a.name}
            label={a.name}
            icon={
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)', fontSize: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {a.avatar}
                {isTeam && isHuman && teamMember && (
                  <PresenceDot status={teamMember.presence} size={4} style={{ position: 'absolute', bottom: -1, right: -1 }} />
                )}
              </div>
            }
            isActive={current === a.name}
            count={taskCounts?.[a.name]}
            onClick={() => { onSelect(a.name); onClose() }}
          />
        )
      })}
    </DropdownWrapper>
  )
}

// ═══════════════════════════════════
// ── Label Dropdown ──
// ═══════════════════════════════════
export function LabelDropdown({ current, onToggle, onClose, position }: {
  current: string[]; onToggle: (label: string) => void; onClose: () => void; position?: React.CSSProperties
}) {
  const [search, setSearch] = useState('')
  const filtered = LABELS.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <DropdownWrapper onClose={onClose} style={{ position: 'absolute', ...position }}>
      <SearchInput value={search} onChange={setSearch} placeholder="Change or add labels..." />
      {filtered.map(l => (
        <button key={l.name} onClick={() => onToggle(l.name)} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--color-text-secondary)',
          cursor: 'pointer', fontSize: 12, textAlign: 'left',
          transition: `background var(--duration-fast)`,
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{
            width: 16, height: 16, borderRadius: 3,
            border: current.includes(l.name) ? 'none' : '1.5px solid var(--color-border)',
            background: current.includes(l.name) ? 'var(--color-primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {current.includes(l.name) && <Check size={10} strokeWidth={3} style={{ color: 'white' }} />}
          </div>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{l.name}</span>
        </button>
      ))}
    </DropdownWrapper>
  )
}

// ═══════════════════════════════════
// ── Estimate Dropdown ──
// ═══════════════════════════════════
export function EstimateDropdown({ current, onSelect, onClose, position }: {
  current: number | undefined; onSelect: (n: number | undefined) => void; onClose: () => void; position?: React.CSSProperties
}) {
  return (
    <DropdownWrapper onClose={onClose} style={{ position: 'absolute', ...position }}>
      <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Complexity</div>
      {COMPLEXITY_LEVELS.map(c => (
        <DropdownItem
          key={c.value}
          label={c.label}
          isActive={current === c.value}
          onClick={() => { onSelect(c.value); onClose() }}
        />
      ))}
    </DropdownWrapper>
  )
}

// ═══════════════════════════════════
// ── Clickable Property Pill ──
// ═══════════════════════════════════
// Used in task detail sidebar and create dialog
export function PropertyPill({ icon, label, color, onClick }: {
  icon?: React.ReactNode; label: string; color?: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5, height: 26,
      padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)',
      background: 'var(--color-surface)', color: color || 'var(--color-text-secondary)',
      cursor: 'pointer', fontSize: 12, fontWeight: 500,
      transition: `background var(--duration-fast)`,
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
    >
      {icon}
      {label}
    </button>
  )
}

// Re-export icons for external use
export { STATUS_ICONS, PriorityBarIcon }
