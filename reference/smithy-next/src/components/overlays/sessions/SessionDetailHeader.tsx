import {
  ChevronUp, ChevronDown, Bot, Container, Laptop, Monitor, FolderGit2, Cloud,
  FileText, Clock, Timer, ArrowDownLeft, ArrowUpRight, ArrowLeft, GitBranch, ExternalLink,
  ChevronDown as ChevDropdown, Play, X, SquareKanban, GitMerge, Presentation,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { Session } from './session-types'
import { mockWhiteboards, mockDirectors } from '../../../mock-data'
import { mockAgentsExtended } from '../agents/agent-mock-data'
import { mockRuntimes } from '../runtimes/runtime-mock-data'

interface SessionDetailHeaderProps {
  session: Session
  onBack: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev: boolean
  hasNext: boolean
  onOpenAgentPanel: () => void
  onResumeSession?: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const statusStyles: Record<string, { bg: string; color: string }> = {
  active: { bg: 'var(--color-success-subtle)', color: 'var(--color-success)' },
  completed: { bg: 'var(--color-surface)', color: 'var(--color-text-tertiary)' },
  error: { bg: 'var(--color-danger-subtle)', color: 'var(--color-danger)' },
}

const envIcons: Record<string, typeof Laptop> = {
  local: Laptop,
  docker: Container,
  ssh: Monitor,
}

const linkChipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)', border: 'none',
  color: 'var(--color-text-accent)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
}

