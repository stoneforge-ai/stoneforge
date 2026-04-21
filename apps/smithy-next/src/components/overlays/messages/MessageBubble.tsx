import { useState } from 'react'
import { MessageSquare, Copy, Bot } from 'lucide-react'
import type { MsgMessage } from './message-types'

interface MessageBubbleProps {
  message: MsgMessage
  onOpenThread?: (messageId: string) => void
}

const entityColors: Record<string, string> = {
  human: 'var(--color-primary)',
  agent: '#a78bfa',
  system: 'var(--color-warning)',
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/** Minimal markdown rendering — bold, italic, code, backtick blocks, links */
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Code blocks (```)
  html = html.replace(/```([\s\S]*?)```/g, '<pre style="background:var(--color-surface);padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;font-family:var(--font-mono);overflow-x:auto;margin:4px 0">$1</pre>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--color-surface);padding:1px 5px;border-radius:3px;font-size:12px;font-family:var(--font-mono)">$1</code>')
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Lists
  html = html.replace(/^- (.+)$/gm, '<div style="padding-left:12px">\u2022 $1</div>')
  // Newlines
  html = html.replace(/\n/g, '<br/>')
  // @mentions
  html = html.replace(/@(\w[\w\s]*?\w)(?=[\s,.\-!?]|$)/g, '<span style="color:var(--color-primary);font-weight:500">@$1</span>')
  return html
}

export function MessageBubble({ message, onOpenThread }: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false)
  const { sender } = message
  const isAgent = sender.entityType === 'agent'
  const isSystem = sender.entityType === 'system'
  const dotColor = entityColors[sender.entityType] || entityColors.human
  const time = new Date(message.timestamp)
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 16px',
        position: 'relative',
        background: hovered ? 'var(--color-surface-hover)' : 'transparent',
        transition: 'background var(--duration-fast)',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: isAgent ? 'rgba(167, 139, 250, 0.15)' : isSystem ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-primary-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 11, fontWeight: 600,
        color: dotColor,
      }}>
        {isAgent ? <Bot size={15} /> : isSystem ? <span style={{ fontSize: 13 }}>S</span> : getInitials(sender.name)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header: name + badge + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span
            style={{
              fontSize: 13, fontWeight: 600,
              color: isSystem ? 'var(--color-text-secondary)' : 'var(--color-text)',
            }}
          >
            {sender.name}
          </span>
          {sender.entityType !== 'human' && (
            <span style={{
              fontSize: 10, fontWeight: 500, padding: '1px 5px',
              borderRadius: 'var(--radius-full)',
              background: isAgent ? 'rgba(167, 139, 250, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: isAgent ? '#a78bfa' : 'var(--color-warning)',
              textTransform: 'capitalize',
            }}>
              {sender.entityType}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {timeStr}
          </span>
        </div>

        {/* Message content */}
        <div
          style={{
            fontSize: 13, lineHeight: 1.5,
            color: isSystem ? 'var(--color-text-secondary)' : 'var(--color-text)',
            fontStyle: isSystem ? 'italic' : 'normal',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {message.attachments.map((a, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', fontSize: 11,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)',
              }}>
                {a.name}
              </span>
            ))}
          </div>
        )}

        {/* Thread indicator */}
        {message.replyCount && message.replyCount > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 6, padding: '3px 8px',
              background: 'none', border: 'none',
              color: 'var(--color-primary)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-subtle)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <MessageSquare size={12} />
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Hover actions */}
      {hovered && (
        <div style={{
          position: 'absolute', top: 4, right: 16,
          display: 'flex', gap: 2,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: 2,
          boxShadow: 'var(--shadow-hover)',
        }}>
          <button
            onClick={() => onOpenThread?.(message.id)}
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            title="Reply in thread"
          >
            <MessageSquare size={13} />
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(message.content)}
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            title="Copy"
          >
            <Copy size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
