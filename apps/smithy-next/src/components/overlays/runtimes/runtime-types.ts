// ── Host (a machine or cloud provider connected to the workspace) ──

export type HostStatus = 'online' | 'offline' | 'error'
export type TunnelStatus = 'connected' | 'reconnecting' | 'disconnected'
export type SandboxProvider = 'stoneforge' | 'e2b' | 'daytona' | 'modal' | 'fly'
export type SandboxTier = 'small' | 'medium' | 'large' | 'gpu'

export interface Host {
  id: string
  name: string
  status: HostStatus
  managed: boolean                    // true = cloud provider, false = user-managed machine
  // User-managed host fields
  tunnelStatus?: TunnelStatus         // only for managed=false
  os?: string                         // "macOS 15.3", "Ubuntu 24.04"
  arch?: string                       // "arm64", "x86_64"
  // Cloud provider fields
  provider?: SandboxProvider          // only for managed=true
  region?: string                     // "us-east-1"
  defaultTier?: SandboxTier           // default sandbox size
  activeSandboxCount?: number         // current running sandboxes
  // Shared
  capabilities: string[]              // ['docker', 'sandbox', 'gpu:a100']
  lastSeen: string
  registeredAt: string
}

// ── Runtime (an execution environment on a Host) ──

export type RuntimeMode = 'worktrees' | 'docker' | 'sandbox'
export type RuntimeStatus = 'online' | 'offline' | 'error' | 'provisioning'

export interface Runtime {
  id: string
  name: string
  hostId: string                      // references Host.id
  mode: RuntimeMode
  isDefault: boolean
  status: RuntimeStatus
  statusMessage?: string
  createdAt: string
  lastHealthCheck?: string
  // Mode-specific config
  worktreePath?: string               // mode=worktrees
  dockerImage?: string                // mode=docker
  sandboxTier?: SandboxTier           // mode=sandbox
  sandboxBaseImage?: string           // mode=sandbox (optional override)
  // Metrics
  assignedAgentCount: number
  assignedAgentIds: string[]
  cpu?: number
  memory?: string
  disk?: string
}

// ── Filter / Sort / Group ──

export type RuntimeFilterField = 'mode' | 'status' | 'host'
export interface RuntimeActiveFilter { field: RuntimeFilterField; value: string }
export type RuntimeSortField = 'name' | 'status' | 'agents' | 'created'
export type RuntimeGroupField = 'mode' | 'status' | 'host' | 'none'

// ── Labels & Colors ──

export const runtimeModeLabels: Record<RuntimeMode, string> = {
  worktrees: 'Worktree',
  docker: 'Docker',
  sandbox: 'Sandbox',
}

export const runtimeModeColors: Record<RuntimeMode, { bg: string; text: string }> = {
  worktrees: { bg: 'rgba(34, 197, 94, 0.1)', text: '#22c55e' },
  docker: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
  sandbox: { bg: 'rgba(168, 85, 247, 0.1)', text: '#a855f7' },
}

export const runtimeStatusColors: Record<RuntimeStatus, string> = {
  online: 'var(--color-success)',
  offline: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)',
  provisioning: 'var(--color-warning)',
}

export const hostStatusColors: Record<HostStatus, string> = {
  online: 'var(--color-success)',
  offline: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)',
}

export const tunnelStatusColors: Record<TunnelStatus, string> = {
  connected: 'var(--color-success)',
  reconnecting: 'var(--color-warning)',
  disconnected: 'var(--color-text-tertiary)',
}

export const sandboxTierLabels: Record<SandboxTier, string> = {
  small: 'Small (2 vCPU, 4 GB)',
  medium: 'Medium (4 vCPU, 8 GB)',
  large: 'Large (8 vCPU, 16 GB)',
  gpu: 'GPU (4 vCPU, 16 GB, A10G)',
}