export function SessionDetailHeader({
  session, onBack, onPrev, onNext, hasPrev, hasNext,
  onOpenAgentPanel, onResumeSession, onNavigateToTask, onNavigateToMR, onNavigateToAgent, onNavigateToWhiteboard,
}: SessionDetailHeaderProps) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!actionsOpen) return
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [actionsOpen])

  const truncatedId = session.id.length > 12 ? `...${session.id.slice(-7)}` : session.id
  const sstyle = statusStyles[session.status]
  const EnvIcon = envIcons[session.environment] ?? Laptop
  const fileCount = session.files?.length ?? 0

  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      {/* Row 1: Breadcrumb + prev/next */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        fontSize: 13,
      }}>
        <button
          onClick={onBack}
          title="Back"
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>
          Session {truncatedId}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            style={{
              background: 'none', border: 'none', cursor: hasPrev ? 'pointer' : 'default',
              padding: 4, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
              color: hasPrev ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
              opacity: hasPrev ? 1 : 0.4,
            }}
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            style={{
              background: 'none', border: 'none', cursor: hasNext ? 'pointer' : 'default',
              padding: 4, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
              color: hasNext ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
              opacity: hasNext ? 1 : 0.4,
            }}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Row 2: Title + status + actions */}
      <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
              {session.title}
            </h1>
            <span style={{
              fontSize: 12, fontWeight: 500,
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              background: sstyle.bg,
              color: sstyle.color,
              textTransform: 'capitalize',
            }}>
              {session.status}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Actions dropdown */}
          <div ref={actionsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setActionsOpen(!actionsOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 10px',
                fontSize: 12, fontWeight: 500,
                background: 'var(--color-surface)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                height: 28,
              }}
            >
              Actions <ChevDropdown size={14} />
            </button>
            {actionsOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4,
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
                zIndex: 'var(--z-dropdown)', minWidth: 160, padding: 4,
              }}>
                {['View logs', 'Copy session ID', 'Export transcript'].map(action => (
                  <button
                    key={action}
                    onClick={() => setActionsOpen(false)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 10px', fontSize: 13,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-sm)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Resume Session button */}
          {onResumeSession && (
            <button
              onClick={onResumeSession}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0 10px',
                fontSize: 12, fontWeight: 500,
                background: 'var(--color-primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'white',
                cursor: 'pointer',
                height: 28,
              }}
            >
              <Play size={13} /> Resume Session
            </button>
          )}
        </div>
      </div>

      {/* Row 3: Metadata chips + linked resource chips (MR style) */}
      <div style={{
        padding: '8px 16px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        fontSize: 12,
        color: 'var(--color-text-tertiary)',
      }}>
        {/* Agent chip (clickable, MR-style link) */}
        <button
          onClick={onOpenAgentPanel}
          style={linkChipStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
        >
          <Bot size={12} strokeWidth={1.5} /> {session.agent.name}
        </button>

        {/* Runtime chip — resolves runtime from agent */}
        {(() => {
          const agentData = mockAgentsExtended.find(a => a.id === session.agent.id)
          const runtime = agentData?.runtimeId ? mockRuntimes.find(r => r.id === agentData.runtimeId) : undefined
          if (runtime) {
            const RuntimeIcon = runtime.mode === 'worktrees' ? FolderGit2 : runtime.mode === 'docker' ? Container : Cloud
            return <Chip icon={RuntimeIcon} label={runtime.name} />
          }
          return <Chip icon={EnvIcon} label={session.environment} />
        })()}

        {/* Files chip (clickable, opens modal) */}
        {fileCount > 0 && (
          <button
            onClick={() => setFilesOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-full)',
              fontSize: 12, color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
          >
            <FileText size={12} /> {fileCount} file{fileCount !== 1 ? 's' : ''}
          </button>
        )}

        <span style={{ color: 'var(--color-border)', margin: '0 2px' }}>·</span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={11} /> {session.startedAt}
        </span>

        <span style={{ color: 'var(--color-border)', margin: '0 2px' }}>·</span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Timer size={11} /> {session.duration}
          {session.activeDuration && (
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              ({session.activeDuration} active)
            </span>
          )}
        </span>

        <span style={{ color: 'var(--color-border)', margin: '0 2px' }}>·</span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <ArrowDownLeft size={10} /> {formatTokens(session.tokensIn)}
          {' / '}
          <ArrowUpRight size={10} /> {formatTokens(session.tokensOut)}
        </span>

        {/* Linked resources (MR-header style, right-aligned) */}
        <div style={{ flex: 1 }} />

        {session.linkedTaskId && (
          <button
            onClick={() => onNavigateToTask?.(session.linkedTaskId!)}
            style={linkChipStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
          >
            <SquareKanban size={11} strokeWidth={1.5} />
            {session.linkedTaskId}
            <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
          </button>
        )}

        {session.linkedMRId && (
          <button
            onClick={() => onNavigateToMR?.(session.linkedMRId!)}
            style={linkChipStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
          >
            <GitMerge size={11} strokeWidth={1.5} />
            {session.linkedMRId}
            <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
          </button>
        )}

        {session.linkedBranch && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)',
          }}>
            <GitBranch size={11} strokeWidth={1.5} />
            {session.linkedBranch}
          </span>
        )}

        {(() => {
          if (!session.linkedDirectorId) return null
          // Only show whiteboard link for director sessions, not workers/stewards
          const isDirectorSession = mockDirectors.some(d => d.name === session.agent.name)
          if (!isDirectorSession) return null
          const hasWb = mockWhiteboards.some(wb => wb.directorId === session.linkedDirectorId)
          if (!hasWb) return null
          return (
            <button
              onClick={() => onNavigateToWhiteboard?.(session.linkedDirectorId!)}
              style={linkChipStyle}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
            >
              <Presentation size={11} strokeWidth={1.5} />
              Whiteboard
              <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
            </button>
          )
        })()}
      </div>

      {/* Files modal */}
      {filesOpen && session.files && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 'var(--z-modal)' as unknown as number,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setFilesOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-float)',
              width: 480,
              maxWidth: '90vw',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                Session files ({fileCount})
              </span>
              <button
                onClick={() => setFilesOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)', padding: 4,
                  borderRadius: 'var(--radius-sm)', display: 'flex',
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ overflow: 'auto', padding: '8px 0' }}>
              {session.files.map(file => (
                <div
                  key={file}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 16px',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <FileText size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  {file}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ icon: Icon, label }: { icon: typeof Laptop; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-full)',
      fontSize: 12, color: 'var(--color-text-secondary)',
    }}>
      <Icon size={12} /> {label}
    </span>
  )
}
