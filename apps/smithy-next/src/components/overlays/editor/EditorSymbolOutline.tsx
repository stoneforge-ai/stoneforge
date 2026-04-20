import { Braces, FunctionSquare, Type, Hash, Package } from 'lucide-react'
import type { EditorSymbol } from './editor-mock-data'

interface Props {
  symbols: EditorSymbol[]
  activeLine: number
  onSelectSymbol: (line: number) => void
}

const kindIcons: Record<string, typeof Braces> = {
  interface: Braces,
  type: Type,
  function: FunctionSquare,
  method: FunctionSquare,
  class: Package,
  const: Hash,
  export: Package,
}

const kindColors: Record<string, string> = {
  interface: 'var(--color-warning)',
  type: 'var(--color-warning)',
  function: 'var(--color-primary)',
  method: 'var(--color-primary)',
  class: '#a855f7',
  const: 'var(--color-success)',
  export: 'var(--color-text-secondary)',
}

export function EditorSymbolOutline({ symbols, activeLine, onSelectSymbol }: Props) {
  // Determine which symbol is "active" based on cursor line
  const activeSymbol = [...symbols].reverse().find(s => activeLine >= s.line)

  return (
    <div style={{
      width: 200, minWidth: 200,
      borderLeft: '1px solid var(--color-border-subtle)',
      overflow: 'auto',
      background: 'var(--color-bg)',
    }}>
      <div style={{
        padding: '8px 12px',
        fontSize: 11, fontWeight: 600,
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        Outline
      </div>
      <div style={{ padding: '4px 0' }}>
        {symbols.map((symbol, i) => {
          const Icon = kindIcons[symbol.kind] || Hash
          const color = kindColors[symbol.kind] || 'var(--color-text-secondary)'
          const isActive = activeSymbol === symbol

          return (
            <button
              key={i}
              onClick={() => onSelectSymbol(symbol.line)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%',
                padding: '4px 12px',
                paddingLeft: 12 + (symbol.indent || 0) * 12,
                background: isActive ? 'var(--color-primary-subtle)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                textAlign: 'left',
                transition: `background var(--duration-fast)`,
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Icon size={13} strokeWidth={1.5} style={{ color, minWidth: 13 }} />
              <span style={{
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}>
                {symbol.name}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 10,
                color: 'var(--color-text-tertiary)',
              }}>
                {symbol.line}
              </span>
            </button>
          )
        })}
        {symbols.length === 0 && (
          <div style={{
            padding: '16px 12px', textAlign: 'center',
            color: 'var(--color-text-tertiary)', fontSize: 11,
          }}>
            No symbols found
          </div>
        )}
      </div>
    </div>
  )
}
