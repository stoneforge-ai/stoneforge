import { useState, useRef, useEffect } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'

interface Props {
  visible: boolean
  onClose: () => void
  content: string
  onHighlightMatches: (matches: number[]) => void
  onScrollToLine: (line: number) => void
}

export function EditorFindBar({ visible, onClose, content, onHighlightMatches, onScrollToLine }: Props) {
  const [query, setQuery] = useState('')
  const [currentMatch, setCurrentMatch] = useState(0)
  const [matchLines, setMatchLines] = useState<number[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [visible])

  useEffect(() => {
    if (!query.trim() || !content) {
      setMatchLines([])
      onHighlightMatches([])
      return
    }

    const lines = content.split('\n')
    const found: number[] = []
    const lowerQuery = query.toLowerCase()

    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(lowerQuery)) {
        found.push(i + 1)
      }
    })

    setMatchLines(found)
    setCurrentMatch(found.length > 0 ? 0 : -1)
    onHighlightMatches(found)

    if (found.length > 0) {
      onScrollToLine(found[0])
    }
  }, [query, content])

  const goNext = () => {
    if (matchLines.length === 0) return
    const next = (currentMatch + 1) % matchLines.length
    setCurrentMatch(next)
    onScrollToLine(matchLines[next])
  }

  const goPrev = () => {
    if (matchLines.length === 0) return
    const prev = (currentMatch - 1 + matchLines.length) % matchLines.length
    setCurrentMatch(prev)
    onScrollToLine(matchLines[prev])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter') {
      if (e.shiftKey) goPrev()
      else goNext()
    }
  }

  if (!visible) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 8px',
      background: 'var(--color-bg-elevated)',
      borderBottom: '1px solid var(--color-border)',
      position: 'absolute', top: 0, right: 0,
      zIndex: 10,
      borderRadius: '0 0 0 var(--radius-md)',
      boxShadow: 'var(--shadow-hover)',
    }}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Find..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          width: 180, height: 24,
          padding: '0 8px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12, color: 'var(--color-text)',
          outline: 'none',
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--color-border-focus)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
      />

      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', minWidth: 40, textAlign: 'center' }}>
        {matchLines.length > 0 ? `${currentMatch + 1}/${matchLines.length}` : 'No results'}
      </span>

      <button onClick={goPrev} title="Previous (Shift+Enter)"
        style={{
          width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-tertiary)', cursor: 'pointer',
        }}
      >
        <ChevronUp size={14} strokeWidth={1.5} />
      </button>
      <button onClick={goNext} title="Next (Enter)"
        style={{
          width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-tertiary)', cursor: 'pointer',
        }}
      >
        <ChevronDown size={14} strokeWidth={1.5} />
      </button>
      <button onClick={onClose} title="Close (Esc)"
        style={{
          width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-tertiary)', cursor: 'pointer',
        }}
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  )
}
