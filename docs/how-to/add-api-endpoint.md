# How to Add an API Endpoint

Step-by-step guide for adding new HTTP endpoints to the server.

## Prerequisites

- Server running at `apps/quarry-server/`
- Understanding of Hono framework
- Access to QuarryAPI

## Steps

### 1. Identify the Route

Determine the HTTP method and path:

```
GET     /api/features           # List
GET     /api/features/:id       # Get one
POST    /api/features           # Create
PATCH   /api/features/:id       # Update
DELETE  /api/features/:id       # Delete
```

### 2. Add the Route Handler

Edit `apps/quarry-server/src/index.ts`:

```typescript
// GET - List all features
app.get('/api/features', async (c) => {
  const features = await api.list({ type: 'feature' });
  return c.json(features);
});

// GET - Get one by ID
app.get('/api/features/:id', async (c) => {
  const id = c.req.param('id');
  const feature = await api.get(id);

  if (!feature) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(feature);
});

// POST - Create
app.post('/api/features', async (c) => {
  const body = await c.req.json();

  // Validate required fields
  if (!body.title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const feature = await api.create({
    type: 'feature',
    ...body,
    createdBy: body.createdBy || defaultActorId,
  });

  return c.json(feature, 201);
});

// PATCH - Update
app.patch('/api/features/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await api.get(id);
  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const updated = await api.update(id, body);
  return c.json(updated);
});

// DELETE
app.delete('/api/features/:id', async (c) => {
  const id = c.req.param('id');

  const existing = await api.get(id);
  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  await api.delete(id);
  return c.json({ success: true });
});
```

### 3. Handle Query Parameters

```typescript
app.get('/api/features', async (c) => {
  // Parse query params
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const tags = c.req.query('tags')?.split(',');

  // Build filter
  const filter: Record<string, unknown> = { type: 'feature' };
  if (status) filter.status = status;
  if (tags) filter.tags = tags;

  // Query with pagination
  const result = await api.listPaginated({
    ...filter,
    limit,
    offset,
  });

  return c.json(result);
});
```

### 4. Add Sub-Resource Endpoints

For nested resources (e.g., plan tasks):

```typescript
// GET /api/plans/:id/tasks
app.get('/api/plans/:id/tasks', async (c) => {
  const planId = c.req.param('id');
  const tasks = await api.getTasksInPlan(planId);
  return c.json(tasks);
});

// POST /api/plans/:id/tasks
app.post('/api/plans/:id/tasks', async (c) => {
  const planId = c.req.param('id');
  const body = await c.req.json();

  // Create task in plan
  const task = await api.createTaskInPlan(planId, body);
  return c.json(task, 201);
});
```

### 5. Add Bulk Operations

```typescript
// PATCH /api/features/bulk
app.patch('/api/features/bulk', async (c) => {
  const { ids, updates } = await c.req.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids array required' }, 400);
  }

  const results = await Promise.all(
    ids.map(id => api.update(id, updates))
  );

  return c.json({ updated: results.length });
});
```

### 6. WebSocket Events (Automatic)

WebSocket event broadcasting is handled automatically by the `EventBroadcaster` (from `@stoneforge/shared-routes`). It polls the database for new events and dispatches them to connected WebSocket clients based on their subscriptions.

When your API endpoint creates, updates, or deletes elements via the `QuarryAPI`, the broadcaster will automatically pick up the resulting events from the `events` table and push them to clients — no manual broadcasting needed.

If you need to broadcast custom events (e.g., inbox notifications), see `apps/quarry-server/src/ws/handler.ts` for the `broadcastInboxEvent()` pattern.

### 7. Error Handling

Use the global error handler for StoneforgeErrors:

```typescript
import { StoneforgeError } from '@stoneforge/core';

// Custom validation error
app.post('/api/features', async (c) => {
  const body = await c.req.json();

  if (!body.title) {
    return c.json({
      error: 'Validation failed',
      details: { title: 'required' },
    }, 400);
  }

  try {
    const feature = await api.create({ type: 'feature', ...body });
    return c.json(feature, 201);
  } catch (err) {
    if (err instanceof StoneforgeError) {
      return c.json({ error: err.message, code: err.code }, 400);
    }
    throw err;
  }
});
```

