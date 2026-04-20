import { useState } from 'react'
import type { CIAction, CIRun } from './ci/ci-types'
import { CIRunListView } from './ci/CIRunListView'
import { CIRunDetailView } from './ci/CIRunDetailView'

interface CIOverlayProps {
  runs: CIRun[]
  actions: CIAction[]
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToAutomation?: (workflowId: string) => void
  initialRunId?: string | null
  initialJobId?: string | null
  onRunChange?: (runId: string | null, jobId: string | null) => void
  onCreateAction?: (action: CIAction) => void
}

export function CIOverlay({ runs, actions, onBack, onNavigateToTask, onNavigateToMR, onNavigateToAutomation, initialRunId, initialJobId, onRunChange, onCreateAction }: CIOverlayProps) {
  const [selectedRun, setSelectedRun] = useState<CIRun | null>(() => {
    if (initialRunId) return runs.find(r => r.id === initialRunId) || null
    return null
  })

  const handleSelectRun = (run: CIRun) => {
    setSelectedRun(run)
    onRunChange?.(run.id, null)
  }

  const handleBack = () => {
    setSelectedRun(null)
    onRunChange?.(null, null)
  }

  const handleJobChange = (jobId: string | null) => {
    onRunChange?.(selectedRun?.id || null, jobId)
  }

  if (selectedRun) {
    return (
      <CIRunDetailView
        run={selectedRun}
        onBack={handleBack}
        onNavigateToTask={onNavigateToTask}
        onNavigateToMR={onNavigateToMR}
        onNavigateToAutomation={onNavigateToAutomation}
        initialJobId={initialJobId}
        onJobChange={handleJobChange}
      />
    )
  }

  return (
    <CIRunListView
      runs={runs}
      actions={actions}
      onBack={onBack}
      onSelectRun={handleSelectRun}
      onCreateAction={onCreateAction}
    />
  )
}
