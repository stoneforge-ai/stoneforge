import { useState } from 'react'
import { X, GitBranch, FolderGit2 } from 'lucide-react'

interface CreateWorkspaceDialogProps {
  onClose: () => void
}

export function CreateWorkspaceDialog({ onClose }: CreateWorkspaceDialogProps) {
  const [name, setName] = useState('')
  const [repo, setRepo] = useState('')

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />

      {/* Dialog */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 480, maxWidth: '90vw',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>New Workspace</span>
          <button onClick={onClose} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Workspace name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Project"
              autoFocus
              style={{
                width: '100%', height: 34, padding: '0 10px',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--color-text)',
                outline: 'none',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            />
          </div>

          {/* Repository field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Repository</label>
            <div style={{ position: 'relative' }}>
              <FolderGit2 size={14} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--color-text-tertiary)' }} />
              <input
                value={repo}
                onChange={e => setRepo(e.target.value)}
                placeholder="org/repository"
                style={{
                  width: '100%', height: 34, padding: '0 10px 0 30px',
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--color-text)',
                  fontFamily: 'var(--font-mono)', outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                onKeyDown={e => { if (e.key === 'Escape') onClose() }}
              />
            </div>
          </div>

          {/* Default branch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Default branch</label>
            <div style={{ position: 'relative' }}>
              <GitBranch size={14} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--color-text-tertiary)' }} />
              <input
                defaultValue="main"
                style={{
                  width: '100%', height: 34, padding: '0 10px 0 30px',
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--color-text)',
                  fontFamily: 'var(--font-mono)', outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                onKeyDown={e => { if (e.key === 'Escape') onClose() }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '12px 16px', borderTop: '1px solid var(--color-border-subtle)',
        }}>
          <button
            onClick={onClose}
            style={{
              height: 30, padding: '0 14px', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', background: 'transparent',
              color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            style={{
              height: 30, padding: '0 14px', border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: name.trim() ? 'var(--color-primary)' : 'var(--color-surface)',
              color: name.trim() ? 'white' : 'var(--color-text-tertiary)',
              fontSize: 12, fontWeight: 500,
              cursor: name.trim() ? 'pointer' : 'default',
              transition: 'all var(--duration-fast)',
              opacity: name.trim() ? 1 : 0.6,
            }}
            onMouseEnter={e => { if (name.trim()) e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={e => { if (name.trim()) e.currentTarget.style.opacity = '1' }}
          >
            Create Workspace
          </button>
        </div>
      </div>
    </>
  )
}
