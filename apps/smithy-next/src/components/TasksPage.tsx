import { useState, useCallback } from 'react'
import { mockPlans, type Task, type Plan } from '../mock-data'
import { KanbanBoard } from './KanbanBoard'
import { PlanListView } from './overlays/plans/PlanListView'
import { PlanDetailView } from './overlays/plans/PlanDetailView'

interface TasksPageProps {
  // KanbanBoard props
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
  // Tab state
  activeTab: 'tasks' | 'plans'
  onTabChange: (tab: 'tasks' | 'plans') => void
  // PlansOverlay props
  onNavigateToTask: (taskId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onNavigateToTasksBoard?: (planId: string, planName: string) => void
  initialPlanId?: string | null
  onPlanChange?: (planId: string | null) => void
}

export function TasksPage({
  tasks,
  onSelectTask,
  viewMode,
  onToggleView,
  onUpdateTask,
  selectedTaskIds,
  onToggleSelect,
  onClearSelection,
  peekTaskId,
  onPeekTask,
  onCreateTask,
  initialPlanFilter,
  activeTab,
  onTabChange,
  onNavigateToTask,
  onNavigateToWhiteboard,
  onNavigateToTasksBoard,
  initialPlanId,
  onPlanChange,
}: TasksPageProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId || null)
  const selectedPlan = selectedPlanId ? mockPlans.find(p => p.id === selectedPlanId) || null : null

  const handleSelectPlan = useCallback((plan: Plan) => {
    setSelectedPlanId(plan.id)
    onPlanChange?.(plan.id)
  }, [onPlanChange])

  const handlePlanBack = useCallback(() => {
    setSelectedPlanId(null)
    onPlanChange?.(null)
  }, [onPlanChange])

  const isInPlanDetail = activeTab === 'plans' && selectedPlan !== null
  const showTabs = !isInPlanDetail

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {showTabs && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, padding: '0 16px' }}>
          {([
            { key: 'tasks' as const, label: `Tasks (${tasks.length})` },
            { key: 'plans' as const, label: `Plans (${mockPlans.length})` },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              style={{
                padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: 'transparent',
                color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'tasks' && (
          <KanbanBoard
            tasks={tasks}
            onSelectTask={onSelectTask}
            viewMode={viewMode}
            onToggleView={onToggleView}
            onUpdateTask={onUpdateTask}
            selectedTaskIds={selectedTaskIds}
            onToggleSelect={onToggleSelect}
            onClearSelection={onClearSelection}
            peekTaskId={peekTaskId}
            onPeekTask={onPeekTask}
            onCreateTask={onCreateTask}
            initialPlanFilter={initialPlanFilter}
          />
        )}
        {activeTab === 'plans' && selectedPlan && (
          <PlanDetailView
            plan={selectedPlan}
            onBack={handlePlanBack}
            onNavigateToTask={onNavigateToTask}
            onNavigateToWhiteboard={onNavigateToWhiteboard}
            onNavigateToTasksBoard={onNavigateToTasksBoard}
          />
        )}
        {activeTab === 'plans' && !selectedPlan && (
          <PlanListView
            plans={mockPlans}
            onSelectPlan={handleSelectPlan}
          />
        )}
      </div>
    </div>
  )
}
