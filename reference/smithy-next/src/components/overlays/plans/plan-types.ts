export type PlanStatus = 'draft' | 'active' | 'completed' | 'cancelled'

export type PlanFilterField = 'status' | 'tag' | 'creator'
export interface PlanActiveFilter { field: PlanFilterField; value: string }

export type PlanSortField = 'name' | 'updated' | 'progress' | 'taskCount'
export type PlanGroupField = 'status' | 'creator' | 'none'
export type PlanViewMode = 'list' | 'kanban'

export const PLAN_STATUS_CONFIG: Record<PlanStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--color-warning)' },
  active: { label: 'Active', color: 'var(--color-success)' },
  completed: { label: 'Completed', color: 'var(--color-primary)' },
  cancelled: { label: 'Cancelled', color: 'var(--color-text-tertiary)' },
}

export const PLAN_KANBAN_COLUMNS: PlanStatus[] = ['draft', 'active', 'completed', 'cancelled']
