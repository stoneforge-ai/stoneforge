import { useState, useCallback, useRef, useEffect } from 'react'
import { KANBAN_COLUMNS, PRIORITIES, ASSIGNEES, COMPLEXITY_LEVELS, TEAM_MEMBERS, currentUser, getAssignees, type Task } from '../mock-data'
import { mockAgentsExtended, mockRoleDefinitions } from './overlays/agents/agent-mock-data'
import {
  CircleDot, GitMerge, AlertTriangle, AlertCircle, ArrowUp, ArrowDown, Minus, Play,
  LayoutGrid, List, Filter, X, ChevronDown, ChevronRight, Calendar, Hash,
  User, Tag, MoreHorizontal, Copy, Archive, Layers, SlidersHorizontal,
  EyeOff, Eye, Plus, Settings, Search, UserCheck, ListChecks,
} from 'lucide-react'
import {
  StatusDropdown, PriorityDropdown, AssigneeDropdown, LabelDropdown,
  STATUS_ICONS, PriorityBarIcon,
} from './dropdowns/PropertyDropdowns'
import { Tooltip } from './Tooltip'
import { useTeamContext } from '../TeamContext'
import { PresenceDot } from './PresenceDot'

interface KanbanBoardProps {
  tasks: Task[]
  onSelectTask: (task: Task) => void
  viewMode: 'kanban' | 'list'
  onToggleView: () => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string) => void
  onClearSelection: () => void
  peekTaskId: string | null
  onPeekTask: (taskId: string | null) => void
  onCreateTask: () => void
  initialPlanFilter?: { planId: string; planName: string } | null
}

type FilterField = 'priority' | 'assignee' | 'label' | 'status' | 'plan'
interface ActiveFilter { field: FilterField; value: string }
type SortField = 'priority' | 'updatedAt' | 'title' | 'estimate'
type GroupField = 'status' | 'priority' | 'assignee' | 'label'

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }

