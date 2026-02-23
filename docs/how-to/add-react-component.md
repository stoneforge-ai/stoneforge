# How to Add a React Component

Step-by-step guide for adding React components to the web apps.

## Prerequisites

- Web app at `apps/quarry-web/` or `apps/smithy-web/`
- Understanding of React + TypeScript
- Familiarity with Tailwind CSS

## Component Types

| Type | Location | Purpose |
|------|----------|---------|
| UI Primitive | `packages/ui/src/components/` | Reusable buttons, inputs, badges, etc. (shared `@stoneforge/ui` package) |
| Domain Component | `packages/ui/src/domain/` | Domain-specific cards (TaskCard, EntityCard, etc.) in shared package |
| App Feature Component | `apps/quarry-web/src/components/{feature}/` | App-specific feature components (filters, panels, etc.) |
| Layout Component | `apps/quarry-web/src/components/layout/` | App shell, sidebar, etc. |

## Steps

### 1. Create the Component File

**UI Primitive** (in `packages/ui/`)**:**
```typescript
// packages/ui/src/components/Badge.tsx
import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
};

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
```

**Domain Component** (in `packages/ui/`)**:**
```typescript
// packages/ui/src/domain/TaskCard.tsx
import { Task } from '@stoneforge/core';
import { Badge } from '../components/Badge';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  className?: string;
}

export function TaskCard({ task, onClick, className }: TaskCardProps) {
  return (
    <div
      className={cn(
        'p-4 rounded-lg border bg-white hover:shadow-md transition-shadow cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">{task.title}</h3>
        <Badge variant={getStatusVariant(task.status)}>{task.status}</Badge>
      </div>
      {task.tags.length > 0 && (
        <div className="mt-2 flex gap-1">
          {task.tags.map(tag => (
            <span key={tag} className="text-xs text-gray-500">#{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'closed': return 'success';
    case 'blocked': return 'error';
    case 'in_progress': return 'warning';
    default: return 'default';
  }
}
```

### 2. Add Data Fetching Hook (if needed)

> **Note:** Existing hooks live in `apps/quarry-web/src/api/hooks/` (e.g., `useAllElements.ts`, `useTaskMutations.ts`). Below is the pattern for creating a new hook.

```typescript
// apps/quarry-web/src/api/hooks/useMyFeatureDetails.ts  (new file)
import { useQuery } from '@tanstack/react-query';
import { Task } from '@stoneforge/core';

const API_BASE = 'http://localhost:3456/api';

export function useTaskDetails(taskId: string) {
  return useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/tasks/${taskId}?hydrate=true`);
      if (!res.ok) throw new Error('Failed to fetch task');
      return res.json();
    },
    enabled: !!taskId,
  });
}
```

### 3. Use the Component

```typescript
// In a page or parent component
import { TaskCard } from '@/components/task/TaskCard';
import { useAllTasks } from '@/api/hooks/useAllElements';

function TaskList() {
  const { data: tasks, isLoading } = useAllTasks();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      {tasks?.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          onClick={() => console.log('Clicked', task.id)}
        />
      ))}
    </div>
  );
}
```

### 4. Handle Real-time Updates

The `useRealtimeEvents` hook (local wrapper around `@stoneforge/ui`) connects to the WebSocket, subscribes to channels, and automatically invalidates React Query caches via `defaultQueryKeyMapper`. You can also handle events manually:

```typescript
import { useRealtimeEvents } from '../api/hooks/useRealtimeEvents';
import type { WebSocketEvent } from '@stoneforge/ui';

function TaskList() {
  useRealtimeEvents({
    channels: ['tasks'],
    onEvent: (event: WebSocketEvent) => {
      if (event.elementType === 'task' && event.eventType === 'created') {
        // Show a toast, play a sound, etc.
      }
    },
    autoInvalidate: true, // default — auto-invalidates React Query caches
  });

  // ... rest of component
}
```

### 5. Add Mutations

```typescript
// apps/quarry-web/src/api/hooks/useTaskMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = 'http://localhost:3456/api';

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useCloseTask() {
  const updateTask = useUpdateTask();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return updateTask.mutateAsync({
        id,
        updates: { status: 'closed', closeReason: reason },
      });
    },
  });
}
```

### 6. Create a Page (if needed)

```typescript
// apps/quarry-web/src/routes/tasks/index.tsx
import { TaskCard } from '@/components/task/TaskCard';
import { useAllTasks } from '@/api/hooks/useAllElements';
import { useState } from 'react';

export default function TasksPage() {
  const { data: tasks, isLoading } = useAllTasks();
  const [filter, setFilter] = useState<string>('all');

  if (isLoading) return <div className="p-6">Loading...</div>;

  const filtered = tasks?.filter(t =>
    filter === 'all' || t.status === filter
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="space-y-4">
        {filtered?.map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
```

### 7. Register the Route

```typescript
// apps/quarry-web/src/router.tsx
import TasksPage from './routes/tasks/index';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // ... existing routes
      { path: 'tasks', element: <TasksPage /> },
    ],
  },
]);
```

### 8. Add Sidebar Link

```typescript
// apps/quarry-web/src/components/layout/Sidebar.tsx
const navItems = [
  // ... existing items
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
];
```

## Styling Patterns

### Conditional Classes

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  'base-classes',
  isActive && 'active-classes',
  isDisabled && 'opacity-50 cursor-not-allowed',
  className
)} />
```

### Responsive Design

```typescript
<div className="
  grid grid-cols-1
  md:grid-cols-2
  lg:grid-cols-3
  gap-4
">
  {/* Grid items */}
</div>
```

### Dark Mode (if supported)

```typescript
<div className="
  bg-white text-gray-900
  dark:bg-gray-800 dark:text-white
">
  {/* Content */}
</div>
```

## Testing

Domain component tests live alongside the components in `packages/ui/src/domain/`. For example, see `packages/ui/src/domain/domain.test.tsx` for the existing domain component test suite.

```typescript
// packages/ui/src/domain/domain.test.tsx  (existing test suite)
import { describe, it, expect } from 'bun:test';
import { TaskCard } from './index';

describe('TaskCard', () => {
  it('exports TaskCard component', async () => {
    const mod = await import('./index');
    expect(mod.TaskCard).toBeDefined();
    expect(typeof mod.TaskCard).toBe('function');
  });

  it('has correct display name', async () => {
    const { TaskCard } = await import('./index');
    expect(TaskCard.name).toBe('TaskCard');
  });
});
```

## Checklist

- [ ] Component file created with TypeScript types
- [ ] Props interface defined
- [ ] Styling with Tailwind + cn() utility
- [ ] Data fetching hook added (if needed)
- [ ] Mutations added (if needed)
- [ ] Real-time updates handled (if needed)
- [ ] Page component created (if needed)
- [ ] Route registered in router.tsx
- [ ] Sidebar link added (if needed)
- [ ] Tests written
