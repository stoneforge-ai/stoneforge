import { X, Bot } from 'lucide-react'
import type { MsgEntity } from './message-types'

interface MembersPanelProps {
  members: MsgEntity[]
  onClose: () => void
  /** When true, takes full width instead of fixed 280px */
  fullWidth?: boolean
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function MembersPanel({ members, onClose, fullWidth }: MembersPanelProps) {
  const humans = members.filter(m => m.entityType === 'human')
  const agents = members.filter(m => m.entityType === 'agent')
  const system = members.filter(m => m.entityType === 'system')

  const sections: { label: string; entities: MsgEntity[] }[] = []
  if (humans.length > 0) sections.push({ label: 'People', entities: humans })
  if (agents.length > 0) sections.push({ label: 'Agents', entities: agents })
  if (system.length > 0) sections.push({ label: 'System', entities: system })

  return (
    <div style={{
      width: fullWidth ? '100%' : 280, height: '100%',
      borderLeft: fullWidth ? 'none' : '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg)',
      flexShrink: 0,
      animation: fullWidth ? 'none' : 'slideInRight var(--duration-normal) ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          Members ({members.length})
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

      {/* Member list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {sections.map(section => (
          <div key={section.label}>
            {/* Section header */}
            <div style={{
              padding: '10px 14px 4px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {section.label} ({section.entities.length})
            </div>

            {section.entities.map(entity => (
              <MemberRow
                key={entity.id}
                entity={entity}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberRow({ entity }: { entity: MsgEntity }) {
  const isAgent = entity.entityType === 'agent'
  const isSystem = entity.entityType === 'system'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 14px',
      transition: 'background var(--duration-fast)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: isAgent ? 'rgba(167, 139, 250, 0.15)' : isSystem ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-primary-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 10, fontWeight: 600,
        color: isAgent ? '#a78bfa' : isSystem ? 'var(--color-warning)' : 'var(--color-primary)',
      }}>
        {isAgent ? <Bot size={13} /> : isSystem ? 'S' : getInitials(entity.name)}
      </div>

      {/* Name + type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: 'var(--color-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entity.name}
        </div>
        {entity.entityType !== 'human' && (
          <div style={{
            fontSize: 10,
            color: isAgent ? '#a78bfa' : 'var(--color-warning)',
            textTransform: 'capitalize',
          }}>
            {entity.entityType}
          </div>
        )}
      </div>

    </div>
  )
}
