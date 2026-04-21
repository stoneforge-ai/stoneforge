import { useState } from 'react'
import {
  ArrowLeft, Pencil, Trash2, GitBranch, Container, Box, Bot,
  ChevronRight, MoreHorizontal, Star, Copy, Cpu,
} from 'lucide-react'
import type { Runtime, Host, RuntimeMode } from './runtime-types'
import { runtimeModeLabels, runtimeStatusColors, hostStatusColors, sandboxTierLabels } from './runtime-types'
import type { WorkspaceDaemonState } from '../../../mock-data'

interface RuntimeDetailViewProps {
  runtime: Runtime
  allRuntimes: Runtime[]
  hosts: Host[]
  onSelectRuntime: (rt: Runtime) => void
  onBack: () => void
  onEdit: () => void
  onNavigateToAgent?: (agentId: string) => void
  agentNames?: Record<string, { name: string; model: string; status: string }>
  daemonState?: WorkspaceDaemonState | null
  editing?: boolean
  editContent?: React.ReactNode
}

const modeIcons: Record<RuntimeMode, typeof GitBranch> = {
  worktrees: GitBranch,
  docker: Container,
  sandbox: Box,
}

export function RuntimeDetailView({ runtime: rt, allRuntimes, hosts, onSelectRuntime, onBack, onEdit, onNavigateToAgent, agentNames = {}, daemonState, editing, editContent }: RuntimeDetailViewProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ModeIcon = modeIcons[rt.mode] || GitBranch
  const dotColor = runtimeStatusColors[rt.status]
  const showSidebar = allRuntimes.length > 1
  const host = hosts.find(h => h.id === rt.hostId)
  const isDaemonHost = daemonState?.hostId === rt.hostId

  const statusLabel = rt.status.charAt(0).toUpperCase() + rt.status.slice(1)

  const agentStatusDot: Record<string, string> = {
    running: 'var(--color-success)',
    idle: 'var(--color-text-tertiary)',
    error: 'var(--color-danger)',
    starting: 'var(--color-warning)',
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      {/* Sidebar */}
      {showSidebar && (
        <div style={{
          width: 200, borderRight: '1px solid var(--color-border-subtle)',
          display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Runtimes</div>
            <button onClick={onBack} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
              background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, textAlign: 'left',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ArrowLeft size={12} strokeWidth={1.5} /> All runtimes
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', flex: 1, overflow: 'auto', padding: '6px 8px' }}>
            {allRuntimes.map(r => {
              const isActive = r.id === rt.id
              const Icon = modeIcons[r.mode] || GitBranch
              return (
                <button key={r.id} onClick={() => onSelectRuntime(r)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                  background: isActive ? 'var(--color-surface-active)' : 'transparent',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                  textAlign: 'left',
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Icon size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div style={{
                      position: 'absolute', bottom: -1, right: -1, width: 6, height: 6, borderRadius: '50%',
                      background: runtimeStatusColors[r.status],
                    }} />
                  </div>
                  <span style={{
                    fontSize: 12, color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    fontWeight: isActive ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{r.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Main content — edit form or detail */}
      {editing && editContent ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {editContent}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
            borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, flexWrap: 'wrap',
          }}>
            {!showSidebar && (
              <button onClick={onBack} style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-tertiary)', cursor: 'pointer',
              }}>
                <ArrowLeft size={14} strokeWidth={1.5} />
              </button>
            )}
            <ModeIcon size={18} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{rt.name}</span>

            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: `color-mix(in srgb, ${dotColor} 15%, transparent)`, color: dotColor,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
              {statusLabel}
            </span>

            {rt.isDefault && (
              <span style={{
                fontSize: 10, fontWeight: 500, color: 'var(--color-text-accent)',
                background: 'var(--color-primary-subtle)', padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
              }}>Default</span>
            )}

            {isDaemonHost && (
              <span style={{
                fontSize: 10, fontWeight: 500, color: 'var(--color-success)',
                background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                padding: '2px 8px', borderRadius: 'var(--radius-full)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <Cpu size={9} strokeWidth={2} /> Daemon Host
              </span>
            )}

            <div style={{ flex: 1 }} />

            <button onClick={onEdit} style={{
              height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              <Pencil size={12} strokeWidth={1.5} /> Edit
            </button>

            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(!menuOpen)} style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer',
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
                    <MenuBtn icon={Copy} label="Duplicate" onClick={() => setMenuOpen(false)} />
                    {!rt.isDefault && <MenuBtn icon={Star} label="Set as default" onClick={() => setMenuOpen(false)} />}
                    <MenuBtn icon={Trash2} label="Delete" color="var(--color-danger)" onClick={() => setMenuOpen(false)} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {/* Dispatch Daemon section */}
            {isDaemonHost && daemonState && (
              <Section title="Dispatch Daemon">
                <div style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-md)',
                  background: 'color-mix(in srgb, var(--color-success) 6%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-success) 15%, transparent)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Cpu size={13} strokeWidth={1.5} style={{ color: 'var(--color-success)' }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>
                      {daemonState.status === 'running' ? 'Running' : daemonState.status === 'error' ? 'Error' : 'Stopped'}
                    </span>
                    {daemonState.startedAt && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Up {daemonState.startedAt}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
                    The daemon runs on host <strong style={{ color: 'var(--color-text-secondary)' }}>{host?.name}</strong> and orchestrates agent lifecycles across all runtimes on this host.
                  </div>
                </div>
              </Section>
            )}

            {/* Configuration section */}
            <Section title="Configuration">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <InfoItem label="Mode" value={runtimeModeLabels[rt.mode]} />
                  {host && (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Host</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: hostStatusColors[host.status], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{host.name}</span>
                        {host.os && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{host.os} {host.arch}</span>}
                      </div>
                    </div>
                  )}
                  <InfoItem label="Created" value={rt.createdAt} />
                  {rt.lastHealthCheck && <InfoItem label="Last Health Check" value={rt.lastHealthCheck} />}
                </div>
                {rt.worktreePath && <InfoItem label="Worktree Path" value={rt.worktreePath} mono />}
                {rt.dockerImage && <InfoItem label="Docker Image" value={rt.dockerImage} mono />}
                {rt.sandboxTier && <InfoItem label="Sandbox Tier" value={sandboxTierLabels[rt.sandboxTier]} />}
                {rt.sandboxBaseImage && <InfoItem label="Sandbox Image" value={rt.sandboxBaseImage} mono />}
              </div>
            </Section>

            {/* Health section */}
            {(rt.cpu !== undefined || rt.memory || rt.disk) && (
              <Section title="Health">
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {rt.cpu !== undefined && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>CPU</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 100, height: 6, borderRadius: 3, background: 'var(--color-surface)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${rt.cpu}%`, height: '100%', borderRadius: 3,
                            background: rt.cpu > 80 ? 'var(--color-danger)' : rt.cpu > 60 ? 'var(--color-warning)' : 'var(--color-primary)',
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{rt.cpu}%</span>
                      </div>
                    </div>
                  )}
                  {rt.memory && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Memory</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{rt.memory}</span>
                    </div>
                  )}
                  {rt.disk && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Disk</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{rt.disk}</span>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Error message */}
            {rt.status === 'error' && rt.statusMessage && (
              <Section title="Error">
                <div style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-md)',
                  background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-danger) 20%, transparent)',
                  fontSize: 12, color: 'var(--color-danger)', lineHeight: 1.5,
                }}>
                  {rt.statusMessage}
                </div>
              </Section>
            )}

            {/* Assigned agents section */}
            <Section title={`Assigned Agents (${rt.assignedAgentCount})`}>
              {rt.assignedAgentIds.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>
                  No agents assigned to this runtime.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {rt.assignedAgentIds.map(agentId => {
                    const agent = agentNames[agentId]
                    return (
                      <button
                        key={agentId}
                        onClick={() => onNavigateToAgent?.(agentId)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                          background: 'var(--color-bg-elevated)', border: 'none', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                          transition: 'background var(--duration-fast)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                      >
                        <Bot size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1 }}>
                          {agent?.name || agentId}
                        </span>
                        {agent?.model && (
                          <span style={{
                            fontSize: 10, color: 'var(--color-text-tertiary)',
                            background: 'var(--color-surface)', padding: '1px 6px',
                            borderRadius: 'var(--radius-full)',
                          }}>{agent.model}</span>
                        )}
                        {agent?.status && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: agentStatusDot[agent.status] || 'var(--color-text-tertiary)',
                          }} />
                        )}
                        <ChevronRight size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                      </button>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
        paddingBottom: 6, borderBottom: '1px solid var(--color-border-subtle)',
      }}>{title}</div>
      {children}
    </div>
  )
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{label}</div>
      <div style={{
        fontSize: mono ? 12 : 13, fontWeight: 500, color: 'var(--color-text-secondary)',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        wordBreak: mono ? 'break-all' as const : undefined,
      }}>{value}</div>
    </div>
  )
}

function MenuBtn({ icon: Icon, label, color, onClick }: { icon: typeof Copy; label: string; color?: string; onClick: () => void }) {
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
