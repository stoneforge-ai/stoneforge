import { useState, useEffect } from 'react'
import type { MergeRequestExtended } from './mr/mr-types'
import type { MRDetailTab } from './mr/mr-types'
import { MRListView } from './mr/MRListView'
import { MRDetailView } from './mr/MRDetailView'

interface MergeRequestsOverlayProps {
  mergeRequests: MergeRequestExtended[]
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToAgents?: () => void
  initialMRId?: string | null
  initialTab?: string | null
  onMRChange?: (mrId: string | null, tab: string | null) => void
  onOpenDirector?: (directorId: string) => void
  onNavigateToPreview?: (mrId: string) => void
  onOpenInEditor?: (filePath: string, branch?: string) => void
  onCreateMR?: (mr: Partial<MergeRequestExtended>) => void
}

export function MergeRequestsOverlay({ mergeRequests, onBack, onNavigateToTask, onNavigateToSession, onNavigateToAgents, initialMRId, initialTab, onMRChange, onOpenDirector, onNavigateToPreview, onOpenInEditor, onCreateMR }: MergeRequestsOverlayProps) {
  const [selectedMR, setSelectedMR] = useState<MergeRequestExtended | null>(() => {
    if (initialMRId) return mergeRequests.find(mr => mr.id === initialMRId) || null
    return null
  })

  const handleSelectMR = (mr: MergeRequestExtended) => {
    setSelectedMR(mr)
    onMRChange?.(mr.id, null)
  }

  const handleBack = () => {
    setSelectedMR(null)
    onMRChange?.(null, null)
  }

  const handleTabChange = (tab: string) => {
    onMRChange?.(selectedMR?.id || null, tab)
  }

  if (selectedMR) {
    return (
      <MRDetailView
        mr={selectedMR}
        onBack={handleBack}
        onNavigateToTask={onNavigateToTask}
        onNavigateToSession={onNavigateToSession}
        onNavigateToAgents={onNavigateToAgents}
        initialTab={(initialTab as MRDetailTab) || undefined}
        onTabChange={handleTabChange}
        onOpenDirector={onOpenDirector}
        onNavigateToPreview={onNavigateToPreview}
        onOpenInEditor={onOpenInEditor}
      />
    )
  }

  return (
    <MRListView
      mergeRequests={mergeRequests}
      onSelectMR={handleSelectMR}
      onCreateMR={onCreateMR}
    />
  )
}
