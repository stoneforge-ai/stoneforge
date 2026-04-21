import { useState } from 'react'
import { ArrowLeft, Play, MoreHorizontal, Pencil, Copy, PowerOff, Power, Trash2, ExternalLink, CircleDot, Check, X, Clock, ShieldCheck, Lock, Users } from 'lucide-react'
import type { Workflow, WFRun } from './wf-types'
import { WorkflowPipelineViz } from './WorkflowPipelineViz'
import { WorkflowRunDetail } from './WorkflowRunDetail'
import { WorkflowStepCard } from './WorkflowStepCard'
import { useTeamContext } from '../../../TeamContext'

interface WorkflowDetailViewProps {
  workflow: Workflow
  runs: WFRun[]
  allWorkflows?: Workflow[]
  onSelectWorkflow?: (wf: Workflow) => void
  activeTab: string | null
  onTabChange: (tab: string | null) => void
  onBack: () => void
  onEdit: () => void
  onNavigateToCI?: (runId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onOpenRun?: (run: import('./wf-types').WFRun) => void
}

const statusDotColor: Record<string, string> = {
  active: 'var(--color-success)', disabled: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)', draft: 'var(--color-warning)',
}

const lastRunIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Clock,
}
const lastRunColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
}

const statusBadgeStyles: Record<string, { bg: string; color: string }> = {
  active: { bg: 'var(--color-success-subtle)', color: 'var(--color-success)' },
  disabled: { bg: 'var(--color-surface)', color: 'var(--color-text-tertiary)' },
  error: { bg: 'var(--color-danger-subtle)', color: 'var(--color-danger)' },
  draft: { bg: 'var(--color-warning-subtle)', color: 'var(--color-warning)' },
}

const triggerLabels: Record<string, string> = {
  cron: 'Cron', event: 'Event', manual: 'Manual', webhook: 'Webhook',
}

type Tab = 'overview' | 'runs' | 'editor'

