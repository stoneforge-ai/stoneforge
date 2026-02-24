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
| `packages/ui/` | Shared React UI components, layout, domain, visualizations, hooks, API clients, design tokens; domain modules: documents, messages, plans, workflows, settings | `Button`, `Card`, `Dialog`, `Badge`, `Input`, `Select`, `Skeleton`, `TagInput`, `Tooltip`, `ThemeToggle`, `AppShell`, `Sidebar`, `MobileDrawer`, `TaskCard`, `EntityCard`, `ChannelHeader`, `UserSelector`, `TaskStatusBadge`, `StatusPieChart`, `TrendLineChart`, `HorizontalBarChart`, `MessageRichComposer`, `CreatePlanModal`, `PlanDetailPanel`, `WorkflowDetailPanel`, `useTheme`, `useIsMobile`, `useWebSocket`, `useSSEStream`, `useRealtimeEvents`, `useKeyboardShortcut`, `usePlanApi`, `useWorkflowApi`, `WebSocketClient`, `SSEClient`, `ApiClient` |
| `packages/shared-routes/` | Shared route factories for server apps | `createElementsRoutes`, `createEntityRoutes`, `createChannelRoutes`, `createMessageRoutes`, `createLibraryRoutes`, `createDocumentRoutes`, `createInboxRoutes`, `createPlanRoutes`, `createTaskRoutes` |
| `packages/smithy/` | Agent orchestration: services, runtime, providers (Claude/Codex/OpenCode), server, prompts | `OrchestratorAPI`, `AgentRole`, `SpawnerService`, `SessionManager`, `DispatchService`, `AgentPoolService`, `AgentProviderRegistry`, `MetricsService` |

## File Map (@stoneforge/core)

| Concept | Source | Tests |
|---------|--------|-------|
| Task type | `types/task.ts` | `types/task.bun.test.ts` |
| Entity type | `types/entity.ts` | `types/entity.bun.test.ts` |
| Message type | `types/message.ts` | `types/message.bun.test.ts` |
| Document type | `types/document.ts` | `types/document.bun.test.ts` |
| Plan type | `types/plan.ts` | `types/plan.bun.test.ts` |
| Workflow type | `types/workflow.ts` | `types/workflow.bun.test.ts` |
| Channel type | `types/channel.ts` | `types/channel.bun.test.ts` |
| Dependency type | `types/dependency.ts` | `types/dependency.bun.test.ts` |
| Event type | `types/event.ts` | `types/event.bun.test.ts` |
| Inbox type | `types/inbox.ts` | `types/inbox.bun.test.ts` |
| Element base type | `types/element.ts` | `types/element.bun.test.ts` |
| Library type | `types/library.ts` | `types/library.bun.test.ts` |
| Team type | `types/team.ts` | `types/team.bun.test.ts` |
| Playbook type | `types/playbook.ts` | `types/playbook.bun.test.ts` |
| Playbook YAML type | `types/playbook-yaml.ts` | `types/playbook-yaml.bun.test.ts` |
| Workflow create helpers | `types/workflow-create.ts` | `types/workflow-create.bun.test.ts` |
| Workflow operations | `types/workflow-ops.ts` | - |
| ID generator | `id/generator.ts` | `id/generator.bun.test.ts` |
| Error codes | `errors/codes.ts` | `errors/codes.bun.test.ts` |
| Error base class | `errors/error.ts` | - |
| Error factories | `errors/factories.ts` | - |
| Mention parsing utils | `utils/mentions.ts` | - |

## File Map (@stoneforge/storage)

| Concept | Source | Tests |
|---------|--------|-------|
| Storage backend interface | `backend.ts` | - |
| Bun SQLite backend | `bun-backend.ts` | - |
| Node.js SQLite backend | `node-backend.ts` | - |
| Browser SQLite backend (WASM) | `browser-backend.ts` | - |
| Storage factory (runtime detection) | `create-backend.ts` | - |
| Schema management & migrations | `schema.ts` | `schema.bun.test.ts` |
| Storage error mapping | `errors.ts` | `errors.bun.test.ts` |
| Storage types | `types.ts` | `types.bun.test.ts` |

