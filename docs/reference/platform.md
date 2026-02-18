# Platform Reference

Platform applications: servers and web UIs.

## Apps Overview

| App | Port | Purpose |
|-----|------|---------|
| `apps/quarry-server/` | 3456 | Core API server |
| `apps/quarry-web/` | 5173 | Core React SPA |
| `apps/smithy-server/` | - | Orchestrator API server |
| `apps/smithy-web/` | - | Orchestrator React SPA |

---

## Server (apps/quarry-server/)

**Entry:** `src/index.ts`

Hono-based API server.

### Running

```bash
cd apps/quarry-server
bun run dev    # Development with hot reload
bun run start  # Production
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Server entry, routes |
| `src/ws/broadcaster.ts` | WebSocket broadcaster (re-exports from `@stoneforge/shared-routes`) |
| `src/ws/handler.ts` | WebSocket handler |
| `src/ws/types.ts` | WebSocket types (re-exports from `@stoneforge/shared-routes`) |

### API Routes

```
GET     /api/elements/:id
POST    /api/elements
PATCH   /api/elements/:id
DELETE  /api/elements/:id

GET     /api/tasks
GET     /api/tasks/ready
GET     /api/tasks/blocked
PATCH   /api/tasks/bulk

GET     /api/plans/:id/tasks
POST    /api/plans/:id/tasks

GET     /api/entities
POST    /api/entities

GET     /api/channels
GET     /api/messages

POST    /api/sync/export
POST    /api/sync/import

GET     /api/stats
```

### Adding an Endpoint

```typescript
// In apps/quarry-server/src/index.ts

// GET endpoint
app.get('/api/elements/:id', async (c) => {
  const id = c.req.param('id');
  const element = await api.get(id);
  if (!element) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(element);
});

// POST endpoint
app.post('/api/elements', async (c) => {
  const body = await c.req.json();
  const element = await api.create(body);
  return c.json(element, 201);
});

// PATCH endpoint
app.patch('/api/elements/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const element = await api.update(id, body);
  return c.json(element);
});
```

### Query Parameters

```typescript
app.get('/api/tasks', async (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const tasks = await api.list({
    type: 'task',
    status,
    limit,
    offset,
  });
  return c.json(tasks);
});
```

### Error Handling

```typescript
import { StoneforgeError } from '@stoneforge/core';

app.onError((err, c) => {
  if (err instanceof StoneforgeError) {
    return c.json({ error: err.message, code: err.code }, 400);
  }
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});
```

### CORS

```typescript
import { cors } from 'hono/cors';

app.use('*', cors({
  origin: ['http://localhost:5173'],  // Vite dev server
  credentials: true,
}));
```

**Note:** CORS is hardcoded for localhost:5173. Update for production.

---

## WebSocket

**Shared types & broadcaster:** `packages/shared-routes/src/ws/` (types, `EventBroadcaster`, `shouldReceiveEvent`)

**Server handler:** `apps/quarry-server/src/ws/handler.ts` (re-exports types/broadcaster from `@stoneforge/shared-routes`)

**Orchestrator server:** `apps/smithy-server/src/events-websocket.ts` (event-subscription WS at `/ws/events`)

### Architecture

The WebSocket event-subscription protocol is shared between the standard server and orchestrator server:

- **Types** (`SubscriptionChannel`, `WebSocketEvent`, `ServerMessage`, etc.) live in `@stoneforge/shared-routes`
- **EventBroadcaster** polls the DB for new events and dispatches to listeners — also in `@stoneforge/shared-routes`
- **shouldReceiveEvent()** filters events based on client subscriptions — also in `@stoneforge/shared-routes`
- Each server has its own handler that wires up WebSocket connections to the shared broadcaster

### Client Connection

Both web apps (`apps/quarry-web`, `apps/smithy-web`) use `@stoneforge/ui`'s `useRealtimeEvents` hook with a thin local wrapper that derives the WebSocket URL from `window.location`:

```typescript
// In any web app — the local wrapper handles URL derivation
import { useRealtimeEvents } from './api/hooks/useRealtimeEvents';

