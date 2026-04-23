import { useState, useEffect, useCallback } from 'react'
import { EditorMiniActivityBar, type EditorSidebarPanel } from './EditorMiniActivityBar'
import { EditorContextBar } from './EditorContextBar'
import { EditorTabBar } from './EditorTabBar'
import { EditorToolbar } from './EditorToolbar'
import { EditorCodeView } from './EditorCodeView'
import { EditorFolderView } from './EditorFolderView'
import { EditorBlameView } from './EditorBlameView'
import { EditorSymbolOutline } from './EditorSymbolOutline'
import { EditorExplorerPanel } from './EditorExplorerPanel'
import { EditorSearchPanel } from './EditorSearchPanel'
import { EditorAgentChangesPanel } from './EditorAgentChangesPanel'
import { EditorFindBar } from './EditorFindBar'
import { EditorFuzzyFinder } from './EditorFuzzyFinder'
import { EditorStatusBar } from './EditorStatusBar'
import {
  mockEditorFileTree, mockEditorFiles, mockEditorSymbols, mockEditorBlame,
  mockAgentChanges, mockAgentSessions,
  getChildrenAtPath,
  type EditorTab, type EditorNavigationContext,
} from './editor-mock-data'

interface EditorOverlayProps {
  onBack: () => void
  filePath?: string | null
  branch?: string | null
  editorLine?: number | null
  editorFrom?: string | null
  editorFromId?: string | null
  editorFromLabel?: string | null
}

let tabIdCounter = 0
function nextTabId() { return `tab-${++tabIdCounter}` }