export function WorkflowDetailView({ workflow, runs, allWorkflows, onSelectWorkflow, activeTab, onTabChange, onBack, onEdit, onNavigateToCI, onNavigateToMR, onNavigateToTask, onOpenRun }: WorkflowDetailViewProps) {
  const { isTeamMode, getUserById } = useTeamContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const [approvalConfirmOpen, setApprovalConfirmOpen] = useState(false)
  const [focusStepId, setFocusStepId] = useState<string | null>(null)
  const currentTab = (activeTab as Tab) || 'overview'
  const badge = statusBadgeStyles[workflow.status]
  const needsApproval = isTeamMode && workflow.approvalRequired

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Workflow navigation sidebar */}
      {allWorkflows && allWorkflows.length > 1 && (
        <div className="wf-nav-sidebar" style={{
          width: 200, flexShrink: 0, borderRight: '1px solid var(--color-border)',
          overflow: 'auto', padding: '16px 0',
        }}>
          <div style={{ padding: '0 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Automations
            </span>
          </div>
          <button
            onClick={onBack}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              background: 'transparent', border: 'none',
              color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <ArrowLeft size={11} strokeWidth={1.5} />
            All automations
          </button>
          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '6px 12px' }} />
          {allWorkflows.map(wf => {
            const isActive = wf.id === workflow.id
            const dotColor = statusDotColor[wf.status]
            const RunIcon = wf.lastRunStatus ? lastRunIcon[wf.lastRunStatus] : null
            const runColor = wf.lastRunStatus ? lastRunColor[wf.lastRunStatus] : undefined
            return (
              <button
                key={wf.id}
                onClick={() => onSelectWorkflow?.(wf)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                  background: isActive ? 'var(--color-surface-active)' : 'transparent',
                  border: 'none',
                  boxShadow: isActive ? 'inset 2px 0 0 var(--color-primary)' : 'none',
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 500 : 400, textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-surface-active)' : 'transparent' }}
              >
                <div style={{ position: 'relative', flexShrink: 0, width: 8, height: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
                </div>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</span>
                {RunIcon && <RunIcon size={11} strokeWidth={2} style={{ color: runColor, flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={onBack} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}>
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', flex: 1, margin: 0 }}>
            {workflow.name}
          </h1>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)',
            background: badge.bg, color: badge.color, fontWeight: 500,
          }}>
            {workflow.status}
          </span>
          {isTeamMode && workflow.scope && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
              fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {workflow.scope === 'personal' ? <Lock size={10} strokeWidth={1.5} /> : <Users size={10} strokeWidth={1.5} />}
              {workflow.scope === 'personal' ? 'Personal' : 'Team'}
            </span>
          )}
          {isTeamMode && workflow.approvalRequired && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: 'var(--color-warning-subtle)', color: 'var(--color-warning)',
              fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <ShieldCheck size={10} strokeWidth={1.5} /> Requires approval
            </span>
          )}

          {/* Actions */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => needsApproval ? setApprovalConfirmOpen(true) : undefined} style={{
              height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              <Play size={12} strokeWidth={2} /> Run
            </button>
            {/* Approval confirmation dialog */}
            {approvalConfirmOpen && needsApproval && (
              <>
                <div onClick={() => setApprovalConfirmOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
                <div style={{
                  position: 'absolute', top: 32, right: 0, zIndex: 1060, width: 280,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <ShieldCheck size={14} strokeWidth={1.5} style={{ color: 'var(--color-warning)' }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>Approval required</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
                    This workflow requires approval before running. A request will be sent to the designated approvers.
                  </p>
                  {workflow.approvalUsers && workflow.approvalUsers.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Approvers:</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {workflow.approvalUsers.map(uid => {
                          const user = getUserById(uid)
                          return user ? (
                            <span key={uid} style={{
                              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                              padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--color-surface)',
                            }}>
                              <span style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 8, fontWeight: 600,
                              }}>
                                {user.avatar}
                              </span>
                              {user.name}
                            </span>
                          ) : null
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => setApprovalConfirmOpen(false)} style={{
                      height: 26, padding: '0 10px', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
                      color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12,
                    }}>
                      Cancel
                    </button>
                    <button onClick={() => setApprovalConfirmOpen(false)} style={{
                      height: 26, padding: '0 10px', border: 'none',
                      borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)',
                      color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    }}>
                      Request approval
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
            }}>
              <MoreHorizontal size={14} strokeWidth={1.5} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
                <div style={{
                  position: 'absolute', top: 32, right: 0, zIndex: 1060, width: 180,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4,
                }}>
                  <MenuBtn icon={Pencil} label="Edit automation" onClick={() => { setMenuOpen(false); onEdit() }} />
                  <MenuBtn icon={Copy} label="Duplicate" onClick={() => setMenuOpen(false)} />
                  <MenuBtn icon={workflow.status === 'active' ? PowerOff : Power} label={workflow.status === 'active' ? 'Disable' : 'Enable'} onClick={() => setMenuOpen(false)} />
                  <MenuBtn icon={Trash2} label="Delete" color="var(--color-danger)" onClick={() => setMenuOpen(false)} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['overview', 'runs', 'editor'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => onTabChange(tab === 'overview' ? null : tab)} style={{
              padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: currentTab === tab ? 'var(--color-surface-active)' : 'transparent',
              color: currentTab === tab ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              textTransform: 'capitalize',
            }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {currentTab === 'overview' && <OverviewTab workflow={workflow} runs={runs} onTabChange={onTabChange} onNavigateToCI={onNavigateToCI} onNavigateToMR={onNavigateToMR} onNavigateToTask={onNavigateToTask} onOpenRun={onOpenRun} onFocusStep={(stepId) => { setFocusStepId(stepId); onTabChange('editor') }} />}
        {currentTab === 'runs' && <RunsTab runs={runs} onNavigateToCI={onNavigateToCI} onNavigateToMR={onNavigateToMR} onNavigateToTask={onNavigateToTask} onOpenRun={onOpenRun} />}
        {currentTab === 'editor' && <EditorTab workflow={workflow} onEdit={onEdit} focusStepId={focusStepId} onClearFocus={() => setFocusStepId(null)} />}
      </div>
    </div>
    </div>
  )
}

// ── Overview Tab ──

function OverviewTab({ workflow, runs, onTabChange, onNavigateToCI, onNavigateToMR, onNavigateToTask, onOpenRun, onFocusStep }: {
  workflow: Workflow
  runs: WFRun[]
  onTabChange: (tab: string) => void
  onFocusStep: (stepId: string) => void
  onNavigateToCI?: (runId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onOpenRun?: (run: WFRun) => void
}) {
  const { isTeamMode, getUserById } = useTeamContext()
  const recentRuns = runs.slice(0, 5)

  return (
    <div style={{ padding: '16px 24px' }}>
      <div className="wf-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Description */}
        {workflow.description && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {workflow.description}
          </div>
        )}

        {/* Pipeline */}
        <Section title="Pipeline">
          <WorkflowPipelineViz steps={workflow.steps} onStepClick={(stepId) => {
            onFocusStep(stepId)
          }} />
        </Section>

        {/* Info grid */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <InfoItem label="Trigger" value={getTriggerDisplayFull(workflow)} />
          {workflow.nextRunAt && <InfoItem label="Next run" value={workflow.nextRunAt} />}
          <InfoItem label="Total runs" value={String(workflow.totalRuns)} />
          <InfoItem label="Created" value={workflow.createdAt} />
          {workflow.linkedCIActionId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CircleDot size={11} strokeWidth={1.5} /> Linked CI
              </span>
              <button onClick={() => onNavigateToCI?.(workflow.linkedCIActionId!)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500,
                color: 'var(--color-text-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}>
                Nightly E2E
                <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
              </button>
            </div>
          )}
        </div>

        {/* Approval workflow (team-mode only) */}
        {isTeamMode && workflow.approvalRequired && (
          <Section title="Approval required">
            <div style={{
              padding: 12, background: 'var(--color-warning-subtle)', borderRadius: 'var(--radius-md)',
              borderLeft: '3px solid var(--color-warning)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <ShieldCheck size={14} strokeWidth={1.5} style={{ color: 'var(--color-warning)' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>
                  Manual triggers require approval
                </span>
              </div>
              {workflow.approvalUsers && workflow.approvalUsers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Approvers:</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {workflow.approvalUsers.map(uid => {
                      const user = getUserById(uid)
                      return user ? (
                        <span key={uid} style={{
                          display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-bg-elevated)',
                        }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: '50%',
                            background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 600,
                          }}>
                            {user.avatar}
                          </span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{user.name}</span>
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Variables */}
        {workflow.variables.length > 0 && (
          <Section title="Variables">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {workflow.variables.map(v => (
                <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-accent)', fontWeight: 500 }}>{v.name}</span>
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>{v.type}</span>
                  {v.default && <span style={{ color: 'var(--color-text-tertiary)' }}>= {v.default}</span>}
                  {v.description && <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>{v.description}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Tags */}
        {workflow.tags.length > 0 && (
          <Section title="Tags">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {workflow.tags.map(t => (
                <span key={t} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                  background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                }}>
                  {t}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Recent runs */}
        <Section title="Recent runs" action={runs.length > 5 ? { label: 'View all →', onClick: () => onTabChange('runs') } : undefined}>
          {recentRuns.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              No runs yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentRuns.map((run, i) => (
                <WorkflowRunDetail key={run.id} run={run} defaultExpanded={i === 0 && run.status === 'failure'} onNavigateToCI={onNavigateToCI} onNavigateToMR={onNavigateToMR} onNavigateToTask={onNavigateToTask} onOpenRun={onOpenRun} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ── Runs Tab ──

function RunsTab({ runs, onNavigateToCI, onNavigateToMR, onNavigateToTask, onOpenRun }: { runs: WFRun[]; onNavigateToCI?: (runId: string) => void; onNavigateToMR?: (mrId: string) => void; onNavigateToTask?: (taskId: string) => void; onOpenRun?: (run: WFRun) => void }) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const filtered = statusFilter
    ? runs.filter(r => r.status === statusFilter)
    : runs

  const statuses = ['success', 'failure', 'running', 'queued', 'cancelled'] as const

  return (
    <div style={{ padding: '16px 24px' }}>
      <div className="wf-tab-content">
        {/* Status filters */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          <FilterPill label="All" active={!statusFilter} onClick={() => setStatusFilter(null)} count={runs.length} />
          {statuses.map(s => {
            const count = runs.filter(r => r.status === s).length
            if (count === 0) return null
            return <FilterPill key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} count={count} />
          })}
        </div>

        {/* Run list */}
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No runs {statusFilter ? `with status "${statusFilter}"` : 'yet'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(run => (
              <WorkflowRunDetail key={run.id} run={run} onNavigateToCI={onNavigateToCI} onNavigateToMR={onNavigateToMR} onNavigateToTask={onNavigateToTask} onOpenRun={onOpenRun} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Editor Tab (read-only) ──

function EditorTab({ workflow, onEdit, focusStepId, onClearFocus }: { workflow: Workflow; onEdit: () => void; focusStepId?: string | null; onClearFocus?: () => void }) {
  return (
    <div style={{ padding: '16px 24px' }}>
      <div className="wf-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Edit button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onEdit} style={{
            height: 28, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            <Pencil size={12} strokeWidth={1.5} /> Edit automation
          </button>
        </div>

        {/* Steps */}
        <Section title={`Steps (${workflow.steps.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workflow.steps.map((step, i) => (
              <WorkflowStepCard key={step.id} step={step} index={i} mode="view" focused={focusStepId === step.id} />
            ))}
          </div>
        </Section>

        {/* Trigger */}
        <Section title="Trigger">
          <div style={{ padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{workflow.trigger.type}</span>
              {workflow.trigger.cronExpression && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)', padding: '2px 6px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)' }}>
                  {workflow.trigger.cronExpression}
                </span>
              )}
              {workflow.trigger.cronHumanReadable && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>({workflow.trigger.cronHumanReadable})</span>
              )}
              {workflow.trigger.eventType && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{workflow.trigger.eventType.replace(/_/g, ' ')}</span>
              )}
            </div>
          </div>
        </Section>

        {/* Variables */}
        {workflow.variables.length > 0 && (
          <Section title={`Variables (${workflow.variables.length})`}>
            <div style={{ padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {workflow.variables.map(v => (
                  <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-accent)', fontWeight: 500, minWidth: 80 }}>{v.name}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>{v.type}</span>
                    {v.required && <span style={{ fontSize: 10, color: 'var(--color-danger)' }}>required</span>}
                    {v.default && <span style={{ color: 'var(--color-text-tertiary)' }}>= {v.default}</span>}
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

// ── Shared components ──

function Section({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{title}</span>
        <div style={{ flex: 1 }} />
        {action && (
          <button onClick={action.onClick} style={{
            border: 'none', background: 'none', color: 'var(--color-text-accent)', cursor: 'pointer',
            fontSize: 11, fontWeight: 500, padding: 0,
          }}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function FilterPill({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none',
      borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
      background: active ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
      color: active ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
      textTransform: 'capitalize',
    }}>
      {label}
      <span style={{ fontSize: 10, opacity: 0.7 }}>{count}</span>
    </button>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function MenuBtn({ icon: Icon, label, color, onClick }: { icon: typeof Pencil; label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
      color: color || 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, textAlign: 'left' as const,
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={12} strokeWidth={1.5} /> {label}
    </button>
  )
}

function getTriggerDisplayFull(wf: Workflow): string {
  const t = wf.trigger
  if (t.cronHumanReadable) return `${triggerLabels[t.type]}: ${t.cronHumanReadable}`
  if (t.eventType) return `${triggerLabels[t.type]}: ${t.eventType.replace(/_/g, ' ')}`
  return triggerLabels[t.type] || t.type
}
