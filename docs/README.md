# Stoneforge Agent Docs

> LLM-optimized documentation for the Stoneforge codebase. Start here to find the right files quickly.

## Quick Navigation

| I want to... | Read | Key Files |
|--------------|------|-----------|
| **Core Types & Collections** |
| Work with tasks | [reference/core-types.md#task](reference/core-types.md#task) | `packages/core/src/types/task.ts` |
| Work with entities | [reference/core-types.md#entity](reference/core-types.md#entity) | `packages/core/src/types/entity.ts` |
| Work with messages | [reference/core-types.md#message](reference/core-types.md#message) | `packages/core/src/types/message.ts` |
| Work with documents | [reference/core-types.md#document](reference/core-types.md#document) | `packages/core/src/types/document.ts` |
| Work with plans, workflows, channels | [reference/core-types.md#collections](reference/core-types.md#collections) | `packages/core/src/types/plan.ts`, etc. |
| Add dependencies | [reference/core-types.md#dependency](reference/core-types.md#dependency) | `packages/quarry/src/services/dependency.ts` |
| **SDK & Services** |
| Use the TypeScript API | [reference/quarry-api.md](reference/quarry-api.md) | `packages/quarry/src/api/quarry-api.ts` |
| Use SDK services | [reference/sdk-services.md](reference/sdk-services.md) | `packages/quarry/src/services/` |
| Understand storage | [reference/storage.md](reference/storage.md) | `packages/storage/src/bun-backend.ts` |
| Configure identity/signing | [reference/identity.md](reference/identity.md) | `packages/quarry/src/systems/identity.ts` |
| Configure the system | [reference/config.md](reference/config.md) | `packages/quarry/src/config/` |
| **Orchestrator** |
| Use the Orchestrator API | [reference/orchestrator-api.md](reference/orchestrator-api.md) | `packages/smithy/src/api/orchestrator-api.ts` |
| Work with orchestrator services | [reference/orchestrator-services.md](reference/orchestrator-services.md) | `packages/smithy/src/services/` |
| Use runtime components | [reference/orchestrator-runtime.md](reference/orchestrator-runtime.md) | `packages/smithy/src/runtime/` |
| Define agent role prompts | [reference/prompts.md](reference/prompts.md) | `packages/smithy/src/prompts/` |
| Define agent role definitions | [reference/orchestrator-services.md#roledefinitionservice](reference/orchestrator-services.md#roledefinitionservice) | `packages/smithy/src/services/role-definition-service.ts` |
| **Platform** |
| Use the CLI | [reference/cli.md](reference/cli.md) | `packages/quarry/src/cli/commands/` |
| Work with platform apps | [reference/platform.md](reference/platform.md) | `apps/quarry-server/`, `apps/quarry-web/`, etc. |
| **How-To Guides** |
| Add an API endpoint | [how-to/add-api-endpoint.md](how-to/add-api-endpoint.md) | `apps/quarry-server/src/index.ts`, `apps/smithy-server/src/routes/` |
| Add a React component | [how-to/add-react-component.md](how-to/add-react-component.md) | `apps/quarry-web/src/components/` |
| Add a new core type | [how-to/add-core-type.md](how-to/add-core-type.md) | `packages/core/src/types/` |
| Add an orchestrator service | [how-to/add-orchestrator-service.md](how-to/add-orchestrator-service.md) | `packages/smithy/src/services/` |
| Work with dependencies | [how-to/work-with-dependencies.md](how-to/work-with-dependencies.md) | `packages/quarry/src/services/dependency.ts` |
| Customize agent prompts | [how-to/customize-agent-prompts.md](how-to/customize-agent-prompts.md) | `.stoneforge/prompts/` |
| Configure identity | [how-to/configure-identity.md](how-to/configure-identity.md) | `packages/quarry/src/systems/identity.ts` |
| Run orchestration tests | [how-to/run-orchestration-tests.md](how-to/run-orchestration-tests.md) | `packages/smithy/src/testing/` |
| **Understanding** |
| Understand event sourcing | [explanation/event-sourcing.md](explanation/event-sourcing.md) | `packages/core/src/types/event.ts` |
| Understand dependencies | [explanation/dependency-system.md](explanation/dependency-system.md) | `packages/quarry/src/services/` |
| Understand agent roles | [explanation/agent-roles.md](explanation/agent-roles.md) | `packages/smithy/src/types/agent.ts` |
| Understand orchestration architecture | [ORCHESTRATION_PLAN.md](ORCHESTRATION_PLAN.md) | - |
| Understand sync/merge | [explanation/sync-and-merge.md](explanation/sync-and-merge.md) | `packages/quarry/src/sync/` |
| Debug issues | [gotchas.md](gotchas.md) | - |

## Architecture Overview

See [ARCHITECTURE.md](ARCHITECTURE.md) for full architecture details.

**Package Dependency Graph:**
```
@stoneforge/core        (shared types, no dependencies)
       ↓
@stoneforge/storage     (SQLite backends)
       ↓
@stoneforge/quarry         (API, services, sync, CLI)
       ↓
@stoneforge/smithy  (agent orchestration)
```

**Dual Storage Model:**
- **SQLite**: Fast cache, queries, indexes
- **JSONL**: Git-tracked source of truth

## File Map (Packages)

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `packages/core/` | Shared types, errors, ID generation | `ElementType`, `Task`, `Entity`, `Document`, `ErrorCode`, `generateId` |
| `packages/storage/` | SQLite storage backends | `createStorage`, `initializeSchema`, `StorageBackend` |
| `packages/quarry/` | Core API, services, sync, CLI | `QuarryAPI`, `createQuarryAPI`, `SyncService`, `InboxService` |
| `packages/ui/` | Shared React UI components, layout, domain, visualizations, hooks, API clients, design tokens | `Button`, `Card`, `Dialog`, `AppShell`, `Sidebar`, `MobileDrawer`, `TaskCard`, `EntityCard`, `ChannelHeader`, `UserSelector`, `TaskStatusBadge`, `StatusPieChart`, `TrendLineChart`, `HorizontalBarChart`, `useTheme`, `useIsMobile`, `useWebSocket`, `useSSEStream`, `useRealtimeEvents`, `useKeyboardShortcut`, `WebSocketClient`, `SSEClient`, `ApiClient` |
| `packages/shared-routes/` | Shared route factories for server apps | `createElementsRoutes`, `createEntityRoutes`, `createChannelRoutes`, `createMessageRoutes`, `createLibraryRoutes`, `createDocumentRoutes`, `createInboxRoutes`, `createPlanRoutes` |
| `packages/smithy/` | Agent orchestration | `OrchestratorAPI`, `AgentRole`, `SpawnerService`, `SessionManager` |

## File Map (@stoneforge/core)

| Concept | Source | Tests |
|---------|--------|-------|
| Task type | `types/task.ts` | `types/task.test.ts` |
| Entity type | `types/entity.ts` | `types/entity.test.ts` |
| Message type | `types/message.ts` | `types/message.test.ts` |
| Document type | `types/document.ts` | `types/document.test.ts` |
| Plan type | `types/plan.ts` | `types/plan.test.ts` |
| Workflow type | `types/workflow.ts` | `types/workflow.test.ts` |
| Channel type | `types/channel.ts` | `types/channel.test.ts` |
| Dependency type | `types/dependency.ts` | `types/dependency.test.ts` |
| Event type | `types/event.ts` | `types/event.test.ts` |
| Inbox type | `types/inbox.ts` | `types/inbox.test.ts` |
| ID generator | `id/generator.ts` | `id/generator.test.ts` |
| Error codes | `errors/codes.ts` | `errors/codes.test.ts` |

## File Map (@stoneforge/quarry)

| Concept | Source | Tests |
|---------|--------|-------|
| QuarryAPI | `api/quarry-api.ts` | `api/*.integration.test.ts` |
| Dependency service | `services/dependency.ts` | `services/dependency.test.ts` |
| Blocked cache | `services/blocked-cache.ts` | `services/blocked-cache.test.ts` |
| Inbox service | `services/inbox.ts` | `services/inbox.test.ts` |
| Priority service | `services/priority-service.ts` | `services/priority-service.test.ts` |
| ID length cache | `services/id-length-cache.ts` | `services/id-length-cache.test.ts` |
| Search utils | `services/search-utils.ts` | `services/search-utils.test.ts` |
| Embedding service | `services/embeddings/service.ts` | `services/embeddings/service.test.ts` |
| Embedding types | `services/embeddings/types.ts` | - |
| Local embedding provider | `services/embeddings/local-provider.ts` | `services/embeddings/local-provider.test.ts` |
| Rank fusion | `services/embeddings/fusion.ts` | `services/embeddings/fusion.test.ts` |
| Sync service | `sync/service.ts` | `sync/service.test.ts` |
| Sync merge | `sync/merge.ts` | - |
| Sync hash | `sync/hash.ts` | - |
| Config loader | `config/config.ts` | `config/config.test.ts` |
| Identity system | `systems/identity.ts` | `systems/identity.test.ts` |
| CLI commands | `cli/commands/*.ts` | `cli/commands/*.test.ts` |
| CLI embeddings commands | `cli/commands/embeddings.ts` | - |

## File Map (@stoneforge/ui)

| Concept | Source | Tests |
|---------|--------|-------|
| Core components | `components/*.tsx` | `components/*.test.tsx` |
| Layout components | `layout/*.tsx` | `layout/layout.test.tsx` |
| Domain types | `domain/types.ts` | `domain/domain.test.tsx` |
| TaskCard | `domain/TaskCard.tsx` | `domain/domain.test.tsx` |
| EntityCard | `domain/EntityCard.tsx` | `domain/domain.test.tsx` |
| PlanCard | `domain/PlanCard.tsx` | `domain/domain.test.tsx` |
| WorkflowCard | `domain/WorkflowCard.tsx` | `domain/domain.test.tsx` |
| TeamCard | `domain/TeamCard.tsx` | `domain/domain.test.tsx` |
| Task badges | `domain/TaskBadges.tsx` | `domain/domain.test.tsx` |
| UserSelector | `domain/UserSelector.tsx` | `domain/domain.test.tsx` |
| ChannelHeader | `domain/ChannelHeader.tsx` | `domain/domain.test.tsx` |
| Visualization types | `visualizations/types.ts` | `visualizations/visualizations.test.tsx` |
| StatusPieChart | `visualizations/StatusPieChart.tsx` | `visualizations/visualizations.test.tsx` |
| TrendLineChart | `visualizations/TrendLineChart.tsx` | `visualizations/visualizations.test.tsx` |
| HorizontalBarChart | `visualizations/HorizontalBarChart.tsx` | `visualizations/visualizations.test.tsx` |
| Theme hook | `hooks/useTheme.ts` | `hooks/useTheme.test.ts` |
| Breakpoint hooks | `hooks/useBreakpoint.ts` | `hooks/useBreakpoint.test.ts` |
| WebSocket hook | `hooks/useWebSocket.ts` | - |
| SSE stream hook | `hooks/useSSEStream.ts` | - |
| Real-time events hook | `hooks/useRealtimeEvents.ts` | - |
| Keyboard shortcuts | `hooks/useKeyboardShortcuts.ts` | `hooks/useKeyboardShortcuts.test.ts` |
| WebSocket client | `api/websocket.ts` | `api/websocket.test.ts` |
| SSE client | `api/sse-client.ts` | `api/sse-client.test.ts` |
| API client | `api/api-client.ts` | `api/api-client.test.ts` |
| Design tokens | `styles/tokens.css` | - |

## File Map (@stoneforge/shared-routes)

| Concept | Source | Tests |
|---------|--------|-------|
| Route types | `types.ts` | - |
| Elements routes | `elements.ts` | - |
| Entity routes | `entities.ts` | - |
| Channel routes | `channels.ts` | - |
| Message routes | `messages.ts` | - |
| Library routes | `libraries.ts` | - |
| Document routes | `documents.ts` | - |
| Inbox routes | `inbox.ts` | - |

## File Map (@stoneforge/smithy)

| Concept | Source | Tests |
|---------|--------|-------|
| OrchestratorAPI | `api/orchestrator-api.ts` | `api/*.integration.test.ts` |
| Agent registry | `services/agent-registry.ts` | `services/agent-registry.test.ts` |
| Role definition service | `services/role-definition-service.ts` | `services/role-definition-service.test.ts` |
| Task assignment service | `services/task-assignment-service.ts` | `services/task-assignment-service.test.ts` |
| Dispatch service | `services/dispatch-service.ts` | `services/dispatch-service.test.ts` |
| Dispatch daemon | `services/dispatch-daemon.ts` | `services/dispatch-daemon.test.ts` |
| Worker task service | `services/worker-task-service.ts` | `services/worker-task-service.test.ts` |
| Merge steward service | `services/merge-steward-service.ts` | `services/merge-steward-service.test.ts` |
| Docs steward service | `services/docs-steward-service.ts` | - |
| Steward scheduler | `services/steward-scheduler.ts` | `services/steward-scheduler.test.ts` |
| Plugin executor | `services/plugin-executor.ts` | `services/plugin-executor.test.ts` |
| Spawner service | `runtime/spawner.ts` | `runtime/spawner.test.ts` |
| Session manager | `runtime/session-manager.ts` | `runtime/session-manager.test.ts` |
| Handoff service | `runtime/handoff.ts` | `runtime/handoff.test.ts` |
| Message mapper | `runtime/message-mapper.ts` | - |
| Prompts | `prompts/index.ts` | `prompts/index.test.ts` |
| Persistent worker prompt | `prompts/persistent-worker.md` | - |
| Message triage prompt | `prompts/message-triage.md` | - |
| Docs steward prompt | `prompts/steward-docs.md` | - |
| Merge CLI command | `cli/commands/merge.ts` | `cli/commands/merge.test.ts` |
| Worktree manager | `git/worktree-manager.ts` | `git/worktree-manager.test.ts` |
| Docs steward service | `services/docs-steward-service.ts` | `services/docs-steward-service.test.ts` |

## File Map (Platform)

| App | Entry | Key Directories |
|-----|-------|-----------------|
| `apps/quarry-server/` | `src/index.ts` | `src/ws/` (WebSocket) |
| `apps/quarry-web/` | `src/main.tsx` | `src/components/`, `src/routes/`, `src/api/hooks/` |
| `apps/smithy-server/` | `src/index.ts` | `src/routes/` (route modules), `src/config.ts`, `src/services.ts` |
| `apps/smithy-web/` | `src/main.tsx` | `src/components/`, `src/routes/`, `src/lib/keyboard.ts`, `src/hooks/useKeyboardShortcuts.ts` |

## Critical Gotchas

See [gotchas.md](gotchas.md) for full list.

**Top 5:**
1. Task `blocked` status is **computed** from dependencies, never set directly
2. `sendDirectMessage()` needs `contentRef` (DocumentId), not raw text
3. For `blocks`: `blockedId` is the waiting task, `blockerId` must complete first
4. SQLite is cache, JSONL is source of truth
5. `sortByEffectivePriority()` mutates array in place

---

## Keeping Docs Updated

| If you... | Update |
|-----------|--------|
| Add/rename/move a source file | File Map tables in this README |
| Add a new type/interface | `reference/core-types.md` |
| Add a new API method | `reference/quarry-api.md` or `reference/orchestrator-api.md` |
| Add a CLI command | `reference/cli.md` |
| Add platform feature | `reference/platform.md` |
| Discover a gotcha | `gotchas.md` |

**File paths are the source of truth.** If a file path in docs doesn't exist, the doc is wrong.
