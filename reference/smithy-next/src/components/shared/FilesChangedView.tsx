import { useState } from 'react'
import { Columns2, AlignJustify, Eye, PanelLeftClose, PanelLeft } from 'lucide-react'
import type { DiffFile } from '../../mock-data'
import type { InlineReviewComment } from '../overlays/mr/mr-types'
import { MRFileTree } from '../overlays/mr/MRFileTree'
import { MRDiffViewer } from '../overlays/mr/MRDiffViewer'

interface FilesChangedViewProps {
  files: DiffFile[]
  /** Inline comments keyed by "file:line" — only used in MR context */
  inlineComments?: Record<string, InlineReviewComment[]>
  /** Enable viewed file tracking (checkboxes) — MR context only */
  showViewed?: boolean
  viewedFiles?: Set<string>
  onToggleViewed?: (path: string) => void
  /** Enable inline commenting (+ button on hover) — MR context only */
  enableCommenting?: boolean
  /** Hide whitespace toggle */
  hideWhitespace?: boolean
  /** Callback to open a file in the editor */
  onOpenInEditor?: (filePath: string) => void
}

export function FilesChangedView({
  files,
  inlineComments = {},
  showViewed = false,
  viewedFiles: externalViewedFiles,
  onToggleViewed: externalToggleViewed,
  enableCommenting = false,
  hideWhitespace: externalHideWhitespace,
  onOpenInEditor,
}: FilesChangedViewProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>(() => window.innerWidth <= 768 ? 'unified' : 'unified')
  const [hideWhitespace, setHideWhitespace] = useState(externalHideWhitespace ?? false)
  const [treeCollapsed, setTreeCollapsed] = useState(() => window.innerWidth <= 900)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [scrollToFile, setScrollToFile] = useState<string | null>(null)
  const [internalViewedFiles, setInternalViewedFiles] = useState<Set<string>>(new Set())

  // Use external viewed state if provided, otherwise internal
  const viewedFiles = externalViewedFiles ?? internalViewedFiles
  const toggleViewed = externalToggleViewed ?? ((path: string) => {
    setInternalViewedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  })

  const viewedCount = files.filter(f => viewedFiles.has(f.path)).length

  const handleSelectFile = (path: string) => {
    setActiveFilePath(path)
    setScrollToFile(path)
    setTimeout(() => setScrollToFile(null), 100)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px',
        borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
        height: 36,
      }}>
        {/* Tree toggle */}
        <button
          onClick={() => setTreeCollapsed(!treeCollapsed)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-tertiary)', display: 'flex' }}
          title={treeCollapsed ? 'Show file tree' : 'Hide file tree'}
        >
          {treeCollapsed ? <PanelLeft size={14} strokeWidth={1.5} /> : <PanelLeftClose size={14} strokeWidth={1.5} />}
        </button>

        {/* Unified/Split toggle */}
        <div style={{ display: 'flex', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <button
            onClick={() => setViewMode('unified')}
            style={{
              height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'unified' ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', color: viewMode === 'unified' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11,
            }}
          >
            <AlignJustify size={12} strokeWidth={1.5} /> Unified
          </button>
          <button
            onClick={() => setViewMode('split')}
            style={{
              height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'split' ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', color: viewMode === 'split' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11,
            }}
          >
            <Columns2 size={12} strokeWidth={1.5} /> Split
          </button>
        </div>

        {/* Hide whitespace */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={hideWhitespace}
            onChange={e => setHideWhitespace(e.target.checked)}
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Hide whitespace</span>
        </label>

        <div style={{ flex: 1 }} />

        {/* Viewed counter (only when tracking is enabled) */}
        {showViewed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            <Eye size={12} strokeWidth={1.5} />
            {viewedCount}/{files.length} files viewed
          </div>
        )}
      </div>

      {/* Content area: tree + diff */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File tree */}
        {!treeCollapsed && (
          <div style={{ width: 240, borderRight: '1px solid var(--color-border-subtle)', flexShrink: 0, overflow: 'hidden' }}>
            <MRFileTree
              files={files}
              viewedFiles={viewedFiles}
              onToggleViewed={toggleViewed}
              activeFilePath={activeFilePath}
              onSelectFile={handleSelectFile}
            />
          </div>
        )}

        {/* Diff viewer */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <MRDiffViewer
            files={files}
            viewMode={viewMode}
            viewedFiles={viewedFiles}
            onToggleViewed={toggleViewed}
            inlineComments={inlineComments}
            scrollToFile={scrollToFile}
            hideWhitespace={hideWhitespace}
            enableCommenting={enableCommenting}
            onOpenInEditor={onOpenInEditor}
          />
        </div>
      </div>
    </div>
  )
}