## File Map (@stoneforge/quarry)

| Concept | Source | Tests |
|---------|--------|-------|
| QuarryAPI | `api/quarry-api.ts` | `api/*.integration.bun.test.ts` |
| API types | `api/types.ts` | - |
| Dependency service | `services/dependency.ts` | `services/dependency.bun.test.ts` |
| Blocked cache | `services/blocked-cache.ts` | `services/blocked-cache.bun.test.ts` |
| Inbox service | `services/inbox.ts` | `services/inbox.bun.test.ts` |
| Priority service | `services/priority-service.ts` | `services/priority-service.bun.test.ts` |
| ID length cache | `services/id-length-cache.ts` | `services/id-length-cache.bun.test.ts` |
| Search utils | `services/search-utils.ts` | `services/search-utils.bun.test.ts` |
| Embedding service | `services/embeddings/service.ts` | `services/embeddings/service.bun.test.ts` |
| Embedding types | `services/embeddings/types.ts` | - |
| Local embedding provider | `services/embeddings/local-provider.ts` | `services/embeddings/local-provider.bun.test.ts` |
| Rank fusion | `services/embeddings/fusion.ts` | `services/embeddings/fusion.bun.test.ts` |
| Sync service | `sync/service.ts` | `sync/service.bun.test.ts` |
| Sync merge | `sync/merge.ts` | - |
| Sync hash | `sync/hash.ts` | - |
| Sync serialization | `sync/serialization.ts` | - |
| Sync types | `sync/types.ts` | - |
| Sync auto-export | `sync/auto-export.ts` | - |
| Config loader | `config/config.ts` | `config/config.bun.test.ts` |
| Config defaults | `config/defaults.ts` | - |
| Config types | `config/types.ts` | - |
| Config validation | `config/validation.ts` | - |
| Config file loader | `config/file.ts` | - |
| Config env vars | `config/env.ts` | - |
| Config merge | `config/merge.ts` | - |
| Duration parser | `config/duration.ts` | - |
| Identity system | `systems/identity.ts` | `systems/identity.bun.test.ts` |
| HTTP sync handlers | `http/sync-handlers.ts` | - |
| Quarry server | `server/index.ts`, `server/static.ts` | - |
| CLI runner | `cli/runner.ts` | - |
| CLI parser | `cli/parser.ts` | - |
| CLI plugin loader | `cli/plugin-loader.ts` | - |
| CLI plugin registry | `cli/plugin-registry.ts` | - |
| CLI plugin types | `cli/plugin-types.ts` | - |
| CLI formatter | `cli/formatter.ts` | - |
| CLI completion | `cli/completion.ts` | - |
| CLI commands | `cli/commands/*.ts` | `cli/commands/*.bun.test.ts` |
| CLI embeddings commands | `cli/commands/embeddings.ts` | - |
| CLI database helpers | `cli/db.ts` | - |
| CLI command suggest | `cli/suggest.ts` | - |
| CLI types | `cli/types.ts` | - |
| CLI entry point | `bin/sf.ts` | - |
| WebSocket broadcaster | `server/ws/broadcaster.ts` | - |
| WebSocket handler | `server/ws/handler.ts` | - |

## File Map (@stoneforge/ui)