### 8. Test the Endpoint

```bash
# Create
curl -X POST http://localhost:3456/api/features \
  -H "Content-Type: application/json" \
  -d '{"title": "New Feature", "createdBy": "user-1"}'

# List
curl http://localhost:3456/api/features

# Get
curl http://localhost:3456/api/features/abc123

# Update
curl -X PATCH http://localhost:3456/api/features/abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# Delete
curl -X DELETE http://localhost:3456/api/features/abc123
```

## Common Patterns

### Hydration

```typescript
app.get('/api/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const hydrate = c.req.query('hydrate') === 'true';

  const task = await api.get(id, hydrate ? {
    hydrate: { description: true, content: true }
  } : undefined);

  return c.json(task);
});
```

### Actor from Header

```typescript
app.post('/api/features', async (c) => {
  const actor = c.req.header('X-Actor') || defaultActorId;
  const body = await c.req.json();

  const feature = await api.create({
    type: 'feature',
    ...body,
    createdBy: actor,
  });

  return c.json(feature, 201);
});
```

### Search Endpoint

```typescript
app.get('/api/search', async (c) => {
  const q = c.req.query('q');
  const type = c.req.query('types')?.split(',');

  if (!q) {
    return c.json({ error: 'Query required' }, 400);
  }

  const results = await api.search(q, { type });
  return c.json(results);
});
```

## Checklist

- [ ] Route handler added to `apps/quarry-server/src/index.ts`
- [ ] Query parameters parsed correctly
- [ ] Error handling for not found (404)
- [ ] Error handling for validation (400)
- [ ] WebSocket broadcast for mutations
- [ ] Tested with curl/Postman
- [ ] Web app hook added if needed

---

## Orchestrator Server Endpoints

The orchestrator server (`apps/smithy-server/`) uses a modular route structure. Instead of adding routes directly to `index.ts`, create or edit route files in `src/routes/`.

### Adding to Existing Route File

```typescript
// In apps/smithy-server/src/routes/tasks.ts

// Add new endpoint alongside existing ones
app.get('/api/tasks/:id/history', async (c) => {
  const taskId = c.req.param('id') as ElementId;
  // Implementation using services
  return c.json({ history: [] });
});
```

### Creating a New Route Module

1. Create the route file:

```typescript
// apps/smithy-server/src/routes/my-feature.ts
import { Hono } from 'hono';
import type { Services } from '../services.js';

export function createMyFeatureRoutes(services: Services) {
  const { api, agentRegistry, sessionManager } = services;
  const app = new Hono();

  app.get('/api/my-feature', async (c) => {
    try {
      // Use injected services
      const data = await api.list({ type: 'task' });
      return c.json({ data });
    } catch (error) {
      console.error('[orchestrator] Failed:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
```

2. Export from routes index:

```typescript
// apps/smithy-server/src/routes/index.ts
export { createMyFeatureRoutes } from './my-feature.js';
```

3. Mount in main entry:

```typescript
// apps/smithy-server/src/index.ts
import { createMyFeatureRoutes } from './routes/index.js';

app.route('/', createMyFeatureRoutes(services));
```

### Response Formatting

Use formatters for consistent responses:

```typescript
// apps/smithy-server/src/formatters.ts
export function formatMyResponse(item: MyType) {
  return {
    id: item.id,
    // ... formatted fields
  };
}
```

### Orchestrator Server Checklist

- [ ] Route file created in `src/routes/`
- [ ] Exported from `src/routes/index.ts`
- [ ] Mounted in `src/index.ts`
- [ ] Uses injected services from `Services` interface
- [ ] Formatter added if needed
- [ ] Error handling with consistent error format
- [ ] Tested with curl/Postman