export function EditorOverlayNew({
  onBack, filePath, branch,
  editorLine, editorFrom, editorFromId, editorFromLabel,
}: EditorOverlayProps) {
  // ── Sidebar state ──
  const [sidebarPanel, setSidebarPanel] = useState<EditorSidebarPanel>('explorer')
  const [sidebarVisible, setSidebarVisible] = useState(true)

  // ── Tabs ──
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // ── View state ──
  const [currentFolderPath, setCurrentFolderPath] = useState<string | null>(null)
  const [showBlame, setShowBlame] = useState(false)
  const [showOutline, setShowOutline] = useState(() => window.innerWidth > 1200)
  const [highlightedLines, setHighlightedLines] = useState<Set<number>>(new Set())
  const [scrollToLine, setScrollToLine] = useState<number | null>(null)
  const [cursorLine, setCursorLine] = useState(1)
  const [findBarVisible, setFindBarVisible] = useState(false)
  const [fuzzyFinderVisible, setFuzzyFinderVisible] = useState(false)
  const [showAgentDiff, setShowAgentDiff] = useState(false)

  // ── Editable file contents (in-memory, not persisted) ──
  const [editedFiles, setEditedFiles] = useState<Record<string, string>>({})
  const [clipboard, setClipboard] = useState<{ path: string; mode: 'copy' | 'cut' } | null>(null)

  // ── Navigation context ──
  const [navContext, setNavContext] = useState<EditorNavigationContext | null>(null)

  // Initialize context from props
  useEffect(() => {
    if (editorFrom && editorFromId) {
      setNavContext({
        type: editorFrom as 'mr' | 'ci' | 'task',
        sourceId: editorFromId,
        sourceLabel: editorFromLabel || undefined,
        branch: branch || undefined,
      })
    }
  }, [editorFrom, editorFromId, editorFromLabel, branch])

  // Open initial file from props
  useEffect(() => {
    if (filePath) {
      openFile(filePath, true)
      if (editorLine) {
        setScrollToLine(editorLine)
        setHighlightedLines(new Set([editorLine]))
      }
    }
  }, []) // Only on mount

  // ── File operations ──
  const getActiveTab = () => tabs.find(t => t.id === activeTabId)
  const activeFilePath = getActiveTab()?.filePath || null

  // Get content for a file — returns edited version if it exists, otherwise original
  const getFileContent = useCallback((path: string): string | null => {
    if (editedFiles[path] !== undefined) return editedFiles[path]
    return mockEditorFiles[path]?.content ?? null
  }, [editedFiles])

  const activeFileInfo = activeFilePath ? mockEditorFiles[activeFilePath] ?? null : null
  const activeFileContent = activeFilePath ? getFileContent(activeFilePath) : null

  const openFile = useCallback((path: string, pinned = false) => {
    const existing = tabs.find(t => t.filePath === path)
    if (existing) {
      setActiveTabId(existing.id)
      setCurrentFolderPath(null)
      setShowBlame(false)
      setShowAgentDiff(false)
      return
    }

    const previewTab = tabs.find(t => !t.isPinned && t.id === activeTabId)
    if (previewTab && !pinned) {
      setTabs(prev => prev.map(t =>
        t.id === previewTab.id ? { ...t, filePath: path, isModified: false } : t
      ))
      setActiveTabId(previewTab.id)
    } else {
      const newTab: EditorTab = {
        id: nextTabId(),
        filePath: path,
        isPinned: pinned,
        isModified: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
    }
    setCurrentFolderPath(null)
    setShowBlame(false)
    setShowAgentDiff(false)
  }, [tabs, activeTabId])

  const openFileWithAgentDiff = useCallback((path: string) => {
    openFile(path, true)
    setShowAgentDiff(true)
    const change = mockAgentChanges.find(a => a.filePath === path)
    if (change && change.changedLines.length > 0) {
      const firstLine = change.changedLines[0].start
      setTimeout(() => {
        setScrollToLine(firstLine)
        setCursorLine(firstLine)
      }, 50)
    }
  }, [openFile])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (id === activeTabId && next.length > 0) {
        const newIdx = Math.min(idx, next.length - 1)
        setActiveTabId(next[newIdx].id)
      } else if (next.length === 0) {
        setActiveTabId(null)
        setCurrentFolderPath('')
      }
      return next
    })
  }, [activeTabId])

  const pinTab = useCallback((id: string) => {
    setTabs(prev => prev.map(t =>
      t.id === id ? { ...t, isPinned: true } : t
    ))
  }, [])

  const navigateToFolder = useCallback((folderPath: string) => {
    setCurrentFolderPath(folderPath)
    setActiveTabId(null)
    setShowBlame(false)
    setShowOutline(false)
  }, [])

  // ── Content editing ──
  const handleContentChange = useCallback((newContent: string) => {
    if (!activeFilePath) return
    setEditedFiles(prev => ({ ...prev, [activeFilePath]: newContent }))
    // Mark the tab as modified if content differs from original
    const original = mockEditorFiles[activeFilePath]?.content ?? ''
    const isModified = newContent !== original
    setTabs(prev => prev.map(t =>
      t.filePath === activeFilePath ? { ...t, isModified, isPinned: true } : t
    ))
  }, [activeFilePath])

  const handleSave = useCallback(() => {
    if (!activeFilePath) return
    // Mock save — just clear the modified state (content stays in editedFiles)
    setTabs(prev => prev.map(t =>
      t.filePath === activeFilePath ? { ...t, isModified: false } : t
    ))
  }, [activeFilePath])

  // ── File tree operations (mock) ──
  const handleRenameEntry = useCallback((_oldPath: string, _newName: string) => {
    // Mock: in a real app this would update the file tree
    // For now just a no-op — the rename UI works visually
  }, [])

  const handleDeleteEntry = useCallback((path: string) => {
    // Close any open tabs for this file
    setTabs(prev => prev.filter(t => t.filePath !== path))
    // Remove from edited files
    setEditedFiles(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
  }, [])

  const handleClipboardAction = useCallback((path: string, mode: 'copy' | 'cut') => {
    setClipboard({ path, mode })
  }, [])

  const handlePaste = useCallback((_targetFolder: string) => {
    // Mock: in a real app this would copy/move the file
    setClipboard(null)
  }, [])

  // ── Line operations ──
  const handleLineClick = useCallback((line: number, shiftKey: boolean) => {
    if (shiftKey && highlightedLines.size > 0) {
      const existing = [...highlightedLines]
      const min = Math.min(...existing, line)
      const max = Math.max(...existing, line)
      const range = new Set<number>()
      for (let i = min; i <= max; i++) range.add(i)
      setHighlightedLines(range)
    } else {
      setHighlightedLines(new Set([line]))
    }
    setCursorLine(line)
  }, [highlightedLines])

  const handleSymbolSelect = useCallback((line: number) => {
    setScrollToLine(line)
    setHighlightedLines(new Set([line]))
    setCursorLine(line)
    setTimeout(() => setScrollToLine(null), 1500)
  }, [])

  const openFileAtLine = useCallback((path: string, line: number) => {
    openFile(path, true)
    setTimeout(() => {
      setScrollToLine(line)
      setHighlightedLines(new Set([line]))
      setCursorLine(line)
    }, 50)
  }, [openFile])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'p') {
        e.preventDefault()
        setFuzzyFinderVisible(v => !v)
      }
      if (mod && e.key === 'f' && !e.shiftKey) {
        e.preventDefault()
        if (activeFileContent) setFindBarVisible(v => !v)
      }
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setSidebarPanel('search')
        setSidebarVisible(true)
      }
      if (mod && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if (mod && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
      }
      if (mod && e.key === '\\') {
        e.preventDefault()
        setSidebarVisible(v => !v)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, activeFileContent, closeTab, handleSave])

  // ── Derived state ──
  const agentChange = activeFilePath
    ? mockAgentChanges.find(a => a.filePath === activeFilePath) || null
    : null
  const symbols = activeFilePath ? mockEditorSymbols[activeFilePath] || [] : []
  const blameBlocks = activeFilePath ? mockEditorBlame[activeFilePath] || [] : []
  const folderEntries = currentFolderPath !== null
    ? getChildrenAtPath(mockEditorFileTree, currentFolderPath)
    : []

  const isViewingFolder = currentFolderPath !== null && activeTabId === null
  const currentPath = isViewingFolder
    ? currentFolderPath
    : activeFilePath

  // ── Find bar state ──
  const [findHighlightLines, setFindHighlightLines] = useState<number[]>([])
  const effectiveHighlightedLines = new Set([
    ...highlightedLines,
    ...findHighlightLines,
  ])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Context bar (conditional) */}
      {navContext && (
        <EditorContextBar
          context={navContext}
          onBack={onBack}
          onDismiss={() => setNavContext(null)}
        />
      )}

      {/* Main editor area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Mini Activity Bar */}
        <EditorMiniActivityBar
          activePanel={sidebarPanel}
          onPanelChange={setSidebarPanel}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible(v => !v)}
        />

        {/* Sidebar panel */}
        {sidebarVisible && (
          <div style={{
            width: 240, minWidth: 240,
            borderRight: '1px solid var(--color-border)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {sidebarPanel === 'explorer' && (
              <EditorExplorerPanel
                fileTree={mockEditorFileTree}
                activeFilePath={activeFilePath}
                onOpenFile={(path) => openFile(path)}
                onNavigateToFolder={navigateToFolder}
                onRenameEntry={handleRenameEntry}
                onDeleteEntry={handleDeleteEntry}
                clipboard={clipboard}
                onClipboardAction={handleClipboardAction}
                onPaste={handlePaste}
              />
            )}
            {sidebarPanel === 'search' && (
              <EditorSearchPanel onOpenFileAtLine={openFileAtLine} />
            )}
            {sidebarPanel === 'agent-changes' && (
              <EditorAgentChangesPanel
                sessions={mockAgentSessions}
                onOpenFile={openFileWithAgentDiff}
              />
            )}
          </div>
        )}

        {/* Editor content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <EditorTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={(id) => { setActiveTabId(id); setCurrentFolderPath(null) }}
            onCloseTab={closeTab}
            onPinTab={pinTab}
          />

          {/* Toolbar */}
          <EditorToolbar
            currentPath={currentPath}
            fileInfo={activeFileInfo}
            agentChange={agentChange}
            branch={branch}
            blameActive={showBlame}
            onToggleBlame={() => setShowBlame(v => !v)}
            outlineActive={showOutline}
            onToggleOutline={() => setShowOutline(v => !v)}
            onNavigateToFolder={navigateToFolder}
          />

          {/* Main content: code view, blame view, or folder view */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
            {/* Find bar overlay */}
            {findBarVisible && activeFileContent && (
              <EditorFindBar
                visible={findBarVisible}
                onClose={() => { setFindBarVisible(false); setFindHighlightLines([]) }}
                content={activeFileContent}
                onHighlightMatches={setFindHighlightLines}
                onScrollToLine={(line) => setScrollToLine(line)}
              />
            )}

            {isViewingFolder ? (
              <EditorFolderView
                entries={folderEntries}
                currentPath={currentFolderPath!}
                onOpenFile={(path) => openFile(path, true)}
                onNavigateToFolder={navigateToFolder}
              />
            ) : activeFileContent !== null && activeFileInfo ? (
              showBlame && blameBlocks.length > 0 ? (
                <EditorBlameView
                  content={activeFileContent}
                  filePath={activeFilePath!}
                  blameBlocks={blameBlocks}
                />
              ) : (
                <EditorCodeView
                  content={activeFileContent}
                  filePath={activeFilePath!}
                  highlightedLines={effectiveHighlightedLines}
                  onLineClick={handleLineClick}
                  agentChange={agentChange}
                  scrollToLine={scrollToLine}
                  showAgentDiff={showAgentDiff}
                  onDismissAgentDiff={() => setShowAgentDiff(false)}
                  onContentChange={handleContentChange}
                />
              )
            ) : (
              /* Empty state */
              <div style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 12, color: 'var(--color-text-tertiary)',
              }}>
                <div style={{ fontSize: 32, opacity: 0.3 }}>{ }</div>
                <span style={{ fontSize: 13 }}>Open a file to start editing</span>
                <span style={{ fontSize: 12 }}>
                  Use the file explorer or press{' '}
                  <kbd style={{
                    padding: '2px 6px',
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontSize: 11,
                  }}>⌘P</kbd>
                  {' '}to find files
                </span>
              </div>
            )}

            {/* Symbol outline (right sidebar) */}
            {showOutline && activeFileContent !== null && !isViewingFolder && (
              <EditorSymbolOutline
                symbols={symbols}
                activeLine={cursorLine}
                onSelectSymbol={handleSymbolSelect}
              />
            )}
          </div>

          {/* Status bar */}
          <EditorStatusBar
            fileInfo={activeFileInfo}
            cursorLine={cursorLine}
            cursorCol={1}
            isFolder={isViewingFolder}
            folderFileCount={isViewingFolder ? folderEntries.length : undefined}
            branch={branch}
          />
        </div>
      </div>

      {/* Fuzzy finder overlay */}
      <EditorFuzzyFinder
        visible={fuzzyFinderVisible}
        onClose={() => setFuzzyFinderVisible(false)}
        onOpenFile={(path) => openFile(path, true)}
        onNavigateToFolder={navigateToFolder}
      />
    </div>
  )
}