| Concept | Source | Tests |
|---------|--------|-------|
| **Core Components** | | |
| Button | `components/Button.tsx` | `components/*.test.tsx` |
| Card | `components/Card.tsx` | `components/*.test.tsx` |
| Dialog | `components/Dialog.tsx` | `components/*.test.tsx` |
| Badge | `components/Badge.tsx` | `components/*.test.tsx` |
| Input | `components/Input.tsx` | `components/*.test.tsx` |
| Select | `components/Select.tsx` | `components/*.test.tsx` |
| Skeleton | `components/Skeleton.tsx` | `components/*.test.tsx` |
| TagInput | `components/TagInput.tsx` | `components/*.test.tsx` |
| ThemeToggle | `components/ThemeToggle.tsx` | `components/*.test.tsx` |
| Tooltip | `components/Tooltip.tsx` | `components/*.test.tsx` |
| **Layout** | | |
| Layout components | `layout/*.tsx` | `layout/layout.test.tsx` |
| Header | `layout/Header.tsx` | - |
| ResponsiveModal | `layout/ResponsiveModal.tsx` | - |
| **Domain Cards** | | |
| Domain types | `domain/types.ts` | `domain/domain.test.tsx` |
| TaskCard | `domain/TaskCard.tsx` | `domain/domain.test.tsx` |
| EntityCard | `domain/EntityCard.tsx` | `domain/domain.test.tsx` |
| PlanCard | `domain/PlanCard.tsx` | `domain/domain.test.tsx` |
| WorkflowCard | `domain/WorkflowCard.tsx` | `domain/domain.test.tsx` |
| TeamCard | `domain/TeamCard.tsx` | `domain/domain.test.tsx` |
| Task badges | `domain/TaskBadges.tsx` | `domain/domain.test.tsx` |
| EntityLink | `domain/EntityLink.tsx` | `domain/domain.test.tsx` |
| MobileEntityCard | `domain/MobileEntityCard.tsx` | `domain/domain.test.tsx` |
| UserSelector | `domain/UserSelector.tsx` | `domain/domain.test.tsx` |
| ChannelHeader | `domain/ChannelHeader.tsx` | `domain/domain.test.tsx` |
| **Visualizations** | | |
| Visualization types | `visualizations/types.ts` | `visualizations/visualizations.test.tsx` |
| StatusPieChart | `visualizations/StatusPieChart.tsx` | `visualizations/visualizations.test.tsx` |
| TrendLineChart | `visualizations/TrendLineChart.tsx` | `visualizations/visualizations.test.tsx` |
| HorizontalBarChart | `visualizations/HorizontalBarChart.tsx` | `visualizations/visualizations.test.tsx` |
| **Documents Module** | | |
| Document types | `documents/types.ts` | - |
| Document constants | `documents/constants.tsx` | - |
| Document utils | `documents/utils.ts` | - |
| DeleteLibraryModal | `documents/components/DeleteLibraryModal.tsx` | - |
| DocumentFilterBar | `documents/components/DocumentFilterBar.tsx` | - |
| DocumentSortDropdown | `documents/components/DocumentSortDropdown.tsx` | - |
| DocumentTagInput | `documents/components/DocumentTagInput.tsx` | - |
| MobileDocumentFilter | `documents/components/MobileDocumentFilter.tsx` | - |
| **Message Module** | | |
| Message types | `message/entity-types.ts` | - |
| Markdown rendering | `message/markdown.ts` | - |
| MessageRichComposer | `message/MessageRichComposer.tsx` | - |
| MessageEmbedCard | `message/MessageEmbedCard.tsx` | - |
| MessageImageAttachment | `message/MessageImageAttachment.tsx` | - |
| MessageSlashCommands | `message/MessageSlashCommands.tsx` | - |
| MentionAutocomplete | `message/MentionAutocomplete.tsx` | - |
| HashAutocomplete | `message/HashAutocomplete.tsx` | - |
| CreateChannelModal | `message/CreateChannelModal.tsx` | - |
| ChannelMembersPanel | `message/ChannelMembersPanel.tsx` | - |
| EntityLink | `message/EntityLink.tsx` | - |
| LinkPopover | `message/LinkPopover.tsx` | - |
| useDeleteChannel | `message/useDeleteChannel.ts` | - |
| **Plans Module** | | |
| Plan types | `plans/types.ts` | - |
| Plan constants | `plans/constants.tsx` | - |
| Plan utils | `plans/utils.ts` | - |
| Plan API hook | `plans/hooks/usePlanApi.ts` | - |
| CreatePlanModal | `plans/components/CreatePlanModal.tsx` | - |
| PlanDetailPanel | `plans/components/PlanDetailPanel.tsx` | - |
| PlanListItem | `plans/components/PlanListItem.tsx` | - |
| PlanSearchBar | `plans/components/PlanSearchBar.tsx` | - |
| PlanTaskList | `plans/components/PlanTaskList.tsx` | - |
| RoadmapView | `plans/components/RoadmapView.tsx` | - |
| TaskPickerModal | `plans/components/TaskPickerModal.tsx` | - |
| StatusBadge | `plans/components/StatusBadge.tsx` | - |
| StatusFilter | `plans/components/StatusFilter.tsx` | - |
| TaskStatusSummary | `plans/components/TaskStatusSummary.tsx` | - |
| ViewToggle | `plans/components/ViewToggle.tsx` | - |
| MobilePlanCard | `plans/components/MobilePlanCard.tsx` | - |
| **Workflows Module** | | |
| Workflow types | `workflows/types.ts` | - |
| Workflow constants | `workflows/constants.tsx` | - |
| Workflow utils | `workflows/utils.ts` | - |
| Workflow API hook | `workflows/hooks/useWorkflowApi.ts` | - |
| CreateWorkflowModal | `workflows/components/CreateWorkflowModal.tsx` | - |
| WorkflowDetailPanel | `workflows/components/WorkflowDetailPanel.tsx` | - |
| WorkflowListItem | `workflows/components/WorkflowListItem.tsx` | - |
| WorkflowCard | `workflows/components/WorkflowCard.tsx` | - |
| WorkflowTaskList | `workflows/components/WorkflowTaskList.tsx` | - |
| WorkflowEditorModal | `workflows/components/WorkflowEditorModal.tsx` | - |
| WorkflowProgressDashboard | `workflows/components/WorkflowProgressDashboard.tsx` | - |
| PlaybookCard | `workflows/components/PlaybookCard.tsx` | - |
| ProgressBar | `workflows/components/ProgressBar.tsx` | - |
| StatusBadge (workflow) | `workflows/components/StatusBadge.tsx` | - |
| StatusFilter (workflow) | `workflows/components/StatusFilter.tsx` | - |
| TaskStatusSummary (workflow) | `workflows/components/TaskStatusSummary.tsx` | - |
| MobileWorkflowCard | `workflows/components/MobileWorkflowCard.tsx` | - |
| **Settings Module** | | |
| ShortcutsSection | `settings/shortcuts/ShortcutsSection.tsx` | - |
| Shortcuts utils | `settings/shortcuts/utils.ts` | - |
| **Contexts** | | |
| CurrentUserContext | `contexts/CurrentUserContext.tsx` | - |
| **Hooks** | | |
| Theme hook | `hooks/useTheme.ts` | `hooks/useTheme.test.ts` |
| Breakpoint hooks | `hooks/useBreakpoint.ts` | `hooks/useBreakpoint.test.ts` |
| WebSocket hook | `hooks/useWebSocket.ts` | - |
| SSE stream hook | `hooks/useSSEStream.ts` | - |
| Real-time events hook | `hooks/useRealtimeEvents.ts` | - |
| Keyboard shortcuts | `hooks/useKeyboardShortcuts.ts` | `hooks/useKeyboardShortcuts.test.ts` |
| **API Clients** | | |
| WebSocket client | `api/websocket.ts` | `api/websocket.test.ts` |
| SSE client | `api/sse-client.ts` | `api/sse-client.test.ts` |
| API client | `api/api-client.ts` | `api/api-client.test.ts` |
| **Styles** | | |
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
| Plan routes | `plans.ts` | - |
| Task routes | `tasks.ts` | - |
| WebSocket types | `ws/types.ts` | - |
| WebSocket handler | `ws/handler.ts` | - |
| WebSocket broadcaster | `ws/broadcaster.ts` | - |

