import { useState, useRef } from 'react'
import { Send, ChevronDown, ChevronRight, Check, X, MessageSquare, Globe, Rocket, ExternalLink, AlertCircle, Loader, Clock } from 'lucide-react'
import type { MRTimelineEvent, MRCheck, MergeRequestExtended } from './mr-types'
import { MRTimelineEventComponent } from './MRTimelineEvent'
import { RichTextEditor } from './RichTextEditor'
import { useTeamContext } from '../../../TeamContext'
import { useMentionAutocomplete, MentionDropdown } from '../../MentionAutocomplete'

interface MRConversationTabProps {
  mr: MergeRequestExtended
  timeline: MRTimelineEvent[]
  checks: MRCheck[]
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToChecks?: () => void
  onNavigateToPreview?: (mrId: string) => void
}

export function MRConversationTab({ mr, timeline, checks, onNavigateToSession, onNavigateToChecks, onNavigateToPreview }: MRConversationTabProps) {
  const [commentBody, setCommentBody] = useState('')
  const [reviewDropdownOpen, setReviewDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { isTeamMode, currentUser, teamMembers } = useTeamContext()

  const mention = useMentionAutocomplete({
    value: commentBody, onChange: setCommentBody,
    teamMembers, currentUserId: currentUser.id, isTeamMode,
  })

  // Filter out ci_status events from timeline (shown in dedicated section now)
  const filteredTimeline = timeline.filter(e => e.type !== 'ci_status')

  // Compute check summary
  const failCount = checks.filter(c => c.status === 'failure').length
  const successCount = checks.filter(c => c.status === 'success').length
  const runningCount = checks.filter(c => c.status === 'running').length
  const queuedCount = checks.filter(c => c.status === 'queued').length
  const totalJobs = checks.reduce((sum, c) => sum + c.jobs.length, 0)
  const failedJobs = checks.reduce((sum, c) => sum + c.jobs.filter(j => j.status === 'failure').length, 0)
  const successJobs = checks.reduce((sum, c) => sum + c.jobs.filter(j => j.status === 'success').length, 0)
  const skippedJobs = checks.reduce((sum, c) => sum + c.jobs.filter(j => j.status === 'skipped').length, 0)
  const allPassing = checks.length > 0 && checks.every(c => c.status === 'success')
  const hasFailing = checks.some(c => c.status === 'failure')

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Timeline events */}
      <div className="mr-pad" style={{ padding: '8px 24px' }}>
        {filteredTimeline.map(event => (
          <div key={event.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            <MRTimelineEventComponent event={event} onNavigateToSession={onNavigateToSession} />
          </div>
        ))}
      </div>

      {/* ── Preview Deployment Section ── */}
      {mr.previewUrl && (
        <div className="mr-pad-outer" style={{ margin: '16px 24px', padding: '12px 16px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: mr.previewStatus === 'ready' ? 8 : 0 }}>
            <Rocket size={14} strokeWidth={1.5} style={{ color: mr.previewStatus === 'ready' ? 'var(--color-success)' : mr.previewStatus === 'building' ? 'var(--color-warning)' : 'var(--color-danger)' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
              {mr.previewStatus === 'ready' ? 'Preview deployed' : mr.previewStatus === 'building' ? 'Preview deploying...' : 'Preview deployment failed'}
            </span>
          </div>
          {mr.previewStatus === 'ready' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 22 }}>
              <Globe size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
              <button
                onClick={() => onNavigateToPreview?.(mr.id)}
                style={{ fontSize: 12, color: 'var(--color-text-accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {mr.previewUrl!.replace('https://', '')}
                <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Checks Summary Section ── */}
      {checks.length > 0 && (
        <ChecksSummarySection
          checks={checks}
          allPassing={allPassing}
          hasFailing={hasFailing}
          failedJobs={failedJobs}
          successJobs={successJobs}
          skippedJobs={skippedJobs}
          totalJobs={totalJobs}
          hasConflicts={mr.hasConflicts}
          onNavigateToChecks={onNavigateToChecks}
        />
      )}

      {/* ── Comment Input (not fixed, just at bottom) ── */}
      <div className="mr-pad" style={{ padding: '24px 24px 32px', position: 'relative' }}>
        <RichTextEditor
          value={commentBody}
          onChange={v => mention.handleChange(v)}
          onKeyDown={mention.handleKeyDown}
          placeholder={isTeamMode ? 'Leave a comment... (@ to mention)' : 'Leave a comment...'}
        />
        {mention.showDropdown && (
          <MentionDropdown
            members={mention.filteredMembers}
            activeIndex={mention.mentionIndex}
            onSelect={mention.insertMention}
            onHover={mention.setMentionIndex}
            position="above"
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <div style={{ display: 'flex' }}>
              <button style={{
                height: 30, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--color-success)', border: 'none',
                borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <Send size={12} strokeWidth={1.5} />
                Comment
              </button>
              <button
                onClick={() => setReviewDropdownOpen(!reviewDropdownOpen)}
                style={{
                  height: 30, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-success)', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  color: 'white', cursor: 'pointer',
                }}
              >
                <ChevronDown size={13} strokeWidth={2} />
              </button>
            </div>

            {reviewDropdownOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setReviewDropdownOpen(false)} />
                <div style={{
                  position: 'absolute', bottom: 38, right: 0, width: 220, zIndex: 100,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', overflow: 'hidden',
                  boxShadow: 'var(--shadow-float)',
                }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Submit review</div>
                  <ReviewOption icon={<Check size={13} strokeWidth={2} style={{ color: 'var(--color-success)' }} />} label="Approve" description="Approve these changes" onClick={() => setReviewDropdownOpen(false)} />
                  <ReviewOption icon={<X size={13} strokeWidth={2} style={{ color: 'var(--color-danger)' }} />} label="Request changes" description="Require changes before merging" onClick={() => setReviewDropdownOpen(false)} />
                  <ReviewOption icon={<MessageSquare size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />} label="Comment" description="Submit general feedback" onClick={() => setReviewDropdownOpen(false)} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Checks Summary (GitHub-style) ──
function ChecksSummarySection({ checks, allPassing, hasFailing, failedJobs, successJobs, skippedJobs, totalJobs, hasConflicts, onNavigateToChecks }: {
  checks: MRCheck[]; allPassing: boolean; hasFailing: boolean
  failedJobs: number; successJobs: number; skippedJobs: number; totalJobs: number
  hasConflicts: boolean; onNavigateToChecks?: () => void
}) {
  const [expanded, setExpanded] = useState(true)

  const summaryParts: string[] = []
  if (failedJobs > 0) summaryParts.push(`${failedJobs} failing`)
  if (skippedJobs > 0) summaryParts.push(`${skippedJobs} skipped`)
  if (successJobs > 0) summaryParts.push(`${successJobs} successful`)
  const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') + ` check${totalJobs > 1 ? 's' : ''}` : ''

  return (
    <div className="mr-pad-outer" style={{ margin: '0 24px 16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          cursor: 'pointer', background: 'var(--color-bg-elevated)',
        }}
      >
        {hasFailing ? (
          <AlertCircle size={16} strokeWidth={2} style={{ color: 'var(--color-danger)' }} />
        ) : allPassing ? (
          <Check size={16} strokeWidth={2} style={{ color: 'var(--color-success)' }} />
        ) : (
          <Loader size={16} strokeWidth={2} style={{ color: 'var(--color-warning)', animation: 'spin 1s linear infinite' }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
            {allPassing ? 'All checks have passed' : hasFailing ? 'Some checks were not successful' : 'Checks are running'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{summaryText}</div>
        </div>
        {expanded ? <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
      </div>

      {/* Expanded: show each action and its jobs */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          {checks.map(action => (
            <ActionRow key={action.id} action={action} onNavigateToChecks={onNavigateToChecks} />
          ))}
        </div>
      )}

      {/* Merge conflict status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)',
      }}>
        {hasConflicts ? (
          <X size={16} strokeWidth={2} style={{ color: 'var(--color-danger)' }} />
        ) : (
          <Check size={16} strokeWidth={2} style={{ color: 'var(--color-success)' }} />
        )}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
            {hasConflicts ? 'This branch has conflicts that must be resolved' : 'No conflicts with base branch'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
            {hasConflicts ? 'Conflicting files must be resolved' : 'Merging can be performed automatically'}
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionRow({ action, onNavigateToChecks }: { action: MRCheck; onNavigateToChecks?: () => void }) {
  const [expanded, setExpanded] = useState(action.status === 'failure')
  const StatusIcon = action.status === 'success' ? Check : action.status === 'failure' ? X : action.status === 'running' ? Loader : Clock
  const sColor = action.status === 'success' ? 'var(--color-success)' : action.status === 'failure' ? 'var(--color-danger)' : action.status === 'running' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'

  return (
    <div>
      {/* Whole row is clickable → navigates to Checks tab */}
      <div
        onClick={onNavigateToChecks}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
          cursor: 'pointer', transition: `background var(--duration-fast)`,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <StatusIcon size={14} strokeWidth={2} style={{ color: sColor, flexShrink: 0, ...(action.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)' }}>{action.name}</span>
        {action.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{action.duration}</span>}
        {action.jobs.length > 1 && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'flex', padding: 2 }}
          >
            {expanded ? <ChevronDown size={13} strokeWidth={1.5} /> : <ChevronRight size={13} strokeWidth={1.5} />}
          </button>
        )}
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' }}>Details</span>
      </div>
      {/* Expanded jobs — each job row also links to Checks tab */}
      {expanded && action.jobs.length > 1 && action.jobs.map(job => {
        const JIcon = job.status === 'success' ? Check : job.status === 'failure' ? X : job.status === 'skipped' ? Check : job.status === 'running' ? Loader : Clock
        const jColor = job.status === 'success' ? 'var(--color-success)' : job.status === 'failure' ? 'var(--color-danger)' : job.status === 'skipped' ? 'var(--color-text-tertiary)' : job.status === 'running' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'
        return (
          <div
            key={job.id}
            onClick={onNavigateToChecks}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 6px 40px',
              fontSize: 12, cursor: 'pointer', transition: `background var(--duration-fast)`,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <JIcon size={12} strokeWidth={2} style={{ color: jColor, flexShrink: 0, ...(job.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
            <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{job.name}</span>
            {job.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{job.duration}</span>}
          </div>
        )
      })}
    </div>
  )
}

function ReviewOption({ icon, label, description, onClick }: { icon: React.ReactNode; label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', width: '100%',
        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        transition: `background var(--duration-fast)`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{description}</div>
      </div>
    </button>
  )
}
