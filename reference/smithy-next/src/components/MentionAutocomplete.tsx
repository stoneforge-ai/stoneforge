import { useState, useRef, useEffect, useCallback } from 'react'
import type { StoneforgeUser } from '../mock-data'
import { UserAvatar } from './UserAvatar'

interface MentionAutocompleteProps {
  value: string
  onChange: (value: string) => void
  teamMembers: StoneforgeUser[]
  currentUserId: string
  isTeamMode: boolean
  /** Position dropdown above or below the input. Default: 'above' */
  position?: 'above' | 'below'
}

/**
 * Headless @mention hook — manages mention detection, filtering, keyboard navigation,
 * and insertion. Components bring their own input/textarea.
 */
export function useMentionAutocomplete({
  value,
  onChange,
  teamMembers,
  currentUserId,
  isTeamMode,
}: Omit<MentionAutocompleteProps, 'position'>) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const filteredMembers = mentionQuery !== null
    ? teamMembers.filter(m => m.id !== currentUserId && m.name.toLowerCase().includes(mentionQuery))
    : []

  const handleChange = useCallback((newValue: string) => {
    onChange(newValue)
    if (isTeamMode) {
      const atMatch = newValue.match(/@(\w*)$/)
      if (atMatch) {
        setMentionQuery(atMatch[1].toLowerCase())
        setMentionIndex(0)
      } else {
        setMentionQuery(null)
      }
    }
  }, [onChange, isTeamMode])

  const insertMention = useCallback((name: string) => {
    const atPos = value.lastIndexOf('@')
    onChange(value.substring(0, atPos) + `@${name} `)
    setMentionQuery(null)
  }, [value, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mentionQuery === null || filteredMembers.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIndex(i => Math.min(i + 1, filteredMembers.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIndex(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filteredMembers[mentionIndex].name)
    }
    if (e.key === 'Escape') {
      setMentionQuery(null)
    }
  }, [mentionQuery, filteredMembers, mentionIndex, insertMention])

  const showDropdown = isTeamMode && mentionQuery !== null && filteredMembers.length > 0

  return {
    mentionQuery,
    mentionIndex,
    filteredMembers,
    showDropdown,
    handleChange,
    handleKeyDown,
    insertMention,
    setMentionIndex,
  }
}

/**
 * Dropdown overlay rendered when @mention is active.
 * Positioned relative to a parent container with `position: relative`.
 */
export function MentionDropdown({ members, activeIndex, onSelect, onHover, position = 'above' }: {
  members: StoneforgeUser[]
  activeIndex: number
  onSelect: (name: string) => void
  onHover: (index: number) => void
  position?: 'above' | 'below'
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const positionStyle: React.CSSProperties = position === 'above'
    ? { bottom: '100%', marginBottom: 4 }
    : { top: '100%', marginTop: 4 }

  return (
    <div
      ref={listRef}
      style={{
        position: 'absolute', left: 0, ...positionStyle,
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: 4, width: 220,
        boxShadow: 'var(--shadow-float)', zIndex: 100,
        maxHeight: 180, overflowY: 'auto',
      }}
    >
      {members.map((member, i) => (
        <button
          key={member.id}
          onClick={() => onSelect(member.name)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: i === activeIndex ? 'var(--color-surface-hover)' : 'transparent',
            color: 'var(--color-text)', cursor: 'pointer', fontSize: 12, textAlign: 'left',
          }}
          onMouseEnter={() => onHover(i)}
        >
          <UserAvatar user={member} size={20} showPresence />
          <span style={{ flex: 1 }}>{member.name}</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{member.role}</span>
        </button>
      ))}
    </div>
  )
}