export function KanbanBoard({ tasks, onSelectTask, viewMode, onToggleView, onUpdateTask, selectedTaskIds, onToggleSelect, onClearSelection, peekTaskId, onPeekTask, onCreateTask, initialPlanFilter }: KanbanBoardProps) {
  const [filters, setFilters] = useState<ActiveFilter[]>(() => {
    if (initialPlanFilter) return [{ field: 'plan' as FilterField, value: initialPlanFilter.planId }]
    return []
  })
  // Sync plan filter when navigating from a Plan detail page
  useEffect(() => {
    if (initialPlanFilter) {
      setFilters(prev => {
        const withoutPlan = prev.filter(f => f.field !== 'plan')
        return [...withoutPlan, { field: 'plan' as FilterField, value: initialPlanFilter.planId }]
      })
    }
  }, [initialPlanFilter])

  const [filterOpen, setFilterOpen] = useState(false)
  const [sortField, setSortField] = useState<SortField>('priority')
  const [sortAsc, setSortAsc] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupField>('status')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [displayOptionsOpen, setDisplayOptionsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)

  const { isTeamMode, getUserById } = useTeamContext()
  const [showMine, setShowMineRaw] = useState(() => {
    const saved = localStorage.getItem('sf-task-tab')
    if (saved !== null) return saved === 'mine'
    return isTeamMode
  })
  const setShowMine = (v: boolean) => {
    setShowMineRaw(v)
    localStorage.setItem('sf-task-tab', v ? 'mine' : 'all')
  }
  // Sync showMine default when mode changes (only if no saved preference)
  useEffect(() => { if (!localStorage.getItem('sf-task-tab')) setShowMineRaw(isTeamMode) }, [isTeamMode])

  // When filtering by plan, show all plan tasks (including sub-tasks); otherwise hide sub-tasks
  const hasPlanFilter = filters.some(f => f.field === 'plan')
  const baseTasks = hasPlanFilter ? tasks : tasks.filter(t => !t.parentId)

  // Apply search + filters + "My Tasks" toggle
  const filtered = baseTasks.filter(task => {
    // "My Tasks" filter (team-mode only)
    if (isTeamMode && showMine) {
      const isMine = task.assigneeUserId === currentUser.id || task.assignee?.name === currentUser.name
      if (!isMine) return false
    }
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matches = task.title.toLowerCase().includes(q) ||
        task.id.toLowerCase().includes(q) ||
        task.description?.toLowerCase().includes(q) ||
        task.assignee?.name.toLowerCase().includes(q) ||
        task.labels.some(l => l.toLowerCase().includes(q)) ||
        task.branch?.toLowerCase().includes(q)
      if (!matches) return false
    }
    return filters.every(f => {
      switch (f.field) {
        case 'priority': return task.priority === f.value
        case 'assignee': return task.assignee?.name === f.value
        case 'label': return task.labels.includes(f.value)
        case 'status': return task.status === f.value
        case 'plan': return task.planId === f.value || (task.parentId && tasks.find(p => p.id === task.parentId)?.planId === f.value)
        default: return true
      }
    })
  })

  // Sort (for list view)
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'priority': cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]; break
      case 'title': cmp = a.title.localeCompare(b.title); break
      case 'estimate': cmp = (a.estimate || 0) - (b.estimate || 0); break
      case 'updatedAt': cmp = 0; break // mock data doesn't have real dates
    }
    return sortAsc ? cmp : -cmp
  })

  const toggleFilter = (field: FilterField, value: string) => {
    setFilters(prev => {
      const exists = prev.some(f => f.field === field && f.value === value)
      if (exists) return prev.filter(f => !(f.field === field && f.value === value))
      return [...prev, { field, value }]
    })
  }

  const removeFilter = (index: number) => setFilters(filters.filter((_, i) => i !== index))

  const allLabels = [...new Set(baseTasks.flatMap(t => t.labels))]
  const allAssignees = [...new Set(baseTasks.map(t => t.assignee?.name).filter(Boolean))] as string[]

  const handleContextMenu = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, taskId })
  }

  const handleDrop = (targetStatus: Task['status']) => {
    if (!draggedId) return
    const ids = selectedTaskIds.has(draggedId) ? [...selectedTaskIds] : [draggedId]
    ids.forEach(id => onUpdateTask(id, { status: targetStatus }))
    setDraggedId(null)
  }

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  // Keyboard: Space for peek, X for select, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' && hoveredTaskId) {
        e.preventDefault()
        onPeekTask(peekTaskId === hoveredTaskId ? null : hoveredTaskId)
      }
      if (e.key === 'x' && hoveredTaskId) {
        e.preventDefault()
        onToggleSelect(hoveredTaskId)
      }
      if (e.key === 'Escape') {
        if (peekTaskId) onPeekTask(null)
        else if (selectedTaskIds.size > 0) onClearSelection()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPeekTask, onClearSelection, onToggleSelect, hoveredTaskId, peekTaskId, selectedTaskIds])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Tasks</span>

        {/* "My Tasks" toggle — team-mode only */}
        {isTeamMode && (
          <div style={{ display: 'flex', gap: 2, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
            {[{ key: true, label: 'My Tasks' }, { key: false, label: 'All Tasks' }].map(({ key, label }) => (
              <button key={label} onClick={() => setShowMine(key)} style={{
                height: 22, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: showMine === key ? 'var(--color-surface-active)' : 'transparent',
                color: showMine === key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all var(--duration-fast)',
              }}>
                {key && <UserCheck size={11} strokeWidth={1.5} />}
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Active filters */}
        {filters.map((f, i) => (
          <span key={i} style={{ height: 22, padding: '0 6px 0 8px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 500 }}>
            {f.field === 'plan' ? `plan: ${initialPlanFilter?.planName || f.value}` : `${f.field}: ${f.value}`}
            <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => removeFilter(i)} />
          </span>
        ))}
        {filters.length > 0 && (
          <button onClick={() => setFilters([])} style={{ height: 22, padding: '0 6px', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>Clear all</button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search — full bar on desktop, icon on mobile */}
        <div className="task-search-container">
          {/* Desktop: always-visible search bar */}
          <div className="task-search-desktop" style={{ display: 'flex' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
              <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tasks..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>}
            </div>
          </div>
          {/* Mobile: icon that expands */}
          <div className="task-search-mobile" style={{ display: 'none' }}>
            {searchExpanded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 180, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border-focus)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
                <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." onBlur={() => { if (!searchQuery) setSearchExpanded(false) }} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
                <button onClick={() => { setSearchQuery(''); setSearchExpanded(false) }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>
              </div>
            ) : (
              <button onClick={() => setSearchExpanded(true)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <Search size={13} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
        <style>{`
          @media (max-width: 768px) {
            .task-search-desktop { display: none !important; }
            .task-search-mobile { display: flex !important; }
          }
          @media (min-width: 769px) {
            .task-search-desktop { display: flex !important; }
            .task-search-mobile { display: none !important; }
          }
          @keyframes agentTagPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
            50% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
          }
          .agent-tag-pulse { animation: agentTagPulse 2s ease-in-out infinite; }
        `}</style>

        {/* Selection info */}
        {selectedTaskIds.size > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-accent)', fontWeight: 500 }}>
            {selectedTaskIds.size} selected
            <button onClick={onClearSelection} style={{ marginLeft: 6, border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>×</button>
          </span>
        )}

        {/* Filter button */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setFilterOpen(!filterOpen)} style={{ height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)', background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)', color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all var(--duration-fast)' }}
            onMouseEnter={e => { if (filters.length === 0) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => e.currentTarget.style.background = filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)'}
          >
            <Filter size={12} strokeWidth={1.5} /> Filter {filters.length > 0 && `(${filters.length})`}
          </button>
          {filterOpen && <FilterPanel tasks={tasks} filters={filters} onToggleFilter={toggleFilter} onClear={() => setFilters([])} onClose={() => setFilterOpen(false)} />}
        </div>

        {/* Display options button */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setDisplayOptionsOpen(!displayOptionsOpen)} style={{ height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)', background: displayOptionsOpen ? 'var(--color-surface-active)' : 'var(--color-surface)', color: displayOptionsOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all var(--duration-fast)' }}
            onMouseEnter={e => { if (!displayOptionsOpen) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => e.currentTarget.style.background = displayOptionsOpen ? 'var(--color-surface-active)' : 'var(--color-surface)'}
          >
            <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
          </button>
          {displayOptionsOpen && <DisplayOptionsPanel groupBy={groupBy} onGroupByChange={setGroupBy} sortField={sortField} onSortChange={setSortField} sortAsc={sortAsc} onSortDirChange={() => setSortAsc(!sortAsc)} hiddenColumns={hiddenColumns} onToggleColumn={col => setHiddenColumns(prev => { const n = new Set(prev); if (n.has(col)) n.delete(col); else n.add(col); return n })} onClose={() => setDisplayOptionsOpen(false)} />}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          {[{ mode: 'kanban' as const, icon: LayoutGrid, label: 'Board' }, { mode: 'list' as const, icon: List, label: 'List' }].map(({ mode, icon: Icon, label }) => (
            <Tooltip key={mode} label={`${label} view`}>
              <button onClick={mode !== viewMode ? onToggleView : undefined} style={{ width: 28, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: viewMode === mode ? 'var(--color-surface-active)' : 'transparent', color: viewMode === mode ? 'var(--color-text)' : 'var(--color-text-tertiary)', cursor: 'pointer', transition: `all var(--duration-fast)` }}
                onMouseEnter={e => { if (viewMode !== mode) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={e => e.currentTarget.style.background = viewMode === mode ? 'var(--color-surface-active)' : 'transparent'}
              >
                <Icon size={14} strokeWidth={1.5} />
              </button>
            </Tooltip>
          ))}
        </div>

        <button onClick={onCreateTask} style={{
          height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          <Plus size={12} strokeWidth={2} /> New Task
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {viewMode === 'kanban' ? (
            <KanbanView tasks={filtered} allTasks={tasks} onSelectTask={onSelectTask} onContextMenu={handleContextMenu} selectedTaskIds={selectedTaskIds} onToggleSelect={onToggleSelect} draggedId={draggedId} onDragStart={setDraggedId} onDrop={handleDrop} peekTaskId={peekTaskId} onPeekTask={onPeekTask} onHoverTask={setHoveredTaskId} hiddenColumns={hiddenColumns} onHideColumn={col => setHiddenColumns(prev => new Set(prev).add(col))} onUnhideColumn={col => setHiddenColumns(prev => { const n = new Set(prev); n.delete(col); return n })} onCreateTask={onCreateTask} onUpdateTask={onUpdateTask} />
          ) : (
            <ListView tasks={sorted} allTasks={tasks} groupBy={groupBy} onSelectTask={onSelectTask} onContextMenu={handleContextMenu} selectedTaskIds={selectedTaskIds} onToggleSelect={onToggleSelect} peekTaskId={peekTaskId} onPeekTask={onPeekTask} onHoverTask={setHoveredTaskId} onUpdateTask={onUpdateTask} />
          )}
        </div>

        {/* Peek preview */}
        {peekTaskId && tasks.find(t => t.id === peekTaskId) && <PeekPanel task={tasks.find(t => t.id === peekTaskId)!} allTasks={tasks} onClose={() => onPeekTask(null)} onOpen={onSelectTask} />}
      </div>

      {/* Context menu */}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} taskIds={selectedTaskIds.has(contextMenu.taskId) ? [...selectedTaskIds] : [contextMenu.taskId]} onUpdateTask={onUpdateTask} onClose={() => setContextMenu(null)} />}
    </div>
  )
}

// ── Kanban View ──
function KanbanView({ tasks, allTasks, onSelectTask, onContextMenu, selectedTaskIds, onToggleSelect, draggedId, onDragStart, onDrop, peekTaskId, onPeekTask, onHoverTask, hiddenColumns, onHideColumn, onUnhideColumn, onCreateTask, onUpdateTask }: { tasks: Task[]; allTasks: Task[]; onSelectTask: (t: Task) => void; onContextMenu: (e: React.MouseEvent, id: string) => void; selectedTaskIds: Set<string>; onToggleSelect: (id: string) => void; draggedId: string | null; onDragStart: (id: string | null) => void; onDrop: (status: Task['status']) => void; peekTaskId: string | null; onPeekTask: (id: string | null) => void; onHoverTask: (id: string | null) => void; hiddenColumns: Set<string>; onHideColumn: (col: string) => void; onUnhideColumn: (col: string) => void; onCreateTask: () => void; onUpdateTask: (id: string, u: Partial<Task>) => void }) {
  const [columnMenuOpen, setColumnMenuOpen] = useState<string | null>(null)
  const visibleColumns = KANBAN_COLUMNS.filter(c => !hiddenColumns.has(c.id))
  const hiddenCols = KANBAN_COLUMNS.filter(c => hiddenColumns.has(c.id))
  const [showHidden, setShowHidden] = useState(false)

  return (
    <div style={{ display: 'flex', gap: 1, height: '100%', overflow: 'auto', background: 'var(--color-border-subtle)' }}>
      {visibleColumns.map(col => {
        const columnTasks = tasks.filter(t => t.status === col.id)
        return (
          <div key={col.id} style={{ flex: '1 0 220px', minWidth: 220, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(col.id as Task['status'])}
          >
            <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{col.label}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px', fontWeight: 500 }}>{columnTasks.length}</span>
              <div style={{ flex: 1 }} />
              <div style={{ position: 'relative' }}>
                <button onClick={() => setColumnMenuOpen(columnMenuOpen === col.id ? null : col.id)} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', opacity: 0.5 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                  <MoreHorizontal size={13} strokeWidth={1.5} />
                </button>
                {columnMenuOpen === col.id && (
                  <div style={{ position: 'absolute', top: 24, right: 0, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 4, minWidth: 140, boxShadow: 'var(--shadow-float)', zIndex: 1060 }}>
                    <button onClick={() => { onHideColumn(col.id); setColumnMenuOpen(null) }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <EyeOff size={13} strokeWidth={1.5} /> Hide column
                    </button>
                  </div>
                )}
              </div>
              <button onClick={onCreateTask} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', opacity: 0.5 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                <Plus size={13} strokeWidth={1.5} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {columnTasks.map(task => (
                <TaskCard key={task.id} task={task} allTasks={allTasks} onClick={() => onSelectTask(task)} onContextMenu={e => onContextMenu(e, task.id)} isSelected={selectedTaskIds.has(task.id)} onToggleSelect={() => onToggleSelect(task.id)} draggable onDragStart={() => onDragStart(task.id)} isPeeked={peekTaskId === task.id} onPeek={() => onPeekTask(task.id)} onHover={onHoverTask} onUpdateTask={onUpdateTask} />
              ))}
            </div>
          </div>
        )
      })}

      {/* Hidden columns section */}
      {hiddenCols.length > 0 && (
        <div style={{ minWidth: 160, maxWidth: 160, background: 'var(--color-bg)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setShowHidden(!showHidden)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: 0 }}>
            {showHidden ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Hidden columns
          </button>
          {showHidden && hiddenCols.map(col => {
            const count = tasks.filter(t => t.status === col.id).length
            return (
              <button key={col.id} onClick={() => onUnhideColumn(col.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, width: '100%', textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}>
                <span style={{ flex: 1 }}>{col.label}</span>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── List View ──
function ListView({ tasks, allTasks, groupBy, onSelectTask, onContextMenu, selectedTaskIds, onToggleSelect, peekTaskId, onPeekTask, onHoverTask, onUpdateTask }: { tasks: Task[]; allTasks: Task[]; groupBy: GroupField; onSelectTask: (t: Task) => void; onContextMenu: (e: React.MouseEvent, id: string) => void; selectedTaskIds: Set<string>; onToggleSelect: (id: string) => void; peekTaskId: string | null; onPeekTask: (id: string | null) => void; onHoverTask: (id: string | null) => void; onUpdateTask: (id: string, u: Partial<Task>) => void }) {
  const groups = groupTasks(tasks, groupBy)

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {groups.map(g => (
        <div key={g.label} style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{g.label}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px', fontWeight: 500 }}>{g.tasks.length}</span>
          </div>
          {g.tasks.map(task => (
            <ListRow key={task.id} task={task} allTasks={allTasks} onClick={() => onSelectTask(task)} onContextMenu={e => onContextMenu(e, task.id)} isSelected={selectedTaskIds.has(task.id)} onToggleSelect={() => onToggleSelect(task.id)} isPeeked={peekTaskId === task.id} onPeek={() => onPeekTask(task.id)} onHover={onHoverTask} onUpdateTask={onUpdateTask} />
          ))}
        </div>
      ))}
    </div>
  )
}

function groupTasks(tasks: Task[], groupBy: GroupField): { label: string; tasks: Task[] }[] {
  if (groupBy === 'status') return KANBAN_COLUMNS.map(c => ({ label: c.label, tasks: tasks.filter(t => t.status === c.id) })).filter(g => g.tasks.length > 0)
  if (groupBy === 'priority') return PRIORITIES.map(p => ({ label: p.charAt(0).toUpperCase() + p.slice(1), tasks: tasks.filter(t => t.priority === p) })).filter(g => g.tasks.length > 0)
  if (groupBy === 'assignee') {
    const assigned = new Map<string, Task[]>()
    const unassigned: Task[] = []
    tasks.forEach(t => { if (t.assignee) { const k = t.assignee.name; assigned.set(k, [...(assigned.get(k) || []), t]) } else unassigned.push(t) })
    const groups = [...assigned.entries()].map(([label, tasks]) => ({ label, tasks }))
    if (unassigned.length) groups.push({ label: 'Unassigned', tasks: unassigned })
    return groups
  }
  if (groupBy === 'label') {
    const map = new Map<string, Task[]>()
    tasks.forEach(t => t.labels.forEach(l => map.set(l, [...(map.get(l) || []), t])))
    return [...map.entries()].map(([label, tasks]) => ({ label, tasks }))
  }
  return [{ label: 'All', tasks }]
}

/** Returns disabled-status map when acceptance criteria gate "Done" */
function getACGate(task: Task): Record<string, string> | undefined {
  const ac = task.acceptanceCriteria
  if (!ac || ac.length === 0) return undefined
  const unchecked = ac.filter(c => !c.checked).length
  if (unchecked === 0) return undefined
  return { done: `${unchecked} acceptance criteria not yet passing` }
}

// ── Task Card (Kanban) ──
function TaskCard({ task, allTasks, onClick, onContextMenu, isSelected, onToggleSelect, draggable, onDragStart, isPeeked, onPeek, onHover, onUpdateTask }: { task: Task; allTasks: Task[]; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void; isSelected: boolean; onToggleSelect: () => void; draggable?: boolean; onDragStart?: () => void; isPeeked: boolean; onPeek: () => void; onHover: (id: string | null) => void; onUpdateTask: (id: string, u: Partial<Task>) => void }) {
  const { isTeamMode, appMode } = useTeamContext()
  const [hovered, setHovered] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const subTasks = task.subTaskIds ? allTasks.filter(t => task.subTaskIds!.includes(t.id)) : []
  const subDone = subTasks.filter(s => s.status === 'done').length
  const statusInfo = STATUS_ICONS[task.status] || STATUS_ICONS.todo
  const hasUnmatchedTags = task.requiredAgentTags && task.requiredAgentTags.length > 0 && !mockAgentsExtended.some(a => task.requiredAgentTags!.every(t => a.tags.includes(t)))
  const isBlocked = task.blocked || hasUnmatchedTags

  const stopAndOpen = (e: React.MouseEvent, dropdown: string) => {
    e.stopPropagation()
    setOpenDropdown(openDropdown === dropdown ? null : dropdown)
  }

  return (
    <div
      onClick={openDropdown ? () => setOpenDropdown(null) : onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      style={{
        padding: '10px 12px', borderRadius: 'var(--radius-md)',
        background: isSelected ? 'var(--color-primary-subtle)' : isPeeked ? 'var(--color-surface-hover)' : 'var(--color-bg-elevated)',
        cursor: 'pointer', transition: `all var(--duration-fast)`,
        display: 'flex', flexDirection: 'column', gap: 8,
        outline: isSelected ? '1px solid var(--color-primary)' : isPeeked ? '1px solid var(--color-border)' : 'none',
      }}
      onMouseEnter={e => { setHovered(true); onHover(task.id); if (!isSelected && !isPeeked) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { setHovered(false); onHover(null); if (!isSelected && !isPeeked) e.currentTarget.style.background = 'var(--color-bg-elevated)' }}
    >
      {/* Top row: ID + status icon + settings + priority */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Clickable status icon */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => stopAndOpen(e, 'status')} style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: statusInfo.color, cursor: 'pointer', padding: 0 }}>
              {statusInfo.icon}
            </button>
            {openDropdown === 'status' && <StatusDropdown current={task.status} onSelect={s => { onUpdateTask(task.id, { status: s }); setOpenDropdown(null) }} onClose={() => setOpenDropdown(null)} position={{ top: 22, left: 0 }} disabledStatuses={getACGate(task)} />}
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{task.id}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Concurrency claim indicator */}
          {task.claimedBy && <ClaimIndicator task={task} />}
          {hovered && (
            <button onClick={e => { e.stopPropagation(); onPeek() }} title="Peek (Space)" style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: isPeeked ? 'var(--color-primary-subtle)' : 'var(--color-surface)', color: isPeeked ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0 }}>
              <ChevronRight size={12} strokeWidth={2} style={{ transform: isPeeked ? 'rotate(180deg)' : undefined }} />
            </button>
          )}
          {/* Clickable priority */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => stopAndOpen(e, 'priority')} style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
              <PriorityBarIcon level={task.priority} />
            </button>
            {openDropdown === 'priority' && <PriorityDropdown current={task.priority} onSelect={p => { onUpdateTask(task.id, { priority: p }); setOpenDropdown(null) }} onClose={() => setOpenDropdown(null)} position={{ top: 22, right: 0 }} />}
          </div>
          {task.estimate && <ComplexityBadge value={task.estimate} />}
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.4 }}>{task.title}</div>

      {task.labels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {task.labels.map(l => <span key={l} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>{l}</span>)}
        </div>
      )}

      {subTasks.length > 0 && (
        <SubTasksIndicator subTasks={subTasks} subDone={subDone} />
      )}

      {/* Bottom row: statuses + date + assignee */}
      <div className="card-bottom" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2, rowGap: 6 }}>
        {isBlocked && <StatusDot color="var(--color-danger)" icon={AlertCircle} label={hasUnmatchedTags ? 'No matching agents' : 'Blocked'} />}
        {task.sessionStatus && <StatusDot color={task.sessionStatus === 'running' ? 'var(--color-success)' : task.sessionStatus === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'} icon={task.sessionStatus === 'running' ? Play : undefined} label={task.sessionStatus} />}
        {task.ciStatus && task.ciStatus !== 'none' && <StatusDot color={task.ciStatus === 'pass' ? 'var(--color-success)' : task.ciStatus === 'fail' ? 'var(--color-danger)' : 'var(--color-warning)'} icon={CircleDot} label={`CI: ${task.ciStatus}`} />}
        {task.mrStatus && task.mrStatus !== 'none' && <StatusDot color={task.mrStatus === 'merged' ? 'var(--color-primary)' : task.mrStatus === 'needs_review' ? 'var(--color-warning)' : 'var(--color-text-secondary)'} icon={GitMerge} label={task.mrStatus === 'needs_review' ? 'Review' : task.mrStatus} />}
        {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && <AcceptanceCriteriaBadge criteria={task.acceptanceCriteria} />}
        {task.requiredAgentTags && task.requiredAgentTags.length > 0 && (() => {
          const tags = task.requiredAgentTags!
          const matched = !hasUnmatchedTags
          const unmatchedTags = matched ? [] : tags.filter(t => !mockAgentsExtended.some(a => a.enabled && a.tags.includes(t)))
          const label = matched ? `Agent tags: ${tags.join(', ')}` : `No agents match: ${unmatchedTags.join(', ')}`
          return (
            <Tooltip label={label}>
              <span className={matched ? undefined : 'agent-tag-pulse'} style={{ width: 18, height: 18, borderRadius: '50%', background: matched ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: matched ? '#22c55e' : '#ef4444', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {tags.length}
              </span>
            </Tooltip>
          )
        })()}
        {task.requiredRoleDefinitionTags && task.requiredRoleDefinitionTags.length > 0 && (() => {
          const rdTags = task.requiredRoleDefinitionTags!
          const rdMatched = mockRoleDefinitions.some(rd => rdTags.every(t => rd.tags.includes(t)))
          const unmatchedRdTags = rdMatched ? [] : rdTags.filter(t => !mockRoleDefinitions.some(rd => rd.tags.includes(t)))
          const label = rdMatched ? `Role tags: ${rdTags.join(', ')}` : `No roles match: ${unmatchedRdTags.join(', ')}`
          return (
            <Tooltip label={label}>
              <span className={rdMatched ? undefined : 'agent-tag-pulse'} style={{ width: 18, height: 18, borderRadius: 4, background: rdMatched ? 'rgba(124, 58, 237, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: rdMatched ? '#7c3aed' : '#ef4444', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {rdTags.length}
              </span>
            </Tooltip>
          )
        })()}
        {/* Date + assignee pushed right, stays together when wrapping */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {task.dueDate && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{task.dueDate}</span>}
          {task.roleDefinitionId && (() => {
            const rd = mockRoleDefinitions.find(r => r.id === task.roleDefinitionId)
            return rd ? (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-full, 9999px)', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {rd.name}
              </span>
            ) : null
          })()}
          <div style={{ position: 'relative' }}>
            <AssigneeAvatar task={task} onClick={e => stopAndOpen(e, 'assignee')} />
            {openDropdown === 'assignee' && <AssigneeDropdown current={task.assignee?.name} appMode={appMode} onSelect={name => { const a = getAssignees(appMode).find(x => x.name === name); onUpdateTask(task.id, { assignee: a ? { name: a.name, avatar: a.avatar } : undefined }); setOpenDropdown(null) }} onClose={() => setOpenDropdown(null)} position={{ top: 26, right: 0 }} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── List Row ──
function ListRow({ task, allTasks, onClick, onContextMenu, isSelected, onToggleSelect, isPeeked, onPeek, onHover, onUpdateTask }: { task: Task; allTasks: Task[]; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void; isSelected: boolean; onToggleSelect: () => void; isPeeked: boolean; onPeek: () => void; onHover: (id: string | null) => void; onUpdateTask: (id: string, u: Partial<Task>) => void }) {
  const { appMode } = useTeamContext()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const statusInfo = STATUS_ICONS[task.status] || STATUS_ICONS.todo
  const hasUnmatchedTagsLR = task.requiredAgentTags && task.requiredAgentTags.length > 0 && !mockAgentsExtended.some(a => task.requiredAgentTags!.every(t => a.tags.includes(t)))
  const isBlockedLR = task.blocked || hasUnmatchedTagsLR
  const subTasks = task.subTaskIds ? allTasks.filter(t => task.subTaskIds!.includes(t.id)) : []
  const subDone = subTasks.filter(s => s.status === 'done').length

  const stopAndOpen = (e: React.MouseEvent, dropdown: string) => {
    e.stopPropagation()
    setOpenDropdown(openDropdown === dropdown ? null : dropdown)
  }

  return (
    <div onClick={openDropdown ? () => setOpenDropdown(null) : onClick} onContextMenu={onContextMenu}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--color-border-subtle)', transition: `background var(--duration-fast)`,
        background: isSelected ? 'var(--color-primary-subtle)' : isPeeked ? 'var(--color-surface-hover)' : 'transparent',
      }}
      onMouseEnter={e => { onHover(task.id); if (!isSelected && !isPeeked) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { onHover(null); if (!isSelected && !isPeeked) e.currentTarget.style.background = isSelected ? 'var(--color-primary-subtle)' : 'transparent' }}
    >
      {/* Select checkbox */}
      <div onClick={e => { e.stopPropagation(); onToggleSelect() }} style={{ width: 16, height: 16, borderRadius: 3, border: isSelected ? 'none' : '1px solid var(--color-border)', background: isSelected ? 'var(--color-primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        {isSelected && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>
      {/* Clickable priority */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button onClick={e => stopAndOpen(e, 'priority')} style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
          <PriorityBarIcon level={task.priority} />
        </button>
        {openDropdown === 'priority' && <PriorityDropdown current={task.priority} onSelect={p => { onUpdateTask(task.id, { priority: p }); setOpenDropdown(null) }} onClose={() => setOpenDropdown(null)} position={{ top: 22, left: 0 }} />}
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, width: 52, flexShrink: 0 }}>{task.id}</span>
      {/* Clickable status */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button onClick={e => stopAndOpen(e, 'status')} style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: statusInfo.color }}>
          {statusInfo.icon}
        </button>
        {openDropdown === 'status' && <StatusDropdown current={task.status} onSelect={s => { onUpdateTask(task.id, { status: s }); setOpenDropdown(null) }} onClose={() => setOpenDropdown(null)} position={{ top: 22, left: 0 }} disabledStatuses={getACGate(task)} />}
      </div>
      <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
      <div className="list-col-statuses" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {subTasks.length > 0 && <SubTasksIndicator subTasks={subTasks} subDone={subDone} />}
        {task.claimedBy && <ClaimIndicator task={task} />}
        {isBlockedLR && <StatusDot color="var(--color-danger)" icon={AlertCircle} label={hasUnmatchedTagsLR ? 'No matching agents' : 'Blocked'} />}
        {task.sessionStatus && <StatusDot color={task.sessionStatus === 'running' ? 'var(--color-success)' : task.sessionStatus === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'} icon={task.sessionStatus === 'running' ? Play : undefined} label={task.sessionStatus} />}
        {task.ciStatus && task.ciStatus !== 'none' && <StatusDot color={task.ciStatus === 'pass' ? 'var(--color-success)' : task.ciStatus === 'fail' ? 'var(--color-danger)' : 'var(--color-warning)'} icon={CircleDot} label={`CI: ${task.ciStatus}`} />}
        {task.mrStatus && task.mrStatus !== 'none' && <StatusDot color={task.mrStatus === 'merged' ? 'var(--color-primary)' : task.mrStatus === 'needs_review' ? 'var(--color-warning)' : 'var(--color-text-secondary)'} icon={GitMerge} label={task.mrStatus === 'needs_review' ? 'Review' : task.mrStatus} />}
        {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && <AcceptanceCriteriaBadge criteria={task.acceptanceCriteria} />}
        {task.requiredAgentTags && task.requiredAgentTags.length > 0 && (() => {
          const unmatchedLR = hasUnmatchedTagsLR ? task.requiredAgentTags.filter(t => !mockAgentsExtended.some(a => a.enabled && a.tags.includes(t))) : []
          const labelLR = hasUnmatchedTagsLR ? `No agents match: ${unmatchedLR.join(', ')}` : `Agent tags: ${task.requiredAgentTags.join(', ')}`
          return (
            <Tooltip label={labelLR}>
              <span className={hasUnmatchedTagsLR ? 'agent-tag-pulse' : undefined} style={{ width: 18, height: 18, borderRadius: '50%', background: hasUnmatchedTagsLR ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', color: hasUnmatchedTagsLR ? '#ef4444' : '#22c55e', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {task.requiredAgentTags.length}
              </span>
            </Tooltip>
          )
        })()}
        {task.requiredRoleDefinitionTags && task.requiredRoleDefinitionTags.length > 0 && (() => {
          const rdTagsLR = task.requiredRoleDefinitionTags!
          const rdMatchedLR = mockRoleDefinitions.some(rd => rdTagsLR.every(t => rd.tags.includes(t)))
          const unmatchedRdLR = rdMatchedLR ? [] : rdTagsLR.filter(t => !mockRoleDefinitions.some(rd => rd.tags.includes(t)))
          const rdLabelLR = rdMatchedLR ? `Role tags: ${rdTagsLR.join(', ')}` : `No roles match: ${unmatchedRdLR.join(', ')}`
          return (
            <Tooltip label={rdLabelLR}>
              <span className={rdMatchedLR ? undefined : 'agent-tag-pulse'} style={{ width: 18, height: 18, borderRadius: 4, background: rdMatchedLR ? 'rgba(124, 58, 237, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: rdMatchedLR ? '#7c3aed' : '#ef4444', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {rdTagsLR.length}
              </span>
            </Tooltip>
          )
        })()}
        {task.roleDefinitionId && (() => {
          const rdLR = mockRoleDefinitions.find(r => r.id === task.roleDefinitionId)
          return rdLR ? (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-full, 9999px)', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {rdLR.name}
            </span>
          ) : null
        })()}
      </div>
      <span className="list-col-estimate">{task.estimate && <ComplexityBadge value={task.estimate} />}</span>
      <div className="list-col-labels" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {task.labels.slice(0, 2).map(l => <span key={l} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>{l}</span>)}
      </div>
      {task.dueDate && <span className="list-col-due" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{task.dueDate}</span>}
      {/* Clickable assignee with presence dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <AssigneeAvatar task={task} onClick={e => stopAndOpen(e, 'assignee')} />
        {openDropdown === 'assignee' && <AssigneeDropdown current={task.assignee?.name} appMode={appMode} onSelect={name => { const a = getAssignees(appMode).find(x => x.name === name); onUpdateTask(task.id, { assignee: a ? { name: a.name, avatar: a.avatar } : undefined }); setOpenDropdown(null) }} onClose={() => setOpenDropdown(null)} position={{ top: 26, right: 0 }} />}
      </div>
      <span className="list-col-updated" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, width: 60, textAlign: 'right' }}>{task.updatedAt}</span>
    </div>
  )
}

// ── Peek Panel ──
function PeekPanel({ task, allTasks, onClose, onOpen }: { task: Task; allTasks: Task[]; onClose: () => void; onOpen: (t: Task) => void }) {
  const subTasks = task.subTaskIds ? allTasks.filter(t => task.subTaskIds!.includes(t.id)) : []

  return (
    <div className="peek-panel" style={{ width: 'min(380px, 50%)', minWidth: 0, borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'auto', flexShrink: 0 }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{task.id}</div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3, margin: 0 }}>{task.title}</h3>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onOpen(task)} style={{ height: 24, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 11 }}>Open</button>
            <button onClick={onClose} style={{ width: 24, height: 24, border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: 12 }}>
          <MetaRow label="Status" value={task.status.replace(/_/g, ' ')} />
          <MetaRow label="Priority" value={task.priority} />
          {task.assignee && <MetaRow label="Assignee" value={task.assignee.name} />}
          {task.estimate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 60, fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>Complexity</span>
              <ComplexityBadge value={task.estimate} />
            </div>
          )}
          {task.dueDate && <MetaRow label="Due" value={task.dueDate} />}
          {task.branch && <MetaRow label="Branch" value={task.branch} mono />}
        </div>

        {/* Description */}
        {task.description && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.description}</div>
          </div>
        )}

        {/* Sub-tasks */}
        {subTasks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Sub-tasks ({subTasks.filter(s => s.status === 'done').length}/{subTasks.length})</div>
            {subTasks.map(sub => (
              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 12 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: sub.status === 'done' ? 'none' : '1px solid var(--color-border)', background: sub.status === 'done' ? 'var(--color-success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sub.status === 'done' && <span style={{ color: 'white', fontSize: 9, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, flexShrink: 0 }}>{sub.id}</span>
                <span style={{ color: sub.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)', textDecoration: sub.status === 'done' ? 'line-through' : 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Labels */}
        {task.labels.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {task.labels.map(l => <span key={l} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>{l}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Context Menu ──
function ContextMenu({ x, y, taskIds, onUpdateTask, onClose }: { x: number; y: number; taskIds: string[]; onUpdateTask: (id: string, u: Partial<Task>) => void; onClose: () => void }) {
  const count = taskIds.length
  const label = count > 1 ? `${count} tasks` : 'task'
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const handleSectionHover = (section: string) => {
    if (openSections.has(section)) return
    // Clear any existing timer for this section (in case of re-entry)
    const existing = timers.current.get(section)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      setOpenSections(prev => new Set(prev).add(section))
      timers.current.delete(section)
    }, 500)
    timers.current.set(section, t)
  }

  const handleSectionLeave = (section: string) => {
    const t = timers.current.get(section)
    if (t) { clearTimeout(t); timers.current.delete(section) }
  }

  const handleSectionClick = (section: string) => {
    // Cancel any pending hover timer for this section
    const t = timers.current.get(section)
    if (t) { clearTimeout(t); timers.current.delete(section) }
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const setAll = (updates: Partial<Task>) => { taskIds.forEach(id => onUpdateTask(id, updates)); onClose() }

  return (
    <div style={{ position: 'fixed', left: x, top: y, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 4, minWidth: 200, boxShadow: 'var(--shadow-float)', zIndex: 1080, fontSize: 12 }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</div>
      <ContextMenuSection title="Status" isOpen={openSections.has('status')} onHover={() => handleSectionHover('status')} onLeave={() => handleSectionLeave('status')} onClick={() => handleSectionClick('status')}>
        {KANBAN_COLUMNS.map(c => <MenuItem key={c.id} label={c.label} onClick={() => setAll({ status: c.id as Task['status'] })} />)}
      </ContextMenuSection>
      <ContextMenuSection title="Priority" isOpen={openSections.has('priority')} onHover={() => handleSectionHover('priority')} onLeave={() => handleSectionLeave('priority')} onClick={() => handleSectionClick('priority')}>
        {PRIORITIES.map(p => <MenuItem key={p} label={p.charAt(0).toUpperCase() + p.slice(1)} onClick={() => setAll({ priority: p })} />)}
      </ContextMenuSection>
      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
      <MenuItem label="Copy ID" icon={Copy} onClick={onClose} />
      <MenuItem label="Archive" icon={Archive} onClick={onClose} destructive />
    </div>
  )
}

function ContextMenuSection({ title, isOpen, onHover, onLeave, onClick, children }: { title: string; isOpen: boolean; onHover: () => void; onLeave: () => void; onClick: () => void; children: React.ReactNode }) {
  return (
    <div onMouseEnter={onHover} onMouseLeave={() => { if (!isOpen) onLeave() }}>
      <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px', background: isOpen ? 'var(--color-surface-hover)' : 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 12 }}
        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {title}
      </div>
      {isOpen && <div style={{ paddingLeft: 16 }}>{children}</div>}
    </div>
  )
}

function MenuItem({ label, icon: Icon, onClick, destructive }: { label: string; icon?: typeof Copy; onClick: () => void; destructive?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: 'transparent', color: destructive ? 'var(--color-danger)' : 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 12, textAlign: 'left' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {Icon && <Icon size={13} strokeWidth={1.5} />} {label}
    </button>
  )
}

// ── Filter Panel (tabbed, Linear-style) ──
function FilterPanel({ tasks, filters, onToggleFilter, onClear, onClose }: {
  tasks: Task[]; filters: ActiveFilter[]; onToggleFilter: (field: FilterField, value: string) => void; onClear: () => void; onClose: () => void
}) {
  const { isTeamMode, teamMembers } = useTeamContext()
  const [activeTab, setActiveTab] = useState<FilterField>('status')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  // Count tasks per filter value
  const topLevel = tasks.filter(t => !t.parentId)
  const getCounts = (): { value: string; count: number; isActive: boolean; presenceStatus?: 'online' | 'away' | 'offline' }[] => {
    switch (activeTab) {
      case 'status':
        return KANBAN_COLUMNS.map(c => ({ value: c.id, count: topLevel.filter(t => t.status === c.id).length, isActive: filters.some(f => f.field === 'status' && f.value === c.id) }))
      case 'priority':
        return PRIORITIES.map(p => ({ value: p, count: topLevel.filter(t => t.priority === p).length, isActive: filters.some(f => f.field === 'priority' && f.value === p) }))
      case 'assignee': {
        const counts: { value: string; count: number; isActive: boolean; presenceStatus?: 'online' | 'away' | 'offline' }[] = []
        const names = new Set(topLevel.map(t => t.assignee?.name).filter(Boolean) as string[])
        // In team mode, also include all team members even if they have 0 tasks
        if (isTeamMode) {
          teamMembers.forEach(m => names.add(m.name))
        }
        names.forEach(n => {
          const member = isTeamMode ? teamMembers.find(m => m.name === n) : undefined
          const isHuman = !!member && !n.startsWith('Director ')
          counts.push({
            value: n,
            count: topLevel.filter(t => t.assignee?.name === n).length,
            isActive: filters.some(f => f.field === 'assignee' && f.value === n),
            presenceStatus: isTeamMode && isHuman && member ? member.presence : undefined,
          })
        })
        const unassigned = topLevel.filter(t => !t.assignee).length
        if (unassigned > 0) counts.push({ value: '_unassigned', count: unassigned, isActive: false })
        return counts
      }
      case 'label': {
        const labelCounts = new Map<string, number>()
        topLevel.forEach(t => t.labels.forEach(l => labelCounts.set(l, (labelCounts.get(l) || 0) + 1)))
        return [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => ({ value: l, count: c, isActive: filters.some(f => f.field === 'label' && f.value === l) }))
      }
      default: return []
    }
  }

  const items = getCounts()
  const tabs: { field: FilterField; label: string }[] = [
    { field: 'status', label: 'Status' },
    { field: 'priority', label: 'Priority' },
    { field: 'assignee', label: 'Assignees' },
    { field: 'label', label: 'Labels' },
  ]

  const getDisplayName = (value: string) => {
    if (activeTab === 'status') return KANBAN_COLUMNS.find(c => c.id === value)?.label || value
    if (activeTab === 'priority') return value.charAt(0).toUpperCase() + value.slice(1)
    if (value === '_unassigned') return 'Unassigned'
    return value
  }

  return (
    <div ref={ref} style={{ position: 'absolute', top: 30, right: 0, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', minWidth: 280, maxWidth: 'calc(100vw - 32px)', boxShadow: 'var(--shadow-float)', zIndex: 1060 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 12px', gap: 8 }}>
        {filters.length > 0 && <button onClick={onClear} style={{ border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>Clear</button>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '0 8px 8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map(tab => {
          const tabFilterCount = filters.filter(f => f.field === tab.field).length
          return (
            <button key={tab.field} onClick={() => setActiveTab(tab.field)} style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 'var(--radius-sm)',
              background: activeTab === tab.field ? 'var(--color-surface-active)' : 'transparent',
              color: activeTab === tab.field ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              {tab.label}
              {tabFilterCount > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />}
            </button>
          )
        })}
      </div>

      {/* Items */}
      <div style={{ padding: 4, maxHeight: 300, overflow: 'auto' }}>
        {items.map(item => (
          <button key={item.value} onClick={() => onToggleFilter(activeTab, item.value)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '8px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: item.isActive ? 'var(--color-primary-subtle)' : 'transparent',
            color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12,
            transition: `background var(--duration-fast)`,
          }}
            onMouseEnter={e => { if (!item.isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = item.isActive ? 'var(--color-primary-subtle)' : 'transparent' }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.isActive ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
              {getDisplayName(item.value)}
              {item.presenceStatus && <PresenceDot status={item.presenceStatus} size={5} />}
            </span>
            {item.isActive && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Clear filter</span>}
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Display Options Panel ──
function DisplayOptionsPanel({ groupBy, onGroupByChange, sortField, onSortChange, sortAsc, onSortDirChange, hiddenColumns, onToggleColumn, onClose }: {
  groupBy: GroupField; onGroupByChange: (v: GroupField) => void
  sortField: SortField; onSortChange: (v: SortField) => void; sortAsc: boolean; onSortDirChange: () => void
  hiddenColumns: Set<string>; onToggleColumn: (col: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const groupOptions: { value: GroupField; label: string }[] = [{ value: 'status', label: 'Status' }, { value: 'priority', label: 'Priority' }, { value: 'assignee', label: 'Assignee' }, { value: 'label', label: 'Label' }]
  const sortOptions: { value: SortField; label: string }[] = [{ value: 'priority', label: 'Priority' }, { value: 'title', label: 'Title' }, { value: 'estimate', label: 'Estimate' }, { value: 'updatedAt', label: 'Updated' }]

  return (
    <div ref={ref} style={{ position: 'absolute', top: 30, right: 0, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, minWidth: 240, maxWidth: 'calc(100vw - 32px)', boxShadow: 'var(--shadow-float)', zIndex: 1060, fontSize: 12 }}>
      {/* Grouping */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>Grouping</span>
        <select value={groupBy} onChange={e => onGroupByChange(e.target.value as GroupField)} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '4px 8px', fontSize: 12 }}>
          {groupOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Ordering */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>Ordering</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onSortDirChange} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 11 }}>
            {sortAsc ? '↑' : '↓'}
          </button>
          <select value={sortField} onChange={e => onSortChange(e.target.value as SortField)} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '4px 8px', fontSize: 12 }}>
            {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '12px 0' }} />

      {/* Visible columns */}
      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 11, marginBottom: 8 }}>Columns</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {KANBAN_COLUMNS.map(col => {
          const isHidden = hiddenColumns.has(col.id)
          return (
            <button key={col.id} onClick={() => onToggleColumn(col.id)} style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: isHidden ? 'transparent' : 'var(--color-surface-active)',
              color: isHidden ? 'var(--color-text-tertiary)' : 'var(--color-text)',
              textDecoration: isHidden ? 'line-through' : 'none',
              opacity: isHidden ? 0.6 : 1,
            }}>
              {col.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Toolbar dropdowns ──
function GroupByDropdown({ value, onChange }: { value: GroupField; onChange: (v: GroupField) => void }) {
  const [open, setOpen] = useState(false)
  const options: { value: GroupField; label: string }[] = [{ value: 'status', label: 'Status' }, { value: 'priority', label: 'Priority' }, { value: 'assignee', label: 'Assignee' }, { value: 'label', label: 'Label' }]
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
        Group: {options.find(o => o.value === value)?.label} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 30, right: 0, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 4, minWidth: 140, boxShadow: 'var(--shadow-float)', zIndex: 1060 }}>
          {options.map(o => <MenuItem key={o.value} label={o.label} onClick={() => { onChange(o.value); setOpen(false) }} />)}
        </div>
      )}
    </div>
  )
}

function SortDropdown({ value, asc, onChange, onToggleDir }: { value: SortField; asc: boolean; onChange: (v: SortField) => void; onToggleDir: () => void }) {
  const [open, setOpen] = useState(false)
  const options: { value: SortField; label: string }[] = [{ value: 'priority', label: 'Priority' }, { value: 'title', label: 'Title' }, { value: 'estimate', label: 'Estimate' }, { value: 'updatedAt', label: 'Updated' }]
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
        Sort: {options.find(o => o.value === value)?.label} {asc ? '↑' : '↓'} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 30, right: 0, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 4, minWidth: 140, boxShadow: 'var(--shadow-float)', zIndex: 1060 }}>
          {options.map(o => <MenuItem key={o.value} label={o.label} onClick={() => { onChange(o.value); setOpen(false) }} />)}
          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
          <MenuItem label={asc ? 'Descending' : 'Ascending'} onClick={() => { onToggleDir(); setOpen(false) }} />
        </div>
      )}
    </div>
  )
}

// ── Shared ──
function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 60, fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: mono ? 11 : 12, color: 'var(--color-text-secondary)', textTransform: mono ? undefined : 'capitalize', fontFamily: mono ? 'var(--font-mono)' : undefined } as React.CSSProperties}>{value}</span>
    </div>
  )
}

function SubTasksIndicator({ subTasks, subDone }: { subTasks: Task[]; subDone: number }) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<'below' | 'above'>('below')

  const handleEnter = () => {
    setHovered(true)
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setDropdownPos(spaceBelow < 180 ? 'above' : 'below')
    }
  }

  return (
    <div
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', cursor: 'default' }}
    >
      <Layers size={11} strokeWidth={1.5} /> {subDone}/{subTasks.length}
      {hovered && (
        <div style={{
          position: 'absolute', left: 0, zIndex: 1060,
          ...(dropdownPos === 'below' ? { top: '100%', marginTop: 6 } : { bottom: '100%', marginBottom: 6 }),
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 4, minWidth: 200, maxWidth: 280,
          boxShadow: 'var(--shadow-float)',
        }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
            Sub-tasks · {subDone}/{subTasks.length}
          </div>
          {subTasks.map(sub => {
            const si = STATUS_ICONS[sub.status] || STATUS_ICONS.todo
            return (
              <div key={sub.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                borderRadius: 'var(--radius-sm)', fontSize: 12,
                transition: `background var(--duration-fast)`,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ color: si.color, flexShrink: 0 }}>{si.icon}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{sub.id}</span>
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: sub.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                  textDecoration: sub.status === 'done' ? 'line-through' : 'none',
                }}>{sub.title}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AcceptanceCriteriaBadge({ criteria }: { criteria: { id: string; text: string; checked: boolean }[] }) {
  const checked = criteria.filter(c => c.checked).length
  const total = criteria.length
  const allPassing = checked === total
  const color = allPassing ? 'var(--color-success)' : 'var(--color-warning)'
  return (
    <Tooltip label={allPassing ? `Acceptance criteria: all ${total} passing` : `Acceptance criteria: ${checked}/${total} passing`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, color }}>
        <ListChecks size={12} strokeWidth={2} />
        <span style={{ fontSize: 11, fontWeight: 500 }}>{checked}/{total}</span>
      </div>
    </Tooltip>
  )
}

function StatusDot({ color, icon: Icon, label }: { color: string; icon?: typeof CircleDot; label: string }) {
  return (
    <Tooltip label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, color }}>
        {Icon ? <Icon size={12} strokeWidth={2} /> : <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}
        <span className="status-dot-label" style={{ fontSize: 11, fontWeight: 500 }}>{label}</span>
      </div>
    </Tooltip>
  )
}

function ComplexityBadge({ value }: { value: number }) {
  const level = COMPLEXITY_LEVELS.find(c => c.value === value)
  if (!level) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', flexShrink: 0, border: '1px solid var(--color-border)' }}>
      {level.label}
    </span>
  )
}

function PriorityIcon({ priority }: { priority: Task['priority'] }) {
  const props = { size: 14, strokeWidth: 2 }
  switch (priority) {
    case 'urgent': return <AlertTriangle {...props} style={{ color: 'var(--color-danger)' }} />
    case 'high': return <ArrowUp {...props} style={{ color: 'var(--color-warning)' }} />
    case 'medium': return <Minus {...props} style={{ color: 'var(--color-text-tertiary)' }} />
    case 'low': return <ArrowDown {...props} style={{ color: 'var(--color-text-tertiary)' }} />
  }
}

// ── Concurrency Claim Indicator (5.2) ──
function ClaimIndicator({ task }: { task: Task }) {
  const { isTeamMode, getUserById } = useTeamContext()
  if (!task.claimedBy) return null
  const { agentName, launchedByUserId } = task.claimedBy
  const launcher = launchedByUserId ? getUserById(launchedByUserId) : undefined
  const tooltip = isTeamMode && launcher
    ? `${agentName} (launched by ${launcher.name}) is working on this task`
    : `${agentName} is already working on this task`
  return (
    <Tooltip label={tooltip}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-presence-away-subtle)', color: 'var(--color-presence-away)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AlertTriangle size={12} strokeWidth={2} />
      </span>
    </Tooltip>
  )
}

// ── Assignee Avatar with Presence Dot (5.3) ──
function AssigneeAvatar({ task, size = 22, onClick }: { task: Task; size?: number; onClick?: (e: React.MouseEvent) => void }) {
  const { isTeamMode, getUserById } = useTeamContext()
  const teamUser = task.assigneeUserId ? getUserById(task.assigneeUserId) : undefined
  const isHuman = !!teamUser && !task.assignee?.name.startsWith('Director ')
  return (
    <button onClick={onClick} style={{ width: size, height: size, borderRadius: '50%', background: task.assignee ? 'var(--color-primary-muted)' : 'var(--color-surface)', color: task.assignee ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', fontSize: size <= 22 ? 9 : 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', padding: 0, position: 'relative' }}>
      {task.assignee ? task.assignee.avatar : <User size={12} strokeWidth={1.5} />}
      {isTeamMode && isHuman && teamUser && (
        <PresenceDot status={teamUser.presence} size={4} style={{ position: 'absolute', bottom: -1, right: -1 }} />
      )}
    </button>
  )
}
