import { useState, useCallback } from 'react'
import { mockPlans, type Plan } from '../../mock-data'
import { PlanListView } from './plans/PlanListView'
import { PlanDetailView } from './plans/PlanDetailView'

interface PlansOverlayProps {
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onNavigateToTasksBoard?: (planId: string, planName: string) => void
  initialPlanId?: string | null
  onPlanChange?: (planId: string | null) => void
}

export function PlansOverlay({ onBack, onNavigateToTask, onNavigateToWhiteboard, onNavigateToTasksBoard, initialPlanId, onPlanChange }: PlansOverlayProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId || null)
  const selectedPlan = selectedPlanId ? mockPlans.find(p => p.id === selectedPlanId) || null : null

  const handleSelectPlan = useCallback((plan: Plan) => {
    setSelectedPlanId(plan.id)
    onPlanChange?.(plan.id)
  }, [onPlanChange])

  const handleBack = useCallback(() => {
    setSelectedPlanId(null)
    onPlanChange?.(null)
  }, [onPlanChange])

  if (selectedPlan) {
    return (
      <PlanDetailView
        plan={selectedPlan}
        onBack={handleBack}
        onNavigateToTask={onNavigateToTask}
        onNavigateToWhiteboard={onNavigateToWhiteboard}
        onNavigateToTasksBoard={onNavigateToTasksBoard}
      />
    )
  }

  return (
    <PlanListView
      plans={mockPlans}
      onSelectPlan={handleSelectPlan}
    />
  )
}
