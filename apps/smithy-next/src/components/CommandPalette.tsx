import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Search, SquareKanban, GitMerge, CircleDot, Eye, Zap, Bot,
  Code, FileText, MessageSquare, Map, BarChart3, Network, Activity,
  Plus, Terminal, Sun, Moon,
} from 'lucide-react'
import type { Task } from '../mock-data'

interface CommandPaletteProps {
  onClose: () => void
  onNavigate: (view: string) => void
  onNavigateToTask: (taskId: string) => void
  onCreateTask: () => void
  onNewWorkspace: () => void
  onToggleTerminal: () => void
  onToggleTheme: () => void
  tasks: Task[]
  theme: 'dark' | 'light'
}

interface PaletteItem {
  id: string
  icon: typeof Search
  label: string
  shortcut?: string
  group: 'navigation' | 'tasks' | 'actions'
  onSelect: () => void
  secondary?: string // task ID, status, etc.
}

const STATUS_DOT: Record<string, string> = {
  backlog: 'var(--color-text-tertiary)',
  todo: 'var(--color-text-secondary)',
  in_progress: 'var(--color-primary)',
  in_review: 'var(--color-warning)',
  done: 'var(--color-success)',
}

export function CommandPalette({
  onClose, onNavigate, onNavigateToTask, onCreateTask, onNewWorkspace,
  onToggleTerminal, onToggleTheme, tasks, theme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Build navigation items
  const navItems: PaletteItem[] = useMemo(() => [
    { id: 'nav-tasks', icon: SquareKanban, label: 'Tasks', shortcut: '⌘1', group: 'navigation', onSelect: () => { onNavigate('kanban'); onClose() } },
    { id: 'nav-mrs', icon: GitMerge, label: 'Merge Requests', shortcut: '⌘2', group: 'navigation', onSelect: () => { onNavigate('merge-requests'); onClose() } },
    { id: 'nav-ci', icon: CircleDot, label: 'CI/CD', shortcut: '⌘3', group: 'navigation', onSelect: () => { onNavigate('ci'); onClose() } },
    { id: 'nav-preview', icon: Eye, label: 'Preview', shortcut: '⌘4', group: 'navigation', onSelect: () => { onNavigate('preview'); onClose() } },
    { id: 'nav-agents', icon: Bot, label: 'Agents', shortcut: '⌘5', group: 'navigation', onSelect: () => { onNavigate('agents'); onClose() } },
    { id: 'nav-automations', icon: Zap, label: 'Automations', shortcut: '⌘6', group: 'navigation', onSelect: () => { onNavigate('automations'); onClose() } },
    { id: 'nav-editor', icon: Code, label: 'Editor', group: 'navigation', onSelect: () => { onNavigate('editor'); onClose() } },
    { id: 'nav-docs', icon: FileText, label: 'Documents', group: 'navigation', onSelect: () => { onNavigate('documents'); onClose() } },
    { id: 'nav-channels', icon: MessageSquare, label: 'Channels', group: 'navigation', onSelect: () => { onNavigate('channels'); onClose() } },
    { id: 'nav-plans', icon: Map, label: 'Plans', group: 'navigation', onSelect: () => { onNavigate('plans'); onClose() } },
    { id: 'nav-metrics', icon: BarChart3, label: 'Metrics', group: 'navigation', onSelect: () => { onNavigate('metrics'); onClose() } },
    { id: 'nav-sessions', icon: Activity, label: 'Sessions', group: 'navigation', onSelect: () => { onNavigate('sessions'); onClose() } },
  ], [onNavigate, onClose])

  // Build action items
  const actionItems: PaletteItem[] = useMemo(() => [
    { id: 'act-create', icon: Plus, label: 'Create task', shortcut: 'C', group: 'actions', onSelect: () => { onCreateTask(); onClose() } },
    { id: 'act-new-workspace', icon: Network, label: 'New Workspace', group: 'actions', onSelect: () => { onNewWorkspace(); onClose() } },
    { id: 'act-terminal', icon: Terminal, label: 'Toggle terminal', shortcut: '⌘`', group: 'actions', onSelect: () => { onToggleTerminal(); onClose() } },
    { id: 'act-theme', icon: theme === 'dark' ? Sun : Moon, label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', group: 'actions', onSelect: () => { onToggleTheme(); onClose() } },
  ], [onCreateTask, onNewWorkspace, onToggleTerminal, onToggleTheme, onClose, theme])

  // Filter and build visible items
  const visibleItems = useMemo(() => {
    const q = query.toLowerCase().trim()
    const results: PaletteItem[] = []

    // Filter nav
    const filteredNav = q
      ? navItems.filter(item => item.label.toLowerCase().includes(q))
      : navItems
    results.push(...filteredNav)

    // Filter tasks (only when query is non-empty)
    if (q) {
      const matchingTasks = tasks.filter(t =>
        t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
      ).slice(0, 6)
      results.push(...matchingTasks.map(t => ({
        id: `task-${t.id}`,
        icon: SquareKanban,
        label: t.title,
        secondary: t.id,
        group: 'tasks' as const,
        onSelect: () => { onNavigateToTask(t.id); onClose() },
      })))
    }

    // Filter actions
    const filteredActions = q
      ? actionItems.filter(item => item.label.toLowerCase().includes(q))
      : actionItems
    results.push(...filteredActions)

    return results
  }, [query, navItems, actionItems, tasks, onNavigateToTask, onClose])

  // Reset active index when query changes
  useEffect(() => { setActiveIndex(0) }, [query])

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, visibleItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (visibleItems[activeIndex]) visibleItems[activeIndex].onSelect()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [visibleItems, activeIndex, onClose])

  // Auto-scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Group items for rendering
  const groups = useMemo(() => {
    const g: { key: string; label: string; items: (PaletteItem & { flatIndex: number })[] }[] = []
    let flatIndex = 0
    const navGroup = visibleItems.filter(i => i.group === 'navigation')
    if (navGroup.length) {
      g.push({ key: 'navigation', label: 'Navigation', items: navGroup.map(i => ({ ...i, flatIndex: flatIndex++ })) })
    }
    const taskGroup = visibleItems.filter(i => i.group === 'tasks')
    if (taskGroup.length) {
      g.push({ key: 'tasks', label: 'Tasks', items: taskGroup.map(i => ({ ...i, flatIndex: flatIndex++ })) })
    }
    const actionGroup = visibleItems.filter(i => i.group === 'actions')
    if (actionGroup.length) {
      g.push({ key: 'actions', label: 'Actions', items: actionGroup.map(i => ({ ...i, flatIndex: flatIndex++ })) })
    }
    return g
  }, [visibleItems])

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-bg-overlay)',
        zIndex: 'var(--z-command)' as unknown as number,
      }} />

      {/* Palette */}
      <div
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: 560, maxWidth: '90vw',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 16px 70px rgba(0,0,0,0.5)',
          zIndex: 'var(--z-command)' as unknown as number,
          display: 'flex', flexDirection: 'column',
          animation: 'commandPaletteIn 120ms ease-out',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          height: 44, flexShrink: 0,
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <Search size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search or type a command..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--color-text)', fontSize: 14,
            }}
          />
          {query && (
            <span
              onClick={() => setQuery('')}
              style={{
                fontSize: 10, color: 'var(--color-text-tertiary)', cursor: 'pointer',
                padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              ESC
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} style={{
          maxHeight: 360, overflowY: 'auto', padding: '4px 0',
          scrollbarWidth: 'thin',
        }}>
          {groups.length === 0 ? (
            <div style={{
              padding: '24px 16px', textAlign: 'center',
              color: 'var(--color-text-tertiary)', fontSize: 13,
            }}>
              No results found
            </div>
          ) : groups.map(group => (
            <div key={group.key}>
              {/* Group header */}
              <div style={{
                padding: '8px 14px 4px', fontSize: 11, fontWeight: 500,
                color: 'var(--color-text-tertiary)', letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}>
                {group.label}
              </div>
              {/* Group items */}
              {group.items.map(item => {
                const Icon = item.icon
                const isActive = item.flatIndex === activeIndex
                return (
                  <div
                    key={item.id}
                    data-index={item.flatIndex}
                    onClick={item.onSelect}
                    onMouseEnter={() => setActiveIndex(item.flatIndex)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      height: 32, padding: '0 14px', margin: '0 4px',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      background: isActive ? 'var(--color-primary-subtle)' : 'none',
                      color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      transition: 'background 60ms',
                    }}
                  >
                    {item.group === 'tasks' ? (
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        border: `1.5px solid ${STATUS_DOT[(tasks.find(t => `task-${t.id}` === item.id)?.status) || 'todo'] || 'var(--color-text-tertiary)'}`,
                      }} />
                    ) : (
                      <Icon size={15} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.7 }} />
                    )}
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    {item.secondary && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                        {item.secondary}
                      </span>
                    )}
                    {item.shortcut && (
                      <span style={{
                        fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)',
                        padding: '1px 5px', borderRadius: 3,
                        background: 'var(--color-surface)', flexShrink: 0,
                      }}>
                        {item.shortcut}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px',
          borderTop: '1px solid var(--color-border-subtle)',
          fontSize: 10, color: 'var(--color-text-tertiary)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <kbd style={kbdStyle}>↑↓</kbd> navigate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <kbd style={kbdStyle}>↵</kbd> select
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <kbd style={kbdStyle}>esc</kbd> close
          </span>
        </div>
      </div>
    </>
  )
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 4px', borderRadius: 3, fontSize: 10,
  background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
  fontFamily: 'var(--font-mono)',
}
