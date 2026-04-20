import { useState, useMemo } from 'react'
import type { MergeRequestExtended, MRDetailTab } from './mr-types'
import { mockMRTimelines, mockMRCommits, mockMRChecks, mockMRDiffFiles } from '../../../mock-data'
import { MRHeader } from './MRHeader'
import { MRConversationTab } from './MRConversationTab'
import { MRFilesChangedTab } from './MRFilesChangedTab'
import { MRCommitsTab } from './MRCommitsTab'
import { MRChecksTab } from './MRChecksTab'
import { MRReviewSidebar } from './MRReviewSidebar'

interface MRDetailViewProps {
  mr: MergeRequestExtended
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToAgents?: () => void
  initialTab?: MRDetailTab
  onTabChange?: (tab: string) => void
  onOpenDirector?: (directorId: string) => void
  onNavigateToPreview?: (mrId: string) => void
  onOpenInEditor?: (filePath: string, branch?: string) => void
}

export function MRDetailView({ mr, onBack, onNavigateToTask, onNavigateToSession, onNavigateToAgents, initialTab, onTabChange, onOpenDirector, onNavigateToPreview, onOpenInEditor }: MRDetailViewProps) {
  const [activeTab, setActiveTabRaw] = useState<MRDetailTab>(initialTab || 'conversation')
  const setActiveTab = (tab: MRDetailTab) => {
    setActiveTabRaw(tab)
    onTabChange?.(tab)
  }
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set())

  const timeline = mockMRTimelines[mr.id] || []
  const commits = mockMRCommits[mr.id] || []
  const checks = mockMRChecks[mr.id] || []
  const diffFiles = mockMRDiffFiles[mr.id] || []

  const toggleViewed = (path: string) => {
    setViewedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'conversation':
        return <MRConversationTab mr={mr} timeline={timeline} checks={checks} onNavigateToSession={onNavigateToSession} onNavigateToChecks={() => setActiveTab('checks')} onNavigateToPreview={onNavigateToPreview} />
      case 'files':
        return <MRFilesChangedTab files={diffFiles} timeline={timeline} viewedFiles={viewedFiles} onToggleViewed={toggleViewed} onOpenInEditor={onOpenInEditor ? (f) => onOpenInEditor(f, mr.branch) : undefined} />
      case 'commits':
        return <MRCommitsTab commits={commits} diffFiles={diffFiles} onOpenInEditor={onOpenInEditor ? (f) => onOpenInEditor(f, mr.branch) : undefined} />
      case 'checks':
        return <MRChecksTab checks={checks} />
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MRHeader
        mr={mr}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBack={onBack}
        onNavigateToTask={onNavigateToTask}
        onNavigateToSession={onOpenDirector || onNavigateToSession}
        onNavigateToAgents={onNavigateToAgents}
        onNavigateToPreview={onNavigateToPreview}
        timeline={timeline}
        commits={commits}
        checks={checks}
        diffFileCount={diffFiles.length}
      />

      {/* Content: tab + sidebar */}
      <div className="mr-detail-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {renderTab()}
        </div>

        {/* Sidebar */}
        <MRReviewSidebar
          mr={mr}
          onNavigateToTask={onNavigateToTask}
          onNavigateToSession={onOpenDirector || onNavigateToSession}
          onNavigateToAgents={onNavigateToAgents}
          onNavigateToPreview={onNavigateToPreview}
        />
      </div>
    </div>
  )
}
