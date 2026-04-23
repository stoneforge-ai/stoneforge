import { useState, useCallback } from 'react'
import { Check, X, Clock, Loader, Ban, SkipForward, ChevronDown, ChevronRight, Wrench, Server, Home, Download, FileCode, Shield, CheckCircle } from 'lucide-react'
import type { CIRun, CIJob, CIStep, CIHandoffContext } from './ci-types'
import { CIRunHeader } from './CIRunHeader'
import { CIAnnotations } from './CIAnnotations'
import { CIWorkflowGraph } from './CIWorkflowGraph'
import { CILogViewer } from './CILogViewer'
import { CIHandoffDialog } from './CIHandoffDialog'
import { useTeamContext } from '../../../TeamContext'

interface CIRunDetailViewProps {
  run: CIRun
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToAutomation?: (workflowId: string) => void
  initialJobId?: string | null
  onJobChange?: (jobId: string | null) => void
}

const statusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Loader, queued: Clock, cancelled: Ban, skipped: SkipForward,
}
const statusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
  queued: 'var(--color-text-tertiary)', cancelled: 'var(--color-text-tertiary)', skipped: 'var(--color-text-tertiary)',
}

export function CIRunDetailView({ run, onBack, onNavigateToTask, onNavigateToMR, onNavigateToAutomation, initialJobId, onJobChange }: CIRunDetailViewProps) {
  const [selectedJobId, setSelectedJobIdRaw] = useState<string | null>(initialJobId || null)
  const [handoffCtx, setHandoffCtx] = useState<CIHandoffContext | null>(null)
  const { isTeamMode, getUserById, currentUser } = useTeamContext()

  const handleSelectJob = useCallback((jobId: string | null) => {
    setSelectedJobIdRaw(jobId)
    onJobChange?.(jobId)
  }, [onJobChange])

  const selectedJob = selectedJobId ? run.jobs.find(j => j.id === selectedJobId) || null : null

  const handleGraphClick = useCallback((jobId: string) => {
    handleSelectJob(jobId)
  }, [handleSelectJob])

  const handleHandoff = useCallback((job: CIJob) => {
    const failedStep = job.steps.find(s => s.status === 'failure')
    const errorLogs = failedStep?.logs?.filter(l =>
      l.includes('FAIL') || l.includes('Error') || l.includes('❌') || l.includes('Expected') || l.includes('Received')
    ) || []
    const relatedFiles = job.annotations?.filter(a => a.file).map(a => a.file!) || []

    setHandoffCtx({
      jobId: job.id,
      jobName: job.name,
      errorSummary: errorLogs[0] || `${job.name} failed`,
      failedStep: failedStep?.name,
      logExcerpt: errorLogs.slice(0, 6),
      relatedFiles,
    })
  }, [])

  const completedJobs = run.jobs.filter(j => j.status === 'success' || j.status === 'failure').length
  const totalJobs = run.jobs.length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CIRunHeader
        run={run}
        onBack={onBack}
        onNavigateToTask={onNavigateToTask}
        onNavigateToMR={onNavigateToMR}
        onNavigateToAutomation={onNavigateToAutomation}
      />

      {/* Deployment Approval Gates (team-mode only) */}
      {isTeamMode && run.approvalGates && (
        <ApprovalGatesSection
          gates={run.approvalGates}
          getUserById={getUserById}
          currentUserId={currentUser.id}
        />
      )}

      {/* Body: sidebar + content */}
      <div className="ci-detail-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar — persistent job navigation */}
        <div className="ci-job-sidebar" style={{
          width: 240, flexShrink: 0, borderRight: '1px solid var(--color-border)',
          overflow: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          {/* Summary link */}
          <button
            onClick={() => handleSelectJob(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
              background: !selectedJobId ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              color: !selectedJobId ? 'var(--color-text)' : 'var(--color-text-secondary)',
              textAlign: 'left',
            }}
            onMouseEnter={e => { if (selectedJobId) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { if (selectedJobId) e.currentTarget.style.background = 'transparent' }}
          >
            <Home size={13} strokeWidth={1.5} /> Summary
          </button>

          {/* Jobs section */}
          <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Jobs
          </div>

          {run.jobs.map(job => {
            const Icon = statusIcon[job.status] || Clock
            const color = statusColor[job.status] || 'var(--color-text-tertiary)'
            const isSelected = selectedJobId === job.id
            return (
              <button
                key={job.id}
                onClick={() => handleSelectJob(job.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px',
                  background: isSelected ? 'var(--color-surface-active)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontSize: 12,
                  color: isSelected ? 'var(--color-text)' : job.status === 'skipped' ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                  fontWeight: isSelected ? 500 : 400, textAlign: 'left',
                  boxShadow: isSelected ? 'inset 2px 0 0 var(--color-primary)' : 'none',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <Icon size={12} strokeWidth={2} style={{ color, flexShrink: 0, ...(job.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</span>
                {job.duration && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{job.duration}</span>}
              </button>
            )
          })}

          {/* Run details section */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-border-subtle)', padding: '8px 0' }}>
            <div style={{ padding: '4px 16px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Run details
            </div>
            {run.artifacts.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                <Download size={12} strokeWidth={1.5} />
                <span>{run.artifacts.length} artifact{run.artifacts.length > 1 ? 's' : ''}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              <FileCode size={12} strokeWidth={1.5} />
              <span>Action file</span>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
          {selectedJob ? (
            <JobDetailContent job={selectedJob} onHandoff={handleHandoff} />
          ) : (
            <SummaryContent
              run={run}
              completedJobs={completedJobs}
              totalJobs={totalJobs}
              onClickJob={handleGraphClick}
              onHandoff={handleHandoff}
            />
          )}
        </div>
      </div>

      {/* Handoff dialog */}
      {handoffCtx && (
        <CIHandoffDialog
          context={handoffCtx}
          onClose={() => setHandoffCtx(null)}
          onSend={(msg, agent) => { console.log('Handoff sent to', agent, ':', msg) }}
        />
      )}
    </div>
  )
}

// ── Summary view (default, no job selected) ──
function SummaryContent({ run, completedJobs, totalJobs, onClickJob, onHandoff }: {
  run: CIRun; completedJobs: number; totalJobs: number
  onClickJob: (jobId: string) => void; onHandoff: (job: CIJob) => void
}) {
  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--color-surface-active)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, transition: 'width 0.3s',
              width: `${totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0}%`,
              background: run.status === 'failure' ? 'var(--color-danger)' : run.status === 'success' ? 'var(--color-success)' : 'var(--color-warning)',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
            {completedJobs}/{totalJobs} jobs
          </span>
        </div>

        {/* Annotations */}
        {run.annotations.length > 0 && (
          <CIAnnotations annotations={run.annotations} />
        )}

        {/* Pipeline graph */}
        <CIWorkflowGraph jobs={run.jobs} onClickJob={onClickJob} />

        {/* Artifacts */}
        {run.artifacts.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Artifacts
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '0 5px' }}>
                {run.artifacts.length}
              </span>
            </div>
            <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
              {run.artifacts.map((art, i) => (
                <div key={art.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderBottom: i < run.artifacts.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                }}>
                  <Download size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text)' }}>{art.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{art.size}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Job detail view (specific job selected from sidebar) ──
function JobDetailContent({ job, onHandoff }: { job: CIJob; onHandoff: (job: CIJob) => void }) {
  const Icon = statusIcon[job.status] || Clock
  const color = statusColor[job.status] || 'var(--color-text-tertiary)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Job header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <Icon size={14} strokeWidth={2} style={{ color, flexShrink: 0, ...(job.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{job.name}</span>
        {job.runnerName && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
            <Server size={9} strokeWidth={1.5} /> {job.runnerName}
          </span>
        )}
        {job.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{job.duration}</span>}
        <div style={{ flex: 1 }} />
        {job.status === 'failure' && (
          <button onClick={() => onHandoff(job)} style={handoffBtnStyle}>
            <Wrench size={11} strokeWidth={1.5} /> Handoff to Fix
          </button>
        )}
      </div>

      {/* Steps + logs — full width, scrollable */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {job.steps.length > 0 ? (
          job.steps.map(step => (
            <StepSection key={step.id} step={step} />
          ))
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            {job.status === 'skipped' ? 'This job was skipped' : 'No steps to display'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step with inline expandable logs ──
function StepSection({ step }: { step: CIStep }) {
  const [expanded, setExpanded] = useState(step.status === 'failure' || (step.logs && step.logs.length > 0 && step.status !== 'success'))
  const Icon = statusIcon[step.status] || Clock
  const color = statusColor[step.status] || 'var(--color-text-tertiary)'
  const hasLogs = step.logs && step.logs.length > 0

  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      {/* Step header */}
      <div
        onClick={hasLogs ? () => setExpanded(!expanded) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px',
          cursor: hasLogs ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasLogs) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {hasLogs && (
          expanded
            ? <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            : <ChevronRight size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        )}
        <Icon size={13} strokeWidth={2} style={{ color, flexShrink: 0, ...(step.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)' }}>{step.name}</span>
        {step.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{step.duration}</span>}
      </div>

      {/* Logs — full width, no nesting indentation */}
      {expanded && hasLogs && (
        <div style={{ padding: '0 20px 12px' }}>
          <CILogViewer logs={step.logs!} isRunning={step.status === 'running'} maxHeight={600} />
        </div>
      )}
    </div>
  )
}

// ── Deployment Approval Gates section (team-mode only) ──
function ApprovalGatesSection({ gates, getUserById, currentUserId }: {
  gates: { requiredApprovals: number; approvedBy: string[]; pending: boolean }
  getUserById: (id: string) => import('../../../mock-data').StoneforgeUser | undefined
  currentUserId: string
}) {
  const approved = gates.approvedBy.length
  const required = gates.requiredApprovals
  const isFulfilled = approved >= required
  const hasCurrentUserApproved = gates.approvedBy.includes(currentUserId)

  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px solid var(--color-border)',
      background: isFulfilled ? 'var(--color-success-subtle)' : 'var(--color-warning-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Shield size={14} strokeWidth={1.5} style={{ color: isFulfilled ? 'var(--color-success)' : 'var(--color-warning)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Deployment Approval</span>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-full)',
          background: isFulfilled ? 'var(--color-success-subtle)' : 'var(--color-surface)',
          color: isFulfilled ? 'var(--color-success)' : 'var(--color-text-secondary)',
        }}>
          {approved}/{required} approvals
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'var(--color-surface-active)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 0.3s',
          width: `${Math.min((approved / required) * 100, 100)}%`,
          background: isFulfilled ? 'var(--color-success)' : 'var(--color-warning)',
        }} />
      </div>

      {/* Approvers list */}
      {gates.approvedBy.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {gates.approvedBy.map(userId => {
            const user = getUserById(userId)
            return (
              <div key={userId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={12} strokeWidth={2} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: 'var(--color-surface-active)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 600, color: 'var(--color-text-secondary)', flexShrink: 0,
                }}>
                  {user?.avatar || '??'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text)' }}>
                  {user?.name || userId}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>approved</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Approve button (if current user hasn't approved yet and gate is pending) */}
      {gates.pending && !hasCurrentUserApproved && (
        <button
          onClick={() => console.log('Approve deployment')}
          style={{
            height: 28, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--color-success)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}
        >
          <Check size={12} strokeWidth={2} /> Approve Deployment
        </button>
      )}
      {hasCurrentUserApproved && (
        <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 500 }}>
          You approved this deployment
        </span>
      )}
    </div>
  )
}

const handoffBtnStyle: React.CSSProperties = {
  height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
  background: 'var(--color-danger-subtle)', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-danger)', cursor: 'pointer', fontSize: 11, fontWeight: 500, flexShrink: 0,
}
