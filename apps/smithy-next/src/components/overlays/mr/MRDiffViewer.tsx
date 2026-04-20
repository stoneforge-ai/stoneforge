import { useState, useRef, useEffect, useCallback } from 'react'
import { File, Check, ChevronDown, ChevronRight, Plus as PlusIcon, MessageSquare } from 'lucide-react'
import type { DiffFile } from '../../../mock-data'
import type { InlineReviewComment } from './mr-types'
import { MRInlineComment } from './MRInlineComment'
import { highlightLine, HighlightedCode } from './syntax-highlight'
import { RichTextEditor } from './RichTextEditor'

interface MRDiffViewerProps {
  files: DiffFile[]
  viewMode: 'unified' | 'split'
  viewedFiles: Set<string>
  onToggleViewed: (path: string) => void
  inlineComments?: Record<string, InlineReviewComment[]>
  scrollToFile?: string | null
  hideWhitespace?: boolean
  /** Show inline comment buttons (+) and comment forms. Default true. */
  enableCommenting?: boolean
  /** Callback to open a file in the editor overlay */
  onOpenInEditor?: (filePath: string) => void
}

const statusColor: Record<string, string> = {
  added: 'var(--color-success)',
  modified: 'var(--color-warning)',
  deleted: 'var(--color-danger)',
}
const statusLetter: Record<string, string> = { added: 'A', modified: 'M', deleted: 'D' }