function MyComponent() {
  useRealtimeEvents({
    channels: ['tasks', 'messages'],
    onEvent: (event) => {
      console.log('Event:', event.elementType, event.eventType);
    },
  });
}
```

The underlying `@stoneforge/ui` hook handles WebSocket connection, reconnection, channel subscriptions, and React Query cache invalidation via `defaultQueryKeyMapper`.

**Note:** WebSocket uses 500ms polling, not instant push.

---

## Web App (apps/quarry-web/)

**Entry:** `src/main.tsx`

React + Vite SPA.

### Running

```bash
cd apps/quarry-web
bun run dev    # Development with HMR (port 5173)
bun run build  # Production build
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | React entry |
| `src/App.tsx` | App shell |
| `src/router.tsx` | Router config |
| `src/api/hooks/` | Data fetching hooks |
| `src/components/` | UI components |
| `src/routes/` | Page components |

### Adding a Page

1. Create route component:

```typescript
// apps/quarry-web/src/routes/feature.tsx
export default function FeaturePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Feature</h1>
      {/* Page content */}
    </div>
  );
}
```

2. Register in router:

```typescript
// apps/quarry-web/src/router.tsx
import FeaturePage from './routes/feature';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // ...existing routes
      { path: 'feature', element: <FeaturePage /> },
    ],
  },
]);
```

3. Add sidebar link in `src/components/layout/Sidebar.tsx`

### Adding an API Hook

