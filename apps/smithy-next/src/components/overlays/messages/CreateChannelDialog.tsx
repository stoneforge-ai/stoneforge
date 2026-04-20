import { useState } from 'react'
import { X, Hash, Lock } from 'lucide-react'
import type { MsgEntity } from './message-types'

interface CreateChannelDialogProps {
  entities: MsgEntity[]
  onClose: () => void
  onCreate: (data: { name: string; channelType: 'group'; description?: string; visibility: 'public' | 'private'; members: MsgEntity[] }) => void
}

export function CreateChannelDialog({ entities, onClose, onCreate }: CreateChannelDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canCreate = name.trim().length > 0 && selectedMembers.size >= 1

  const handleCreate = () => {
    if (!canCreate) return
    const members = entities.filter(e => selectedMembers.has(e.id))
    onCreate({ name: name.trim(), channelType: 'group', description: description.trim() || undefined, visibility, members })
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 480, maxWidth: '90vw', maxHeight: '80vh',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>New Discussion Channel</span>
          <button onClick={onClose} style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
          }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
          {/* Name */}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Channel name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Architecture Review"
            autoFocus
            style={{
              width: '100%', padding: '6px 10px', fontSize: 13,
              background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
              marginBottom: 12,
            }}
          />

          {/* Description */}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Set a topic for agents to discuss..."
            rows={2}
            style={{
              width: '100%', padding: '6px 10px', fontSize: 13, resize: 'none',
              background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
              fontFamily: 'inherit', marginBottom: 12,
            }}
          />

          {/* Visibility */}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Visibility
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {([
              { v: 'public' as const, icon: Hash, label: 'Public' },
              { v: 'private' as const, icon: Lock, label: 'Private' },
            ]).map(opt => (
              <button key={opt.v} onClick={() => setVisibility(opt.v)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 12,
                border: '1px solid',
                borderColor: visibility === opt.v ? 'var(--color-primary)' : 'var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: visibility === opt.v ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                color: visibility === opt.v ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}>
                <opt.icon size={13} /> {opt.label}
              </button>
            ))}
          </div>

          {/* Members */}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Members
          </label>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {entities.map(e => (
              <label key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', fontSize: 12,
              }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.has(e.id)}
                  onChange={() => toggleMember(e.id)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span style={{ color: 'var(--color-text)' }}>{e.name}</span>
                <span style={{
                  fontSize: 10, color: e.entityType === 'agent' ? '#a78bfa' : 'var(--color-text-tertiary)',
                  textTransform: 'capitalize',
                }}>
                  {e.entityType}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--color-border-subtle)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!canCreate} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            background: canCreate ? 'var(--color-primary)' : 'var(--color-surface)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            color: canCreate ? 'white' : 'var(--color-text-tertiary)',
            cursor: canCreate ? 'pointer' : 'default',
          }}>
            Create
          </button>
        </div>
      </div>
    </>
  )
}