export function MRDiffViewer({ files, viewMode, viewedFiles, onToggleViewed, inlineComments = {}, scrollToFile, hideWhitespace = false, enableCommenting = true, onOpenInEditor }: MRDiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set(files.map(f => f.path)))
  const [commentingOn, setCommentingOn] = useState<string | null>(null)
  const [hoveringLine, setHoveringLine] = useState<string | null>(null)
  const [newCommentText, setNewCommentText] = useState('')
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Multi-line selection state
  const [selectionStart, setSelectionStart] = useState<{ file: string; hunk: number; line: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ file: string; hunk: number; line: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [showSelectionComment, setShowSelectionComment] = useState(false)
  const [selectionCommentText, setSelectionCommentText] = useState('')

  useEffect(() => {
    if (scrollToFile && fileRefs.current[scrollToFile]) {
      fileRefs.current[scrollToFile]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrollToFile])

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Auto-collapse when marking as viewed, auto-expand when unmarking
  const handleToggleViewed = (path: string) => {
    const isCurrentlyViewed = viewedFiles.has(path)
    onToggleViewed(path)
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (!isCurrentlyViewed) {
        // Marking as viewed → collapse
        next.delete(path)
      } else {
        // Unmarking viewed → expand
        next.add(path)
      }
      return next
    })
  }

  const getSelectedLines = useCallback(() => {
    if (!selectionStart || !selectionEnd || selectionStart.file !== selectionEnd.file) return null
    const file = files.find(f => f.path === selectionStart.file)
    if (!file) return null
    const startIdx = Math.min(selectionStart.line, selectionEnd.line)
    const endIdx = Math.max(selectionStart.line, selectionEnd.line)
    const hunk = file.hunks[selectionStart.hunk]
    if (!hunk) return null
    return {
      file: selectionStart.file,
      startLine: startIdx,
      endLine: endIdx,
      lines: hunk.lines.slice(startIdx, endIdx + 1),
    }
  }, [selectionStart, selectionEnd, files])

  const isLineSelected = (filePath: string, hunkIdx: number, lineIdx: number) => {
    if (!selectionStart || !selectionEnd) return false
    if (selectionStart.file !== filePath || selectionStart.hunk !== hunkIdx) return false
    if (selectionEnd.file !== filePath || selectionEnd.hunk !== hunkIdx) return false
    const start = Math.min(selectionStart.line, selectionEnd.line)
    const end = Math.max(selectionStart.line, selectionEnd.line)
    return lineIdx >= start && lineIdx <= end
  }

  const handleLineMouseDown = (filePath: string, hunkIdx: number, lineIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSelectionStart({ file: filePath, hunk: hunkIdx, line: lineIdx })
    setSelectionEnd({ file: filePath, hunk: hunkIdx, line: lineIdx })
    setIsSelecting(true)
    setShowSelectionComment(false)
  }

  const handleLineMouseEnter = (filePath: string, hunkIdx: number, lineIdx: number) => {
    if (isSelecting && selectionStart?.file === filePath && selectionStart?.hunk === hunkIdx) {
      setSelectionEnd({ file: filePath, hunk: hunkIdx, line: lineIdx })
    }
    setHoveringLine(`${filePath}:${hunkIdx}:${lineIdx}`)
  }

  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false)
        // If we selected more than one line, show the comment button
        if (selectionStart && selectionEnd && (selectionStart.line !== selectionEnd.line)) {
          setShowSelectionComment(true)
        }
      }
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isSelecting, selectionStart, selectionEnd])

  const clearSelection = () => {
    setSelectionStart(null)
    setSelectionEnd(null)
    setShowSelectionComment(false)
    setSelectionCommentText('')
  }

  return (
    <div onClick={e => {
      // Clear selection when clicking outside a diff line
      if (!(e.target as HTMLElement).closest('[data-diff-line]') && !(e.target as HTMLElement).closest('[data-selection-comment]')) {
        if (!showSelectionComment) clearSelection()
      }
    }}>
      {files.map(file => {
        const isExpanded = expandedFiles.has(file.path)
        const isViewed = viewedFiles.has(file.path)

        return (
          <div key={file.path} ref={el => { fileRefs.current[file.path] = el }} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            {/* File header */}
            <div className="mr-diff-file-header" style={{
              padding: '8px 16px', background: 'var(--color-bg-secondary)',
              display: 'flex', alignItems: 'center', gap: 8,
              position: 'sticky', top: 0, zIndex: 1,
              borderBottom: isExpanded ? '1px solid var(--color-border-subtle)' : 'none',
            }}>
              <button onClick={() => toggleFile(file.path)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--color-text-tertiary)' }}>
                {isExpanded ? <ChevronDown size={13} strokeWidth={1.5} /> : <ChevronRight size={13} strokeWidth={1.5} />}
              </button>
              <span style={{ fontSize: 10, fontWeight: 600, color: statusColor[file.status], width: 14, textAlign: 'center' }}>
                {statusLetter[file.status]}
              </span>
              <File size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
              <span
                onClick={onOpenInEditor ? (e) => { e.stopPropagation(); onOpenInEditor(file.path) } : undefined}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: onOpenInEditor ? 'var(--color-text-accent)' : 'var(--color-text)',
                  cursor: onOpenInEditor ? 'pointer' : 'default',
                  textDecoration: 'none', transition: `color var(--duration-fast)`,
                }}
                onMouseEnter={e => { if (onOpenInEditor) e.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={e => { if (onOpenInEditor) e.currentTarget.style.textDecoration = 'none' }}
              >{file.path}</span>
              <span style={{ fontSize: 11, display: 'flex', gap: 6, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                {file.additions > 0 && <span style={{ color: 'var(--color-success)' }}>+{file.additions}</span>}
                {file.deletions > 0 && <span style={{ color: 'var(--color-danger)' }}>-{file.deletions}</span>}
              </span>
              <div onClick={e => { e.stopPropagation(); handleToggleViewed(file.path) }} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: isViewed ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: isViewed ? 'none' : '1.5px solid var(--color-border)', background: isViewed ? 'var(--color-success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isViewed && <Check size={10} strokeWidth={3} style={{ color: 'white' }} />}
                </div>
                Viewed
              </div>
            </div>

            {/* Diff content */}
            {isExpanded && (
              viewMode === 'split'
                ? <SplitDiffView file={file} inlineComments={inlineComments} hideWhitespace={hideWhitespace} />
                : file.hunks.map((hunk, hi) => {
                    // Pre-process lines for hideWhitespace: mark whitespace-only changes as context
                    const processedLines = hideWhitespace ? hunk.lines.reduce<typeof hunk.lines>((acc, line, idx) => {
                      if (line.type === 'remove') {
                        const next = hunk.lines[idx + 1]
                        if (next?.type === 'add' && line.content.trim() === next.content.trim()) {
                          // Whitespace-only change — show as context
                          acc.push({ ...line, type: 'context' })
                          return acc
                        }
                      }
                      if (line.type === 'add') {
                        const prev = hunk.lines[idx - 1]
                        if (prev?.type === 'remove' && prev.content.trim() === line.content.trim()) {
                          // Skip the add side of whitespace-only pair (already shown as context)
                          return acc
                        }
                      }
                      acc.push(line)
                      return acc
                    }, []) : hunk.lines

                    let oldLine = hunk.oldStart
                    let newLine = hunk.newStart
                    return (
                      <div key={hi} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>
                        {processedLines.map((line, li) => {
                          const currentOld = line.type === 'add' ? null : oldLine
                          const currentNew = line.type === 'remove' ? null : newLine
                          if (line.type !== 'add') oldLine++
                          if (line.type !== 'remove') newLine++

                          const lineKey = `${file.path}:${currentNew ?? currentOld ?? li}`
                          const lineHoverKey = `${file.path}:${hi}:${li}`
                          const isHovering = hoveringLine === lineHoverKey
                          const lineComments = inlineComments[lineKey]
                          const isCommenting = commentingOn === lineKey
                          const selected = isLineSelected(file.path, hi, li)

                          // Show selection comment form after the last selected line
                          const isLastSelected = selected && selectionEnd &&
                            Math.max(selectionStart!.line, selectionEnd.line) === li &&
                            selectionStart!.file === file.path && selectionStart!.hunk === hi

                          return (
                            <div key={li}>
                              <div
                                data-diff-line
                                style={{
                                  display: 'flex', minHeight: 22, position: 'relative',
                                  background: selected
                                    ? 'rgba(59,130,246,0.12)'
                                    : line.type === 'add' ? 'rgba(34,197,94,0.06)'
                                    : line.type === 'remove' ? 'rgba(239,68,68,0.06)'
                                    : 'transparent',
                                  cursor: 'default',
                                }}
                                onMouseDown={enableCommenting ? (e => handleLineMouseDown(file.path, hi, li, e)) : undefined}
                                onMouseEnter={() => handleLineMouseEnter(file.path, hi, li)}
                                onMouseLeave={() => { if (!isSelecting) setHoveringLine(null) }}
                              >
                                {/* Add comment / drag-select button (hover) */}
                                {enableCommenting && isHovering && !isSelecting && (
                                  <button
                                    onMouseDown={e => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      // Start drag selection from this line
                                      handleLineMouseDown(file.path, hi, li, e)
                                    }}
                                    onClick={e => {
                                      e.stopPropagation()
                                      // If no drag happened (single click), open single-line comment
                                      if (!isSelecting && selectionStart?.line === selectionEnd?.line) {
                                        setCommentingOn(commentingOn === lineKey ? null : lineKey)
                                        clearSelection()
                                      }
                                    }}
                                    style={{
                                      position: 'absolute', left: 2, top: 2,
                                      width: 18, height: 18, borderRadius: '50%',
                                      background: 'var(--color-primary)', border: 'none',
                                      color: 'white', cursor: 'grab',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                                    }}
                                  >
                                    <PlusIcon size={11} strokeWidth={2.5} />
                                  </button>
                                )}

                                {/* Line numbers */}
                                <span className="mr-line-num" style={{ width: 44, textAlign: 'right', paddingRight: 8, color: 'var(--color-text-tertiary)', userSelect: 'none', flexShrink: 0, fontSize: 11 }}>
                                  {currentOld ?? ''}
                                </span>
                                <span className="mr-line-num" style={{ width: 44, textAlign: 'right', paddingRight: 8, color: 'var(--color-text-tertiary)', userSelect: 'none', flexShrink: 0, fontSize: 11 }}>
                                  {currentNew ?? ''}
                                </span>

                                {/* +/- indicator */}
                                <span style={{ width: 16, textAlign: 'center', color: line.type === 'add' ? 'var(--color-success)' : line.type === 'remove' ? 'var(--color-danger)' : 'transparent', userSelect: 'none', flexShrink: 0, fontWeight: 500 }}>
                                  {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
                                </span>

                                {/* Syntax-highlighted content */}
                                <span style={{ flex: 1, paddingRight: 16, whiteSpace: 'pre' }}>
                                  {highlightLine(line.content)}
                                </span>
                              </div>

                              {/* Inline comments */}
                              {lineComments && lineComments.length > 0 && (
                                <MRInlineComment comments={lineComments} />
                              )}

                              {/* Single-line comment form */}
                              {enableCommenting && isCommenting && !lineComments && (
                                <div style={{ margin: '0 24px 4px', padding: '8px 12px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-focus)', borderRadius: 'var(--radius-md)' }}>
                                  <RichTextEditor value={newCommentText} onChange={setNewCommentText} placeholder="Write a comment..." minHeight={60} maxHeight={150} />
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                                    <button onClick={() => { setCommentingOn(null); setNewCommentText('') }} style={{ height: 26, padding: '0 10px', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                                    <button style={{ height: 26, padding: '0 10px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>Comment</button>
                                  </div>
                                </div>
                              )}

                              {/* Multi-line selection comment form */}
                              {enableCommenting && isLastSelected && showSelectionComment && (
                                <SelectionCommentForm
                                  selectedLines={getSelectedLines()}
                                  value={selectionCommentText}
                                  onChange={setSelectionCommentText}
                                  onCancel={clearSelection}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Split diff view ──
function SplitDiffView({ file, inlineComments, hideWhitespace = false }: { file: DiffFile; inlineComments: Record<string, InlineReviewComment[]>; hideWhitespace?: boolean }) {
  return (
    <div>
      {file.hunks.map((hunk, hi) => {
        // Build parallel lines for left (old) and right (new)
        const leftLines: { num: number | null; content: string; type: 'remove' | 'context' | 'empty' }[] = []
        const rightLines: { num: number | null; content: string; type: 'add' | 'context' | 'empty' }[] = []
        let oldLine = hunk.oldStart
        let newLine = hunk.newStart
        let i = 0

        while (i < hunk.lines.length) {
          const line = hunk.lines[i]
          if (line.type === 'context') {
            leftLines.push({ num: oldLine++, content: line.content, type: 'context' })
            rightLines.push({ num: newLine++, content: line.content, type: 'context' })
            i++
          } else if (line.type === 'remove') {
            // Check if next line is an add (paired change)
            const next = hunk.lines[i + 1]
            if (next && next.type === 'add') {
              leftLines.push({ num: oldLine++, content: line.content, type: 'remove' })
              rightLines.push({ num: newLine++, content: next.content, type: 'add' })
              i += 2
            } else {
              leftLines.push({ num: oldLine++, content: line.content, type: 'remove' })
              rightLines.push({ num: null, content: '', type: 'empty' })
              i++
            }
          } else if (line.type === 'add') {
            leftLines.push({ num: null, content: '', type: 'empty' })
            rightLines.push({ num: newLine++, content: line.content, type: 'add' })
            i++
          } else {
            i++
          }
        }

        return (
          <div key={hi} style={{ display: 'flex', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>
            {/* Left (old) */}
            <div style={{ flex: 1, borderRight: '1px solid var(--color-border-subtle)' }}>
              {leftLines.map((line, li) => (
                <div key={li} style={{
                  display: 'flex', minHeight: 22,
                  background: line.type === 'remove' ? 'rgba(239,68,68,0.06)' : line.type === 'empty' ? 'var(--color-bg-secondary)' : 'transparent',
                }}>
                  <span className="mr-line-num" style={{ width: 40, textAlign: 'right', paddingRight: 8, color: 'var(--color-text-tertiary)', userSelect: 'none', flexShrink: 0, fontSize: 11 }}>
                    {line.num ?? ''}
                  </span>
                  <span style={{ width: 14, textAlign: 'center', color: line.type === 'remove' ? 'var(--color-danger)' : 'transparent', userSelect: 'none', flexShrink: 0, fontWeight: 500 }}>
                    {line.type === 'remove' ? '−' : ' '}
                  </span>
                  <span style={{ flex: 1, paddingRight: 8, whiteSpace: 'pre' }}>
                    {line.type === 'empty' ? '' : highlightLine(line.content)}
                  </span>
                </div>
              ))}
            </div>
            {/* Right (new) */}
            <div style={{ flex: 1 }}>
              {rightLines.map((line, li) => (
                <div key={li} style={{
                  display: 'flex', minHeight: 22,
                  background: line.type === 'add' ? 'rgba(34,197,94,0.06)' : line.type === 'empty' ? 'var(--color-bg-secondary)' : 'transparent',
                }}>
                  <span className="mr-line-num" style={{ width: 40, textAlign: 'right', paddingRight: 8, color: 'var(--color-text-tertiary)', userSelect: 'none', flexShrink: 0, fontSize: 11 }}>
                    {line.num ?? ''}
                  </span>
                  <span style={{ width: 14, textAlign: 'center', color: line.type === 'add' ? 'var(--color-success)' : 'transparent', userSelect: 'none', flexShrink: 0, fontWeight: 500 }}>
                    {line.type === 'add' ? '+' : ' '}
                  </span>
                  <span style={{ flex: 1, paddingRight: 8, whiteSpace: 'pre' }}>
                    {line.type === 'empty' ? '' : highlightLine(line.content)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Selection comment form (for multi-line suggest changes) ──
function SelectionCommentForm({ selectedLines, value, onChange, onCancel }: {
  selectedLines: { file: string; startLine: number; endLine: number; lines: { type: string; content: string }[] } | null
  value: string; onChange: (v: string) => void; onCancel: () => void
}) {
  // Auto-enable suggestion when multi-line selection is used (fix #6)
  const [showSuggestion, setShowSuggestion] = useState(true)
  const [suggestion, setSuggestion] = useState(() => {
    if (!selectedLines) return ''
    return selectedLines.lines
      .filter(l => l.type !== 'remove')
      .map(l => l.content)
      .join('\n')
  })

  return (
    <div data-selection-comment style={{ margin: '0 24px 4px', padding: '10px 12px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-focus)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <MessageSquare size={12} strokeWidth={1.5} />
        Comment on {selectedLines ? selectedLines.endLine - selectedLines.startLine + 1 : 0} selected lines
      </div>

      <RichTextEditor value={value} onChange={onChange} placeholder="Write a comment..." minHeight={60} maxHeight={120} />

      {/* Suggestion toggle */}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => setShowSuggestion(!showSuggestion)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500,
            color: showSuggestion ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            background: showSuggestion ? 'var(--color-success-subtle)' : 'var(--color-surface)',
            border: 'none', borderRadius: 'var(--radius-sm)', padding: '4px 8px', cursor: 'pointer',
          }}
        >
          {showSuggestion ? <Check size={11} strokeWidth={2} /> : <PlusIcon size={11} strokeWidth={2} />}
          {showSuggestion ? 'Suggestion added' : 'Add a suggestion'}
        </button>
      </div>

      {showSuggestion && (
        <div style={{ marginTop: 6, border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(34,197,94,0.04)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Suggested change (editable)</span>
          </div>
          <SyntaxTextarea value={suggestion} onChange={setSuggestion} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <button onClick={onCancel} style={{ height: 26, padding: '0 10px', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
        <button style={{ height: 26, padding: '0 10px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
          {showSuggestion ? 'Submit suggestion' : 'Comment'}
        </button>
      </div>
    </div>
  )
}

// ── Syntax-highlighted editable textarea ──
// Shows highlighted code by default; click to edit, blur to return to preview
function SyntaxTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        spellCheck={false}
        style={{
          width: '100%', minHeight: 60, resize: 'vertical',
          background: 'var(--color-bg-secondary)', border: 'none', padding: 8,
          color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11,
          lineHeight: 1.6, outline: 'none',
        }}
      />
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{ cursor: 'text', position: 'relative' }}
      title="Click to edit"
    >
      <HighlightedCode code={value} />
    </div>
  )
}
