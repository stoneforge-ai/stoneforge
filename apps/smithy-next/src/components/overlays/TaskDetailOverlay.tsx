import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowUp, ArrowDown, Send, Plus, MoreHorizontal, GitBranch, Layers, Calendar, Link, Copy, Clipboard, Star, Trash2, Clock, FileText, Smile, Paperclip, ExternalLink, Eye, EyeOff, AlertTriangle, CheckSquare, Square, ListChecks, ChevronDown } from 'lucide-react'
import type { Task } from '../../mock-data'
import { KANBAN_COLUMNS, ASSIGNEES, COMPLEXITY_LEVELS, mockDirectors, mockWhiteboards } from '../../mock-data'
import { useTeamContext } from '../../TeamContext'
import { UserAvatar } from '../UserAvatar'
import { AvatarStack } from '../AvatarStack'
import { useMentionAutocomplete, MentionDropdown } from '../MentionAutocomplete'
import { mockRoleDefinitions } from './agents/agent-mock-data'

const COMPLEXITY_LABEL = (v: number) => COMPLEXITY_LEVELS.find(c => c.value === v)?.label || 'Unknown'
import {
  StatusDropdown, PriorityDropdown, AssigneeDropdown, LabelDropdown, EstimateDropdown,
  PropertyPill, STATUS_ICONS, PriorityBarIcon,
} from '../dropdowns/PropertyDropdowns'

type View = string

