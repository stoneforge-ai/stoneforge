import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Clock, Eye, Code, MoreHorizontal, Tag, Link2, FileText, FileCode, FileType, ChevronDown, ChevronRight, ExternalLink, Trash2, Copy, Archive, RotateCcw } from 'lucide-react'
import type { Document, DocumentVersion, Library } from './doc-types'

interface DocEditorViewProps {
  document: Document
  libraries: Library[]
  viewingVersion?: DocumentVersion | null
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToDoc?: (docId: string) => void
  onShowVersionHistory: () => void
  onRestoreVersion?: () => void
  onExitVersionView?: () => void
}

const categoryLabels: Record<string, string> = {
  spec: 'Spec', prd: 'PRD', 'decision-log': 'ADR', changelog: 'Changelog',
  tutorial: 'Tutorial', 'how-to': 'How-to', explanation: 'Explanation',
  reference: 'Reference', runbook: 'Runbook', 'meeting-notes': 'Meeting Notes',
  'post-mortem': 'Post-mortem', other: 'Other',
}

const categoryColors: Record<string, string> = {
  spec: 'var(--color-primary)', prd: '#a78bfa', 'decision-log': '#f59e0b',
  changelog: 'var(--color-success)', tutorial: '#06b6d4', 'how-to': '#06b6d4',
  explanation: '#8b5cf6', reference: 'var(--color-text-secondary)', runbook: '#ef4444',
  'meeting-notes': '#6b7280', 'post-mortem': '#ef4444', other: 'var(--color-text-tertiary)',
}

function timeAgo(dateStr: string): string {
  const now = new Date('2026-04-13')
  const then = new Date(dateStr)
  const days = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ── Simple markdown renderer (block-level only for prototype) ──
function renderMarkdown(content: string): React.ReactNode[] {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let inCodeBlock = false
  let codeLines: string[] = []
  let _codeLang = ''

  while (i < lines.length) {
    const line = lines[i]

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={i} style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-md)',
            padding: '12px 16px', overflow: 'auto', fontSize: 12,
            fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            border: '1px solid var(--color-border-subtle)', margin: '12px 0',
          }}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        )
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
        _codeLang = line.slice(3).trim()
      }
      i++
      continue
    }
    if (inCodeBlock) {
      codeLines.push(line)
      i++
      continue
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ fontSize: 22, fontWeight: 700, margin: '24px 0 8px', color: 'var(--color-text)', lineHeight: 1.3 }}>{line.slice(2)}</h1>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ fontSize: 17, fontWeight: 600, margin: '20px 0 6px', color: 'var(--color-text)', lineHeight: 1.3 }}>{line.slice(3)}</h2>)
      i++; continue
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 4px', color: 'var(--color-text)', lineHeight: 1.4 }}>{line.slice(4)}</h3>)
      i++; continue
    }

    // Tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows: string[][] = []
      let j = i
      while (j < lines.length && lines[j].includes('|') && lines[j].trim().startsWith('|')) {
        const cells = lines[j].split('|').filter(c => c.trim()).map(c => c.trim())
        if (!lines[j].match(/^\|[\s-:|]+\|$/)) {
          tableRows.push(cells)
        }
        j++
      }
      if (tableRows.length > 0) {
        elements.push(
          <div key={i} style={{ overflow: 'auto', margin: '12px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {tableRows[0].map((cell, ci) => (
                    <th key={ci} style={{
                      padding: '6px 10px', textAlign: 'left', fontWeight: 600,
                      borderBottom: '2px solid var(--color-border)', color: 'var(--color-text)',
                    }}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)',
                        color: 'var(--color-text-secondary)',
                      }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      i = j; continue
    }

    // Unordered list
    if (line.match(/^- \[[ x]\] /)) {
      const checked = line.charAt(3) === 'x'
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={checked} readOnly style={{ marginTop: 3, accentColor: 'var(--color-primary)' }} />
          <span style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>{renderInline(line.slice(6))}</span>
        </div>
      )
      i++; continue
    }
    if (line.startsWith('- ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', paddingLeft: 4, alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--color-text-tertiary)', marginTop: 1 }}>•</span>
          <span style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>{renderInline(line.slice(2))}</span>
        </div>
      )
      i++; continue
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\. /)
    if (numMatch) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', paddingLeft: 4, alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13, minWidth: 16, textAlign: 'right' }}>{numMatch[1]}.</span>
          <span style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>{renderInline(line.slice(numMatch[0].length))}</span>
        </div>
      )
      i++; continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--color-border-subtle)', margin: '16px 0' }} />)
      i++; continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 8 }} />)
      i++; continue
    }

    // Paragraph
    elements.push(
      <p key={i} style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6, margin: '4px 0' }}>
        {renderInline(line)}
      </p>
    )
    i++
  }

  return elements
}

