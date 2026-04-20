import type { Document, Library, DocumentVersion } from './doc-types'

// ── Libraries ──

export const mockLibraries: Library[] = [
  {
    id: 'lib-1',
    name: 'API Specs',
    parentId: null,
    description: 'API design specifications and contracts',
    createdAt: '2026-03-10',
    updatedAt: '2026-04-11',
    createdBy: 'Adam',
  },
  {
    id: 'lib-1a',
    name: 'REST Endpoints',
    parentId: 'lib-1',
    description: 'REST API endpoint documentation',
    createdAt: '2026-03-12',
    updatedAt: '2026-04-09',
    createdBy: 'Adam',
  },
  {
    id: 'lib-1b',
    name: 'WebSocket Events',
    parentId: 'lib-1',
    createdAt: '2026-03-15',
    updatedAt: '2026-04-06',
    createdBy: 'Adam',
  },
  {
    id: 'lib-2',
    name: 'Architecture',
    parentId: null,
    description: 'System architecture and design decisions',
    createdAt: '2026-02-20',
    updatedAt: '2026-04-12',
    createdBy: 'Adam',
  },
  {
    id: 'lib-3',
    name: 'Runbooks',
    parentId: null,
    description: 'Operational runbooks and incident procedures',
    createdAt: '2026-01-15',
    updatedAt: '2026-04-08',
    createdBy: 'Sarah',
  },
  {
    id: 'lib-4',
    name: 'Onboarding',
    parentId: null,
    description: 'New team member onboarding guides',
    createdAt: '2026-03-01',
    updatedAt: '2026-04-05',
    createdBy: 'Mike',
  },
]

// ── Documents ──

