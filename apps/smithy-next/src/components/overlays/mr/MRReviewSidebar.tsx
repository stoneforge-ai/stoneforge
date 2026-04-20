import { useState, useRef, useEffect } from 'react'
import { ExternalLink, Bot, Eye, Globe, Tag, User, UserPlus } from 'lucide-react'
import type { MergeRequestExtended, MRReviewer, ReviewState } from './mr-types'
import { MRMergeFlow } from './MRMergeFlow'
import { currentUser } from '../../../mock-data'
import { useTeamContext } from '../../../TeamContext'
import { PresenceDot } from '../../PresenceDot'

interface MRReviewSidebarProps {
  mr: MergeRequestExtended
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToAgents?: () => void
  onNavigateToPreview?: (mrId: string) => void
}

const reviewStateColor: Record<ReviewState, string> = {
  approved: 'var(--color-success)',
  changes_requested: 'var(--color-danger)',
  commented: 'var(--color-text-secondary)',
  pending: 'var(--color-text-tertiary)',
}

const reviewStateLabel: Record<ReviewState, string> = {
  approved: 'Approved',
  changes_requested: 'Changes requested',
  commented: 'Commented',
  pending: 'Pending',
}

export function MRReviewSidebar({ mr, onNavigateToTask, onNavigateToSession, onNavigateToAgents, onNavigateToPreview }: MRReviewSidebarProps) {
  const { isTeamMode, teamMembers } = useTeamContext()
  const [reviewDropdownOpen, setReviewDropdownOpen] = useState(false)
  const [localReviewers, setLocalReviewers] = useState<MRReviewer[]>(mr.reviewers)
  const reviewDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!reviewDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (reviewDropdownRef.current && !reviewDropdownRef.current.contains(e.target as Node)) {
        setReviewDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reviewDropdownOpen])

  // Filter team members not already reviewing (exclude currentUser too)
  const availableReviewers = teamMembers.filter(
    m => m.id !== currentUser.id && !localReviewers.some(r => r.name === m.name)
  )

  const handleAddReviewer = (member: typeof teamMembers[0]) => {
    setLocalReviewers(prev => [...prev, { name: member.name, avatar: member.avatar, state: 'pending' as const }])
    setReviewDropdownOpen(false)
  }

  return (
    <div className="mr-review-sidebar" style={{ width: 280, minWidth: 280, borderLeft: '1px solid var(--color-border)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 16px 0', flex: 1 }}>
        {/* Reviewers */}
        <SidebarSection title="Reviewers">
          {localReviewers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>No reviewers yet</div>
          ) : (
            localReviewers.map(r => {
              const teamMember = teamMembers.find(m => m.name === r.name)
              return (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, position: 'relative',
                    background: r.name === currentUser.name ? 'var(--color-primary-muted)' : 'var(--color-surface-active)',
                    color: r.name === currentUser.name ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                    fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {r.avatar}
                    {isTeamMode && teamMember && (
                      <PresenceDot status={teamMember.presence} size={6} style={{ position: 'absolute', bottom: -1, right: -1 }} />
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text)', flex: 1 }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: reviewStateColor[r.state], display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: reviewStateColor[r.state] }} />
                    {reviewStateLabel[r.state]}
                  </span>
                </div>
              )
            })
          )}

          {/* Request review button (team-mode only) */}
          {isTeamMode && (
            <div ref={reviewDropdownRef} style={{ position: 'relative', marginTop: 6 }}>
              <button
                onClick={() => setReviewDropdownOpen(!reviewDropdownOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500,
                  color: 'var(--color-text-tertiary)', background: 'none', border: 'none',
                  cursor: 'pointer', padding: '4px 0',
                  transition: `color var(--duration-fast)`,
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
              >
                <UserPlus size={12} strokeWidth={1.5} />
                Request review
              </button>

              {reviewDropdownOpen && availableReviewers.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, width: 220, zIndex: 100,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', overflow: 'hidden',
                  boxShadow: 'var(--shadow-float)',
                }}>
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                    Select reviewer
                  </div>
                  {availableReviewers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => handleAddReviewer(member)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '7px 10px', background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        transition: `background var(--duration-fast)`,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0, position: 'relative',
                        background: 'var(--color-surface-active)',
                        color: 'var(--color-text-secondary)',
                        fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {member.avatar}
                        <PresenceDot status={member.presence} size={6} style={{ position: 'absolute', bottom: -1, right: -1 }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{member.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {reviewDropdownOpen && availableReviewers.length === 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, width: 200, zIndex: 100,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', padding: '8px 10px',
                  boxShadow: 'var(--shadow-float)',
                  fontSize: 11, color: 'var(--color-text-tertiary)',
                }}>
                  All team members are already reviewers
                </div>
              )}
            </div>
          )}
        </SidebarSection>

        {/* Labels */}
        {mr.labels.length > 0 && (
          <SidebarSection title="Labels">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {mr.labels.map(l => (
                <span key={l} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Tag size={9} strokeWidth={1.5} style={{ flexShrink: 0 }} />{l}
                </span>
              ))}
            </div>
          </SidebarSection>
        )}

        {/* Stoneforge section */}
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Stoneforge</div>

          {/* Linked task */}
          {mr.linkedTaskId && (
            <LinkRow
              label="Task"
              value={mr.linkedTaskId}
              mono
              onClick={() => onNavigateToTask?.(mr.linkedTaskId!)}
            />
          )}

          {/* Director — opens director panel */}
          {mr.createdByAgent && (
            <LinkRow
              label="Director"
              value={mr.createdByAgent}
              icon={<User size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
              onClick={() => mr.agentSessionId && onNavigateToSession?.(mr.agentSessionId)}
            />
          )}

          {/* Worker — opens Agents/Workspaces page */}
          {mr.createdByAgent && (
            <LinkRow
              label="Worker"
              value={mr.createdByAgent.replace('Director ', 'Worker ')}
              icon={<Bot size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
              onClick={() => onNavigateToAgents?.()}
            />
          )}

          {/* Review Agent */}
          {mr.reviewAgentStatus && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, cursor: mr.reviewAgentSessionId ? 'pointer' : 'default' }}
              onClick={() => mr.reviewAgentSessionId && onNavigateToAgents?.()}
              onMouseEnter={e => { if (mr.reviewAgentSessionId) (e.currentTarget.querySelector('.reviewer-name') as HTMLElement)?.style.setProperty('color', 'var(--color-text-accent)') }}
              onMouseLeave={e => { if (mr.reviewAgentSessionId) (e.currentTarget.querySelector('.reviewer-name') as HTMLElement)?.style.setProperty('color', 'var(--color-text-secondary)') }}
            >
              <span style={{ color: 'var(--color-text-tertiary)', width: 70, flexShrink: 0 }}>Reviewer</span>
              <Bot size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: mr.reviewAgentStatus === 'approved' ? 'var(--color-success)'
                  : mr.reviewAgentStatus === 'changes_requested' ? 'var(--color-danger)'
                  : mr.reviewAgentStatus === 'reviewing' ? 'var(--color-warning)'
                  : 'var(--color-text-tertiary)',
              }} />
              <span className="reviewer-name" style={{ color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: `color var(--duration-fast)` }}>
                {mr.reviewAgentName || 'Review Agent'}
              </span>
              {mr.reviewAgentSessionId && <ExternalLink size={10} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />}
            </div>
          )}

          {/* Preview */}
          {mr.previewUrl && (
            <div
              style={{ display: 'block', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              onClick={() => onNavigateToPreview?.(mr.id)}
              onMouseEnter={e => (e.currentTarget.querySelector('.link-value') as HTMLElement)?.style.setProperty('color', 'var(--color-text-accent)')}
              onMouseLeave={e => (e.currentTarget.querySelector('.link-value') as HTMLElement)?.style.setProperty('color', 'var(--color-text-secondary)')}
            >
              <LinkRow
                label="Preview"
                value={mr.previewStatus === 'ready' ? 'Ready' : mr.previewStatus === 'building' ? 'Building...' : 'Failed'}
                statusColor={mr.previewStatus === 'ready' ? 'var(--color-success)' : mr.previewStatus === 'building' ? 'var(--color-warning)' : 'var(--color-danger)'}
                icon={<Globe size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
              />
            </div>
          )}
        </div>
      </div>

      {/* Merge flow (bottom of sidebar) */}
      <div style={{ borderTop: '1px solid var(--color-border)', padding: 16 }}>
        <MRMergeFlow mr={mr} />
      </div>
    </div>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function LinkRow({ label, value, mono, icon, statusColor, onClick }: {
  label: string; value: string; mono?: boolean; icon?: React.ReactNode; statusColor?: string; onClick?: () => void
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, cursor: onClick ? 'pointer' : 'inherit' }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) (e.currentTarget.querySelector('.link-value') as HTMLElement)?.style.setProperty('color', 'var(--color-text-accent)') }}
      onMouseLeave={e => { if (onClick) (e.currentTarget.querySelector('.link-value') as HTMLElement)?.style.setProperty('color', mono ? 'var(--color-text-accent)' : 'var(--color-text-secondary)') }}
    >
      <span style={{ color: 'var(--color-text-tertiary)', width: 70, flexShrink: 0 }}>{label}</span>
      {icon}
      {statusColor && <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />}
      <span className="link-value" style={{ color: mono ? 'var(--color-text-accent)' : 'var(--color-text-secondary)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 11 : 12 }}>{value}</span>
      {onClick && <ExternalLink size={10} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', marginLeft: 'auto' }} />}
    </div>
  )
}
