import { X } from 'lucide-react'
import type { MsgMessage } from './message-types'
import { MessageBubble } from './MessageBubble'
import { ChannelComposer } from './ChannelComposer'

interface ThreadPanelProps {
  parentMessage: MsgMessage
  replies: MsgMessage[]
  onClose: () => void
  onSendReply: (content: string) => void
  /** When true, takes full width instead of fixed 380px */
  fullWidth?: boolean
}

export function ThreadPanel({ parentMessage, replies, onClose, onSendReply, fullWidth }: ThreadPanelProps) {
  return (
    <div style={{
      width: fullWidth ? '100%' : 'clamp(260px, 33%, 340px)',
      height: '100%',
      borderLeft: fullWidth ? 'none' : '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg)',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          Thread
        </span>
        <button
          onClick={onClose}
          style={{
            width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none',
            color: 'var(--color-text-tertiary)', cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Parent message (muted background) */}
        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <MessageBubble message={parentMessage} />
        </div>

        {/* Reply count */}
        <div style={{
          padding: '8px 16px',
          fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </div>

        {/* Replies */}
        {replies.map(reply => (
          <MessageBubble key={reply.id} message={reply} />
        ))}

        {replies.length === 0 && (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: 'var(--color-text-tertiary)', fontSize: 13,
          }}>
            No replies yet. Start the conversation.
          </div>
        )}
      </div>

      {/* Composer */}
      <ChannelComposer onSend={onSendReply} placeholder="Reply in thread..." />
    </div>
  )
}
