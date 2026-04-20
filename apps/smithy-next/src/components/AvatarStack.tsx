import type { StoneforgeUser } from '../mock-data'
import { UserAvatar } from './UserAvatar'

interface AvatarStackProps {
  users: StoneforgeUser[]
  max?: number
  size?: number
  showPresence?: boolean
  style?: React.CSSProperties
}

export function AvatarStack({ users, max = 4, size = 22, showPresence = false, style }: AvatarStackProps) {
  const visible = users.slice(0, max)
  const overflow = users.length - max

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        ...style,
      }}
    >
      {visible.map((user, i) => (
        <UserAvatar
          key={user.id}
          user={user}
          size={size}
          showPresence={showPresence}
          style={{
            marginLeft: i === 0 ? 0 : -6,
            border: '2px solid var(--color-bg)',
            borderRadius: '50%',
            zIndex: visible.length - i,
            position: 'relative',
          }}
        />
      ))}
      {overflow > 0 && (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: 'var(--color-surface-active)',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(9, Math.round(size * 0.4)),
            fontWeight: 600,
            marginLeft: -6,
            border: '2px solid var(--color-bg)',
            position: 'relative',
            zIndex: 0,
            lineHeight: 1,
          }}
          title={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
