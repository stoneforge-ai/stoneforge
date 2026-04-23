import { useState, useEffect } from 'react'
import type { Runtime, Host } from './runtimes/runtime-types'
import { RuntimeListView } from './runtimes/RuntimeListView'
import { RuntimeDetailView } from './runtimes/RuntimeDetailView'
import { RuntimeCreateView } from './runtimes/RuntimeCreateView'
import { mockRuntimes, mockHosts } from './runtimes/runtime-mock-data'
import { mockAgentsExtended } from './agents/agent-mock-data'
import { mockDaemonState } from '../../mock-data'
import type { WorkspaceDaemonState } from '../../mock-data'

interface RuntimesOverlayProps {
  onBack: () => void
  initialRuntimeId?: string | null
  initialCreate?: boolean
  onRuntimeChange?: (id: string | null, editing?: boolean) => void
  onNavigateToAgent?: (agentId: string) => void
}

export function RuntimesOverlay({ onBack, initialRuntimeId, initialCreate, onRuntimeChange, onNavigateToAgent }: RuntimesOverlayProps) {
  const [runtimes] = useState<Runtime[]>(mockRuntimes)
  const [hosts] = useState<Host[]>(mockHosts)
  const [selectedId, setSelectedId] = useState<string | null>(initialRuntimeId || null)
  const [editing, setEditing] = useState(!!initialCreate)
  const [daemonState, setDaemonState] = useState<WorkspaceDaemonState>(mockDaemonState)

  // Sync with external navigation (e.g. daemon pill click resets to list)
  useEffect(() => {
    setSelectedId(initialRuntimeId || null)
    setEditing(!!initialCreate)
  }, [initialRuntimeId, initialCreate])

  const selectedRuntime = selectedId ? runtimes.find(r => r.id === selectedId) || null : null

  // Build agent name lookup
  const agentNames: Record<string, { name: string; model: string; status: string }> = {}
  for (const a of mockAgentsExtended) {
    agentNames[a.id] = { name: a.name, model: a.model, status: a.status }
  }

  const handleSelectRuntime = (rt: Runtime) => {
    setSelectedId(rt.id)
    setEditing(false)
    onRuntimeChange?.(rt.id)
  }

  const handleBack = () => {
    setSelectedId(null)
    setEditing(false)
    onRuntimeChange?.(null)
  }

  const handleCreate = () => {
    setSelectedId(null)
    setEditing(true)
    onRuntimeChange?.(null, true)
  }

  const handleEdit = (rt?: Runtime | null) => {
    const target = rt || selectedRuntime
    if (target) setSelectedId(target.id)
    setEditing(true)
    onRuntimeChange?.(target?.id || selectedId, true)
  }

  const handleCreateBack = () => {
    if (selectedId) {
      setEditing(false)
      onRuntimeChange?.(selectedId)
    } else {
      handleBack()
    }
  }

  // List view
  if (!selectedRuntime && !editing) {
    return (
      <RuntimeListView
        runtimes={runtimes}
        hosts={hosts}
        onSelectRuntime={handleSelectRuntime}
        onCreate={handleCreate}
        onEdit={(rt) => handleEdit(rt)}
        daemonState={daemonState}
        onChangeDaemonHost={(hostId) => setDaemonState(prev => ({ ...prev, hostId }))}
      />
    )
  }

  // Create new
  if (!selectedRuntime && editing) {
    return (
      <RuntimeCreateView
        onBack={handleCreateBack}
        hosts={hosts}
        editingRuntime={null}
      />
    )
  }

  // Detail or Edit — sidebar persists
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <RuntimeDetailView
        runtime={selectedRuntime!}
        allRuntimes={runtimes}
        hosts={hosts}
        onSelectRuntime={handleSelectRuntime}
        onBack={handleBack}
        onEdit={() => handleEdit()}
        onNavigateToAgent={onNavigateToAgent}
        agentNames={agentNames}
        daemonState={daemonState}
        editing={editing}
        editContent={editing ? (
          <RuntimeCreateView
            onBack={handleCreateBack}
            hosts={hosts}
            editingRuntime={selectedRuntime}
          />
        ) : undefined}
      />
    </div>
  )
}
