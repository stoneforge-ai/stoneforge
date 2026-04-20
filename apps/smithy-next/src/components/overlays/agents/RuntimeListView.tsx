import { useState } from 'react'
import { Plus, ChevronRight, Server, Monitor, Cloud } from 'lucide-react'
import type { Runtime, Host } from './agent-types'
import { mockHosts } from './agent-mock-data'
import { runtimeModeLabels, runtimeModeColors } from '../runtimes/runtime-types'
import { Tooltip } from '../../Tooltip'

interface RuntimeListViewProps {
  runtimes: Runtime[]
  onSelectRuntime: (rt: Runtime) => void
  onCreateRuntime: () => void
}

const getHost = (hostId?: string): Host | undefined => hostId ? mockHosts.find(h => h.id === hostId) : undefined

const statusDotColor: Record<string, string> = {
  online: 'var(--color-success)',
  offline: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)',
  provisioning: 'var(--color-warning)',
}

function formatLastSeen(ts?: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts // human-readable mock data strings
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

export function RuntimeListView({ runtimes, onSelectRuntime, onCreateRuntime }: RuntimeListViewProps) {
  const [daemonRunning, setDaemonRunning] = useState(() => {
    const dr = runtimes.find(r => r.isDefault)
    return !!dr && dr.status === 'online'
  })
  const [daemonRuntimeId, setDaemonRuntimeId] = useState(() => {
    const dr = runtimes.find(r => r.isDefault)
    return dr?.id || runtimes[0]?.id || ''
  })

  const selectedDaemonRuntime = runtimes.find(r => r.id === daemonRuntimeId)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>Runtimes</span>
        <button
          onClick={onCreateRuntime}
          style={{
            height: 26,
            fontSize: 12,
            fontWeight: 500,
            padding: '0 10px',
            background: 'var(--color-primary)',
            color: 'white',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Plus size={12} strokeWidth={2} /> New Runtime
        </button>
      </div>

      {/* Dispatch Daemon status bar */}
      {(() => {
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px',
            background: 'rgba(124,58,237,0.03)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: daemonRunning ? 'var(--color-success)' : 'var(--color-danger)',
            }} />
            <span style={{
              fontSize: 12, fontWeight: 600, color: '#7c3aed',
            }}>
              Dispatch Daemon
            </span>
            <span style={{
              fontSize: 11, fontWeight: 500, padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: daemonRunning ? 'rgba(124,58,237,0.1)' : 'var(--color-danger-subtle)',
              color: daemonRunning ? '#7c3aed' : 'var(--color-danger)',
            }}>
              {daemonRunning ? 'Running' : 'Stopped'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              on{' '}
              {daemonRunning ? (
                <Tooltip label="Stop the daemon to change the runtime" placement="bottom">
                  <span
                    style={{
                      fontSize: 11, fontWeight: 500, padding: '1px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(124,58,237,0.08)',
                      color: '#7c3aed',
                      cursor: 'default',
                    }}
                  >
                    {selectedDaemonRuntime?.name || '—'}
                  </span>
                </Tooltip>
              ) : (
                <select
                  value={daemonRuntimeId}
                  onChange={e => setDaemonRuntimeId(e.target.value)}
                  style={{
                    fontSize: 11, fontWeight: 500, padding: '1px 4px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {runtimes.map(rt => (
                    <option key={rt.id} value={rt.id}>{rt.name}</option>
                  ))}
                </select>
              )}
            </span>
            <div style={{ flex: 1 }} />
            {daemonRunning && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginRight: 8 }}>
                uptime 30 min
              </span>
            )}
            <button
              onClick={() => setDaemonRunning(!daemonRunning)}
              style={{
                height: 24, padding: '0 10px', fontSize: 11, fontWeight: 500,
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: daemonRunning ? 'var(--color-danger-subtle)' : 'rgba(34,197,94,0.1)',
                color: daemonRunning ? 'var(--color-danger)' : 'var(--color-success)',
              }}
            >
              {daemonRunning ? 'Stop' : 'Start'}
            </button>
          </div>
        )
      })()}

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {runtimes.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Server size={32} strokeWidth={1} style={{ color: 'var(--color-text-tertiary)', marginBottom: 12 }} />
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 4 }}>No runtimes configured</div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginBottom: 16 }}>Create a runtime to define where your agents run.</div>
            <button onClick={onCreateRuntime} style={{
              height: 30, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              <Plus size={13} strokeWidth={2} /> Create runtime
            </button>
          </div>
        )}
        {runtimes.map(rt => (
          <RuntimeRow key={rt.id} runtime={rt} onClick={() => onSelectRuntime(rt)} />
        ))}
      </div>
    </div>
  )
}

function RuntimeRow({ runtime: rt, onClick }: { runtime: Runtime; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const dotColor = statusDotColor[rt.status] || 'var(--color-text-tertiary)'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        width: '100%',
        border: 'none',
        borderBlockEnd: '1px solid var(--color-border-subtle)',
        background: hovered ? 'var(--color-surface-hover)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {/* Status dot */}
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
      }} />

      {/* Name + host */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 500, color: 'var(--color-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
        }}>
          {rt.name}
        </span>
        {(() => {
          const host = getHost(rt.hostId)
          if (!host) return null
          const HostIcon = host.managed ? Cloud : Monitor
          return (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <HostIcon size={10} strokeWidth={1.5} /> {host.name}
            </span>
          )
        })()}
      </div>

      {/* Mode badge */}
      {(() => {
        const mc = runtimeModeColors[rt.mode]
        return (
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            background: mc?.bg || 'var(--color-surface)', color: mc?.text || 'var(--color-text-secondary)',
            flexShrink: 0,
          }}>
            {runtimeModeLabels[rt.mode] || rt.mode}
          </span>
        )
      })()}

      {/* Active count */}
      <span style={{
        fontSize: 11, color: 'var(--color-text-tertiary)',
        fontFamily: 'var(--font-mono)', flexShrink: 0,
      }}>
        {rt.assignedAgentCount} active
      </span>

      {/* Last health check */}
      <span style={{
        fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0,
      }}>
        {formatLastSeen(rt.lastHealthCheck)}
      </span>

      {/* Chevron */}
      <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
    </button>
  )
}
