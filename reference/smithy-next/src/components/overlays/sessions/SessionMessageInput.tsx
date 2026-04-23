import { useState, useRef, useEffect } from 'react'
import { Send, Play } from 'lucide-react'
import type { SessionStatus } from './session-types'

interface SessionMessageInputProps {
  sessionStatus: SessionStatus
  onSendMessage: (message: string) => void
  onResumeSession?: () => void
}

export function SessionMessageInput({ sessionStatus, onSendMessage, onResumeSession }: SessionMessageInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-expand textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '36px'
    const newHeight = Math.min(Math.max(el.scrollHeight, 36), 120)
    el.style.height = newHeight + 'px'
  }, [value])

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  // Completed sessions: show ended state
  if (sessionStatus === 'completed') {
    return (
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Session ended
        </span>
        {onResumeSession && (
          <button
            onClick={onResumeSession}
            style={{
              height: 26, padding: '0 10px',
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--color-surface)', border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500,
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
          >
            <Play size={11} strokeWidth={2} /> Resume
          </button>
        )}
      </div>
    )
  }

  // Active / error sessions: show message input
  const placeholder = sessionStatus === 'error'
    ? 'Send to resume...'
    : 'Send a message...'

  return (
    <div style={{
      padding: '8px 12px',
      borderTop: '1px solid var(--color-border-subtle)',
      display: 'flex', alignItems: 'flex-end', gap: 8,
      flexShrink: 0,
    }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        style={{
          flex: 1,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '7px 10px',
          color: 'var(--color-text)',
          fontSize: 13,
          lineHeight: '20px',
          outline: 'none',
          resize: 'none',
          minHeight: 36,
          maxHeight: 120,
          overflow: 'auto',
          fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
        }}
      />
      <button
        onClick={handleSend}
        disabled={!value.trim()}
        style={{
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: value.trim() ? 'var(--color-primary)' : 'var(--color-surface)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          color: value.trim() ? 'white' : 'var(--color-text-quaternary)',
          cursor: value.trim() ? 'pointer' : 'default',
          flexShrink: 0,
          transition: 'all var(--duration-fast)',
        }}
        title="Send (⌘+Enter)"
      >
        <Send size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