export const mockDocuments: Document[] = [
  // API Specs > REST Endpoints
  {
    id: 'doc-1',
    title: 'Endpoint Naming Conventions',
    content: `# Endpoint Naming Conventions

## Overview

All REST endpoints follow a consistent naming pattern to ensure discoverability and predictability across the API surface.

## Rules

### 1. Resource-Based URLs

Use plural nouns for resource collections:

\`\`\`
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:id
PATCH  /api/workspaces/:id
DELETE /api/workspaces/:id
\`\`\`

### 2. Nested Resources

Limit nesting to one level. Use query params for deeper filtering:

\`\`\`
GET /api/workspaces/:id/tasks          ✅ one level
GET /api/tasks?workspace=:id&status=open ✅ query params
GET /api/workspaces/:id/tasks/:tid/comments ❌ too deep
\`\`\`

### 3. Actions as Sub-Resources

Non-CRUD operations use verb sub-resources:

\`\`\`
POST /api/tasks/:id/assign
POST /api/merge-requests/:id/merge
POST /api/documents/:id/restore
\`\`\`

## Status Codes

| Code | Usage |
|------|-------|
| 200 | Successful read/update |
| 201 | Successful create |
| 204 | Successful delete |
| 400 | Validation error |
| 404 | Resource not found |
| 409 | Conflict (e.g., stale version) |
| 422 | Semantic error |

## Versioning

API version is set via the \`X-API-Version\` header, not the URL path.`,
    contentType: 'markdown',
    category: 'spec',
    status: 'active',
    version: 4,
    tags: ['api', 'rest', 'conventions'],
    libraryId: 'lib-1a',
    createdAt: '2026-03-12',
    updatedAt: '2026-04-11',
    createdBy: 'Adam',
    linkedDocIds: ['doc-2'],
    linkedTaskIds: ['SF-102'],
    linkedMRIds: [],
    agentSessionId: undefined,
  },
  {
    id: 'doc-2',
    title: 'Authentication Flow',
    content: `# Authentication Flow

## Token Lifecycle

1. Client sends credentials to \`POST /api/auth/login\`
2. Server returns JWT access token (15m) + refresh token (7d)
3. Client includes access token in \`Authorization: Bearer <token>\`
4. On 401, client uses refresh token at \`POST /api/auth/refresh\`

## Token Format

\`\`\`json
{
  "sub": "user-id",
  "workspace": "ws-id",
  "role": "admin",
  "exp": 1714567890
}
\`\`\`

## API Key Authentication

For agent-to-agent and CI/CD authentication:

\`\`\`
Authorization: Bearer sf_key_<workspace>_<hash>
\`\`\`

API keys are scoped to a workspace and have configurable permissions.`,
    contentType: 'markdown',
    category: 'spec',
    status: 'active',
    version: 3,
    tags: ['api', 'auth', 'security'],
    libraryId: 'lib-1a',
    createdAt: '2026-03-14',
    updatedAt: '2026-04-09',
    createdBy: 'Adam',
    linkedDocIds: ['doc-1'],
    linkedTaskIds: [],
    linkedMRIds: ['MR-03'],
  },
  // API Specs > WebSocket Events
  {
    id: 'doc-3',
    title: 'Real-time Event Protocol',
    content: `# Real-time Event Protocol

## Connection

WebSocket endpoint: \`wss://api.stoneforge.dev/ws?workspace=<id>\`

## Event Format

\`\`\`json
{
  "type": "task.updated",
  "payload": { "id": "SF-123", "status": "in_review" },
  "timestamp": "2026-04-06T10:30:00Z",
  "actor": "agent:director-alpha"
}
\`\`\`

## Event Types

- \`task.*\` — Task lifecycle events
- \`mr.*\` — Merge request events
- \`agent.*\` — Agent status changes
- \`ci.*\` — CI/CD run updates
- \`document.*\` — Document changes

## Subscriptions

Subscribe to specific channels:

\`\`\`json
{ "action": "subscribe", "channels": ["task.*", "mr.*"] }
\`\`\``,
    contentType: 'markdown',
    category: 'spec',
    status: 'active',
    version: 2,
    tags: ['api', 'websocket', 'real-time'],
    libraryId: 'lib-1b',
    createdAt: '2026-03-15',
    updatedAt: '2026-04-06',
    createdBy: 'Adam',
    linkedDocIds: [],
    linkedTaskIds: [],
    linkedMRIds: [],
  },
  // Architecture
  {
    id: 'doc-4',
    title: 'Agent Orchestration Architecture',
    content: `# Agent Orchestration Architecture

## Overview

Stoneforge uses a hierarchical agent model: **Directors** orchestrate **Workers** to execute tasks, while **Stewards** handle reviews and quality gates.

## Agent Hierarchy

\`\`\`
Director (1 per workspace)
├── Worker Pool (N ephemeral)
│   ├── Worker A → Task SF-101
│   └── Worker B → Task SF-102
└── Steward Pool (M persistent)
    ├── Merge Steward → MR reviews
    └── Recovery Steward → Error handling
\`\`\`

## Communication

Agents communicate through the **Director Panel** — a structured message protocol that supports:

- Natural language instructions
- Tool use blocks (with input/output)
- Plan proposals (checklist format)
- Status updates

## Decision: Why Not Flat Agents?

**Decision date:** 2026-02-25
**Decided by:** Adam, Sarah

We evaluated flat (peer-to-peer) agent architectures but chose hierarchical because:
1. Directors provide consistent task decomposition
2. Workers are stateless and cheap to spin up/down
3. Stewards enforce quality without blocking workers
4. Resource allocation is centralized and predictable

See also: ADR-003 in the decision log.`,
    contentType: 'markdown',
    category: 'explanation',
    status: 'active',
    version: 6,
    tags: ['architecture', 'agents', 'orchestration'],
    libraryId: 'lib-2',
    createdAt: '2026-02-20',
    updatedAt: '2026-04-12',
    createdBy: 'Adam',
    linkedDocIds: ['doc-5'],
    linkedTaskIds: ['SF-105', 'SF-108'],
    linkedMRIds: [],
  },
  {
    id: 'doc-5',
    title: 'Database Schema Design',
    content: `# Database Schema Design

## Overview

Stoneforge uses PostgreSQL with a multi-tenant schema. Each workspace gets isolated data via row-level security (RLS).

## Core Tables

| Table | Purpose |
|-------|---------|
| workspaces | Workspace metadata |
| elements | Universal entity store (tasks, docs, etc.) |
| dependencies | Relationships between elements |
| events | Audit log / activity stream |
| agents | Agent configuration |
| sessions | Agent execution sessions |

## Element Model

All domain objects (tasks, documents, libraries) are stored as \`elements\` with a \`type\` discriminator:

\`\`\`sql
CREATE TABLE elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
\`\`\`

This enables cross-type queries and generic relationship tracking.`,
    contentType: 'markdown',
    category: 'reference',
    status: 'active',
    version: 3,
    tags: ['architecture', 'database', 'schema'],
    libraryId: 'lib-2',
    createdAt: '2026-02-22',
    updatedAt: '2026-04-10',
    createdBy: 'Sarah',
    linkedDocIds: ['doc-4'],
    linkedTaskIds: [],
    linkedMRIds: ['MR-01'],
  },
  // Runbooks
  {
    id: 'doc-6',
    title: 'Incident Response Playbook',
    content: `# Incident Response Playbook

## Severity Levels

| Level | Response Time | Example |
|-------|--------------|---------|
| P0 | 15 min | Full outage |
| P1 | 1 hour | Major feature broken |
| P2 | 4 hours | Degraded performance |
| P3 | Next business day | Minor bug |

## Steps

### 1. Acknowledge

- Post in #incidents Slack channel
- Assign incident commander
- Start incident document (use this template)

### 2. Investigate

- Check Grafana dashboards
- Review recent deploys
- Check agent activity logs

### 3. Mitigate

- Roll back if deploy-related
- Scale resources if load-related
- Disable affected agent if agent-related

### 4. Resolve & Retrospect

- Confirm resolution with monitoring
- Write post-mortem within 48 hours
- Create follow-up tasks in Stoneforge`,
    contentType: 'markdown',
    category: 'runbook',
    status: 'active',
    version: 2,
    tags: ['ops', 'incident', 'runbook'],
    libraryId: 'lib-3',
    createdAt: '2026-01-15',
    updatedAt: '2026-04-08',
    createdBy: 'Sarah',
    linkedDocIds: ['doc-7'],
    linkedTaskIds: [],
    linkedMRIds: [],
  },
  {
    id: 'doc-7',
    title: 'Deploy Rollback Procedure',
    content: `# Deploy Rollback Procedure

## When to Roll Back

- Error rate > 5% in the last 5 minutes
- P0 latency spike (>2s p99)
- Agent sessions failing to start

## Steps

1. Identify the bad deploy:
   \`\`\`bash
   sf deploys list --last 5
   \`\`\`

2. Roll back:
   \`\`\`bash
   sf deploys rollback --to <deploy-id>
   \`\`\`

3. Verify:
   - Check health endpoint: \`curl https://api.stoneforge.dev/health\`
   - Confirm error rate dropping in Grafana
   - Verify agent sessions reconnecting

4. Notify in #incidents that rollback is complete.`,
    contentType: 'markdown',
    category: 'runbook',
    status: 'active',
    version: 1,
    tags: ['ops', 'deploy', 'rollback'],
    libraryId: 'lib-3',
    createdAt: '2026-02-10',
    updatedAt: '2026-03-20',
    createdBy: 'Sarah',
    linkedDocIds: ['doc-6'],
    linkedTaskIds: [],
    linkedMRIds: [],
  },
  // Onboarding
  {
    id: 'doc-8',
    title: 'Getting Started with Stoneforge',
    content: `# Getting Started with Stoneforge

Welcome! This guide will help you set up your development environment and ship your first task.

## Prerequisites

- Node.js 20+
- Docker Desktop
- Git
- A Stoneforge workspace invite

## Setup

1. Clone the monorepo:
   \`\`\`bash
   git clone git@github.com:toolco/stoneforge.git
   cd stoneforge
   pnpm install
   \`\`\`

2. Start the local stack:
   \`\`\`bash
   pnpm dev
   \`\`\`

3. Open the dashboard at \`http://localhost:5173\`

## Your First Task

1. Open the **Tasks** board (⌘1)
2. Find a task tagged \`good-first-issue\`
3. Click "Start" to assign yourself
4. The Director will guide you through the implementation

## Key Concepts

- **Tasks** are the unit of work
- **Directors** orchestrate your tasks using AI agents
- **Merge Requests** flow through automated review
- **Documents** store your specs, runbooks, and decisions`,
    contentType: 'markdown',
    category: 'tutorial',
    status: 'active',
    version: 5,
    tags: ['onboarding', 'setup', 'getting-started'],
    libraryId: 'lib-4',
    createdAt: '2026-03-01',
    updatedAt: '2026-04-05',
    createdBy: 'Mike',
    linkedDocIds: [],
    linkedTaskIds: [],
    linkedMRIds: [],
  },
  // Top-level (no library)
  {
    id: 'doc-9',
    title: 'Q2 2026 Roadmap',
    content: `# Q2 2026 Roadmap

## Theme: Developer Experience

### April
- [ ] Ship Documents v2 (block editor, library hierarchy)
- [ ] Agent pool auto-scaling
- [x] Merge Steward GA

### May
- [ ] Preview environments for branches
- [ ] CI/CD YAML editor in dashboard
- [ ] Director multi-workspace support

### June
- [ ] Public API v2 (breaking changes)
- [ ] Plugin SDK beta
- [ ] Performance audit & optimization sprint`,
    contentType: 'markdown',
    category: 'prd',
    status: 'active',
    version: 3,
    tags: ['roadmap', 'planning', 'q2-2026'],
    libraryId: null,
    createdAt: '2026-03-28',
    updatedAt: '2026-04-13',
    createdBy: 'Adam',
    linkedDocIds: [],
    linkedTaskIds: ['SF-101', 'SF-105'],
    linkedMRIds: [],
  },
  {
    id: 'doc-10',
    title: 'ADR-003: Hierarchical Agent Model',
    content: `# ADR-003: Hierarchical Agent Model

**Status:** Accepted
**Date:** 2026-02-25
**Authors:** Adam, Sarah

## Context

We need to decide how agents coordinate work within a workspace. Two approaches were considered:

1. **Flat:** All agents are peers, communicating via a shared message bus
2. **Hierarchical:** Directors manage Workers and Stewards in a tree

## Decision

We chose the **hierarchical model**.

## Consequences

**Positive:**
- Clear ownership of task decomposition (Director)
- Workers are stateless → easy to scale
- Stewards are isolated quality gates

**Negative:**
- Single point of failure if Director errors
- More complex orchestration logic
- Director token budget limits parallelism`,
    contentType: 'markdown',
    category: 'decision-log',
    status: 'active',
    version: 1,
    tags: ['adr', 'architecture', 'agents'],
    libraryId: null,
    createdAt: '2026-02-25',
    updatedAt: '2026-02-25',
    createdBy: 'Adam',
    linkedDocIds: ['doc-4'],
    linkedTaskIds: [],
    linkedMRIds: [],
  },
  {
    id: 'doc-11',
    title: 'CI Pipeline Config Reference',
    content: `{
  "version": "2.0",
  "pipelines": {
    "default": {
      "stages": ["lint", "test", "build", "deploy"],
      "triggers": {
        "push": { "branches": ["main", "develop"] },
        "pull_request": { "branches": ["main"] }
      }
    },
    "nightly": {
      "stages": ["test", "e2e", "security-scan"],
      "triggers": {
        "cron": "0 2 * * *"
      }
    }
  },
  "agents": {
    "builder": { "image": "node:20-alpine", "memory": "4Gi" },
    "tester": { "image": "playwright:latest", "memory": "8Gi" }
  }
}`,
    contentType: 'json',
    category: 'reference',
    status: 'active',
    version: 2,
    tags: ['ci', 'config', 'reference'],
    libraryId: null,
    createdAt: '2026-03-05',
    updatedAt: '2026-04-01',
    createdBy: 'Sarah',
    linkedDocIds: [],
    linkedTaskIds: [],
    linkedMRIds: [],
  },
  {
    id: 'doc-12',
    title: 'Sprint Retrospective 2026-W14',
    content: `# Sprint Retrospective — Week 14, 2026

## What Went Well
- Merge Steward caught 3 regressions before human review
- CI pipeline time reduced from 8m → 4m after caching improvements
- Documents v2 prototype approved by stakeholders

## What Could Improve
- Agent error rate spiked on Tuesday (API rate limit not handled gracefully)
- Too many in-progress tasks (WIP limit was 5, actual was 9)
- Need better visibility into agent token usage

## Action Items
- [ ] Add rate limit retry logic to agent SDK — SF-110
- [ ] Enforce WIP limit in board UI — SF-111
- [ ] Add token usage dashboard to metrics page — SF-112`,
    contentType: 'markdown',
    category: 'meeting-notes',
    status: 'active',
    version: 1,
    tags: ['retro', 'sprint', 'team'],
    libraryId: null,
    createdAt: '2026-04-04',
    updatedAt: '2026-04-04',
    createdBy: 'Mike',
    linkedDocIds: [],
    linkedTaskIds: ['SF-110', 'SF-111', 'SF-112'],
    linkedMRIds: [],
  },
]

