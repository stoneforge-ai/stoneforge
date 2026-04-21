import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, ChevronUp, ChevronDown, Copy, X } from 'lucide-react'

interface CILogViewerProps {
  logs: string[]
  isRunning?: boolean
  maxHeight?: number
}

export function CILogViewer({ logs, isRunning, maxHeight = 360 }: CILogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [currentMatch, setCurrentMatch] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  // Find matching line indices
  const matchIndices = searchQuery.trim()
    ? logs.reduce<number[]>((acc, line, i) => {
        if (line.toLowerCase().includes(searchQuery.toLowerCase())) acc.push(i)
        return acc
      }, [])
    : []

  const scrollToMatch = useCallback((idx: number) => {
    const lineIdx = matchIndices[idx]
    if (lineIdx != null && lineRefs.current[lineIdx]) {
      lineRefs.current[lineIdx]!.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [matchIndices])

  // Auto-scroll to bottom for running logs
  useEffect(() => {
    if (isRunning && containerRef.current && !searchOpen) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs.length, isRunning, searchOpen])

  const handlePrev = () => {
    const next = currentMatch > 0 ? currentMatch - 1 : matchIndices.length - 1
    setCurrentMatch(next)
    scrollToMatch(next)
  }
  const handleNext = () => {
    const next = currentMatch < matchIndices.length - 1 ? currentMatch + 1 : 0
    setCurrentMatch(next)
    scrollToMatch(next)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n')).catch(() => {})
  }

  const getLineColor = (line: string): string => {
    if (line.includes('❌') || line.includes('FAIL') || line.includes('failed') || line.includes('Error')) return 'var(--color-danger)'
    if (line.includes('✅') || line.includes('✓') || line.includes('passed') || line.includes('succeeded')) return 'var(--color-success)'
    if (line.startsWith('▶') || line.startsWith('⚡') || line.startsWith('📦') || line.startsWith('🔨') || line.startsWith('🧪') || line.startsWith('🚀')) return 'var(--color-text-secondary)'
    return 'var(--color-text-tertiary)'
  }

  return (
    <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {searchOpen ? (
          <>
            <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentMatch(0) }}
              placeholder="Search logs..."
              autoFocus
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', minWidth: 0 }}
              onKeyDown={e => { if (e.key === 'Enter') handleNext(); if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') } }}
            />
            {matchIndices.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                {currentMatch + 1}/{matchIndices.length}
              </span>
            )}
            <button onClick={handlePrev} style={toolBtnStyle}><ChevronUp size={11} strokeWidth={1.5} /></button>
            <button onClick={handleNext} style={toolBtnStyle}><ChevronDown size={11} strokeWidth={1.5} /></button>
            <button onClick={() => { setSearchOpen(false); setSearchQuery('') }} style={toolBtnStyle}><X size={11} strokeWidth={1.5} /></button>
          </>
        ) : (
          <>
            <button onClick={() => setSearchOpen(true)} style={toolBtnStyle} title="Search logs">
              <Search size={11} strokeWidth={1.5} />
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={handleCopy} style={toolBtnStyle} title="Copy all">
              <Copy size={11} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Log lines */}
      <div ref={containerRef} style={{
        maxHeight, overflow: 'auto', padding: '8px 0', background: 'var(--color-bg-secondary)',
        fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7,
      }}>
        {logs.map((line, i) => {
          const isMatch = searchQuery && matchIndices.includes(i)
          const isCurrentMatch = isMatch && matchIndices[currentMatch] === i
          return (
            <div
              key={i}
              ref={el => { lineRefs.current[i] = el }}
              style={{
                display: 'flex', padding: '0 12px 0 0', minHeight: line === '' ? 12 : 18,
                background: isCurrentMatch ? 'var(--color-warning-subtle)' : isMatch ? 'rgba(255,255,255,0.04)' : undefined,
              }}
            >
              <span style={{ width: 40, textAlign: 'right', paddingRight: 12, flexShrink: 0, color: 'var(--color-text-tertiary)', opacity: 0.4, userSelect: 'none', fontSize: 10 }}>
                {i + 1}
              </span>
              <span style={{ color: getLineColor(line) }}>{line || '\u00A0'}</span>
            </div>
          )
        })}
        {isRunning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 4px 52px', color: 'var(--color-text-accent)' }}>
            <span style={{ animation: 'pulse 1.5s infinite' }}>●</span> Running...
          </div>
        )}
      </div>
    </div>
  )
}

const toolBtnStyle: React.CSSProperties = {
  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0,
}
