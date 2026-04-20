import type { StoneforgeUser } from '../mock-data'
import { currentUser } from '../mock-data'
import { PresenceDot } from './PresenceDot'

interface UserAvatarProps {
  user: StoneforgeUser
  size?: number
  showPresence?: boolean
  style?: React.CSSProperties
}

export function UserAvatar({ user, size = 22, showPresence = false, style }: UserAvatarProps) {
  const isCurrentUser = user.id === currentUser.id
  const fontSize = Math.max(9, Math.round(size * 0.45))

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
      title={user.name}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: isCurrentUser ? 'var(--color-primary-muted)' : 'var(--color-surface-active)',
          color: isCurrentUser ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          fontWeight: 600,
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {user.avatar}
      </div>
      {showPresence && (
        <PresenceDot
          status={user.presence}
          size={Math.max(4, Math.round(size * 0.27))}
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
          }}
        />
      )}
    </div>
  )
}
