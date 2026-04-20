import { useState, useCallback, useRef, useEffect } from 'react'
import type { Document, DocumentVersion } from './documents/doc-types'
import { mockDocuments, mockLibraries, mockVersions } from './documents/doc-mock-data'
import { DocNavPanel } from './documents/DocNavPanel'
import { DocListView } from './documents/DocListView'
import { DocEditorView } from './documents/DocEditorView'
import { DocVersionHistory } from './documents/DocVersionHistory'
import { CreateDocumentDialog } from './documents/CreateDocumentDialog'

interface DocumentsOverlayProps {
  onBack: () => void
  initialDocId?: string | null
  onDocChange?: (docId: string | null) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
}

export function DocumentsOverlay({ onBack: _onBack, initialDocId, onDocChange, onNavigateToTask, onNavigateToMR }: DocumentsOverlayProps) {
  const [documents, setDocuments] = useState(mockDocuments)
  const [libraries] = useState(mockLibraries)
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(() => {
    if (initialDocId) return mockDocuments.find(d => d.id === initialDocId) || null
    return null
  })
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [viewingVersion, setViewingVersion] = useState<DocumentVersion | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [recentDocIds, setRecentDocIds] = useState<string[]>(() => {
    return [...mockDocuments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map(d => d.id)
  })

  // Responsive: measure container width
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const isNarrow = containerWidth < 800

  const handleSelectDoc = useCallback((doc: Document) => {
    setSelectedDoc(doc)
    onDocChange?.(doc.id)
    setRecentDocIds(prev => {
      const filtered = prev.filter(id => id !== doc.id)
      return [doc.id, ...filtered].slice(0, 10)
    })
  }, [onDocChange])

  const handleBack = useCallback(() => {
    setSelectedDoc(null)
    setShowVersionHistory(false)
    setViewingVersion(null)
    onDocChange?.(null)
  }, [onDocChange])

  const handleRestoreVersion = useCallback(() => {
    if (!selectedDoc || !viewingVersion) return
    // In a real app this would call an API. Here we update mock state.
    setDocuments(prev => prev.map(d =>
      d.id === selectedDoc.id
        ? { ...d, content: viewingVersion.content, title: viewingVersion.title, version: d.version + 1, updatedAt: '2026-04-14' }
        : d
    ))
    setSelectedDoc(prev => prev ? { ...prev, content: viewingVersion.content, title: viewingVersion.title, version: prev.version + 1, updatedAt: '2026-04-14' } : null)
    setViewingVersion(null)
  }, [selectedDoc, viewingVersion])

  const handleNavigateToDoc = useCallback((docId: string) => {
    const doc = documents.find(d => d.id === docId)
    if (doc) handleSelectDoc(doc)
  }, [documents, handleSelectDoc])

  const handleCreateDoc = useCallback((newDoc: Document) => {
    setDocuments(prev => [newDoc, ...prev])
    handleSelectDoc(newDoc)
  }, [handleSelectDoc])

  const versions = selectedDoc ? (mockVersions[selectedDoc.id] || []) : []

  // ── Narrow mode: show list OR editor (single column) ──
  if (isNarrow) {
    if (selectedDoc) {
      return (
        <div ref={containerRef} style={{ display: 'flex', height: '100%', width: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <DocEditorView
              document={selectedDoc}
              libraries={libraries}
              viewingVersion={viewingVersion}
              onBack={handleBack}
              onNavigateToTask={onNavigateToTask}
              onNavigateToMR={onNavigateToMR}
              onNavigateToDoc={handleNavigateToDoc}
              onShowVersionHistory={() => setShowVersionHistory(!showVersionHistory)}
              onRestoreVersion={handleRestoreVersion}
              onExitVersionView={() => setViewingVersion(null)}
            />
          </div>
          {showVersionHistory && (
            <DocVersionHistory
              documentTitle={selectedDoc.title}
              versions={versions}
              viewingVersion={viewingVersion?.version ?? null}
              onClose={() => { setShowVersionHistory(false); setViewingVersion(null) }}
              onViewVersion={setViewingVersion}
            />
          )}
        </div>
      )
    }

    // Narrow list view (full width, no tree sidebar)
    return (
      <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
        <DocListView
          documents={documents}
          libraries={libraries}
          selectedDocId={null}
          selectedLibraryId={selectedLibraryId}
          onSelectDoc={handleSelectDoc}
          onCreateDoc={() => setCreateDialogOpen(true)}
          showLibraryFilter
          onLibraryChange={setSelectedLibraryId}
        />
        <CreateDocumentDialog
          isOpen={createDialogOpen}
          libraries={libraries}
          selectedLibraryId={selectedLibraryId}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={handleCreateDoc}
        />
      </div>
    )
  }

  // ── Wide mode: tree sidebar + list/editor ──
  return (
    <div ref={containerRef} style={{ display: 'flex', height: '100%', width: '100%' }}>
      <DocNavPanel
        documents={documents}
        libraries={libraries}
        selectedDocId={selectedDoc?.id || null}
        selectedLibraryId={selectedLibraryId}
        onSelectDoc={handleSelectDoc}
        onSelectLibrary={setSelectedLibraryId}
        recentDocIds={recentDocIds}
        style={{ width: 240, minWidth: 200, flexShrink: 0 }}
      />

      {selectedDoc ? (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <DocEditorView
              document={selectedDoc}
              libraries={libraries}
              viewingVersion={viewingVersion}
              onBack={handleBack}
              onNavigateToTask={onNavigateToTask}
              onNavigateToMR={onNavigateToMR}
              onNavigateToDoc={handleNavigateToDoc}
              onShowVersionHistory={() => setShowVersionHistory(!showVersionHistory)}
              onRestoreVersion={handleRestoreVersion}
              onExitVersionView={() => setViewingVersion(null)}
            />
          </div>
          {showVersionHistory && (
            <DocVersionHistory
              documentTitle={selectedDoc.title}
              versions={versions}
              viewingVersion={viewingVersion?.version ?? null}
              onClose={() => { setShowVersionHistory(false); setViewingVersion(null) }}
              onViewVersion={setViewingVersion}
            />
          )}
        </>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <DocListView
            documents={documents}
            libraries={libraries}
            selectedDocId={null}
            selectedLibraryId={selectedLibraryId}
            onSelectDoc={handleSelectDoc}
            onCreateDoc={() => setCreateDialogOpen(true)}
            onLibraryChange={setSelectedLibraryId}
          />
        </div>
      )}

      <CreateDocumentDialog
        isOpen={createDialogOpen}
        libraries={libraries}
        selectedLibraryId={selectedLibraryId}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateDoc}
      />
    </div>
  )
}
