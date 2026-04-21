import { useState } from 'react'
import { X, GitPullRequest, GitBranch } from 'lucide-react'
import type { MergeRequestExtended } from './mr-types'

interface CreateMRDialogProps {
  onClose: () => void
  onCreate: (mr: Partial<MergeRequestExtended>) => void
}

const MOCK_BRANCHES = ['feat/oauth-pkce', 'feat/sqlite-wal', 'fix/ws-reconnect', 'fix/pty-resize', 'refactor/agent-pool', 'feat/rate-limit-banner']
const TARGET_BRANCHES = ['main', 'staging', 'develop']
const LABEL_OPTIONS = ['feature', 'bugfix', 'refactor', 'performance', 'auth', 'networking', 'database', 'ui', 'docs']
const REVIEWER_OPTIONS = [
  { name: 'Sarah Chen', avatar: '' },
  { name: 'Alex Kim', avatar: '' },
  { name: 'Jordan Lee', avatar: '' },
  { name: 'Maya Patel', avatar: '' },
  { name: 'Riley Morgan', avatar: '' },
]

export function CreateMRDialog({ onClose, onCreate }: CreateMRDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sourceBranch, setSourceBranch] = useState(MOCK_BRANCHES[0])
  const [targetBranch, setTargetBranch] = useState(TARGET_BRANCHES[0])
  const [isDraft, setIsDraft] = useState(false)
  const [labels, setLabels] = useState<string[]>([])
  const [reviewers, setReviewers] = useState<string[]>([])
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false)
  const [reviewerDropdownOpen, setReviewerDropdownOpen] = useState(false)

  const handleSubmit = () => {
    if (!title.trim()) return
    onCreate({
      title,
      description: description || undefined,
      branch: sourceBranch,
      targetBranch,
      isDraft,
      labels,
      reviewers: reviewers.map(name => ({ name, avatar: '', state: 'pending' as const })),
    })
    onClose()
  }

  const toggleLabel = (label: string) => {
    setLabels(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }
  const toggleReviewer = (name: string) => {
    setReviewers(prev => prev.includes(name) ? prev.filter(r => r !== name) : [...prev, name])
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <GitPullRequest size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>New Merge Request</span>
          <button onClick={onClose} style={closeBtnStyle}><X size={14} strokeWidth={1.5} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          {/* Title */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Title <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Merge request title"
              style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && title.trim()) handleSubmit() }}
            />
          </div>

          {/* Branches */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}><GitBranch size={11} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> Source</label>
              <select value={sourceBranch} onChange={e => setSourceBranch(e.target.value)} style={selectStyle}>
                {MOCK_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6, color: 'var(--color-text-tertiary)', fontSize: 12 }}>→</div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Target</label>
              <select value={targetBranch} onChange={e => setTargetBranch(e.target.value)} style={selectStyle}>
                {TARGET_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the changes..."
              style={{
                width: '100%', minHeight: 80, padding: '8px 10px', resize: 'vertical',
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Reviewers */}
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label style={labelStyle}>Reviewers</label>
            <button
              onClick={() => { setReviewerDropdownOpen(!reviewerDropdownOpen); setLabelDropdownOpen(false) }}
              style={{
                ...selectStyle, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
                color: reviewers.length > 0 ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              }}
            >
              {reviewers.length > 0 ? reviewers.join(', ') : 'Select reviewers...'}
            </button>
            {reviewerDropdownOpen && (
              <div style={dropdownStyle}>
                {REVIEWER_OPTIONS.map(r => (
                  <button key={r.name} onClick={() => toggleReviewer(r.name)} style={dropdownItemStyle}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, border: '1px solid var(--color-border)',
                      background: reviewers.includes(r.name) ? 'var(--color-primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {reviewers.includes(r.name) && <span style={{ color: 'white', fontSize: 10 }}>✓</span>}
                    </span>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Labels */}
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label style={labelStyle}>Labels</label>
            <button
              onClick={() => { setLabelDropdownOpen(!labelDropdownOpen); setReviewerDropdownOpen(false) }}
              style={{
                ...selectStyle, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
                color: labels.length > 0 ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              }}
            >
              {labels.length > 0 ? labels.join(', ') : 'Select labels...'}
            </button>
            {labelDropdownOpen && (
              <div style={dropdownStyle}>
                {LABEL_OPTIONS.map(l => (
                  <button key={l} onClick={() => toggleLabel(l)} style={dropdownItemStyle}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, border: '1px solid var(--color-border)',
                      background: labels.includes(l) ? 'var(--color-primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {labels.includes(l) && <span style={{ color: 'white', fontSize: 10 }}>✓</span>}
                    </span>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Draft toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label
              onClick={() => setIsDraft(!isDraft)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <div style={{
                width: 32, height: 18, borderRadius: 9, padding: 2,
                background: isDraft ? 'var(--color-primary)' : 'var(--color-surface-active)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: 'white',
                  transform: isDraft ? 'translateX(14px)' : 'translateX(0)',
                  transition: 'transform 0.15s',
                }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Mark as draft</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <button onClick={onClose} style={{
            height: 32, padding: '0 14px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            style={{
              height: 32, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: title.trim() ? 'var(--color-primary)' : 'var(--color-surface-active)',
              color: title.trim() ? 'white' : 'var(--color-text-tertiary)',
              cursor: title.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 500,
            }}
          >
            <GitPullRequest size={12} strokeWidth={2} /> Create MR
          </button>
        </div>
      </div>
    </>
  )
}

const closeBtnStyle: React.CSSProperties = {
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 10px',
  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
  outline: 'none', fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px',
  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
  outline: 'none', cursor: 'pointer',
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1060,
  marginTop: 2, padding: 4,
  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
  maxHeight: 200, overflow: 'auto',
}

const dropdownItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 8px', border: 'none', background: 'none',
  color: 'var(--color-text)', fontSize: 12, cursor: 'pointer',
  borderRadius: 'var(--radius-sm)', textAlign: 'left',
}