```typescript
// apps/quarry-web/src/api/hooks/useFeatures.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = 'http://localhost:3456/api';

export function useFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/features`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateFeatureInput) => {
      const res = await fetch(`${API_BASE}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['features'] });
    },
  });
}
```

### Available Data Hooks

```typescript
// Main hook - loads ALL elements
const { data } = useAllElements();

// Type-specific (derived from cache)
const { data: tasks } = useAllTasks();
const { data: plans } = useAllPlans();
const { data: entities } = useAllEntities();
const { data: documents } = useAllDocuments();
const { data: channels } = useAllChannels();
const { data: messages } = useAllMessages();

// WebSocket real-time events (from @stoneforge/ui, wrapped locally)
const { connectionState, lastEvent } = useRealtimeEvents({
  channels: ['tasks', 'messages'],
});
// connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// In-place cache updates
const handleEvent = useInPlaceCacheUpdates();
```

### Component Patterns

**UI Primitive:**
```typescript
// apps/quarry-web/src/components/ui/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant = 'primary', children, onClick }: ButtonProps) {
  return (
    <button className={cn('px-4 py-2 rounded', variants[variant])} onClick={onClick}>
      {children}
    </button>
  );
}
```

**Feature Component:**
```
apps/quarry-web/src/components/{feature}/
```

### Styling

Uses Tailwind CSS + Shadcn/ui:

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  'flex items-center gap-2',
  isActive && 'bg-accent',
  className
)} />
```

---

## Orchestrator Server (apps/smithy-server/)

**Entry:** `src/index.ts`

Hono-based API server for agent orchestration. Modular architecture with routes split by domain.

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Server entry, route mounting |
| `src/config.ts` | Server configuration (ports, paths, CORS) |
| `src/services.ts` | Service initialization |
| `src/server.ts` | Cross-runtime startup (Bun/Node.js) |
| `src/websocket.ts` | Terminal WebSocket connection handling |
| `src/events-websocket.ts` | Event-subscription WebSocket (`/ws/events`) |
| `src/formatters.ts` | Response formatters |
| `src/types.ts` | Shared types |

### Routes Structure

| File | Prefix | Purpose |
|------|--------|---------|
| `routes/health.ts` | `/api/health` | Health check |
| `routes/tasks.ts` | `/api/tasks` | Task CRUD, dispatch, smart dispatch |
| `routes/agents.ts` | `/api/agents` | Agent registration, status, workload |
| `routes/sessions.ts` | `/api/agents/:id/*`, `/api/sessions` | Session lifecycle, streaming |
| `routes/worktrees.ts` | `/api/worktrees` | Git worktree management |
| `routes/scheduler.ts` | `/api/scheduler` | Steward scheduling |
| `routes/plugins.ts` | `/api/plugins` | Plugin execution |
| `routes/events.ts` | `/api/events` | Activity/events, SSE streaming |
| `routes/upload.ts` | `/api/terminal/upload` | Terminal file upload |

### Key Routes

**Agents:**
```
POST    /api/agents                    # Register agent (any role)
POST    /api/agents/director           # Register director
POST    /api/agents/worker             # Register worker
POST    /api/agents/steward            # Register steward
GET     /api/agents                    # List agents
GET     /api/agents/:id                # Get agent
PATCH   /api/agents/:id                # Update agent
GET     /api/agents/:id/status         # Get agent status
GET     /api/agents/:id/workload       # Get agent workload
```

**Sessions:**
```
POST    /api/agents/:id/start          # Start session
POST    /api/agents/:id/stop           # Stop session
POST    /api/agents/:id/interrupt      # Interrupt session
POST    /api/agents/:id/resume         # Resume session
GET     /api/agents/:id/stream         # SSE stream for session
POST    /api/agents/:id/input          # Send input to session
GET     /api/sessions                  # List sessions
GET     /api/sessions/:id              # Get session
```

**Tasks:**
```
GET     /api/tasks                     # List tasks
POST    /api/tasks                     # Create task
GET     /api/tasks/:id                 # Get task
POST    /api/tasks/:id/dispatch        # Dispatch to specific agent
POST    /api/tasks/:id/dispatch/smart  # Smart dispatch (auto-select agent)
GET     /api/tasks/:id/candidates      # Get dispatch candidates
POST    /api/tasks/:id/start-worker    # Start worker on task
POST    /api/tasks/:id/complete        # Complete task
GET     /api/tasks/:id/context         # Get task context
POST    /api/tasks/:id/cleanup         # Cleanup task resources
```

**Scheduler:**
```
GET     /api/scheduler/status          # Scheduler status
POST    /api/scheduler/start           # Start scheduler
POST    /api/scheduler/stop            # Stop scheduler
POST    /api/scheduler/register-all    # Register all stewards
POST    /api/scheduler/stewards/:id/execute  # Execute steward
GET     /api/scheduler/history         # Execution history
```

### Adding an Endpoint

Create or edit a route file in `src/routes/`:

```typescript
// src/routes/my-feature.ts
import { Hono } from 'hono';
import type { Services } from '../services.js';

export function createMyFeatureRoutes(services: Services) {
  const { api, agentRegistry } = services;
  const app = new Hono();

  app.get('/api/my-feature', async (c) => {
    // Implementation
    return c.json({ data: [] });
  });

  return app;
}
```

Then mount in `src/index.ts`:

```typescript
import { createMyFeatureRoutes } from './routes/my-feature.js';

app.route('/', createMyFeatureRoutes(services));
```

---

## Orchestrator Web (apps/smithy-web/)

**Entry:** `src/main.tsx`

### Key Components

| Component | Purpose |
|-----------|---------|
| `layout/AppShell.tsx` | Main layout |
| `layout/Sidebar.tsx` | Navigation |
| `layout/DirectorPanel.tsx` | Director terminal |
| `terminal/XTerminal.tsx` | Terminal emulator |
| `workspace/WorkspacePane.tsx` | Workspace panes |
| `workspace/StreamViewer.tsx` | Agent output viewer |
| `agent-graph/AgentWorkspaceGraph.tsx` | Agent hierarchy graph visualization |

### Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/activity` | `ActivityPage` | Recent activity |
| `/tasks` | `TasksPage` | Task management |
| `/agents` | `AgentsPage` | Agent management (Agents, Stewards, Graph tabs) |
| `/workspaces` | `WorkspacesPage` | Workspace panes |
| `/workflows` | `WorkflowsPage` | Workflow view |
| `/metrics` | `MetricsPage` | System metrics |
| `/settings` | `SettingsPage` | Configuration |
| `/inbox` | `InboxPage` | Inbox messages |
| `/messages` | `MessagesPage` | Channel messages |
| `/documents` | `DocumentsPage` | Document library |
| `/editor` | `FileEditorPage` | Read-only file editor with Monaco, multi-tab support, VSCode-style activity bar with file tree and search panel |

### Document Library Drag-and-Drop

The Documents page supports drag-and-drop for organizing documents and libraries:

**Supported Operations:**

| Drag Source | Drop Target | Result |
|-------------|-------------|--------|
| Document | Library | Move document to library |
| Document | All Documents | Remove from library (shows confirmation) |
| Library | Library | Nest library under another |
| Library | Root | Move library to root level |

**Invalid Operations (prevented):**

| Drag Source | Drop Target | Why Invalid |
|-------------|-------------|-------------|
| Document | Same Library | No-op |
| Library | Self | Cannot drop on self |
| Library | Descendant | Prevents circular nesting |

**Components:**

| File | Purpose |
|------|---------|
| `routes/documents/components/LibraryTree.tsx` | Tree sidebar with react-arborist |
| `routes/documents/components/DocumentListItem.tsx` | Draggable document item |
| `routes/documents/components/MoveToTopLevelDialog.tsx` | Confirmation for removing from library |

**Key Features:**
- Drag handle appears on hover for documents
- Visual feedback during drag (highlight, drag preview)
- 8px activation threshold to prevent accidental drags
- Toast notifications for success/failure

### Keyboard Shortcuts

The orchestrator-web app supports global keyboard shortcuts for navigation and actions.

**Navigation (G prefix = "Go to"):**

| Shortcut | Action |
|----------|--------|
| `G A` | Go to Activity |
| `G T` | Go to Tasks |
| `G E` | Go to Agents |
| `G W` | Go to Workspaces |
| `G F` | Go to Workflows |
| `G M` | Go to Metrics |
| `G S` | Go to Settings |
| `G I` | Go to Inbox |
| `G C` | Go to Messages |
| `G D` | Go to Documents |

**Actions (Cmd+ for global, C prefix for create):**

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open Command Palette |
| `Cmd+B` | Toggle Sidebar |
| `Cmd+D` | Toggle Director Panel |
| `Cmd+Shift+F` | Search in files (opens modal, or focuses Editor search panel) |
| `C T` | Create Task |
| `C A` | Create Agent |

**Key Files:**

| File | Purpose |
|------|---------|
| `lib/keyboard.ts` | Default shortcut definitions |
| `hooks/useKeyboardShortcuts.ts` | React hooks for shortcuts |
| `components/layout/AppShell.tsx` | Global shortcuts initialization |

**Adding Custom Shortcuts:**

```typescript
import { useKeyboardShortcut } from '@/hooks';

function MyComponent() {
  useKeyboardShortcut('Cmd+E', () => {
    console.log('Custom shortcut triggered');
  }, 'My custom action');

  return <div>...</div>;
}
```

**Customizing Shortcuts:**

Shortcuts can be customized via localStorage. The `@stoneforge/ui` package provides utilities:

```typescript
import { setCustomShortcut, resetAllShortcuts } from '@stoneforge/ui';
import { DEFAULT_SHORTCUTS } from '@/lib/keyboard';

// Change "Go to Tasks" from G T to G X
setCustomShortcut('nav.tasks', 'G X', DEFAULT_SHORTCUTS);

// Reset all to defaults
resetAllShortcuts();
```

### Workspace Panes

```typescript
import { usePaneManager } from '@/components/workspace/usePaneManager';

const { panes, addPane, removePane, updatePane } = usePaneManager();

addPane({
  type: 'terminal',
  agentId: 'agent-123',
  title: 'Worker Terminal',
});
```

### Agent Workspace Graph

The `/agents?tab=graph` route displays a graph visualization of the agent hierarchy using `@xyflow/react`.

**Components:**

| File | Purpose |
|------|---------|
| `agent-graph/AgentWorkspaceGraph.tsx` | Main graph container with ReactFlow |
| `agent-graph/AgentNode.tsx` | Custom node renderer for agents |
| `agent-graph/useAgentGraph.ts` | Hook to transform agent data to nodes/edges |
| `agent-graph/types.ts` | TypeScript types for graph data |

**Features:**

- Displays hierarchy: Human → Director → (Workers + Stewards)
- Shows agent status (running, idle, suspended, terminated)
- Displays current task assignment and git branch
- Health indicators for stewards
- Click any agent node to open in Workspaces terminal multiplexer
- Interactive: zoom, pan, fit view, minimap, draggable nodes

**Usage:**

```typescript
import { AgentWorkspaceGraph } from '@/components/agent-graph';

<AgentWorkspaceGraph
  director={director}
  workers={workers}
  stewards={stewards}
  tasks={tasks}
  sessionStatuses={statusMap}
  isLoading={false}
  onRefresh={() => refetch()}
/>
```

---

## Vite Proxy Configuration

For API and WebSocket calls during development. The `/ws` prefix proxy covers both `/ws` (standard server event-subscription) and `/ws/events` (orchestrator server event-subscription):

```typescript
// apps/quarry-web/vite.config.ts — standard server on port 3456
// apps/smithy-web/vite.config.ts — orchestrator server on port 3457
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3456', // or 3457 for orchestrator
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3456', // or 3457 for orchestrator
        ws: true,
      },
    },
  },
});
```