// ── Version History (for doc-1 as example) ──

export const mockVersions: Record<string, DocumentVersion[]> = {
  'doc-1': [
    { version: 4, updatedAt: '2026-04-11', updatedBy: 'Adam', title: 'Endpoint Naming Conventions', content: mockDocuments.find(d => d.id === 'doc-1')!.content, contentPreview: 'Updated status codes table' },
    { version: 3, updatedAt: '2026-04-02', updatedBy: 'Director Alpha', title: 'Endpoint Naming Conventions', content: `# Endpoint Naming Conventions\n\n## Overview\n\nAll REST endpoints follow a consistent naming pattern.\n\n## Rules\n\n### 1. Resource-Based URLs\n\nUse plural nouns for resource collections:\n\n\`\`\`\nGET    /api/workspaces\nPOST   /api/workspaces\nGET    /api/workspaces/:id\n\`\`\`\n\n### 2. Nested Resources\n\nLimit nesting to one level.\n\n### 3. Actions as Sub-Resources\n\nNon-CRUD operations use verb sub-resources:\n\n\`\`\`\nPOST /api/tasks/:id/assign\nPOST /api/merge-requests/:id/merge\n\`\`\``, contentPreview: 'Added versioning section' },
    { version: 2, updatedAt: '2026-03-20', updatedBy: 'Adam', title: 'Endpoint Naming Conventions', content: `# Endpoint Naming Conventions\n\n## Overview\n\nAll REST endpoints follow a consistent naming pattern.\n\n## Rules\n\n### 1. Resource-Based URLs\n\nUse plural nouns for resource collections:\n\n\`\`\`\nGET    /api/workspaces\nPOST   /api/workspaces\n\`\`\``, contentPreview: 'Added nested resources' },
    { version: 1, updatedAt: '2026-03-12', updatedBy: 'Adam', title: 'Endpoint Naming Conventions', content: `# Endpoint Naming Conventions\n\n## Overview\n\nAll REST endpoints follow a consistent naming pattern to ensure discoverability and predictability across the API surface.`, contentPreview: 'Initial draft' },
  ],
  'doc-4': [
    { version: 6, updatedAt: '2026-04-12', updatedBy: 'Adam', title: 'Agent Orchestration Architecture', content: mockDocuments.find(d => d.id === 'doc-4')!.content, contentPreview: 'Updated diagram' },
    { version: 5, updatedAt: '2026-04-01', updatedBy: 'Director Alpha', title: 'Agent Orchestration Architecture', content: `# Agent Orchestration Architecture\n\n## Overview\n\nStoneforge uses a hierarchical agent model: **Directors** orchestrate **Workers** to execute tasks, while **Stewards** handle reviews and quality gates.\n\n## Agent Hierarchy\n\n\`\`\`\nDirector (1 per workspace)\n├── Worker Pool (N ephemeral)\n└── Steward Pool (M persistent)\n\`\`\`\n\n## Communication\n\nAgents communicate through the **Director Panel**.`, contentPreview: 'Added steward details' },
    { version: 4, updatedAt: '2026-03-20', updatedBy: 'Sarah', title: 'Agent Orchestration Architecture', content: `# Agent Orchestration Architecture\n\n## Overview\n\nStoneforge uses a hierarchical agent model: **Directors** orchestrate **Workers** to execute tasks.\n\n## Agent Hierarchy\n\n\`\`\`\nDirector (1 per workspace)\n├── Worker Pool (N ephemeral)\n└── Steward Pool (M persistent)\n\`\`\``, contentPreview: 'Decision section added' },
    { version: 3, updatedAt: '2026-03-10', updatedBy: 'Adam', title: 'Agent Orchestration Architecture', content: `# Agent Orchestration Architecture\n\n## Overview\n\nStoneforge uses a hierarchical agent model.\n\n## Communication\n\nAgents communicate through the **Director Panel** — a structured message protocol.`, contentPreview: 'Communication protocol' },
    { version: 2, updatedAt: '2026-02-28', updatedBy: 'Adam', title: 'Agent Orchestration Architecture', content: `# Agent Orchestration Architecture\n\n## Overview\n\nStoneforge uses a hierarchical agent model.\n\n## Agent Hierarchy\n\n\`\`\`\nDirector → Workers → Stewards\n\`\`\``, contentPreview: 'Added hierarchy diagram' },
    { version: 1, updatedAt: '2026-02-20', updatedBy: 'Adam', title: 'Agent Orchestration Architecture', content: `# Agent Orchestration Architecture\n\n## Overview\n\nStoneforge uses a hierarchical agent model: Directors orchestrate Workers to execute tasks.`, contentPreview: 'Initial overview' },
  ],
}
