import { Bot } from 'lucide-react'
import { highlightLine, detectLanguage } from '../mr/syntax-highlight'
import type { EditorBlameBlock } from './editor-mock-data'

interface Props {
  content: string
  filePath: string
  blameBlocks: EditorBlameBlock[]
}

export function EditorBlameView({ content, filePath, blameBlocks }: Props) {
  const lines = content.split('\n')
  const language = detectLanguage(filePath)
  const gutterWidth = Math.max(3, String(lines.length).length) * 8 + 24

  // Build line → blame block lookup
  const lineToBlock = new Map<number, EditorBlameBlock>()
  for (const block of blameBlocks) {
    for (let i = block.startLine; i <= block.endLine; i++) {
      lineToBlock.set(i, block)
    }
  }

  // Determine if a line is the first in its block (show metadata only on first line)
  const isFirstInBlock = (lineNum: number): boolean => {
    const block = lineToBlock.get(lineNum)
    return block ? block.startLine === lineNum : false
  }

  // Alternate background for adjacent blocks
  let blockIndex = 0
  let lastBlockSha = ''

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: 12, lineHeight: 1.7,
    }}>
      <div style={{ padding: '8px 0', minWidth: 'fit-content' }}>
        {lines.map((line, i) => {
          const lineNum = i + 1
          const block = lineToBlock.get(lineNum)

          // Track block index for alternating backgrounds
          if (block && block.commitSha !== lastBlockSha) {
            blockIndex++
            lastBlockSha = block.commitSha
          }

          const showMeta = isFirstInBlock(lineNum) && block
          const isEven = blockIndex % 2 === 0

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                minHeight: 20,
                background: isEven ? 'transparent' : 'var(--color-surface)',
              }}
            >
              {/* Blame metadata column */}
              <div style={{
                width: 260, minWidth: 260,
                padding: '0 12px',
                display: 'flex', alignItems: 'center', gap: 6,
                borderRight: '1px solid var(--color-border-subtle)',
                overflow: 'hidden',
              }}>
                {showMeta && block && (
                  <>
                    {/* Author avatar */}
                    <div style={{
                      width: 18, height: 18, minWidth: 18,
                      borderRadius: '50%',
                      background: block.isAgent ? 'var(--color-primary-muted)' : 'var(--color-surface-active)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 600,
                      color: block.isAgent ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}>
                      {block.isAgent ? <Bot size={10} strokeWidth={2} /> : block.author.charAt(0).toUpperCase()}
                    </div>

                    {/* Author + commit message */}
                    <span style={{
                      flex: 1, minWidth: 0,
                      color: 'var(--color-text-secondary)',
                      fontSize: 11,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={`${block.author}: ${block.commitMessage}`}>
                      {block.commitMessage}
                    </span>

                    {/* Date */}
                    <span style={{
                      color: 'var(--color-text-tertiary)',
                      fontSize: 11, whiteSpace: 'nowrap',
                    }}>
                      {block.date}
                    </span>

                    {/* Commit SHA */}
                    <span style={{
                      color: 'var(--color-text-tertiary)',
                      fontSize: 10, fontFamily: 'var(--font-mono)',
                    }}>
                      {block.commitSha.slice(0, 7)}
                    </span>
                  </>
                )}
              </div>

              {/* Line number */}
              <span style={{
                width: gutterWidth, minWidth: gutterWidth,
                textAlign: 'right', paddingRight: 16,
                color: 'var(--color-text-tertiary)',
                userSelect: 'none',
              }}>
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
    </div>
  )
}