interface TaskDetailOverlayProps {
  task: Task
  allTasks: Task[]
  onBack: () => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onNavigate: (view: View) => void
  onViewDiff: (taskId: string, branch: string) => void
  onNavigateToTask: (taskId: string) => void
  onNavigateToPreview?: (taskId: string) => void
  onSelectDirector?: (directorId: string) => void
  onSelectAgent?: (agentId: string) => void
  onOpenInEditor?: (branch: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  siblingIds: string[]
}

export function TaskDetailOverlay({ task, allTasks, onBack, onUpdateTask, onNavigate, onViewDiff, onNavigateToTask, onNavigateToPreview, onSelectDirector, onSelectAgent, onOpenInEditor, onNavigateToWhiteboard, siblingIds }: TaskDetailOverlayProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [commentInput, setCommentInput] = useState('')
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuTriggerRef = useRef<HTMLDivElement>(null)
  const [claimDismissed, setClaimDismissed] = useState(false)
  const { isTeamMode, currentUser, getUserById, teamMembers } = useTeamContext()

  const mention = useMentionAutocomplete({
    value: commentInput, onChange: setCommentInput,
    teamMembers, currentUserId: currentUser.id, isTeamMode,
  })

  const subTasks = task.subTaskIds ? allTasks.filter(t => task.subTaskIds!.includes(t.id)) : []
  const parentTask = task.parentId ? allTasks.find(t => t.id === task.parentId) : null
  const currentIndex = siblingIds.indexOf(task.id)
  const prevId = currentIndex > 0 ? siblingIds[currentIndex - 1] : null
  const nextId = currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : null

  const statusInfo = STATUS_ICONS[task.status] || STATUS_ICONS.todo

  const update = (updates: Partial<Task>) => onUpdateTask(task.id, updates)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: 44, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>

        {parentTask && (
          <>
            <button onClick={() => onNavigateToTask(parentTask.id)} style={{ fontSize: 12, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>{parentTask.id}</button>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>›</span>
          </>
        )}
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{task.id}</span>

        {/* More menu — right after ID */}
        <div ref={moreMenuTriggerRef} style={{ position: 'relative' }}>
          <HeaderIconButton icon={<MoreHorizontal size={14} strokeWidth={1.5} />} tooltip="More options" onClick={() => setMoreMenuOpen(!moreMenuOpen)} />
          {moreMenuOpen && <MoreOptionsMenu task={task} onClose={() => setMoreMenuOpen(false)} triggerRef={moreMenuTriggerRef} />}
        </div>

        <div style={{ flex: 1 }} />

        {/* Prev/Next */}
        <span className="task-detail-counter" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{currentIndex + 1} / {siblingIds.length}</span>
        <button disabled={!prevId} onClick={() => prevId && onNavigateToTask(prevId)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: prevId ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', cursor: prevId ? 'pointer' : 'default', opacity: prevId ? 1 : 0.4 }}>
          <ArrowUp size={13} strokeWidth={1.5} />
        </button>
        <button disabled={!nextId} onClick={() => nextId && onNavigateToTask(nextId)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: nextId ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', cursor: nextId ? 'pointer' : 'default', opacity: nextId ? 1 : 0.4 }}>
          <ArrowDown size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* 6.3 Soft claim warning banner (both modes) */}
      {task.claimedBy && !claimDismissed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
          background: 'var(--color-conflict-bg)', borderLeft: '3px solid var(--color-conflict-border)',
          fontSize: 13, color: 'var(--color-text-secondary)',
        }}>
          <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {isTeamMode && task.claimedBy.launchedByUserId
              ? `${task.claimedBy.agentName} (launched by ${getUserById(task.claimedBy.launchedByUserId)?.name || 'unknown'}) is working on this task. Assign your agent anyway?`
              : `${task.claimedBy.agentName} is already working on this task. Assign another agent anyway?`}
          </span>
          <button onClick={() => setClaimDismissed(true)} style={{
            padding: '3px 10px', fontSize: 12, fontWeight: 500, border: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}>Dismiss</button>
          <button onClick={() => setClaimDismissed(true)} style={{
            padding: '3px 10px', fontSize: 12, fontWeight: 500, border: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-warning-subtle, var(--color-surface))',
            color: 'var(--color-warning)', cursor: 'pointer',
          }}>Assign Anyway</button>
        </div>
      )}

      {/* Body — two columns */}
      <div className="task-detail-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Content */}
        <div className="task-detail-content" style={{ flex: 1, overflow: 'auto', padding: '24px 32px', minWidth: 0 }}>
          {/* Title */}
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3, marginBottom: 16, outline: 'none' }}>
            {task.title}
          </h1>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            {task.description ? (
              <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{task.description}</div>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Add description...</div>
            )}
          </div>

          {/* Reaction + Attachment buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <button style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              title="Add reaction">
              <Smile size={15} strokeWidth={1.5} />
            </button>
            <button style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              title="Attach images, files or videos">
              <Paperclip size={15} strokeWidth={1.5} />
            </button>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Attach images, files or videos</span>
          </div>

          {/* Acceptance Criteria */}
          {(() => {
            const ac = task.acceptanceCriteria || []
            const checkedCount = ac.filter(c => c.checked).length
            const allPassing = ac.length > 0 && checkedCount === ac.length
            return (
              <div style={{ marginBottom: 24 }}>
                {ac.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <ListChecks size={14} strokeWidth={1.5} style={{ color: allPassing ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Acceptance Criteria</span>
                      <span style={{
                        fontSize: 11,
                        color: allPassing ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                        fontWeight: allPassing ? 500 : 400,
                      }}>
                        {checkedCount}/{ac.length}
                      </span>
                      {allPassing && (
                        <span style={{
                          fontSize: 10, fontWeight: 500, padding: '1px 6px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-success-subtle)',
                          color: 'var(--color-success)',
                        }}>All passing</span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div style={{
                      height: 2, borderRadius: 1, background: 'var(--color-surface)',
                      marginBottom: 8, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 1,
                        width: `${(checkedCount / ac.length) * 100}%`,
                        background: allPassing ? 'var(--color-success)' : 'var(--color-primary)',
                        transition: 'width 0.2s ease-out, background 0.2s ease-out',
                      }} />
                    </div>
                    <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      {ac.map((criterion, i) => (
                        <div
                          key={criterion.id}
                          onClick={() => {
                            const updated = ac.map(c => c.id === criterion.id ? { ...c, checked: !c.checked } : c)
                            update({ acceptanceCriteria: updated })
                          }}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 12px',
                            borderBottom: i < ac.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                            background: 'var(--color-bg-elevated)', cursor: 'pointer',
                            transition: `background var(--duration-fast)`,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                        >
                          <span style={{
                            color: criterion.checked ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                            flexShrink: 0, marginTop: 1,
                            transition: `color var(--duration-fast)`,
                          }}>
                            {criterion.checked
                              ? <CheckSquare size={15} strokeWidth={1.5} />
                              : <Square size={15} strokeWidth={1.5} />}
                          </span>
                          <span style={{
                            fontSize: 13, lineHeight: 1.4,
                            color: criterion.checked ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                            textDecoration: criterion.checked ? 'line-through' : 'none',
                            transition: `color var(--duration-fast)`,
                          }}>{criterion.text}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <button style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 0', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}>
                  <Plus size={13} strokeWidth={1.5} /> Add acceptance criteria
                </button>
              </div>
            )
          })()}

          {/* Sub-tasks */}
          <div style={{ marginBottom: 24 }}>
            {subTasks.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Layers size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Sub-tasks</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {subTasks.filter(s => s.status === 'done').length}/{subTasks.length}
                  </span>
                </div>
                <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  {subTasks.map((sub, i) => (
                    <div key={sub.id} onClick={() => onNavigateToTask(sub.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderBottom: i < subTasks.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                      background: 'var(--color-bg-elevated)', cursor: 'pointer',
                      transition: `background var(--duration-fast)`,
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                    >
                      <span style={{ color: (STATUS_ICONS[sub.status] || STATUS_ICONS.todo).color }}>
                        {(STATUS_ICONS[sub.status] || STATUS_ICONS.todo).icon}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{sub.id}</span>
                      <span style={{ fontSize: 13, color: sub.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: sub.status === 'done' ? 'line-through' : 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>{sub.status.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 0', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}>
              <Plus size={13} strokeWidth={1.5} /> Add sub-tasks
            </button>
          </div>

          {/* Dependencies */}
          {(() => {
            const deps = task.dependencyIds ? allTasks.filter(t => task.dependencyIds!.includes(t.id)) : []
            if (deps.length === 0) return null
            const doneCount = deps.filter(d => d.status === 'done').length
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Link size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Dependencies</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {doneCount}/{deps.length}
                  </span>
                </div>
                <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  {deps.map((dep, i) => (
                    <div key={dep.id} onClick={() => onNavigateToTask(dep.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderBottom: i < deps.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                      background: 'var(--color-bg-elevated)', cursor: 'pointer',
                      transition: `background var(--duration-fast)`,
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                    >
                      <span style={{ color: (STATUS_ICONS[dep.status] || STATUS_ICONS.todo).color }}>
                        {(STATUS_ICONS[dep.status] || STATUS_ICONS.todo).icon}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{dep.id}</span>
                      <span style={{ fontSize: 13, color: dep.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: dep.status === 'done' ? 'line-through' : 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>{dep.status.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Activity */}
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: 0 }}>Activity</h3>
            </div>
            {getActivity(task, currentUser.name, currentUser.avatar, isTeamMode, getUserById).map((entry, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                {entry.user ? (
                  <UserAvatar user={entry.user} size={28} showPresence={isTeamMode} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: entry.isAgent ? 'var(--color-primary-muted)' : 'var(--color-surface)', color: entry.isAgent ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{entry.avatar}</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {entry.text}
                    {isTeamMode && entry.launchedByName && (
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}> (launched by {entry.launchedByName})</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{entry.time}</div>
                </div>
              </div>
            ))}

            {/* Comment input with @mention support (6.5) */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <UserAvatar user={currentUser} size={28} />
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={commentInput}
                    onChange={e => mention.handleChange(e.target.value)}
                    onKeyDown={mention.handleKeyDown}
                    placeholder={isTeamMode ? 'Leave a comment... (@ to mention)' : 'Leave a comment...'}
                    style={{ flex: 1, background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--color-text)', fontSize: 13, outline: 'none' }}
                  />
                  <button style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer' }}>
                    <Send size={14} strokeWidth={1.5} />
                  </button>
                </div>
                {mention.showDropdown && (
                  <MentionDropdown
                    members={mention.filteredMembers}
                    activeIndex={mention.mentionIndex}
                    onSelect={mention.insertMention}
                    onHover={mention.setMentionIndex}
                    position="above"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Properties Sidebar */}
        <div className="task-detail-sidebar" style={{ width: 280, minWidth: 280, borderLeft: '1px solid var(--color-border)', overflow: 'auto', padding: 16, flexShrink: 0 }}>
          {/* Copy buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 12, justifyContent: 'flex-end' }}>
            <HeaderIconButton icon={<Link size={13} strokeWidth={1.5} />} tooltip="Copy task link" onClick={() => {}} />
            <HeaderIconButton icon={<Clipboard size={13} strokeWidth={1.5} />} tooltip={`Copy ID: ${task.id}`} onClick={() => {}} />
            {task.branch && <HeaderIconButton icon={<GitBranch size={13} strokeWidth={1.5} />} tooltip={`Copy branch: ${task.branch}`} onClick={() => {}} />}
            <HeaderIconButton icon={<Copy size={13} strokeWidth={1.5} />} tooltip="Copy as prompt" onClick={() => {}} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>Properties</div>

          {/* Status */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <PropertyPill
              icon={<span style={{ color: statusInfo.color }}>{statusInfo.icon}</span>}
              label={KANBAN_COLUMNS.find(c => c.id === task.status)?.label || task.status}
              onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
            />
            {openDropdown === 'status' && <StatusDropdown current={task.status} onSelect={s => update({ status: s })} onClose={() => setOpenDropdown(null)} position={{ top: 30, left: 0 }} disabledStatuses={(() => {
              const ac = task.acceptanceCriteria
              if (!ac || ac.length === 0) return undefined
              const unchecked = ac.filter(c => !c.checked).length
              return unchecked > 0 ? { done: `${unchecked} acceptance criteria not yet passing` } : undefined
            })()} />}
          </div>

          {/* Priority */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <PropertyPill
              icon={<PriorityBarIcon level={task.priority} />}
              label={task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              onClick={() => setOpenDropdown(openDropdown === 'priority' ? null : 'priority')}
            />
            {openDropdown === 'priority' && <PriorityDropdown current={task.priority} onSelect={p => update({ priority: p })} onClose={() => setOpenDropdown(null)} position={{ top: 30, left: 0 }} />}
          </div>

          {/* Assignee */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <PropertyPill
              icon={task.assignee ? <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)', fontSize: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{task.assignee.avatar}</div> : undefined}
              label={task.assignee?.name || 'Assign'}
              onClick={() => setOpenDropdown(openDropdown === 'assignee' ? null : 'assignee')}
            />
            {openDropdown === 'assignee' && <AssigneeDropdown current={task.assignee?.name} onSelect={name => {
              const a = ASSIGNEES.find(a => a.name === name)
              update({ assignee: a ? { name: a.name, avatar: a.avatar } : undefined })
            }} onClose={() => setOpenDropdown(null)} position={{ top: 30, left: 0 }} />}
          </div>

          {/* Labels */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4, marginTop: 8 }}>Labels</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {task.labels.map(l => (
                <span key={l} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>{l}</span>
              ))}
              <button onClick={() => setOpenDropdown(openDropdown === 'labels' ? null : 'labels')} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}>+</button>
            </div>
            {openDropdown === 'labels' && <LabelDropdown current={task.labels} onToggle={l => {
              const labels = task.labels.includes(l) ? task.labels.filter(x => x !== l) : [...task.labels, l]
              update({ labels })
            }} onClose={() => setOpenDropdown(null)} position={{ top: '100%', left: 0 }} />}
          </div>

          {/* Estimate */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <PropertyRow label="Complexity" value={task.estimate ? COMPLEXITY_LABEL(task.estimate) : 'None'} onClick={() => setOpenDropdown(openDropdown === 'estimate' ? null : 'estimate')} />
            {openDropdown === 'estimate' && <EstimateDropdown current={task.estimate} onSelect={n => update({ estimate: n as Task['estimate'] })} onClose={() => setOpenDropdown(null)} position={{ top: 30, left: 0 }} />}
          </div>

          {/* Due date */}
          <PropertyRow label="Due date" value={task.dueDate || 'None'} onClick={() => {}} />

          {/* Creator — shown only when a human created the task */}
          {task.creatorId && (() => {
            const creator = getUserById(task.creatorId)
            if (!creator) return null
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Creator</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isTeamMode ? (
                    <UserAvatar user={creator} size={16} showPresence />
                  ) : (
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', fontSize: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{creator.avatar}</div>
                  )}
                  <span style={{ color: 'var(--color-text-secondary)' }}>{creator.name}</span>
                </div>
              </div>
            )
          })()}

          {/* Branch */}
          {task.branch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              <GitBranch size={13} strokeWidth={1.5} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{task.branch}</span>
              {onOpenInEditor && (
                <button
                  onClick={() => onOpenInEditor(task.branch!)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px',
                    background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text-tertiary)', fontSize: 10, cursor: 'pointer',
                    transition: `all var(--duration-fast)`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  <ExternalLink size={10} strokeWidth={1.5} />
                  Editor
                </button>
              )}
            </div>
          )}

          {/* Required Agent Tags */}
          <RequiredAgentTags tags={task.requiredAgentTags || []} onChange={tags => update({ requiredAgentTags: tags.length > 0 ? tags : undefined })} />

          {/* Required Role */}
          <RequiredRoleDropdown
            roleDefinitionId={task.roleDefinitionId}
            onChange={id => update({ roleDefinitionId: id || undefined })}
          />

          {/* Required Role Tags */}
          <RequiredAgentTags tags={task.requiredRoleDefinitionTags || []} onChange={tags => update({ requiredRoleDefinitionTags: tags.length > 0 ? tags : undefined })} label="Required Role Tags" />

          {/* 6.1 Watchers section (team-mode only) */}
          {isTeamMode && (
            <div style={{ marginTop: 8, marginBottom: 4, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Eye size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Watchers</span>
                </div>
                <button
                  onClick={() => {
                    const watchers = task.watchers || []
                    const isWatching = watchers.includes(currentUser.id)
                    update({ watchers: isWatching ? watchers.filter(id => id !== currentUser.id) : [...watchers, currentUser.id] })
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                    fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-sm)',
                    background: (task.watchers || []).includes(currentUser.id) ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                    color: (task.watchers || []).includes(currentUser.id) ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  {(task.watchers || []).includes(currentUser.id) ? <EyeOff size={11} strokeWidth={1.5} /> : <Eye size={11} strokeWidth={1.5} />}
                  {(task.watchers || []).includes(currentUser.id) ? 'Unwatch' : 'Watch'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AvatarStack
                  users={(task.watchers || []).map(id => getUserById(id)).filter((u): u is import('../../mock-data').StoneforgeUser => !!u)}
                  size={20}
                  showPresence
                  max={5}
                />
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'watchers' ? null : 'watchers')}
                  style={{
                    width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', borderRadius: '50%', background: 'var(--color-surface)',
                    color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14,
                  }}
                >+</button>
              </div>
              {openDropdown === 'watchers' && (
                <WatcherDropdown
                  watchers={task.watchers || []}
                  teamMembers={teamMembers}
                  getUserById={getUserById}
                  onToggle={(userId) => {
                    const watchers = task.watchers || []
                    update({ watchers: watchers.includes(userId) ? watchers.filter(id => id !== userId) : [...watchers, userId] })
                  }}
                  onClose={() => setOpenDropdown(null)}
                />
              )}
            </div>
          )}

          {/* Stoneforge-specific */}
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Stoneforge</div>

            {task.blocked && (
              <LinkRow label="Status" value="Blocked" color="var(--color-danger)" onClick={() => {}} />
            )}
            {task.sessionStatus && (() => {
              const director = mockDirectors.find(d => d.name === task.assignee?.name)
              return (
                <LinkRow
                  label="Director Session"
                  value={`${task.assignee?.name?.replace('Director ', '') || ''} · ${task.sessionStatus}`}
                  color={task.sessionStatus === 'running' ? 'var(--color-success)' : task.sessionStatus === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'}
                  onClick={() => director && onSelectDirector?.(director.id)}
                  action={director ? 'Open chat →' : undefined}
                />
              )
            })()}
            {task.agentName && (task.status === 'in_progress' || task.status === 'in_review') && (
              <LinkRow
                label="Agent Session"
                value={`${task.agentName} · ${task.sessionStatus === 'running' ? 'running' : 'idle'}`}
                color={task.sessionStatus === 'running' ? 'var(--color-success)' : 'var(--color-text-tertiary)'}
                onClick={() => task.agentSessionId && onSelectAgent?.(task.agentSessionId)}
                action={task.agentSessionId ? 'View agent →' : undefined}
              />
            )}
            {task.reviewAgentName && task.status === 'in_review' && (
              <LinkRow
                label="Review Session"
                value={`${task.reviewAgentName} · reviewing`}
                color="var(--color-warning)"
                onClick={() => task.reviewAgentSessionId && onSelectAgent?.(task.reviewAgentSessionId)}
                action={task.reviewAgentSessionId ? 'View agent →' : undefined}
              />
            )}
            {task.ciStatus && task.ciStatus !== 'none' && (
              <LinkRow label="CI/CD" value={task.ciStatus} color={task.ciStatus === 'pass' ? 'var(--color-success)' : task.ciStatus === 'fail' ? 'var(--color-danger)' : 'var(--color-warning)'} onClick={() => onNavigate('ci')} action="View pipeline →" />
            )}
            {task.mrStatus && task.mrStatus !== 'none' && (
              <LinkRow label="Merge Request" value={task.mrStatus.replace(/_/g, ' ')} color={task.mrStatus === 'merged' ? 'var(--color-primary)' : task.mrStatus === 'needs_review' ? 'var(--color-warning)' : 'var(--color-text-secondary)'} onClick={() => onNavigate('merge-requests')} action="Open MR →" />
            )}
            {task.mrStatus && task.mrStatus !== 'none' && onNavigateToPreview && (
              <LinkRow label="Preview" value="Ready" color="var(--color-success)" onClick={() => onNavigateToPreview(task.id)} action="View preview →" />
            )}
            {(() => {
              if (!task.whiteboardId) return null
              const wb = mockWhiteboards.find(w => w.id === task.whiteboardId)
              if (!wb) return null
              return <LinkRow label="Whiteboard" value={wb.title} color="var(--color-primary)" onClick={() => onNavigateToWhiteboard?.(wb.directorId)} action="View whiteboard →" />
            })()}
            {task.planName && (
              <LinkRow label="Plan" value={task.planName} color="var(--color-text-secondary)" onClick={() => onNavigate('plans')} action="View plan →" />
            )}
            {task.branch && (
              <LinkRow label="Changes" value="View diff" color="var(--color-text-tertiary)" onClick={() => onViewDiff(task.id, task.branch!)} action="View diff →" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RequiredRoleDropdown({ roleDefinitionId, onChange }: { roleDefinitionId?: string; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const selected = roleDefinitionId ? mockRoleDefinitions.find(r => r.id === roleDefinitionId) : null
  const categoryColors: Record<string, { bg: string; text: string }> = {
    orchestrator: { bg: 'rgba(124,58,237,0.1)', text: '#7c3aed' },
    executor: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
    reviewer: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  }

  return (
    <div style={{ marginTop: 8, marginBottom: 4, position: 'relative' }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Required Role</div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', height: 28, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', fontSize: 12, color: selected ? 'var(--color-text)' : 'var(--color-text-tertiary)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : 'None'}
        </span>
        <ChevronDown size={11} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 1060,
            background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
            maxHeight: 220, overflow: 'auto', padding: 4,
          }}>
            <button onClick={() => { onChange(null); setOpen(false) }} style={{
              width: '100%', display: 'flex', alignItems: 'center', padding: '5px 8px',
              background: !roleDefinitionId ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12,
              color: 'var(--color-text-tertiary)',
            }}>
              None
            </button>
            {mockRoleDefinitions.map(rd => {
              const isSelected = rd.id === roleDefinitionId
              const colors = categoryColors[rd.category || ''] || { bg: 'var(--color-surface)', text: 'var(--color-text-secondary)' }
              return (
                <button key={rd.id} onClick={() => { onChange(rd.id); setOpen(false) }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                  background: isSelected ? 'var(--color-surface-active)' : 'transparent',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12,
                  color: 'var(--color-text)',
                }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <span>{rd.name}</span>
                  {rd.category && (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 'var(--radius-full)', background: colors.bg, color: colors.text, fontWeight: 500, flexShrink: 0 }}>
                      {rd.category}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function RequiredAgentTags({ tags, onChange, label = 'Required Agent Tags' }: { tags: string[]; onChange: (tags: string[]) => void; label?: string }) {
  const [input, setInput] = useState('')
  const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag))
  const addTag = (raw: string) => {
    const trimmed = raw.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed])
  }

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {tags.map(tag => (
          <span key={tag} style={{
            fontSize: 11, padding: '2px 5px 2px 7px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-warning-subtle, var(--color-surface))',
            color: 'var(--color-warning, var(--color-text-secondary))',
            display: 'flex', alignItems: 'center', gap: 3, fontWeight: 500,
          }}>
            {tag}
            <span
              onClick={() => removeTag(tag)}
              style={{ cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center' }}
            >
              ×
            </span>
          </span>
        ))}
        <input
          value={input}
          onChange={e => {
            const val = e.target.value
            if (val.includes(',')) {
              val.split(',').forEach(s => addTag(s))
              setInput('')
            } else {
              setInput(val)
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim()) {
              addTag(input)
              setInput('')
              e.preventDefault()
            }
            if (e.key === 'Backspace' && !input && tags.length > 0) {
              onChange(tags.slice(0, -1))
            }
          }}
          placeholder={tags.length === 0 ? 'Add tag...' : 'Add...'}
          style={{
            flex: 1, minWidth: 60, height: 22, padding: '0 4px', fontSize: 11,
            background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--color-text)', fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  )
}

function PropertyRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '6px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
    </button>
  )
}

function LinkRow({ label, value, color, onClick, action }: { label: string; value: string; color: string; onClick: () => void; action?: string }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', cursor: action ? 'pointer' : 'default', fontSize: 12 }}>
      <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </div>
  )
}

function HeaderIconButton({ icon, tooltip, onClick }: { icon: React.ReactNode; tooltip: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const handleEnter = () => {
    setHovered(true)
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
  }

  return (
    <div style={{ position: 'relative' }}>
      <button ref={btnRef} onClick={onClick} onMouseEnter={handleEnter} onMouseLeave={() => setHovered(false)}
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', transition: `all var(--duration-fast)` }}
      >
        {icon}
      </button>
      {hovered && rect && createPortal(
        <div style={{
          position: 'fixed', top: rect.bottom + 6,
          left: Math.min(Math.max(rect.left + rect.width / 2, 60), window.innerWidth - 60),
          transform: 'translateX(-50%)',
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', padding: '4px 8px',
          whiteSpace: 'nowrap', fontSize: 11, color: 'var(--color-text)',
          boxShadow: 'var(--shadow-float)', zIndex: 9999, pointerEvents: 'none',
          maxWidth: 'calc(100vw - 16px)', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {tooltip}
        </div>,
        document.body
      )}
    </div>
  )
}

function MoreOptionsMenu({ task, onClose, triggerRef }: { task: Task; onClose: () => void; triggerRef: React.RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  // Calculate fixed position from trigger
  useEffect(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuWidth = 240
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = rect.left
    const top = rect.bottom + 4
    // Clamp to viewport
    if (left + menuWidth > vw - 8) left = vw - menuWidth - 8
    if (left < 8) left = 8
    setPos({ top, left })
  }, [triggerRef])

  const items: { icon: React.ReactNode; label: string; shortcut?: string; destructive?: boolean; divider?: boolean }[] = [
    { icon: <Calendar size={14} strokeWidth={1.5} />, label: 'Set due date', shortcut: '⇧ D' },
    { icon: <Link size={14} strokeWidth={1.5} />, label: 'Add link...', shortcut: '⌃ L' },
    { icon: <FileText size={14} strokeWidth={1.5} />, label: 'Add document...' },
    { icon: <Copy size={14} strokeWidth={1.5} />, label: 'Make a copy...' },
    { icon: <span />, label: '', divider: true },
    { icon: <Star size={14} strokeWidth={1.5} />, label: 'Favorite', shortcut: '⌥ F' },
    { icon: <Clipboard size={14} strokeWidth={1.5} />, label: 'Copy task link' },
    { icon: <Clipboard size={14} strokeWidth={1.5} />, label: `Copy ID: ${task.id}`, shortcut: '⌘ .' },
    ...(task.branch ? [{ icon: <GitBranch size={14} strokeWidth={1.5} />, label: `Copy branch: ${task.branch}` }] : []),
    { icon: <Copy size={14} strokeWidth={1.5} />, label: 'Copy as prompt' },
    { icon: <span />, label: '', divider: true },
    { icon: <Clock size={14} strokeWidth={1.5} />, label: 'Remind me', shortcut: '⇧ H' },
    { icon: <FileText size={14} strokeWidth={1.5} />, label: 'Show version history' },
    { icon: <span />, label: '', divider: true },
    { icon: <Trash2 size={14} strokeWidth={1.5} />, label: 'Delete', shortcut: '⌘ ⌫', destructive: true },
  ]

  return createPortal(
    <div ref={ref} style={{ position: 'fixed', top: pos.top, left: pos.left, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 4, width: 240, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', boxShadow: 'var(--shadow-float)', zIndex: 9999, fontSize: 12 }}>
      {items.map((item, i) => {
        if (item.divider) return <div key={i} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
        return (
          <button key={i} onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '7px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: item.destructive ? 'var(--color-danger)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12, textAlign: 'left',
            transition: `background var(--duration-fast)`,
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {item.icon}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{item.shortcut}</span>}
          </button>
        )
      })}
    </div>,
    document.body
  )
}

function WatcherDropdown({ watchers, teamMembers, getUserById, onToggle, onClose }: {
  watchers: string[]
  teamMembers: import('../../mock-data').StoneforgeUser[]
  getUserById: (id: string) => import('../../mock-data').StoneforgeUser | undefined
  onToggle: (userId: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 100,
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: 4, width: 220,
      boxShadow: 'var(--shadow-float)',
    }}>
      <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Add watchers</div>
      {teamMembers.map(member => {
        const isWatching = watchers.includes(member.id)
        return (
          <button key={member.id} onClick={() => onToggle(member.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: 'var(--color-text)', cursor: 'pointer',
            fontSize: 12, textAlign: 'left',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <UserAvatar user={member} size={20} showPresence />
            <span style={{ flex: 1 }}>{member.name}</span>
            {isWatching && <Eye size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-accent)' }} />}
          </button>
        )
      })}
    </div>
  )
}

interface ActivityEntry {
  avatar: string
  text: string
  time: string
  user?: import('../../mock-data').StoneforgeUser
  isAgent?: boolean
  launchedByName?: string
}

function getActivity(
  task: Task,
  currentUserName: string,
  currentUserAvatar: string,
  isTeamMode: boolean,
  getUserById: (id: string) => import('../../mock-data').StoneforgeUser | undefined
): ActivityEntry[] {
  const a: ActivityEntry[] = []
  const launchedByName = task.claimedBy?.launchedByUserId ? getUserById(task.claimedBy.launchedByUserId)?.name : undefined
  if (task.sessionStatus === 'running') a.push({ avatar: task.assignee?.avatar || '?', text: `${task.assignee?.name || 'Agent'} started working on this task`, time: task.updatedAt, isAgent: true, launchedByName })
  if (task.mrStatus === 'needs_review') a.push({ avatar: task.assignee?.avatar || '?', text: `${task.assignee?.name || 'Agent'} opened a merge request for review`, time: '20 min ago', isAgent: true, launchedByName })
  if (task.mrStatus === 'open') a.push({ avatar: task.assignee?.avatar || '?', text: `${task.assignee?.name || 'Agent'} pushed changes to ${task.branch}`, time: '45 min ago', isAgent: true, launchedByName })
  if (task.ciStatus === 'fail') a.push({ avatar: 'CI', text: 'CI pipeline failed — 1 test failure', time: '40 min ago' })
  if (task.ciStatus === 'pass') a.push({ avatar: 'CI', text: 'CI pipeline passed — all checks green', time: '25 min ago' })
  const mergeUser = task.creatorId ? getUserById(task.creatorId) : undefined
  if (task.mrStatus === 'merged') a.push({ avatar: currentUserAvatar, text: `${currentUserName} merged the pull request`, time: task.updatedAt, user: mergeUser })
  const creator = task.creatorId ? getUserById(task.creatorId) : undefined
  if (creator) {
    a.push({ avatar: creator.avatar, text: `${creator.name} created this task`, time: '3 days ago', user: creator })
  } else {
    a.push({ avatar: task.assignee?.avatar || '?', text: 'Task created', time: '3 days ago' })
  }
  return a
}
