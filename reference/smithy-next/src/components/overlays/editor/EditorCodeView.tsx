import { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, X } from 'lucide-react'
import { highlightLine, detectLanguage } from '../mr/syntax-highlight'
import type { AgentFileChange } from './editor-mock-data'

interface Props {
  content: string
  filePath: string
  highlightedLines: Set<number>
  onLineClick: (line: number, shiftKey: boolean) => void
  agentChange: AgentFileChange | null
  scrollToLine?: number | null
  /** When true, highlight agent-changed lines with diff-style backgrounds */
  showAgentDiff?: boolean
  onDismissAgentDiff?: () => void
  /** Called when the user edits the content */
  onContentChange?: (content: string) => void
}

export function EditorCodeView({
  content, filePath, highlightedLines, onLineClick,
  agentChange, scrollToLine, showAgentDiff, onDismissAgentDiff,
  onContentChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [agentPopover, setAgentPopover] = useState<{ line: number; x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)

  // Sync external content changes
  useEffect(() => {
    setEditContent(content)
    setIsEditing(false)
  }, [filePath])

  const lines = (isEditing ? editContent : content).split('\n')
  const language = detectLanguage(filePath)
  const gutterWidth = Math.max(3, String(lines.length).length) * 8 + 24

  // Scroll to target line on mount or when scrollToLine changes
  useEffect(() => {
    if (scrollToLine && containerRef.current) {
      const lineEl = containerRef.current.querySelector(`[data-line="${scrollToLine}"]`)
      if (lineEl) {
        setTimeout(() => {
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }
  }, [scrollToLine])

  // Agent change line lookup
  const getAgentLineType = useCallback((lineNum: number): 'add' | 'modify' | null => {
    if (!agentChange) return null
    for (const range of agentChange.changedLines) {
      if (lineNum >= range.start && lineNum <= range.end) return range.type
    }
    return null
  }, [agentChange])

  const handleAgentMarkerClick = (lineNum: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setAgentPopover(prev =>
      prev?.line === lineNum ? null : { line: lineNum, x: rect.right + 8, y: rect.top }
    )
  }

  // ── Editing ──
  const handleLineDoubleClick = (lineNum: number) => {
    setIsEditing(true)
    setEditContent(content)
    // Focus textarea and place cursor at the right line
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        // Calculate character offset for the target line
        const linesBefore = content.split('\n').slice(0, lineNum - 1)
        const offset = linesBefore.reduce((sum, l) => sum + l.length + 1, 0)
        textareaRef.current.setSelectionRange(offset, offset)
      }
    }, 0)
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setEditContent(newContent)
    onContentChange?.(newContent)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab inserts 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newVal = ta.value.substring(0, start) + '  ' + ta.value.substring(end)
      setEditContent(newVal)
      onContentChange?.(newVal)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2 }, 0)
    }
    // Escape exits edit mode
    if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  // Count agent-changed lines for the banner
  const agentAddedCount = agentChange?.changedLines.filter(r => r.type === 'add').reduce((sum, r) => sum + (r.end - r.start + 1), 0) ?? 0
  const agentModifiedCount = agentChange?.changedLines.filter(r => r.type === 'modify').reduce((sum, r) => sum + (r.end - r.start + 1), 0) ?? 0

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, overflow: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: 12, lineHeight: 1.7,
        position: 'relative',
      }}
      onClick={() => setAgentPopover(null)}
    >
      {/* Agent diff banner */}
      {showAgentDiff && agentChange && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: 'var(--color-primary-subtle)',
          borderBottom: '1px solid var(--color-border-subtle)',
          fontSize: 12,
          position: 'sticky', top: 0, zIndex: 5,
        }}>
          <Bot size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
          <span style={{ color: 'var(--color-text-secondary)' }}>
            Showing changes by <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{agentChange.agentName}</strong>
          </span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{agentChange.commitMessage}</span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
            {agentAddedCount > 0 && (
              <span style={{ color: 'var(--color-success)', fontSize: 11 }}>+{agentAddedCount} added</span>
            )}
            {agentModifiedCount > 0 && (
              <span style={{ color: 'var(--color-warning)', fontSize: 11 }}>~{agentModifiedCount} modified</span>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {onDismissAgentDiff && (
            <button
              onClick={onDismissAgentDiff}
              title="Dismiss diff highlighting"
              style={{
                width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none',
                color: 'var(--color-text-tertiary)', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}

      {/* Edit mode — textarea with line numbers */}
      {isEditing ? (
        <div style={{ display: 'flex', minHeight: '100%' }}>
          {/* Line numbers column */}
          <div style={{
            width: gutterWidth + 3, minWidth: gutterWidth + 3,
            paddingTop: 8,
            userSelect: 'none',
            flexShrink: 0,
          }}>
            {editContent.split('\n').map((_, i) => (
              <div key={i} style={{
                height: 20.4,
                textAlign: 'right', paddingRight: 16, paddingLeft: 3,
                color: 'var(--color-text-tertiary)',
              }}>
                {i + 1}
              </div>
            ))}
          </div>
          {/* Editable textarea */}
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            spellCheck={false}
            style={{
              flex: 1,
              padding: '8px 16px 8px 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 12, lineHeight: 1.7,
              color: 'var(--color-text)',
              background: 'transparent',
              border: 'none', outline: 'none',
              resize: 'none',
              tabSize: 2,
              whiteSpace: 'pre',
              overflowWrap: 'normal',
              overflow: 'hidden',
            }}
          />
        </div>
      ) : (
        /* Read mode — syntax highlighted lines */
        <div style={{ padding: '8px 0', minWidth: 'fit-content' }}>
          {lines.map((line, i) => {
            const lineNum = i + 1
            const isHighlighted = highlightedLines.has(lineNum)
            const isHovered = hoveredLine === lineNum
            const agentType = getAgentLineType(lineNum)
            const isScrollTarget = scrollToLine === lineNum
            const isDiffHighlighted = showAgentDiff && agentType !== null

            // Determine line background — agent diff mode takes priority
            let lineBg = 'transparent'
            if (isScrollTarget) {
              lineBg = 'var(--color-warning-subtle)'
            } else if (isDiffHighlighted) {
              lineBg = agentType === 'add'
                ? 'rgba(34, 197, 94, 0.08)'
                : 'rgba(245, 158, 11, 0.08)'
            } else if (isHighlighted) {
              lineBg = 'var(--color-primary-subtle)'
            } else if (isHovered) {
              lineBg = 'var(--color-surface-hover)'
            }

            return (
              <div
                key={i}
                data-line={lineNum}
                onDoubleClick={() => handleLineDoubleClick(lineNum)}
                style={{
                  display: 'flex',
                  minHeight: 20,
                  background: lineBg,
                  transition: isScrollTarget ? 'background 1s ease-out' : undefined,
                  cursor: 'text',
                }}
                onMouseEnter={() => setHoveredLine(lineNum)}
                onMouseLeave={() => setHoveredLine(null)}
              >
                {/* Agent gutter marker */}
                <div
                  style={{
                    width: 3, minWidth: 3,
                    background: agentType === 'add'
                      ? 'var(--color-success)'
                      : agentType === 'modify'
                        ? 'var(--color-warning)'
                        : 'transparent',
                    cursor: agentType ? 'pointer' : 'default',
                    transition: `opacity var(--duration-fast)`,
                  }}
                  onClick={agentType ? (e) => handleAgentMarkerClick(lineNum, e) : undefined}
                  title={agentType ? `${agentChange?.agentName}: ${agentChange?.commitMessage}` : undefined}
                />

                {/* Diff indicator (+/~) when in agent diff mode */}
                {showAgentDiff && (
                  <span style={{
                    width: 16, minWidth: 16,
                    textAlign: 'center',
                    color: agentType === 'add'
                      ? 'var(--color-success)'
                      : agentType === 'modify'
                        ? 'var(--color-warning)'
                        : 'transparent',
                    userSelect: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    {agentType === 'add' ? '+' : agentType === 'modify' ? '~' : ' '}
                  </span>
                )}

                {/* Line number */}
                <span
                  onClick={(e) => onLineClick(lineNum, e.shiftKey)}
                  style={{
                    width: gutterWidth, minWidth: gutterWidth,
                    textAlign: 'right', paddingRight: 16,
                    color: isDiffHighlighted
                      ? (agentType === 'add' ? 'var(--color-success)' : 'var(--color-warning)')
                      : isHighlighted ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
                    userSelect: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {lineNum}
                </span>

                {/* Code content */}
                <span style={{
                  paddingRight: 16,
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'pre',
                }}>
                  {highlightLine(line, language)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Agent popover */}
      {agentPopover && agentChange && (
        <div style={{
          position: 'fixed',
          left: agentPopover.x, top: agentPopover.y,
          width: 320,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          boxShadow: 'var(--shadow-float)',
          zIndex: 'var(--z-tooltip)' as any,
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--color-primary-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: 'var(--color-primary)',
            }}>
              AI
            </span>
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{agentChange.agentName}</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>&middot; {agentChange.changedAt}</span>
          </div>
          <div style={{ color: 'var(--color-text)', marginBottom: 6, fontWeight: 500 }}>
            {agentChange.commitMessage}
          </div>
          <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {agentChange.reasoning}
          </div>
          <div style={{
            display: 'flex', gap: 8, marginTop: 8, paddingTop: 8,
            borderTop: '1px solid var(--color-border-subtle)',
            fontSize: 11, color: 'var(--color-text-tertiary)',
          }}>
            <span>Task: {agentChange.taskId}</span>
            {agentChange.mrId && <span>MR: {agentChange.mrId}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