// Inline markdown: bold, italic, code, links
function renderInline(text: string): React.ReactNode {
  // Simple regex-based inline rendering
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      parts.push(
        <code key={key++} style={{
          background: 'var(--color-surface)', padding: '1px 5px',
          borderRadius: 3, fontSize: 12, fontFamily: 'var(--font-mono)',
          color: 'var(--color-primary)',
        }}>
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Find next special char
    const nextSpecial = remaining.search(/[`*]/)
    if (nextSpecial === -1) {
      parts.push(remaining)
      break
    }
    if (nextSpecial > 0) {
      parts.push(remaining.slice(0, nextSpecial))
      remaining = remaining.slice(nextSpecial)
      continue
    }

    // No match, just consume the character
    parts.push(remaining[0])
    remaining = remaining.slice(1)
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

// ── JSON Renderer ──
function renderJSON(content: string): React.ReactNode {
  try {
    const formatted = JSON.stringify(JSON.parse(content), null, 2)
    return (
      <pre style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-md)',
        padding: '16px', overflow: 'auto', fontSize: 12,
        fontFamily: 'var(--font-mono)', lineHeight: 1.5,
        border: '1px solid var(--color-border-subtle)',
        color: 'var(--color-text)',
      }}>
        <code>{formatted}</code>
      </pre>
    )
  } catch {
    return <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-danger)' }}>Invalid JSON</pre>
  }
}

// ── Connections Section ──
function ConnectionsSection({ doc, onNavigateToTask, onNavigateToMR, onNavigateToDoc }: {
  doc: Document
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToDoc?: (docId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hasConnections = doc.linkedDocIds.length > 0 || doc.linkedTaskIds.length > 0 || doc.linkedMRIds.length > 0 || doc.agentSessionId

  if (!hasConnections) return null

  return (
    <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 16, marginTop: 24 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600,
          padding: 0, fontFamily: 'var(--font-sans)',
        }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <Link2 size={12} />
        Connections
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {doc.linkedTaskIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {doc.linkedTaskIds.map(taskId => (
                <button
                  key={taskId}
                  onClick={() => onNavigateToTask?.(taskId)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    background: 'var(--color-primary-subtle)', border: '1px solid var(--color-border)',
                    color: 'var(--color-primary)', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontWeight: 500,
                  }}
                >
                  {taskId}
                  <ExternalLink size={9} />
                </button>
              ))}
            </div>
          )}
          {doc.linkedMRIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {doc.linkedMRIds.map(mrId => (
                <button
                  key={mrId}
                  onClick={() => onNavigateToMR?.(mrId)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    background: 'var(--color-success-subtle)', border: '1px solid var(--color-border)',
                    color: 'var(--color-success)', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontWeight: 500,
                  }}
                >
                  {mrId}
                  <ExternalLink size={9} />
                </button>
              ))}
            </div>
          )}
          {doc.linkedDocIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {doc.linkedDocIds.map(docId => (
                <button
                  key={docId}
                  onClick={() => onNavigateToDoc?.(docId)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <FileText size={10} />
                  {docId}
                  <ExternalLink size={9} />
                </button>
              ))}
            </div>
          )}
          {doc.agentSessionId && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Generated by agent session {doc.agentSessionId}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Editor View ──
export function DocEditorView({ document: doc, libraries, viewingVersion, onBack, onNavigateToTask, onNavigateToMR, onNavigateToDoc, onShowVersionHistory, onRestoreVersion, onExitVersionView }: DocEditorViewProps) {
  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState(doc.content)
  const [isSourceMode, setIsSourceMode] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track changes for auto-save indicator
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    setSaveState('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saving')
      setTimeout(() => setSaveState('saved'), 400)
    }, 800)
  }, [])

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    setSaveState('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saving')
      setTimeout(() => setSaveState('saved'), 400)
    }, 800)
  }, [])

  // Reset when document changes
  useEffect(() => {
    setTitle(doc.title)
    setContent(doc.content)
    setSaveState('saved')
    setIsSourceMode(false)
  }, [doc.id])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isSourceMode) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [content, isSourceMode])

  const library = doc.libraryId ? libraries.find(l => l.id === doc.libraryId) : null

  const ContentTypeIcon = doc.contentType === 'json' ? FileCode : doc.contentType === 'text' ? FileType : FileText

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg)' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 44, flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <ArrowLeft size={16} />
        </button>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 0 }}>
          {library && (
            <>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{library.name}</span>
              <span>/</span>
            </>
          )}
          <span style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Save state */}
        <span style={{
          fontSize: 11,
          color: saveState === 'saved' ? 'var(--color-text-tertiary)' : saveState === 'saving' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
        }}>
          {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving...' : 'Unsaved'}
        </span>

        {/* Source/Preview toggle */}
        {doc.contentType === 'markdown' && (
          <button
            onClick={() => setIsSourceMode(!isSourceMode)}
            title={isSourceMode ? 'Preview' : 'Source'}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', height: 26,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
              background: isSourceMode ? 'var(--color-primary-subtle)' : 'transparent',
              color: isSourceMode ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            {isSourceMode ? <Eye size={12} /> : <Code size={12} />}
            {isSourceMode ? 'Preview' : 'Source'}
          </button>
        )}

        {/* Version history */}
        <button
          onClick={onShowVersionHistory}
          title="Version history"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', height: 26,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-secondary)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          <Clock size={12} />
          v{doc.version}
        </button>

        {/* More menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 'var(--radius-sm)',
              background: 'transparent', border: '1px solid var(--color-border)',
              cursor: 'pointer', color: 'var(--color-text-secondary)',
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {showMoreMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' as any }} onClick={() => setShowMoreMenu(false)} />
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: 4, minWidth: 160,
                zIndex: 'var(--z-dropdown)' as any,
                boxShadow: 'var(--shadow-float)',
              }}>
                {[
                  { icon: Copy, label: 'Duplicate', action: () => {} },
                  { icon: Archive, label: 'Archive', action: () => {} },
                  { icon: Trash2, label: 'Delete', action: () => {}, danger: true },
                ].map(({ icon: Icon, label, action, danger }) => (
                  <button
                    key={label}
                    onClick={() => { action(); setShowMoreMenu(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: danger ? 'var(--color-danger)' : 'var(--color-text)',
                      fontSize: 12, textAlign: 'left', fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = danger ? 'var(--color-danger-subtle)' : 'var(--color-surface-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Version viewing banner ── */}
      {viewingVersion && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', flexShrink: 0,
          background: 'var(--color-warning-subtle)', borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <Eye size={13} color="var(--color-warning)" />
          <span style={{ fontSize: 12, color: 'var(--color-warning)', fontWeight: 500 }}>
            Viewing v{viewingVersion.version}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            by {viewingVersion.updatedBy}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onExitVersionView}
            style={{
              height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--color-text-secondary)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            Exit preview
          </button>
          <button
            onClick={onRestoreVersion}
            style={{
              height: 24, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)', color: 'white',
              fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            <RotateCcw size={11} />
            Restore this version
          </button>
        </div>
      )}

      {/* ── Editor Content ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 32px 80px' }}>
          {/* ── Title ── */}
          <input
            type="text"
            value={viewingVersion ? viewingVersion.title : title}
            onChange={e => { if (!viewingVersion) handleTitleChange(e.target.value) }}
            readOnly={!!viewingVersion}
            placeholder="Untitled"
            style={{
              width: '100%', border: 'none', background: 'transparent',
              fontSize: 22, fontWeight: 700, color: 'var(--color-text)',
              outline: 'none', fontFamily: 'var(--font-sans)', padding: 0,
              lineHeight: 1.3,
            }}
          />

          {/* ── Metadata Row ── */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
            padding: '8px 0 16px', borderBottom: '1px solid var(--color-border-subtle)',
            marginBottom: 16,
          }}>
            {/* Category badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: `${categoryColors[doc.category]}15`,
              color: categoryColors[doc.category] || 'var(--color-text-tertiary)',
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em',
            }}>
              {categoryLabels[doc.category] || doc.category}
            </span>

            {/* Content type */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 11, color: 'var(--color-text-tertiary)',
            }}>
              <ContentTypeIcon size={11} />
              {doc.contentType}
            </span>

            {/* Tags */}
            {doc.tags.map(tag => (
              <span key={tag} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 6px', borderRadius: 'var(--radius-full)',
                background: 'var(--color-surface)', fontSize: 11,
                color: 'var(--color-text-secondary)',
              }}>
                <Tag size={9} />
                {tag}
              </span>
            ))}

            <div style={{ flex: 1 }} />

            {/* Author + time */}
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {doc.createdBy} · {timeAgo(doc.updatedAt)}
            </span>
          </div>

          {/* ── Content ── */}
          {(() => {
            // Strip leading H1 if it matches the title (avoid duplicate)
            const activeContent = viewingVersion ? viewingVersion.content : content
            const activeTitle = viewingVersion ? viewingVersion.title : title
            let displayContent = activeContent
            if (doc.contentType === 'markdown') {
              const firstLine = activeContent.split('\n')[0]
              if (firstLine.startsWith('# ') && firstLine.slice(2).trim() === activeTitle.trim()) {
                displayContent = activeContent.slice(firstLine.length).replace(/^\n+/, '')
              }
            }

            if (doc.contentType === 'json') return renderJSON(displayContent)
            if ((isSourceMode || doc.contentType === 'text') && !viewingVersion) return (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                style={{
                  width: '100%', minHeight: 300, border: 'none', background: 'transparent',
                  color: 'var(--color-text)', fontSize: 13, lineHeight: 1.6,
                  fontFamily: doc.contentType === 'text' ? 'var(--font-sans)' : 'var(--font-mono)',
                  outline: 'none', resize: 'none', padding: 0,
                }}
              />
            )
            return (
              <div
                onClick={() => { if (!viewingVersion) setIsSourceMode(true) }}
                style={{ cursor: viewingVersion ? 'default' : 'text', minHeight: 200 }}
              >
                {renderMarkdown(displayContent)}
              </div>
            )
          })()}

          {/* ── Connections ── */}
          <ConnectionsSection
            doc={doc}
            onNavigateToTask={onNavigateToTask}
            onNavigateToMR={onNavigateToMR}
            onNavigateToDoc={onNavigateToDoc}
          />
        </div>
      </div>
    </div>
  )
}
