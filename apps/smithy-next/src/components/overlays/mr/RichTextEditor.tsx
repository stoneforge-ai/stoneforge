import { useState, useRef } from 'react'
import { Bold, Italic, Code, List, ListOrdered, Link2, Quote, Heading2, Image, Minus } from 'lucide-react'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  onKeyDown?: (e: React.KeyboardEvent) => void
}

export function RichTextEditor({ value, onChange, placeholder = 'Leave a comment...', minHeight = 80, maxHeight = 200, onKeyDown: externalKeyDown }: RichTextEditorProps) {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = value.slice(start, end)
    const newText = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newText)
    // Restore cursor position
    requestAnimationFrame(() => {
      textarea.focus()
      const cursorPos = start + before.length + selected.length + (selected ? 0 : 0)
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const wrapSelection = (wrapper: string) => insertMarkdown(wrapper, wrapper)

  const tools: { icon: typeof Bold; label: string; action: () => void; separator?: boolean }[] = [
    { icon: Heading2, label: 'Heading', action: () => insertMarkdown('### ') },
    { icon: Bold, label: 'Bold', action: () => wrapSelection('**') },
    { icon: Italic, label: 'Italic', action: () => wrapSelection('_') },
    { icon: Code, label: 'Code', action: () => wrapSelection('`') },
    { icon: Link2, label: 'Link', action: () => insertMarkdown('[', '](url)') },
    { icon: Quote, label: 'Quote', action: () => insertMarkdown('> ') },
    { icon: Minus, label: 'Divider', action: () => insertMarkdown('\n---\n'), separator: true },
    { icon: List, label: 'Bullet list', action: () => insertMarkdown('- ') },
    { icon: ListOrdered, label: 'Numbered list', action: () => insertMarkdown('1. ') },
  ]

  const renderPreview = () => {
    if (!value.trim()) return <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Nothing to preview</span>
    // Simple markdown rendering for prototype
    const lines = value.split('\n')
    return lines.map((line, i) => {
      let content: React.ReactNode = line

      // Headers
      if (line.startsWith('### ')) return <div key={i} style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{line.slice(4)}</div>
      if (line.startsWith('## ')) return <div key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{line.slice(3)}</div>
      if (line.startsWith('# ')) return <div key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>{line.slice(2)}</div>

      // Blockquote
      if (line.startsWith('> ')) return <div key={i} style={{ borderLeft: '3px solid var(--color-border)', paddingLeft: 10, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>{line.slice(2)}</div>

      // Lists
      if (line.match(/^[-*] /)) return <div key={i} style={{ paddingLeft: 16 }}>{'• '}{line.slice(2)}</div>
      if (line.match(/^\d+\. /)) return <div key={i} style={{ paddingLeft: 16 }}>{line}</div>

      // HR
      if (line.trim() === '---') return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '8px 0' }} />

      // Inline formatting (bold, italic, code)
      let html = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:var(--color-surface);padding:1px 4px;border-radius:3px;font-size:11px;font-family:var(--font-mono)">$1</code>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a style="color:var(--color-text-accent);text-decoration:underline">$1</a>')

      return <div key={i} dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
    })
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 1, padding: '4px 8px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-secondary)',
      }}>
        {/* Write / Preview tabs */}
        <button
          onClick={() => setActiveTab('write')}
          style={{
            padding: '3px 8px', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: activeTab === 'write' ? 'var(--color-surface-active)' : 'transparent',
            color: activeTab === 'write' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          Write
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          style={{
            padding: '3px 8px', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: activeTab === 'preview' ? 'var(--color-surface-active)' : 'transparent',
            color: activeTab === 'preview' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          Preview
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--color-border-subtle)', margin: '0 6px' }} />

        {/* Formatting tools */}
        {activeTab === 'write' && tools.map((tool, i) => {
          const Icon = tool.icon
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
              {tool.separator && <div style={{ width: 1, height: 16, background: 'var(--color-border-subtle)', margin: '0 4px' }} />}
              <button
                onClick={tool.action}
                title={tool.label}
                style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-sm)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              >
                <Icon size={14} strokeWidth={1.5} />
              </button>
            </span>
          )
        })}
      </div>

      {/* Content area */}
      {activeTab === 'write' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => {
            externalKeyDown?.(e)
            if (e.defaultPrevented) return
            if (e.ctrlKey || e.metaKey) {
              if (e.key === 'b') { e.preventDefault(); wrapSelection('**') }
              if (e.key === 'i') { e.preventDefault(); wrapSelection('_') }
              if (e.key === 'e') { e.preventDefault(); wrapSelection('`') }
              if (e.key === 'k') { e.preventDefault(); insertMarkdown('[', '](url)') }
            }
          }}
          style={{
            width: '100%', minHeight, maxHeight, resize: 'vertical',
            background: 'var(--color-surface)', border: 'none',
            padding: '10px 12px', color: 'var(--color-text)', fontSize: 13, lineHeight: 1.5,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
      ) : (
        <div style={{
          minHeight, maxHeight, overflow: 'auto',
          padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
          color: 'var(--color-text-secondary)', background: 'var(--color-surface)',
        }}>
          {renderPreview()}
        </div>
      )}

      {/* Footer hint */}
      <div style={{
        padding: '4px 8px', borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-secondary)', fontSize: 10, color: 'var(--color-text-tertiary)',
      }}>
        Supports Markdown. <span style={{ fontFamily: 'var(--font-mono)' }}>**bold**</span> <span style={{ fontFamily: 'var(--font-mono)' }}>_italic_</span> <span style={{ fontFamily: 'var(--font-mono)' }}>`code`</span>
      </div>
    </div>
  )
}
