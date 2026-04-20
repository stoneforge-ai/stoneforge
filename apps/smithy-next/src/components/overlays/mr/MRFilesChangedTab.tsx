import { useMemo } from 'react'
import type { DiffFile } from '../../../mock-data'
import type { MRTimelineEvent, InlineReviewComment } from './mr-types'
import { FilesChangedView } from '../../shared/FilesChangedView'

interface MRFilesChangedTabProps {
  files: DiffFile[]
  timeline: MRTimelineEvent[]
  viewedFiles: Set<string>
  onToggleViewed: (path: string) => void
  onOpenInEditor?: (filePath: string) => void
}

export function MRFilesChangedTab({ files, timeline, viewedFiles, onToggleViewed, onOpenInEditor }: MRFilesChangedTabProps) {
  // Collect inline comments from timeline events (reviews, agent review)
  const inlineComments = useMemo(() => {
    const comments: Record<string, InlineReviewComment[]> = {}
    for (const event of timeline) {
      const reviewComments = event.review?.comments || event.agentReview?.comments || []
      for (const c of reviewComments) {
        const key = `${c.file}:${c.line}`
        if (!comments[key]) comments[key] = []
        comments[key].push(c)
      }
    }
    return comments
  }, [timeline])

  return (
    <FilesChangedView
      files={files}
      inlineComments={inlineComments}
      showViewed
      viewedFiles={viewedFiles}
      onToggleViewed={onToggleViewed}
      enableCommenting
      onOpenInEditor={onOpenInEditor}
    />
  )
}
