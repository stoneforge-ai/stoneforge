# Unified Runtime Architecture

## Status: Spec — ready for prototype implementation, then production engineering

## Problem

The current runtime system conflates two independent concerns into a single `RuntimeType`:

```
RuntimeType = 'local' | 'local-docker' | 'remote-ssh'
```

- `local` = your machine + worktree execution
- `local-docker` = your machine + Docker execution
- `remote-ssh` = someone else's machine + worktree or Docker execution

This means adding a new execution mode (e.g., sandboxed containers) requires a new type per location (`local-sandbox`, `remote-sandbox`), and adding a new connectivity method requires duplicating all execution modes. It also bakes SSH-specific configuration (commands, remote paths) into the runtime model, coupling transport to execution.

The dispatch daemon further complicates this — it needs a "machine to run on" but doesn't use the runtime's execution config (worktree, Docker). The daemon cares about the host, not the runtime.

## Solution: Hosts + Runtimes

Separate the model into two orthogonal concepts:

**Host** — A physical or virtual machine connected to the workspace. All hosts are peers connected via a persistent tunnel (Tailscale, WireGuard, or Stoneforge's own tunnel agent). From the daemon's perspective, your Mac Mini in the office and an EC2 instance are identical — both are "connected hosts."

**Runtime** — An execution environment configured on a specific host. Defines HOW agents run (worktree, Docker, sandbox), not WHERE the machine is. A single host can have multiple runtimes (e.g., one worktree runtime and one Docker runtime on the same machine).

```
Host (machine)          Runtime (execution config)
├─ adam-macbook     ──→ ├─ my-macbook (worktree)
│                       └─ docker-sandbox (docker)
├─ staging-1        ──→ └─ staging-worktree (worktree)
└─ gpu-rack-3       ──→ └─ gpu-docker (docker)
```

## Data Model

### Host

```typescript
type HostStatus = 'online' | 'offline' | 'error'
type TunnelStatus = 'connected' | 'reconnecting' | 'disconnected'
type SandboxProvider = 'stoneforge' | 'e2b' | 'daytona'
type SandboxTier = 'small' | 'medium' | 'large' | 'gpu'

interface Host {
  id: string
  name: string                      // "adam-macbook", "staging-1", "Stoneforge Cloud"
  status: HostStatus
  managed: boolean                  // true = cloud provider, false = user-managed machine
  // User-managed host fields
  tunnelStatus?: TunnelStatus       // only for managed=false
  os?: string                       // "macOS 15.3", "Ubuntu 24.04"
  arch?: string                     // "arm64", "x86_64"
  // Cloud provider fields
  provider?: SandboxProvider        // only for managed=true
  region?: string                   // "us-east-1"
  defaultTier?: SandboxTier         // default sandbox size
  activeSandboxCount?: number       // currently running sandboxes
  // Shared
  capabilities: string[]            // ['docker', 'sandbox', 'gpu:a100']
  lastSeen: string
  registeredAt: string
}
```

**Key properties:**
- **`managed`** distinguishes user-managed machines from cloud providers. Cloud providers don't have tunnel status, OS, or arch — they have provider type, region, and sandbox counts.
- **User-managed hosts**: connected via persistent tunnel agent. Status derived from tunnel health + heartbeat. Capabilities auto-detected on registration.
- **Cloud provider hosts**: connected via API. Status derived from API reachability + quota availability. Sandboxes are ephemeral — they boot, connect via tunnel, do work, and are destroyed.
- `capabilities` gates mode availability: `docker` for Docker mode, `sandbox` for Sandbox mode. Cloud providers can support both.
- No SSH config. No IP addresses. Connectivity is the tunnel agent's responsibility (user-managed) or the provider API's responsibility (cloud).

### Runtime

```typescript
type RuntimeMode = 'worktrees' | 'docker' | 'sandbox'
type RuntimeStatus = 'online' | 'offline' | 'error' | 'provisioning'

interface Runtime {
  id: string
  name: string
  hostId: string                    // references Host.id
  mode: RuntimeMode
  isDefault: boolean
  status: RuntimeStatus
  statusMessage?: string
  createdAt: string
  lastHealthCheck?: string

  // Mode-specific config — only one set populated per runtime
  worktreePath?: string             // mode=worktrees: path to .stoneforge/worktrees
  dockerImage?: string              // mode=docker: container image
  sandboxTier?: SandboxTier         // mode=sandbox: resource allocation (small/medium/large/gpu)
  sandboxBaseImage?: string         // mode=sandbox: optional base image override

  // Metrics
  assignedAgentCount: number
  assignedAgentIds: string[]
  cpu?: number
  memory?: string
  disk?: string
}
```

**Key properties:**
- `hostId` is the only link to where this runtime executes. No SSH fields, no "local" vs "remote" distinction.
- `status` is derived from the host's status + the runtime's own health. If the host is offline, all its runtimes are offline.
- `mode` determines which config fields are relevant and which icon/label to display.

### Dispatch Daemon

```typescript
interface WorkspaceDaemonState {
  hostId: string                    // which Host the daemon runs on (NOT a runtime)
  status: 'running' | 'stopped' | 'error'
  startedAt?: string
  uptimeSeconds?: number
}
```

**Key decision:** The daemon targets a Host, not a Runtime. The daemon is an orchestration process — it needs a machine to stay alive on, but it doesn't execute in a worktree or Docker container. It uses the host's connectivity (the tunnel) but ignores runtime-level execution config.

## Connectivity: Tunnel Agent

Every host runs a lightweight tunnel agent that:

1. **Registers** the host with the workspace on first run
2. **Maintains** a persistent encrypted tunnel back to the workspace control plane
3. **Reports** heartbeats, OS info, architecture, and capabilities (e.g., Docker available, GPU present)
4. **Accepts** dispatched work from the daemon through the tunnel

### Registration flow

```bash
# On any machine — laptop, server, VM, container host:
stoneforge host connect --workspace ws-1 --name staging-1

# Agent starts, detects capabilities, establishes tunnel.
# Host appears in workspace UI automatically.
```

### Reachability model

All hosts are equal peers. A Mac Mini on a home network and an EC2 instance in us-east-1 both connect outbound to the control plane. The daemon dispatches work through these tunnels — it never needs to SSH into anything.

If a host's tunnel drops (laptop lid closed, network outage), the host transitions to `tunnelStatus: 'reconnecting'` → `'disconnected'` after a timeout. The daemon marks it offline and reschedules work to other available hosts.

### Why not SSH?

SSH requires the daemon (or control plane) to reach the host directly — inbound connectivity. This breaks for:
- Laptops behind NAT/firewalls
- Machines on private networks without public IPs
- Environments where inbound SSH is a security concern

Outbound tunnels invert this: the host reaches out, the control plane never needs to reach in. This is the same model used by Tailscale, Cloudflare Tunnel, and ngrok.

## Agent ↔ Runtime Relationship

Agents reference runtimes, not hosts directly:

```
Agent.runtimeId → Runtime.hostId → Host
```

When the daemon dispatches a task to an agent, it:
1. Looks up the agent's assigned runtime
2. Resolves the runtime's host
3. Sends the work through the host's tunnel
4. The tunnel agent on the host starts the agent process in the appropriate mode (worktree checkout, Docker container, or sandbox)

## Dispatch Daemon Behavior

### Single daemon per workspace

One daemon runs per workspace. It runs on a designated host. Changing the daemon host requires explicit action (with a confirmation dialog, since it interrupts running workflows).

### Daemon host vs. runtime hosts

The daemon host is where the daemon *process* runs. Agent runtimes are where agent *work* runs. These can be different machines:

```
Daemon: runs on staging-1
Agents: dispatched to staging-1 (worktree), gpu-rack-3 (docker), adam-macbook (worktree)
```

### Tag-based dispatch scoping

For users who want personal experimentation alongside team automation:

1. Create a runtime on your laptop
2. Define an agent with a capability tag (e.g., `local:adam`)
3. Tell the director: "tag tasks with `local:adam`"
4. The daemon dispatches `local:adam`-tagged tasks only to agents with that tag, which run on your laptop's runtime

No second daemon needed. The workspace's single daemon handles all dispatch — tags route work to the right agents/runtimes.

## UI: Runtime Create Flow (Mode-First)

The create flow uses a **mode-first** approach: choose the execution mode, then select a compatible host. This naturally filters the host list — sandboxes only show cloud providers, worktrees only show user-managed machines, Docker shows both.

### Step 1: Name

Standard name input.

### Step 2: Select Mode

Three mode cards with color-coded accents:

| Mode | Color | Description | Config |
|------|-------|-------------|--------|
| **Worktree** | Green | Git worktrees on the host filesystem | Worktree path |
| **Docker** | Blue | Docker containers on the host | Docker image |
| **Sandbox** | Purple | Ephemeral cloud environments, provisioned on demand | Tier selector (Small/Medium/Large/GPU) + optional base image |

### Step 3: Select Host (filtered by mode)

The host list is filtered based on the selected mode:

- **Worktree** → only user-managed hosts (`managed: false`)
- **Docker** → user-managed hosts with `docker` capability + cloud providers with `docker` capability
- **Sandbox** → only cloud providers with `sandbox` capability

Each host card shows:
- **User-managed**: Monitor icon, name, status dot, tunnel status, OS · arch · capabilities
- **Cloud provider**: Cloud icon, name, status dot, region · active sandbox count

Changing mode automatically selects the first compatible host.

### Step 4: Mode-specific config

- **Worktree**: Worktree path input (default: `.stoneforge/worktrees`)
- **Docker**: Docker image input (default: `ghcr.io/stoneforge/worker:latest`)
- **Sandbox**: Tier selector (4 cards: Small/Medium/Large/GPU with resource descriptions) + optional base image override

### In edit mode

Mode can be changed. Host is pre-filled and read-only (changing host = create new runtime). Mode-specific config is editable.

## UI: Runtimes List

The runtime list shows a flat list of runtimes with host information inline:

```
staging-worktree    Worktree   staging-1    ● Online    0 agents
my-macbook          Worktree   adam-macbook ● Online    3 agents   default
docker-sandbox      Docker     adam-macbook ● Online    1 agent
gpu-docker          Docker     gpu-rack-3   ○ Offline   2 agents
```

Each row shows: name, mode badge, host name, status, agent count.

### Grouping

Users can group by:
- **Mode** (Worktree / Docker / Sandbox)
- **Host** (adam-macbook / staging-1 / gpu-rack-3)
- **Status** (Online / Offline / Error)
- **None** (flat list, default)

### Daemon section

At the top of the list, above all runtimes:

```
Dispatch Daemon  ● Running  Up 30 min ago
Host: staging-1  [Change host]
```

The "Change host" dropdown shows **hosts** (not runtimes). Selecting a different host triggers a confirmation dialog warning that it will interrupt running workflows.

## UI: Runtime Detail

The configuration section shows:
- **Mode**: Worktree / Docker
- **Host**: {host name} — {os} {arch}
- **Worktree Path** or **Docker Image** (mode-specific)
- **Created**: timestamp
- **Last Health Check**: timestamp

No SSH fields. No "Created by" attribution.

When viewing the daemon host's runtime, a "Dispatch Daemon" info section appears showing daemon status and uptime.

## Migration from Current Model

### Type mapping

| Old `RuntimeType` | New `RuntimeMode` | New `Host` |
|---|---|---|
| `local` | `worktree` | Host representing the local machine |
| `local-docker` | `docker` | Same host as local |
| `remote-ssh` | `worktree` or `docker` | Host representing the remote machine |

### Field mapping

| Old field | New location |
|---|---|
| `type: RuntimeType` | `mode: RuntimeMode` |
| `localWorktreePath` | `worktreePath` (on Runtime) |
| `dockerImage` | `dockerImage` (on Runtime, unchanged) |
| `sshCommand` | Removed — tunnel handles connectivity |
| `sshWorktreePath` | `worktreePath` (on Runtime) |
| `sshUseDocker` | Removed — `mode` field determines this |
| `daemonState.hostRuntimeId` | `daemonState.hostId` (references Host, not Runtime) |

### Removed concepts

- **"Local" vs "Remote"**: All hosts are tunnel-connected peers.
- **SSH configuration**: No SSH commands, remote paths, or "use Docker on remote" toggles.
- **Personal/Shared scope**: All runtimes in a team workspace are shared. Individual experimentation is handled via tag-based dispatch scoping, not runtime-level access control.
- **Creator attribution**: Not displayed in runtime UI. Audit-log concern only.

## Sandbox Mode: Cloud Provider Architecture

Sandbox mode uses **managed cloud hosts** — hosts where `managed: true`. These represent cloud providers (Stoneforge Cloud, E2B, Daytona) rather than physical machines.

### Lifecycle

1. Daemon decides to dispatch a task to a sandbox runtime
2. Daemon calls the cloud provider API: "create an environment with tier X and optional base image Y"
3. Provider spins up an ephemeral sandbox (microVM, cloud container, etc.)
4. The sandbox boots a Stoneforge agent process that connects back via an ephemeral tunnel
5. Agent does its work, reports results through the tunnel
6. Sandbox is destroyed

### Connectivity

Cloud sandboxes **do use tunnels** — but they're ephemeral. The sandbox boots, connects, does work, disconnects, dies. The tunnel agent is baked into the sandbox image. This keeps the connectivity model uniform across all hosts.

### Adding a cloud provider

```bash
stoneforge provider connect --name "Stoneforge Cloud" --provider stoneforge --region us-east-1 --api-key sk-...
```

The provider appears as a managed Host. When the daemon dispatches to a runtime on this host, it calls the provider API to spin up a sandbox. Host status for cloud providers: `online` = API reachable + quota available, `error` = API key invalid or quota exceeded, `offline` = provider unreachable.

### Sandbox tiers

Each sandbox runtime specifies a resource tier:
- **Small**: 2 vCPU, 4 GB RAM
- **Medium**: 4 vCPU, 8 GB RAM (default)
- **Large**: 8 vCPU, 16 GB RAM
- **GPU**: 4 vCPU, 16 GB RAM, A10G GPU

Tiers are provider-defined. The optional `sandboxBaseImage` field allows overriding the default sandbox OS image.

## Open Questions

1. **Host management page**: Should hosts have their own management UI (register, deregister, view details), or is the runtime create flow's host selector sufficient? Current recommendation: host selector in create flow + a "Connected Hosts" section in workspace settings.

2. **Host deregistration**: What happens to runtimes when a host is deregistered? Current recommendation: runtimes go to `error` status with message "Host deregistered." They can be deleted or reassigned to a new host.

3. **Cloud Docker**: Cloud providers with `docker` capability could run Docker containers on managed infrastructure (serverless containers like Fly.io or Cloud Run). This is architecturally supported — the provider just needs to accept Docker image + run params instead of sandbox tier. Not yet implemented in the UI.

4. **Tunnel agent packaging**: How is the tunnel agent distributed for user-managed hosts? CLI tool (`stoneforge host connect`), Docker image, system package? Production engineering concern.

4. **Tunnel agent packaging**: How is the tunnel agent distributed? CLI tool (`stoneforge host connect`), Docker image, system package? This is a production engineering concern, not a prototype concern.