## File Map (@stoneforge/smithy)

| Concept | Source | Tests |
|---------|--------|-------|
| **API** | | |
| OrchestratorAPI | `api/orchestrator-api.ts` | `api/*.integration.bun.test.ts` |
| **Types** | | |
| Agent types | `types/agent.ts` | - |
| Agent pool types | `types/agent-pool.ts` | - |
| Role definition types | `types/role-definition.ts` | - |
| Message types | `types/message-types.ts` | - |
| Task metadata types | `types/task-meta.ts` | - |
| **Services** | | |
| Agent registry | `services/agent-registry.ts` | `services/agent-registry.bun.test.ts` |
| Role definition service | `services/role-definition-service.ts` | `services/role-definition-service.bun.test.ts` |
| Task assignment service | `services/task-assignment-service.ts` | `services/task-assignment-service.bun.test.ts` |
| Dispatch service | `services/dispatch-service.ts` | `services/dispatch-service.bun.test.ts` |
| Dispatch daemon | `services/dispatch-daemon.ts` | `services/dispatch-daemon.bun.test.ts` |
| Worker task service | `services/worker-task-service.ts` | `services/worker-task-service.test.ts` |
| Merge steward service | `services/merge-steward-service.ts` | `services/merge-steward-service.test.ts` |
| Docs steward service | `services/docs-steward-service.ts` | `services/docs-steward-service.test.ts` |
| Agent pool service | `services/agent-pool-service.ts` | - |
| Merge request provider | `services/merge-request-provider.ts` | - |
| Steward scheduler | `services/steward-scheduler.ts` | `services/steward-scheduler.test.ts` |
| Plugin executor | `services/plugin-executor.ts` | `services/plugin-executor.bun.test.ts` |
| Settings service | `services/settings-service.ts` | `services/settings-service.bun.test.ts` |
| Metrics service | `services/metrics-service.ts` | `services/metrics-service.bun.test.ts` |
| Operation log service | `services/operation-log-service.ts` | `services/operation-log-service.bun.test.ts` |
| Rate limit tracker | `services/rate-limit-tracker.ts` | `services/rate-limit-tracker.bun.test.ts` |
| **Runtime** | | |
| Spawner service | `runtime/spawner.ts` | `runtime/spawner.bun.test.ts` |
| Session manager | `runtime/session-manager.ts` | `runtime/session-manager.bun.test.ts` |
| Handoff service | `runtime/handoff.ts` | `runtime/handoff.bun.test.ts` |
| Message mapper | `runtime/message-mapper.ts` | - |
| Predecessor query service | `runtime/predecessor-query.ts` | `runtime/predecessor-query.bun.test.ts` |
| Runtime event utils | `runtime/event-utils.ts` | - |
| **Providers** | | |
| Provider registry | `providers/registry.ts` | - |
| Provider types | `providers/types.ts` | - |
| Claude headless provider | `providers/claude/headless.ts` | - |
| Claude interactive provider | `providers/claude/interactive.ts` | - |
| Codex headless provider | `providers/codex/headless.ts` | - |
| Codex interactive provider | `providers/codex/interactive.ts` | - |
| Codex server manager | `providers/codex/server-manager.ts` | - |
| Codex event mapper | `providers/codex/event-mapper.ts` | - |
| Codex JSON-RPC client | `providers/codex/jsonrpc-client.ts` | - |
| OpenCode headless provider | `providers/opencode/headless.ts` | - |
| OpenCode interactive provider | `providers/opencode/interactive.ts` | - |
| OpenCode server manager | `providers/opencode/server-manager.ts` | - |
| OpenCode event mapper | `providers/opencode/event-mapper.ts` | - |
| OpenCode async queue | `providers/opencode/async-queue.ts` | - |
| **Git** | | |
| Worktree manager | `git/worktree-manager.ts` | `git/worktree-manager.bun.test.ts` |
| Git merge | `git/merge.ts` | - |
| **Server** | | |
| Server entry | `server/server.ts` | - |
| Server config | `server/config.ts` | - |
| Server services | `server/services.ts` | - |
| Server formatters | `server/formatters.ts` | - |
| Server types | `server/types.ts` | - |
| Daemon state | `server/daemon-state.ts` | - |
| WebSocket handler | `server/websocket.ts` | - |
| Events WebSocket | `server/events-websocket.ts` | - |
| LSP WebSocket | `server/lsp-websocket.ts` | - |
| Server static files | `server/static.ts` | - |
| Route: agents | `server/routes/agents.ts` | - |
| Route: daemon | `server/routes/daemon.ts` | - |
| Route: events | `server/routes/events.ts` | - |
| Route: health | `server/routes/health.ts` | - |
| Route: pools | `server/routes/pools.ts` | - |
| Route: sessions | `server/routes/sessions.ts` | - |
| Route: tasks | `server/routes/tasks.ts` | - |
| Route: upload | `server/routes/upload.ts` | - |
| Route: assets | `server/routes/assets.ts` | - |
| Route: settings | `server/routes/settings.ts` | - |
| Route: worktrees | `server/routes/worktrees.ts` | - |
| Route: workflows | `server/routes/workflows.ts` | - |
| Route: scheduler | `server/routes/scheduler.ts` | - |
| Route: plugins | `server/routes/plugins.ts` | - |
| Route: lsp | `server/routes/lsp.ts` | - |
| Route: extensions | `server/routes/extensions.ts` | - |
| Route: workspace-files | `server/routes/workspace-files.ts` | - |
| Route: diagnostics | `server/routes/diagnostics.ts` | - |
| Route: metrics | `server/routes/metrics.ts` | - |
| LSP manager service | `server/services/lsp-manager.ts` | - |
| Session messages service | `server/services/session-messages.ts` | - |
| **Prompts** | | |
| Prompts loader | `prompts/index.ts` | `prompts/index.bun.test.ts` |
| Director prompt | `prompts/director.md` | - |
| Worker prompt | `prompts/worker.md` | - |
| Persistent worker prompt | `prompts/persistent-worker.md` | - |
| Message triage prompt | `prompts/message-triage.md` | - |
| Steward base prompt | `prompts/steward-base.md` | - |
| Steward docs prompt | `prompts/steward-docs.md` | - |
| Steward merge prompt | `prompts/steward-merge.md` | - |
| Steward recovery prompt | `prompts/steward-recovery.md` | - |
| **CLI** | | |
| CLI plugin entry | `cli/plugin.ts` | - |
| Merge CLI command | `cli/commands/merge.ts` | `cli/commands/merge.bun.test.ts` |
| Agent CLI commands | `cli/commands/agent.ts` | - |
| Daemon CLI commands | `cli/commands/daemon.ts` | - |
| Dispatch CLI command | `cli/commands/dispatch.ts` | - |
| Pool CLI commands | `cli/commands/pool.ts` | - |
| Serve CLI command | `cli/commands/serve.ts` | - |
| Task CLI commands | `cli/commands/task.ts` | - |
| Test orchestration CLI | `cli/commands/test-orchestration.ts` | - |
| **Testing** | | |
| Orchestration test runner | `testing/orchestration-tests.ts` | - |
| Test context | `testing/test-context.ts` | - |
| Test prompts | `testing/test-prompts.ts` | - |
| Test utils | `testing/test-utils.ts` | - |
| **Utils** | | |
| Logger | `utils/logger.ts` | - |
| Rate limit parser | `utils/rate-limit-parser.ts` | - |
| CLI entry point | `bin/sf.ts` | - |

## File Map (Platform)

| App | Entry | Key Directories |
|-----|-------|-----------------|
| `apps/quarry-server/` | `src/index.ts` | `src/ws/` (WebSocket) |
| `apps/quarry-web/` | `src/main.tsx` | `src/components/`, `src/routes/`, `src/api/hooks/` |
| `apps/smithy-server/` | `src/index.ts` | `src/routes/` (route modules), `src/config.ts`, `src/services.ts` |
| `apps/smithy-web/` | `src/main.tsx` | `src/components/`, `src/routes/`, `src/lib/keyboard.ts`, `src/hooks/useKeyboardShortcuts.ts` |
| `apps/docs/` | `astro.config.mjs` | `src/content/docs/` (MDX pages), `src/components/`, `src/styles/` |
| `apps/website/` | `astro.config.mjs` | `src/pages/`, `src/components/`, `src/layouts/`, `src/styles/` |

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
