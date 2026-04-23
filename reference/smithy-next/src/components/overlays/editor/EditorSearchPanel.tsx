import { useState, useMemo } from 'react'
import { Search, ChevronRight, ChevronDown, File, CaseSensitive, WholeWord, Regex, X } from 'lucide-react'
import { mockEditorFiles, flattenFileTree, mockEditorFileTree } from './editor-mock-data'

interface Props {
  onOpenFileAtLine: (path: string, line: number) => void
}

interface SearchMatch {
  filePath: string
  line: number
  content: string
  matchStart: number
  matchEnd: number
}

export function EditorSearchPanel({ onOpenFileAtLine }: Props) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const results = useMemo(() => {
    if (!query.trim()) return []

    const matches: SearchMatch[] = []
    const allFiles = flattenFileTree(mockEditorFileTree).filter(e => e.type === 'file')

    for (const file of allFiles) {
      const content = mockEditorFiles[file.path]?.content
      if (!content) continue

      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const searchIn = caseSensitive ? line : line.toLowerCase()
        const searchFor = caseSensitive ? query : query.toLowerCase()

        let idx = -1
        if (useRegex) {
          try {
            const re = new RegExp(query, caseSensitive ? 'g' : 'gi')
            const m = re.exec(line)
            if (m) idx = m.index
          } catch { continue }
        } else if (wholeWord) {
          const re = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? '' : 'i')
          const m = re.exec(line)
          if (m) idx = m.index
        } else {
          idx = searchIn.indexOf(searchFor)
        }

        if (idx >= 0) {
          matches.push({
            filePath: file.path,
            line: i + 1,
            content: line,
            matchStart: idx,
            matchEnd: idx + query.length,
          })
        }
      }
    }

    return matches
  }, [query, caseSensitive, wholeWord, useRegex])

  // Group by file
  const grouped = useMemo(() => {
    const map = new Map<string, SearchMatch[]>()
    for (const match of results) {
      const arr = map.get(match.filePath) || []
      arr.push(match)
      map.set(match.filePath, arr)
    }
    return map
  }, [results])

  // Auto-expand when <=3 files
  const effectiveExpanded = useMemo(() => {
    if (grouped.size <= 3 && grouped.size > 0) {
      return new Set([...grouped.keys()])
    }
    return expandedFiles
  }, [grouped, expandedFiles])

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search input area */}
      <div style={{
        padding: 8,
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} strokeWidth={1.5} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--color-text-tertiary)',
          }} />
          <input
            type="text"
            placeholder="Search in workspace..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%', height: 28,
              padding: '0 28px 0 26px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12, color: 'var(--color-text)',
              outline: 'none',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-border-focus)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                width: 18, height: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none',
                color: 'var(--color-text-tertiary)', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Options toggles */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[
            { active: caseSensitive, toggle: () => setCaseSensitive(v => !v), icon: CaseSensitive, title: 'Case Sensitive' },
            { active: wholeWord, toggle: () => setWholeWord(v => !v), icon: WholeWord, title: 'Whole Word' },
            { active: useRegex, toggle: () => setUseRegex(v => !v), icon: Regex, title: 'Use Regex' },
          ].map(opt => (
            <button
              key={opt.title}
              onClick={opt.toggle}
              title={opt.title}
              style={{
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: opt.active ? 'var(--color-primary)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)',
                color: opt.active ? 'white' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
                transition: `all var(--duration-fast)`,
              }}
              onMouseEnter={e => {
                if (!opt.active) {
                  e.currentTarget.style.background = 'var(--color-surface-hover)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
              onMouseLeave={e => {
                if (!opt.active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-tertiary)'
                }
              }}
            >
              <opt.icon size={14} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>

      {/* Results summary */}
      {query && (
        <div style={{
          padding: '4px 12px',
          fontSize: 11, color: 'var(--color-text-tertiary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          {results.length} result{results.length !== 1 ? 's' : ''} in {grouped.size} file{grouped.size !== 1 ? 's' : ''}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!query && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 8,
            color: 'var(--color-text-tertiary)',
          }}>
            <Search size={28} strokeWidth={1} />
            <span style={{ fontSize: 12 }}>Search in workspace</span>
            <span style={{ fontSize: 11 }}>Type to search all files</span>
          </div>
        )}

        {query && results.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 8,
            color: 'var(--color-text-tertiary)',
          }}>
            <X size={28} strokeWidth={1} />
            <span style={{ fontSize: 12 }}>No results</span>
          </div>
        )}

        {[...grouped.entries()].map(([filePath, matches]) => {
          const fileName = filePath.split('/').pop()
          const isOpen = effectiveExpanded.has(filePath)

          return (
            <div key={filePath}>
              <button
                onClick={() => toggleFile(filePath)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px',
                  background: 'none', border: 'none',
                  fontSize: 12, color: 'var(--color-text)',
                  textAlign: 'left', cursor: 'pointer',
                  transition: `background var(--duration-fast)`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {isOpen ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
                <File size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                <span style={{ fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fileName}
                </span>
                <span style={{
                  fontSize: 10, padding: '1px 5px',
                  background: 'var(--color-primary-subtle)',
                  color: 'var(--color-primary)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  {matches.length}
                </span>
              </button>

              {isOpen && (
                <div style={{ background: 'var(--color-surface)' }}>
                  {matches.slice(0, 10).map((match, i) => (
                    <button
                      key={i}
                      onClick={() => onOpenFileAtLine(match.filePath, match.line)}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'flex-start', gap: 6,
                        padding: '3px 8px 3px 32px',
                        background: 'none', border: 'none',
                        fontSize: 11, textAlign: 'left', cursor: 'pointer',
                        transition: `background var(--duration-fast)`,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <span style={{
                        width: 28, minWidth: 28, textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-tertiary)',
                      }}>
                        {match.line}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-secondary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {match.content.slice(Math.max(0, match.matchStart - 20), match.matchStart)}
                        <span style={{
                          background: 'var(--color-warning-subtle)',
                          color: 'var(--color-text)',
                          fontWeight: 600,
                          padding: '0 1px',
                          borderRadius: 2,
                        }}>
                          {match.content.slice(match.matchStart, match.matchEnd)}
                        </span>
                        {match.content.slice(match.matchEnd, match.matchEnd + 30)}
                      </span>
                    </button>
                  ))}
                  {matches.length > 10 && (
                    <div style={{
                      padding: '3px 8px 3px 32px',
                      fontSize: 11, fontStyle: 'italic',
                      color: 'var(--color-text-tertiary)',
                    }}>
                      +{matches.length - 10} more...
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
