import { useState } from 'react'
import { X, Maximize2, Minimize2, Paperclip } from 'lucide-react'
import { type Task, ASSIGNEES } from '../mock-data'
import {
  StatusDropdown, PriorityDropdown, AssigneeDropdown, LabelDropdown,
  PropertyPill, STATUS_ICONS, PriorityBarIcon,
} from './dropdowns/PropertyDropdowns'
import { KANBAN_COLUMNS } from '../mock-data'

interface CreateTaskDialogProps {
  onClose: () => void
  onCreate: (task: Partial<Task>) => void
}

export function CreateTaskDialog({ onClose, onCreate }: CreateTaskDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<Task['status']>('todo')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [assignee, setAssignee] = useState<{ name: string; avatar: string } | undefined>()
  const [labels, setLabels] = useState<string[]>([])
  const [createMore, setCreateMore] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [fullScreen, setFullScreen] = useState(false)

  const statusInfo = STATUS_ICONS[status] || STATUS_ICONS.todo

  const handleCreate = () => {
    if (!title.trim()) return
    onCreate({ title, description: description || undefined, status, priority, assignee, labels })
    if (createMore) {
      setTitle('')
      setDescription('')
    } else {
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />

      {/* Dialog */}
      <div style={{
        position: 'fixed',
        ...(fullScreen
          ? { top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0 }
          : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 640, maxWidth: '90vw', maxHeight: '80vh', borderRadius: 'var(--radius-md)' }
        ),
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500, background: 'var(--color-surface)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>SF</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>›</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>New task</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setFullScreen(!fullScreen)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {fullScreen ? <Minimize2 size={13} strokeWidth={1.5} /> : <Maximize2 size={13} strokeWidth={1.5} />}
            </button>
            <button onClick={onClose} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '16px 20px', overflow: 'auto' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
            style={{ width: '100%', background: 'none', border: 'none', fontSize: 18, fontWeight: 500, color: 'var(--color-text)', outline: 'none', marginBottom: 8 }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreate() } }}
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add description..."
            style={{ width: '100%', minHeight: 120, background: 'none', border: 'none', fontSize: 14, color: 'var(--color-text-secondary)', outline: 'none', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
          />
        </div>

        {/* Property pills */}
        <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--color-border-subtle)' }}>
          {/* Status */}
          <div style={{ position: 'relative' }}>
            <PropertyPill icon={<span style={{ color: statusInfo.color }}>{statusInfo.icon}</span>} label={KANBAN_COLUMNS.find(c => c.id === status)?.label || ''} onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')} />
            {openDropdown === 'status' && <StatusDropdown current={status} onSelect={setStatus} onClose={() => setOpenDropdown(null)} position={{ bottom: 32, left: 0 }} />}
          </div>

          {/* Priority */}
          <div style={{ position: 'relative' }}>
            <PropertyPill icon={<PriorityBarIcon level={priority} />} label={priority.charAt(0).toUpperCase() + priority.slice(1)} onClick={() => setOpenDropdown(openDropdown === 'priority' ? null : 'priority')} />
            {openDropdown === 'priority' && <PriorityDropdown current={priority} onSelect={setPriority} onClose={() => setOpenDropdown(null)} position={{ bottom: 32, left: 0 }} />}
          </div>

          {/* Assignee */}
          <div style={{ position: 'relative' }}>
            <PropertyPill label={assignee?.name || 'Assignee'} onClick={() => setOpenDropdown(openDropdown === 'assignee' ? null : 'assignee')} />
            {openDropdown === 'assignee' && <AssigneeDropdown current={assignee?.name} onSelect={name => { const a = ASSIGNEES.find(x => x.name === name); setAssignee(a ? { name: a.name, avatar: a.avatar } : undefined) }} onClose={() => setOpenDropdown(null)} position={{ bottom: 32, left: 0 }} />}
          </div>

          {/* Labels */}
          {labels.map(l => (
            <span key={l} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />
              {l}
            </span>
          ))}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOpenDropdown(openDropdown === 'labels' ? null : 'labels')} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>⋯</button>
            {openDropdown === 'labels' && <LabelDropdown current={labels} onToggle={l => setLabels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])} onClose={() => setOpenDropdown(null)} position={{ bottom: 32, left: 0 }} />}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <button style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
            <Paperclip size={14} strokeWidth={1.5} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
              <div onClick={() => setCreateMore(!createMore)} style={{ width: 32, height: 18, borderRadius: 9, background: createMore ? 'var(--color-primary)' : 'var(--color-surface-active)', display: 'flex', alignItems: 'center', padding: 2, cursor: 'pointer', transition: 'background 0.15s' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'white', transform: createMore ? 'translateX(14px)' : 'translateX(0)', transition: 'transform 0.15s' }} />
              </div>
              Create more
            </label>
            <button onClick={handleCreate} disabled={!title.trim()} style={{
              height: 32, padding: '0 16px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: title.trim() ? 'var(--color-primary)' : 'var(--color-surface-active)',
              color: title.trim() ? 'white' : 'var(--color-text-tertiary)',
              cursor: title.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 500,
            }}>
              Create task
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
