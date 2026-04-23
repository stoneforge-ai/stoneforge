import { useState } from 'react'
import type { Workflow, WFRun } from './automations/wf-types'
import { WorkflowListView } from './automations/WorkflowListView'
import { WorkflowDetailView } from './automations/WorkflowDetailView'
import { WorkflowCreateView } from './automations/WorkflowCreateView'
import { WorkflowRunPage } from './automations/WorkflowRunPage'

interface AutomationsOverlayProps {
  workflows: Workflow[]
  workflowRuns: Record<string, WFRun[]>
  onBack: () => void
  initialWorkflowId?: string | null
  initialTab?: string | null
  initialEdit?: boolean | null
  initialRunNumber?: number | null
  onWorkflowChange?: (id: string | null, tab: string | null, edit: boolean, runNumber?: number | null) => void
  onNavigateToCI?: (runId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToTask?: (taskId: string) => void
}

export function AutomationsOverlay({ workflows, workflowRuns, onBack, initialWorkflowId, initialTab, initialEdit, initialRunNumber, onWorkflowChange, onNavigateToCI, onNavigateToMR, onNavigateToTask }: AutomationsOverlayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialWorkflowId || null)
  const [activeTab, setActiveTab] = useState<string | null>(initialTab || null)
  const [editing, setEditing] = useState(!!initialEdit)
  const [openRunNumber, setOpenRunNumber] = useState<number | null>(initialRunNumber || null)

  const selectedWorkflow = selectedId ? workflows.find(w => w.id === selectedId) || null : null
  const allRuns = selectedId ? workflowRuns[selectedId] || [] : []
  const openRun = openRunNumber ? allRuns.find(r => r.runNumber === openRunNumber) || null : null

  const handleSelectWorkflow = (wf: Workflow) => {
    setSelectedId(wf.id)
    setActiveTab(null)
    setEditing(false)
    setOpenRunNumber(null)
    onWorkflowChange?.(wf.id, null, false)
  }

  const handleBack = () => {
    setSelectedId(null)
    setActiveTab(null)
    setEditing(false)
    setOpenRunNumber(null)
    onWorkflowChange?.(null, null, false)
  }

  const handleTabChange = (tab: string | null) => {
    setActiveTab(tab)
    onWorkflowChange?.(selectedId, tab, false)
  }

  const handleCreate = () => {
    setSelectedId(null)
    setEditing(true)
    setOpenRunNumber(null)
    onWorkflowChange?.(null, null, true)
  }

  const handleEdit = (wf: Workflow) => {
    setSelectedId(wf.id)
    setEditing(true)
    setOpenRunNumber(null)
    onWorkflowChange?.(wf.id, null, true)
  }

  const handleCreateBack = () => {
    if (selectedId) {
      setEditing(false)
      onWorkflowChange?.(selectedId, null, false)
    } else {
      handleBack()
    }
  }

  const handleOpenRun = (run: WFRun) => {
    setOpenRunNumber(run.runNumber)
    onWorkflowChange?.(selectedId, activeTab, false, run.runNumber)
  }

  const handleRunPageBack = () => {
    setOpenRunNumber(null)
    onWorkflowChange?.(selectedId, 'runs', false)
  }

  // Run page
  if (selectedWorkflow && openRun) {
    return (
      <WorkflowRunPage
        workflow={selectedWorkflow}
        run={openRun}
        onBack={handleRunPageBack}
        onNavigateToCI={onNavigateToCI}
        onNavigateToMR={onNavigateToMR}
        onNavigateToTask={onNavigateToTask}
      />
    )
  }

  // Create / Edit view
  if (editing) {
    return (
      <WorkflowCreateView
        workflow={selectedWorkflow}
        onBack={handleCreateBack}
        allWorkflows={workflows}
        onSelectWorkflow={handleSelectWorkflow}
      />
    )
  }

  // Detail view
  if (selectedWorkflow) {
    return (
      <WorkflowDetailView
        workflow={selectedWorkflow}
        runs={allRuns}
        allWorkflows={workflows}
        onSelectWorkflow={handleSelectWorkflow}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onBack={handleBack}
        onEdit={() => handleEdit(selectedWorkflow)}
        onNavigateToCI={onNavigateToCI}
        onNavigateToMR={onNavigateToMR}
        onNavigateToTask={onNavigateToTask}
        onOpenRun={handleOpenRun}
      />
    )
  }

  // List view
  return (
    <WorkflowListView
      workflows={workflows}
      workflowRuns={workflowRuns}
      onSelectWorkflow={handleSelectWorkflow}
      onCreate={handleCreate}
    />
  )
}
