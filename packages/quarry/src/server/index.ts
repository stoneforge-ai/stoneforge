/**
 * Stoneforge Platform Server
 *
 * HTTP + WebSocket server for the Stoneforge web platform.
 * Built with Hono for fast, minimal overhead.
 *
 * Exports `createQuarryApp` (builds the Hono app + services) and
 * `startQuarryServer` (creates the app and starts listening with
 * dual-runtime Bun/Node support).
 */

import { resolve, dirname, extname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { registerStaticMiddleware } from './static.js';
import { mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
// Core types and factory functions
import {
  createTask,
  createDocument,
  createMessage,
  createWorkflowFromPlaybook,
  createWorkflow,
  discoverPlaybookFiles,
  loadPlaybookFromFile,
  createPlaybook,
  createLibrary,
  createGroupChannel,
  createDirectChannel,
  createEntity,
  createTeam,
  getDirectReports,
  getManagementChain,
  validateManager,
  detectReportingCycle,
} from '@stoneforge/core';
import type {
  Element,
  ElementId,
  EntityId,
  CreateTaskInput,
  CreateDocumentInput,
  CreateMessageInput,
  Document,
  DocumentId,
  Message,
  WorkflowStatus,
  CreateWorkflowInput,
  CreateWorkflowFromPlaybookInput,
  Playbook,
  DiscoveredPlaybook,
  CreateLibraryInput,
  CreateGroupChannelInput,
  CreateDirectChannelInput,
  Visibility,
  JoinPolicy,
  CreateTeamInput,
  Channel,
  Workflow,
  InboxFilter,
  InboxStatus,
  Entity,
  EventType,
} from '@stoneforge/core';
// Storage layer
import { createStorage, initializeSchema } from '@stoneforge/storage';
// SDK - API and services (relative imports since we're inside the quarry package)
import { createQuarryAPI } from '../api/quarry-api.js';
import { createSyncService } from '../sync/service.js';
import { createAutoExportService } from '../sync/auto-export.js';
import { createInboxService } from '../services/inbox.js';
import { loadConfig } from '../config/config.js';
import type { QuarryAPI } from '../api/types.js';
import type { SyncService } from '../sync/service.js';
import type { AutoExportService } from '../sync/auto-export.js';
import type { InboxService } from '../services/inbox.js';
// Shared routes for collaborate features
import {
  createElementsRoutes,
  createChannelRoutes,
  createMessageRoutes,
  createLibraryRoutes,
  createDocumentRoutes,
  createPlanRoutes,
} from '@stoneforge/shared-routes';
import { initializeBroadcaster } from './ws/broadcaster.js';
import { handleOpen, handleMessage, handleClose, handleError, getClientCount, broadcastInboxEvent, type ClientData } from './ws/handler.js';

// ============================================================================
// Local type replacing bun's ServerWebSocket (runtime-agnostic)
// ============================================================================

type ServerWebSocket<T> = {
  data: T;
  send(data: string | ArrayBuffer): void;
  close(): void;
  readyState: number;
};

// ============================================================================
// Options & Return Types
// ============================================================================

export interface QuarryServerOptions {
  port?: number;
  host?: string;
  dbPath?: string;
  webRoot?: string;
  corsOrigins?: string[];
}

export interface QuarryApp {
  app: InstanceType<typeof Hono>;
  api: QuarryAPI;
  syncService: SyncService;
  autoExportService: AutoExportService;
  inboxService: InboxService;
  broadcaster: ReturnType<typeof initializeBroadcaster>;
  storageBackend: ReturnType<typeof createStorage>;
}

// ============================================================================
// createQuarryApp
// ============================================================================

export function createQuarryApp(options: QuarryServerOptions = {}): QuarryApp {
  const PORT = options.port ?? parseInt(process.env.PORT || '3456', 10);
  const HOST = options.host ?? (process.env.HOST || 'localhost');

  // Database path - defaults to .stoneforge/stoneforge.db in current working directory
  const PROJECT_ROOT = process.cwd();
  const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, '.stoneforge/stoneforge.db');
  const DB_PATH = options.dbPath ?? (process.env.STONEFORGE_DB_PATH || DEFAULT_DB_PATH);

  // Uploads directory - defaults based on dbPath directory, falling back to PROJECT_ROOT
  const UPLOADS_DIR = DB_PATH === ':memory:'
    ? resolve(PROJECT_ROOT, '.stoneforge/uploads')
    : resolve(dirname(DB_PATH), 'uploads');
  const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];
  const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };

  // ============================================================================
  // Initialize API
  // ============================================================================

  let api: QuarryAPI;
  let syncService: SyncService;
  let inboxService: InboxService;
  let storageBackend: ReturnType<typeof createStorage>;

  try {
    if (DB_PATH !== ':memory:') {
      mkdirSync(dirname(DB_PATH), { recursive: true });
    }
    storageBackend = createStorage({ path: DB_PATH });
    initializeSchema(storageBackend);
    api = createQuarryAPI(storageBackend);
    syncService = createSyncService(storageBackend);
    inboxService = createInboxService(storageBackend);
    console.log(`[stoneforge] Connected to database: ${DB_PATH}`);
  } catch (error) {
    throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ============================================================================
  // Initialize Auto Export
  // ============================================================================

  const config = loadConfig();
  const autoExportService = createAutoExportService({
    syncService,
    backend: storageBackend,
    syncConfig: config.sync,
    outputDir: resolve(PROJECT_ROOT, '.stoneforge/sync'),
  });
  autoExportService.start().catch((err: Error) => {
    console.error('[stoneforge] Failed to start auto-export:', err);
  });

  // ============================================================================
  // Initialize Event Broadcaster
  // ============================================================================

  const broadcaster = initializeBroadcaster(api);
  broadcaster.start().catch((err: Error) => {
    console.error('[stoneforge] Failed to start event broadcaster:', err);
  });

  // ============================================================================
  // Create Hono App
  // ============================================================================

  const app = new Hono();

  // CORS middleware - allow web app to connect
  const corsOrigins = options.corsOrigins ?? [
    `http://${HOST}:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${PORT}`,
  ];
  app.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  // ============================================================================
  // Register Shared Collaborate Routes
  // ============================================================================

  // Create services object for shared routes
  const collaborateServices = {
    api,
    inboxService,
    storageBackend,
    broadcastInboxEvent,
  };

  // Register all collaborate routes from shared package
  app.route('/', createElementsRoutes(collaborateServices));
  app.route('/', createChannelRoutes(collaborateServices));
  app.route('/', createMessageRoutes(collaborateServices));
  app.route('/', createLibraryRoutes(collaborateServices));
  app.route('/', createDocumentRoutes(collaborateServices));
  app.route('/', createPlanRoutes(collaborateServices));

  // ============================================================================
  // Health Check Endpoint
  // ============================================================================

  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: DB_PATH,
      websocket: {
        clients: getClientCount(),
        broadcasting: broadcaster.listenerCount > 0,
      },
    });
  });

// ============================================================================
// Stats Endpoint
// ============================================================================

app.get('/api/stats', async (c) => {
  try {
    const stats = await api.stats();
    return c.json(stats);
  } catch (error) {
    console.error('[stoneforge] Failed to get stats:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } }, 500);
  }
});

// ============================================================================
// Task Enrichment Helper (TB83)
// ============================================================================

/**
 * Enriches tasks with dependency and attachment counts.
 * Used by multiple endpoints for TB83 rich task display.
 */
function enrichTasksWithCounts(tasks: Record<string, unknown>[]): Record<string, unknown>[] {
  if (tasks.length === 0) return tasks;

  // Get all dependencies efficiently using a single query
  const allDependencies = storageBackend.query<{
    blocked_id: string;
    blocker_id: string;
    type: string;
  }>('SELECT blocked_id, blocker_id, type FROM dependencies');

  // Build maps for quick lookup
  const blocksCountMap = new Map<string, number>();
  const blockedByCountMap = new Map<string, number>();
  const attachmentCountMap = new Map<string, number>();

  for (const dep of allDependencies) {
    const depType = dep.type;
    const blockedId = dep.blocked_id;
    const blockerId = dep.blocker_id;

    if (depType === 'blocks' || depType === 'awaits') {
      blocksCountMap.set(blockerId, (blocksCountMap.get(blockerId) || 0) + 1);
      blockedByCountMap.set(blockedId, (blockedByCountMap.get(blockedId) || 0) + 1);
    } else if (depType === 'references') {
      attachmentCountMap.set(blockedId, (attachmentCountMap.get(blockedId) || 0) + 1);
    }
  }

  // Enrich tasks with counts
  return tasks.map((task) => {
    const taskId = task.id as string;
    return {
      ...task,
      _attachmentCount: attachmentCountMap.get(taskId) || 0,
      _blocksCount: blocksCountMap.get(taskId) || 0,
      _blockedByCount: blockedByCountMap.get(taskId) || 0,
    };
  });
}

// ============================================================================
// Tasks Endpoints
// ============================================================================

app.get('/api/tasks', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse query parameters
    const statusParam = url.searchParams.get('status');
    const priorityParam = url.searchParams.get('priority');
    const assigneeParam = url.searchParams.get('assignee');
    const tagsParam = url.searchParams.get('tags');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');
    const searchParam = url.searchParams.get('search');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'task',
    };

    if (statusParam) {
      // Support comma-separated statuses
      filter.status = statusParam.includes(',') ? statusParam.split(',') : statusParam;
    }
    if (priorityParam) {
      const priorities = priorityParam.split(',').map(p => parseInt(p, 10)).filter(p => !isNaN(p));
      filter.priority = priorities.length === 1 ? priorities[0] : priorities;
    }
    if (assigneeParam) {
      filter.assignee = assigneeParam;
    }
    if (tagsParam) {
      filter.tags = tagsParam.split(',');
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    } else {
      filter.limit = 50; // Default page size
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }
    if (orderByParam) {
      filter.orderBy = orderByParam;
    } else {
      filter.orderBy = 'updated_at';
    }
    if (orderDirParam) {
      filter.orderDir = orderDirParam;
    } else {
      filter.orderDir = 'desc';
    }

    // If search param is provided, use the search API
    if (searchParam && searchParam.trim()) {
      const searchResults = await api.search(searchParam.trim(), filter as Parameters<typeof api.search>[1]);
      const limit = filter.limit as number || 50;
      const offset = (filter.offset as number) || 0;
      const slicedResults = searchResults.slice(offset, offset + limit);
      return c.json({
        data: slicedResults,
        total: searchResults.length,
        limit,
        offset,
      });
    }

    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);
    return c.json(result);
  } catch (error) {
    console.error('[stoneforge] Failed to get tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get tasks' } }, 500);
  }
});

app.get('/api/tasks/ready', async (c) => {
  try {
    const tasks = await api.ready();
    // TB83: Enrich ready tasks with counts for rich display
    const enrichedTasks = enrichTasksWithCounts(tasks as unknown as Record<string, unknown>[]);
    return c.json(enrichedTasks);
  } catch (error) {
    console.error('[stoneforge] Failed to get ready tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get ready tasks' } }, 500);
  }
});

app.get('/api/tasks/blocked', async (c) => {
  try {
    const tasks = await api.blocked();
    // TB83: Enrich blocked tasks with counts for rich display
    const enrichedTasks = enrichTasksWithCounts(tasks as unknown as Record<string, unknown>[]);
    return c.json(enrichedTasks);
  } catch (error) {
    console.error('[stoneforge] Failed to get blocked tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get blocked tasks' } }, 500);
  }
});

app.get('/api/tasks/in-progress', async (c) => {
  try {
    // Get tasks with in_progress status, sorted by updated_at desc
    const tasks = await api.list({
      type: 'task',
      status: 'in_progress',
      orderBy: 'updated_at',
      orderDir: 'desc',
    } as Parameters<typeof api.list>[0]);
    return c.json(tasks);
  } catch (error) {
    console.error('[stoneforge] Failed to get in-progress tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get in-progress tasks' } }, 500);
  }
});

app.get('/api/tasks/completed', async (c) => {
  try {
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const afterParam = url.searchParams.get('after'); // ISO date string for date filtering

    // Get tasks with closed status, sorted by updated_at desc
    // The API accepts TaskFilter when type is 'task', but TypeScript signature is ElementFilter
    // Note: The actual status value is 'closed' (not 'completed') per src/types/task.ts
    const filter: Record<string, unknown> = {
      type: 'task',
      status: ['closed'],
      orderBy: 'updated_at',
      orderDir: 'desc',
      limit: limitParam ? parseInt(limitParam, 10) : 20,
    };

    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    // Note: 'after' date filtering needs to be done post-query since the API
    // may not support date filtering directly on updated_at
    let tasks = await api.list(filter as Parameters<typeof api.list>[0]);

    // Save the fetched count before filtering to determine if there are more pages
    const fetchedCount = tasks.length;

    // Apply date filter if provided
    if (afterParam) {
      const afterDate = new Date(afterParam);
      tasks = tasks.filter((task) => new Date(task.updatedAt) >= afterDate);
    }

    // Return with total count for pagination info
    // hasMore is based on whether we got a full page from the DB (before date filtering)
    return c.json({
      items: tasks,
      hasMore: fetchedCount === (filter.limit as number),
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get completed tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get completed tasks' } }, 500);
  }
});

app.get('/api/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);

    // Parse hydration options from query params
    const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';
    const hydrateDesign = url.searchParams.get('hydrate.design') === 'true';

    const hydrate = (hydrateDescription || hydrateDesign)
      ? { description: hydrateDescription, design: hydrateDesign }
      : undefined;

    const task = await api.get(id, hydrate ? { hydrate } : undefined);

    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Verify it's actually a task
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Fetch dependencies and dependents for the task detail view
    const [dependencies, dependents] = await Promise.all([
      api.getDependencies(id),
      api.getDependents(id),
    ]);

    return c.json({
      ...task,
      _dependencies: dependencies,
      _dependents: dependents,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get task' } }, 500);
  }
});

app.post('/api/tasks', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
    }
    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
    }

    // Handle description field - creates linked Document (TB124)
    let descriptionRef = body.descriptionRef;
    if (body.description !== undefined && body.description.trim().length > 0 && !descriptionRef) {
      const docInput: CreateDocumentInput = {
        contentType: 'markdown',
        content: body.description,
        createdBy: body.createdBy as EntityId,
        tags: ['task-description'],
      };
      const newDoc = await createDocument(docInput);
      const docWithTitle = { ...newDoc, title: `Description for task ${body.title}` };
      const createdDoc = await api.create(docWithTitle as unknown as Element & Record<string, unknown>);
      descriptionRef = createdDoc.id;
    }

    // Build CreateTaskInput from request body
    const taskInput: CreateTaskInput = {
      title: body.title,
      createdBy: body.createdBy,
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.complexity !== undefined && { complexity: body.complexity }),
      ...(body.taskType !== undefined && { taskType: body.taskType }),
      ...(body.assignee !== undefined && { assignee: body.assignee }),
      ...(body.owner !== undefined && { owner: body.owner }),
      ...(body.deadline !== undefined && { deadline: body.deadline }),
      ...(body.scheduledFor !== undefined && { scheduledFor: body.scheduledFor }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(descriptionRef !== undefined && { descriptionRef }),
      ...(body.acceptanceCriteria !== undefined && { acceptanceCriteria: body.acceptanceCriteria }),
    };
    const task = await createTask(taskInput);
    const created = await api.create(task as unknown as Element & Record<string, unknown>);

    return c.json(created);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[stoneforge] Failed to create task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' } }, 500);
  }
});

// Bulk update tasks - MUST be before /:id route to avoid matching "bulk" as an id
app.patch('/api/tasks/bulk', async (c) => {
  try {
    const body = await c.req.json();

    // Validate request structure
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
    }
    if (!body.updates || typeof body.updates !== 'object') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'updates must be an object' } }, 400);
    }

    const ids = body.ids as string[];

    // Extract allowed updates
    const updates: Record<string, unknown> = {};
    const allowedFields = [
      'status', 'priority', 'complexity', 'taskType',
      'assignee', 'owner', 'deadline', 'scheduledFor', 'tags'
    ];

    for (const field of allowedFields) {
      if (body.updates[field] !== undefined) {
        updates[field] = body.updates[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
    }

    // Update each task
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const existing = await api.get(id as ElementId);
        if (!existing || existing.type !== 'task') {
          results.push({ id, success: false, error: 'Task not found' });
          continue;
        }

        await api.update(id as ElementId, updates);
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id, success: false, error: (error as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return c.json({
      updated: successCount,
      failed: failureCount,
      results,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to bulk update tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to bulk update tasks' } }, 500);
  }
});

// Bulk delete tasks - Uses POST with action parameter for better proxy compatibility
app.post('/api/tasks/bulk-delete', async (c) => {
  console.log('[stoneforge] Bulk delete request received');
  try {
    const body = await c.req.json();
    console.log('[stoneforge] Bulk delete body:', JSON.stringify(body));

    // Validate request structure
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      console.log('[stoneforge] Bulk delete validation failed: ids must be a non-empty array');
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
    }

    const ids = body.ids as string[];
    console.log('[stoneforge] Deleting tasks:', ids);

    // Delete each task
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const existing = await api.get(id as ElementId);
        if (!existing || existing.type !== 'task') {
          console.log(`[stoneforge] Task not found: ${id}`);
          results.push({ id, success: false, error: 'Task not found' });
          continue;
        }

        console.log(`[stoneforge] Deleting task: ${id}`);
        await api.delete(id as ElementId);
        console.log(`[stoneforge] Successfully deleted task: ${id}`);
        results.push({ id, success: true });
      } catch (error) {
        console.error(`[stoneforge] Error deleting task ${id}:`, error);
        results.push({ id, success: false, error: (error as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`[stoneforge] Bulk delete complete: ${successCount} deleted, ${failureCount} failed`);
    return c.json({
      deleted: successCount,
      failed: failureCount,
      results,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to bulk delete tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to bulk delete tasks' } }, 500);
  }
});

app.patch('/api/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // First verify it's a task
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (existing.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Extract allowed updates (prevent changing immutable fields)
    const updates: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'status', 'priority', 'complexity', 'taskType',
      'assignee', 'owner', 'deadline', 'scheduledFor', 'tags', 'metadata'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Handle description field - creates or updates linked Document (TB124)
    if (body.description !== undefined) {
      const task = existing as { descriptionRef?: string; createdBy: string };

      if (task.descriptionRef) {
        // Update existing description document
        const descDoc = await api.get(task.descriptionRef as ElementId);
        if (descDoc && descDoc.type === 'document') {
          await api.update(task.descriptionRef as ElementId, {
            content: body.description,
          } as unknown as Partial<Document>);
        }
      } else if (body.description.trim().length > 0) {
        // Create new description document and link it
        const docInput: CreateDocumentInput = {
          contentType: 'markdown',
          content: body.description,
          createdBy: task.createdBy as EntityId,
          tags: ['task-description'],
        };
        const newDoc = await createDocument(docInput);
        const docWithTitle = { ...newDoc, title: `Description for task ${id}` };
        const createdDoc = await api.create(docWithTitle as unknown as Element & Record<string, unknown>);
        updates.descriptionRef = createdDoc.id;
      }
    }

    // Update the task
    const updated = await api.update(id, updates);

    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'CONCURRENT_MODIFICATION') {
      return c.json({ error: { code: 'CONFLICT', message: 'Task was modified by another process' } }, 409);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[stoneforge] Failed to update task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update task' } }, 500);
  }
});

app.delete('/api/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // First verify it's a task
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (existing.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // TB121/TB122: Check if task is in a plan or workflow and would be the last one
    const parentDeps = await api.getDependencies(id, ['parent-child']);
    for (const dep of parentDeps) {
      const parent = await api.get(dep.blockerId);
      if (parent) {
        if (parent.type === 'plan') {
          // Check if this is the last task in the plan
          const planTasks = await api.getTasksInPlan(dep.blockerId);
          if (planTasks.length === 1 && planTasks[0].id === id) {
            return c.json({
              error: {
                code: 'LAST_TASK',
                message: 'Cannot delete the last task in a plan. Plans must have at least one task.'
              }
            }, 400);
          }
        } else if (parent.type === 'workflow') {
          // Check if this is the last task in the workflow
          const workflowTasks = await api.getTasksInWorkflow(dep.blockerId);
          if (workflowTasks.length === 1 && workflowTasks[0].id === id) {
            return c.json({
              error: {
                code: 'LAST_TASK',
                message: "Cannot delete the last task in a workflow. Workflows must have at least one task. Use 'sf workflow delete' to delete the entire workflow."
              }
            }, 400);
          }
        }
      }
    }

    // Soft-delete the task
    await api.delete(id);

    return c.json({ success: true, id });
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    console.error('[stoneforge] Failed to delete task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete task' } }, 500);
  }
});

// ============================================================================
// Task Attachments Endpoints
// ============================================================================

/**
 * GET /api/tasks/:id/attachments
 * Returns all documents attached to a task via 'references' dependencies
 */
app.get('/api/tasks/:id/attachments', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Get all dependencies where this task references a document
    const dependencies = await api.getDependencies(taskId);
    const attachmentDeps = dependencies.filter(
      (dep) => dep.blockedId === taskId && dep.type === 'references'
    );

    // Get the document details for each attachment
    const attachments = await Promise.all(
      attachmentDeps.map(async (dep) => {
        const doc = await api.get(dep.blockerId as ElementId);
        if (doc && doc.type === 'document') {
          return doc;
        }
        return null;
      })
    );

    // Filter out nulls (in case documents were deleted)
    return c.json(attachments.filter(Boolean));
  } catch (error) {
    console.error('[stoneforge] Failed to get task attachments:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get task attachments' } }, 500);
  }
});

/**
 * POST /api/tasks/:id/attachments
 * Attaches a document to a task via 'references' dependency
 */
app.post('/api/tasks/:id/attachments', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // Validate document ID
    if (!body.documentId || typeof body.documentId !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'documentId is required' } }, 400);
    }

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Verify document exists
    const doc = await api.get(body.documentId as ElementId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (doc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Check if already attached
    const existingDeps = await api.getDependencies(taskId);
    const alreadyAttached = existingDeps.some(
      (dep) => dep.blockedId === taskId && dep.blockerId === body.documentId && dep.type === 'references'
    );
    if (alreadyAttached) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Document is already attached to this task' } }, 400);
    }

    // Create the references dependency (task references document)
    await api.addDependency({
      blockedId: taskId,
      blockerId: body.documentId as ElementId,
      type: 'references',
      actor: (body.actor as EntityId) || ('el-0000' as EntityId),
    });

    return c.json(doc, 201);
  } catch (error) {
    console.error('[stoneforge] Failed to attach document to task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to attach document' } }, 500);
  }
});

/**
 * DELETE /api/tasks/:id/attachments/:docId
 * Removes a document attachment from a task
 */
app.delete('/api/tasks/:id/attachments/:docId', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const docId = c.req.param('docId') as ElementId;

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Find the attachment dependency
    const dependencies = await api.getDependencies(taskId);
    const attachmentDep = dependencies.find(
      (dep) => dep.blockedId === taskId && dep.blockerId === docId && dep.type === 'references'
    );

    if (!attachmentDep) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document is not attached to this task' } }, 404);
    }

    // Remove the dependency
    await api.removeDependency(taskId, docId, 'references');

    return c.json({ success: true, taskId, documentId: docId });
  } catch (error) {
    console.error('[stoneforge] Failed to remove task attachment:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove attachment' } }, 500);
  }
});

/**
 * GET /api/tasks/:id/dependency-tasks
 * Returns hydrated task details for dependencies (blocks/blocked-by)
 * Used for displaying dependencies as sub-issues in TaskDetailPanel (TB84)
 */
app.get('/api/tasks/:id/dependency-tasks', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // getDependencies(taskId) = rows where taskId is SOURCE (this task blocks others)
    // getDependents(taskId) = rows where taskId is TARGET (other tasks block this task)
    const [outgoingDeps, incomingDeps] = await Promise.all([
      api.getDependencies(taskId),  // This task is source -> this task BLOCKS others
      api.getDependents(taskId),    // This task is target -> other tasks BLOCK this task
    ]);

    // Filter to only include blocks/awaits dependency types (not references)
    // blockedByDeps: dependencies where THIS task is blocked BY other tasks (incoming)
    const blockedByDeps = incomingDeps.filter(d => d.type === 'blocks' || d.type === 'awaits');
    // blocksDeps: dependencies where THIS task blocks other tasks (outgoing)
    const blocksDeps = outgoingDeps.filter(d => d.type === 'blocks' || d.type === 'awaits');

    // Collect all unique task IDs we need to fetch
    // For blockedBy: this task is the blocked, so fetch the blocker
    // For blocks: this task is the blocker, so fetch the blocked task
    const blockerTaskIds = blockedByDeps.map(d => d.blockerId);
    const blockedTaskIds = blocksDeps.map(d => d.blockedId);
    const allTaskIds = [...new Set([...blockerTaskIds, ...blockedTaskIds])];

    // Fetch all related tasks in parallel
    const tasksMap = new Map<string, { id: string; title: string; status: string; priority: number }>();

    if (allTaskIds.length > 0) {
      const taskPromises = allTaskIds.map(async (id) => {
        try {
          const t = await api.get(id as ElementId);
          if (t && t.type === 'task') {
            return {
              id: t.id,
              title: (t as unknown as { title: string }).title,
              status: (t as unknown as { status: string }).status,
              priority: (t as unknown as { priority: number }).priority,
            };
          }
          return null;
        } catch {
          return null;
        }
      });

      const tasks = await Promise.all(taskPromises);
      tasks.forEach((t) => {
        if (t) tasksMap.set(t.id, t);
      });
    }

    // Build hydrated blocker list (tasks that block this task)
    const blockedBy = blockedByDeps.map((dep) => {
      const blockerTask = tasksMap.get(dep.blockerId);
      return {
        dependencyType: dep.type,
        task: blockerTask || { id: dep.blockerId, title: `Unknown (${dep.blockerId})`, status: 'unknown', priority: 3 },
      };
    });

    // Build hydrated blocking list (tasks blocked by this task)
    const blocks = blocksDeps.map((dep) => {
      const blockedTask = tasksMap.get(dep.blockedId);
      return {
        dependencyType: dep.type,
        task: blockedTask || { id: dep.blockedId, title: `Unknown (${dep.blockedId})`, status: 'unknown', priority: 3 },
      };
    });

    // Calculate progress stats — check terminal statuses across all element types
    // Tasks: closed, tombstone | Plans: completed, cancelled | Workflows: completed, cancelled, failed
    const blockedByResolved = blockedBy.filter(b =>
      ['closed', 'completed', 'tombstone', 'cancelled', 'failed'].includes(b.task.status)
    ).length;
    const blockedByTotal = blockedBy.length;

    return c.json({
      blockedBy,
      blocks,
      progress: {
        resolved: blockedByResolved,
        total: blockedByTotal,
      },
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get dependency tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get dependency tasks' } }, 500);
  }
});

// ============================================================================
// Entities Endpoints
// ============================================================================

app.get('/api/entities', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse pagination and filter parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');
    const entityTypeParam = url.searchParams.get('entityType');
    const searchParam = url.searchParams.get('search');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'entity',
    };

    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    } else {
      filter.limit = 50; // Default page size
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }
    if (orderByParam) {
      filter.orderBy = orderByParam;
    } else {
      filter.orderBy = 'updated_at';
    }
    if (orderDirParam) {
      filter.orderDir = orderDirParam;
    } else {
      filter.orderDir = 'desc';
    }

    // Get paginated results
    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

    // Apply client-side filtering for entityType and search (not supported in base filter)
    let filteredItems = result.items;

    if (entityTypeParam && entityTypeParam !== 'all') {
      filteredItems = filteredItems.filter((e) => {
        const entity = e as unknown as { entityType: string };
        return entity.entityType === entityTypeParam;
      });
    }

    if (searchParam) {
      const query = searchParam.toLowerCase();
      filteredItems = filteredItems.filter((e) => {
        const entity = e as unknown as { name: string; id: string; tags?: string[] };
        return (
          entity.name.toLowerCase().includes(query) ||
          entity.id.toLowerCase().includes(query) ||
          (entity.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    // Return paginated response format
    return c.json({
      items: filteredItems,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get entities:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entities' } }, 500);
  }
});

app.post('/api/entities', async (c) => {
  try {
    const body = await c.req.json();
    const { name, entityType, publicKey, tags, metadata, createdBy } = body;

    // Validation
    if (!name || typeof name !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }, 400);
    }
    if (!entityType || !['agent', 'human', 'system'].includes(entityType)) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Valid entity type (agent, human, system) is required' } }, 400);
    }

    // Check for duplicate name
    const existingEntities = await api.list({ type: 'entity' });
    const duplicateName = existingEntities.some((e) => {
      const entity = e as unknown as { name: string };
      return entity.name.toLowerCase() === name.toLowerCase();
    });
    if (duplicateName) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Entity with this name already exists' } }, 400);
    }

    const entityInput = {
      name,
      entityType,
      publicKey,
      tags: tags || [],
      metadata: metadata || {},
      createdBy: (createdBy || 'el-0000') as EntityId,
    };

    const entity = await createEntity(entityInput);
    const created = await api.create(entity as unknown as Element & Record<string, unknown>);

    return c.json(created, 201);
  } catch (error) {
    console.error('[stoneforge] Failed to create entity:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create entity';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

app.get('/api/entities/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const entity = await api.get(id);
    if (!entity) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }
    return c.json(entity);
  } catch (error) {
    console.error('[stoneforge] Failed to get entity:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity' } }, 500);
  }
});

app.patch('/api/entities/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();
    const { name, tags, metadata, active } = body;

    // Verify entity exists
    const existing = await api.get(id);
    if (!existing || existing.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Build updates object
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      // Validate name format
      if (typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be a non-empty string' } }, 400);
      }
      // Check for duplicate name (if changing)
      const existingEntity = existing as unknown as { name: string };
      if (name !== existingEntity.name) {
        const existingEntities = await api.list({ type: 'entity' });
        const duplicateName = existingEntities.some((e) => {
          const entity = e as unknown as { name: string; id: string };
          return entity.name.toLowerCase() === name.toLowerCase() && entity.id !== id;
        });
        if (duplicateName) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Entity with this name already exists' } }, 400);
        }
      }
      updates.name = name.trim();
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Tags must be an array' } }, 400);
      }
      updates.tags = tags;
    }

    if (metadata !== undefined) {
      if (typeof metadata !== 'object' || metadata === null) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Metadata must be an object' } }, 400);
      }
      updates.metadata = metadata;
    }

    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Active must be a boolean' } }, 400);
      }
      updates.active = active;
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
    }

    const updated = await api.update(id, updates);
    return c.json(updated);
  } catch (error) {
    console.error('[stoneforge] Failed to update entity:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update entity';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

app.get('/api/entities/:id/tasks', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    // Get tasks assigned to this entity
    const tasks = await api.list({
      type: 'task',
      assignee: id,
    } as Parameters<typeof api.list>[0]);
    return c.json(tasks);
  } catch (error) {
    console.error('[stoneforge] Failed to get entity tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity tasks' } }, 500);
  }
});

app.get('/api/entities/:id/stats', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Get tasks assigned to this entity
    const assignedTasks = await api.list({
      type: 'task',
      assignee: id,
    } as Parameters<typeof api.list>[0]);

    // Get tasks created by this entity (filter post-query since createdBy needs EntityId)
    const allTasks = await api.list({
      type: 'task',
    } as Parameters<typeof api.list>[0]);
    const createdTasks = allTasks.filter((t) => String(t.createdBy) === String(id));

    // Get messages sent by this entity
    const messages = await api.list({
      type: 'message',
    } as Parameters<typeof api.list>[0]);
    const sentMessages = messages.filter((m) => {
      const msg = m as unknown as { sender?: string };
      return msg.sender === id;
    });

    // Get documents created by this entity (filter post-query)
    const allDocuments = await api.list({
      type: 'document',
    } as Parameters<typeof api.list>[0]);
    const documents = allDocuments.filter((d) => String(d.createdBy) === String(id));

    // Calculate task stats
    const activeTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status !== 'closed' && task.status !== 'cancelled';
      }
    );
    const completedTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status === 'closed';
      }
    );

    // Calculate tasks completed today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const completedTodayTasks = completedTasks.filter(
      (t) => {
        const task = t as unknown as { updatedAt: string };
        return new Date(task.updatedAt) >= startOfToday;
      }
    );

    // Calculate blocked tasks
    const blockedTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status === 'blocked';
      }
    );

    // Calculate in-progress tasks
    const inProgressTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status === 'in_progress';
      }
    );

    return c.json({
      assignedTaskCount: assignedTasks.length,
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasks.length,
      completedTodayCount: completedTodayTasks.length,
      blockedTaskCount: blockedTasks.length,
      inProgressTaskCount: inProgressTasks.length,
      createdTaskCount: createdTasks.length,
      messageCount: sentMessages.length,
      documentCount: documents.length,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get entity stats:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity stats' } }, 500);
  }
});

app.get('/api/entities/:id/events', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const eventTypeParam = url.searchParams.get('eventType');

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Parse event type filter if provided
    let eventTypeFilter: EventType | EventType[] | undefined;
    if (eventTypeParam) {
      const types = eventTypeParam.split(',').map(t => t.trim()).filter(Boolean) as EventType[];
      eventTypeFilter = types.length === 1 ? types[0] : types;
    }

    // Get events by this actor
    const events = await api.listEvents({
      actor: id as unknown as EntityId,
      limit: limitParam ? parseInt(limitParam, 10) : 20,
      offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
      eventType: eventTypeFilter,
    });

    return c.json(events);
  } catch (error) {
    console.error('[stoneforge] Failed to get entity events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity events' } }, 500);
  }
});

// GET /api/entities/:id/history - Get entity's full event history with pagination
// TB110: Entity Event History (Commit History Style)
app.get('/api/entities/:id/history', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const eventTypeParam = url.searchParams.get('eventType');

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Parse event type filter if provided
    let eventTypeFilter: EventType | EventType[] | undefined;
    if (eventTypeParam) {
      const types = eventTypeParam.split(',').map(t => t.trim()).filter(Boolean) as EventType[];
      eventTypeFilter = types.length === 1 ? types[0] : types;
    }

    // Get total count (events without pagination)
    const allEvents = await api.listEvents({
      actor: id as unknown as EntityId,
      limit: 100000, // High limit to get total count
      eventType: eventTypeFilter,
    });
    const total = allEvents.length;

    // Get paginated events
    const events = await api.listEvents({
      actor: id as unknown as EntityId,
      limit,
      offset,
      eventType: eventTypeFilter,
    });

    return c.json({
      items: events,
      total,
      offset,
      limit,
      hasMore: offset + events.length < total,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get entity history:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity history' } }, 500);
  }
});

// GET /api/entities/:id/activity - Get daily activity counts for contribution chart
// TB108: Entity Contribution Chart - GitHub-style activity grid
app.get('/api/entities/:id/activity', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 365;

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all events by this actor in the date range
    const events = await api.listEvents({
      actor: id as unknown as EntityId,
      after: startDate.toISOString(),
      before: endDate.toISOString(),
      limit: 10000, // Get all events in range
    });

    // Aggregate by date (YYYY-MM-DD)
    const activityByDate: Record<string, number> = {};
    for (const event of events) {
      const date = event.createdAt.split('T')[0]; // Extract YYYY-MM-DD
      activityByDate[date] = (activityByDate[date] || 0) + 1;
    }

    // Convert to array format for frontend
    const activity = Object.entries(activityByDate).map(([date, count]) => ({
      date,
      count,
    }));

    // Sort by date ascending
    activity.sort((a, b) => a.date.localeCompare(b.date));

    return c.json({
      entityId: id,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalEvents: events.length,
      activity,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get entity activity:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity activity' } }, 500);
  }
});

// GET /api/entities/:id/mentions - Get documents and tasks that mention this entity
// TB113: Entity Tags Display - Shows where this entity is @mentioned
app.get('/api/entities/:id/mentions', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    // Verify entity exists and get their name
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }
    const entityTyped = entity as unknown as { name: string };
    const entityName = entityTyped.name;

    // Create search pattern for @mentions (stored as @name in Markdown)
    const mentionPattern = `@${entityName}`;

    // Search for documents containing the mention
    const allDocuments = await api.list({
      type: 'document',
    } as Parameters<typeof api.list>[0]);

    const mentioningDocuments: Array<{
      id: string;
      title: string;
      contentType: string;
      updatedAt: string;
      type: 'document';
    }> = [];

    for (const doc of allDocuments) {
      const docTyped = doc as unknown as { id: string; title?: string; content?: string; contentType: string; updatedAt: string };
      const content = docTyped.content || '';

      // Check if content contains the @mention
      if (content.includes(mentionPattern)) {
        mentioningDocuments.push({
          id: docTyped.id,
          title: docTyped.title || `Document ${docTyped.id}`,
          contentType: docTyped.contentType,
          updatedAt: docTyped.updatedAt,
          type: 'document',
        });

        if (mentioningDocuments.length >= limit) break;
      }
    }

    // Sort documents by updatedAt (most recent first)
    const allMentions = mentioningDocuments
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);

    return c.json({
      entityId: id,
      entityName,
      mentions: allMentions,
      documentCount: mentioningDocuments.length,
      totalCount: mentioningDocuments.length,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get entity mentions:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity mentions' } }, 500);
  }
});

// ============================================================================
// Inbox Endpoints
// ============================================================================

// GET /api/entities/:id/inbox - Get entity's inbox with pagination and optional hydration
app.get('/api/entities/:id/inbox', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;
    const url = new URL(c.req.url);

    // Parse pagination params
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const statusParam = url.searchParams.get('status');
    const sourceTypeParam = url.searchParams.get('sourceType');
    const hydrateParam = url.searchParams.get('hydrate');

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Build filter
    const filter: InboxFilter = {
      limit: limitParam ? parseInt(limitParam, 10) : 25,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    // Handle status filter (can be comma-separated for multiple values)
    if (statusParam) {
      const statuses = statusParam.split(',') as InboxStatus[];
      filter.status = statuses.length === 1 ? statuses[0] : statuses;
    }

    // Handle source type filter
    if (sourceTypeParam) {
      filter.sourceType = sourceTypeParam as 'direct' | 'mention';
    }

    // Get paginated inbox items
    const result = inboxService.getInboxPaginated(id, filter);

    // Hydrate items if requested
    let items = result.items;
    if (hydrateParam === 'true') {
      // Hydrate each inbox item with message, channel, sender, and TB92 enhancements
      items = await Promise.all(result.items.map(async (item) => {
        try {
          // Get message
          const message = await api.get(item.messageId as unknown as ElementId) as Message | null;

          // Get channel
          const channel = await api.get(item.channelId as unknown as ElementId) as Channel | null;

          // Get sender from message
          let sender = null;
          if (message?.sender) {
            sender = await api.get(message.sender as unknown as ElementId);
          }

          // Get message content - both preview and full content (TB92)
          let messagePreview = '';
          let fullContent = '';
          let contentType = 'text';
          if (message?.contentRef) {
            const contentDoc = await api.get(message.contentRef as unknown as ElementId) as Document | null;
            if (contentDoc?.content) {
              fullContent = contentDoc.content;
              contentType = contentDoc.contentType ?? 'text';
              // Truncate content for preview
              messagePreview = contentDoc.content.substring(0, 150);
              if (contentDoc.content.length > 150) {
                messagePreview += '...';
              }
            }
          }

          // TB92: Hydrate attachments (document embeds)
          let hydratedAttachments: { id: string; title: string; content?: string; contentType?: string }[] = [];
          if (message?.attachments && message.attachments.length > 0) {
            hydratedAttachments = await Promise.all(
              message.attachments.map(async (attachmentId) => {
                try {
                  const attachmentDoc = await api.get(attachmentId as unknown as ElementId) as Document | null;
                  if (attachmentDoc) {
                    // Derive title from first line of content or use ID
                    const firstLine = attachmentDoc.content?.split('\n')[0]?.substring(0, 50) ?? '';
                    const title = firstLine.replace(/^#+\s*/, '') || `Document ${attachmentDoc.id}`;
                    return {
                      id: attachmentDoc.id,
                      title: title,
                      content: attachmentDoc.content,
                      contentType: attachmentDoc.contentType ?? 'text',
                    };
                  }
                  return { id: attachmentId, title: 'Unknown Document' };
                } catch {
                  return { id: attachmentId, title: 'Unknown Document' };
                }
              })
            );
          }

          // TB92: Get thread parent message if this is a reply
          let threadParent = null;
          if (message?.threadId) {
            try {
              const parentMessage = await api.get(message.threadId as unknown as ElementId) as Message | null;
              if (parentMessage) {
                // Get parent sender
                let parentSender = null;
                if (parentMessage.sender) {
                  parentSender = await api.get(parentMessage.sender as unknown as ElementId);
                }
                // Get parent content preview
                let parentPreview = '';
                if (parentMessage.contentRef) {
                  const parentContentDoc = await api.get(parentMessage.contentRef as unknown as ElementId) as Document | null;
                  if (parentContentDoc?.content) {
                    parentPreview = parentContentDoc.content.substring(0, 100);
                    if (parentContentDoc.content.length > 100) {
                      parentPreview += '...';
                    }
                  }
                }
                threadParent = {
                  id: parentMessage.id,
                  sender: parentSender,
                  contentPreview: parentPreview,
                  createdAt: parentMessage.createdAt,
                };
              }
            } catch {
              // Thread parent fetch failed, continue without it
            }
          }

          return {
            ...item,
            message: message ? {
              ...message,
              contentPreview: messagePreview,
              fullContent: fullContent,
              contentType: contentType,
            } : null,
            channel: channel,
            sender: sender,
            attachments: hydratedAttachments,
            threadParent: threadParent,
          };
        } catch (err) {
          // If hydration fails for an item, return it without hydration
          console.warn(`[stoneforge] Failed to hydrate inbox item ${item.id}:`, err);
          return item;
        }
      }));
    }

    return c.json({
      items,
      total: result.total,
      offset: filter.offset ?? 0,
      limit: filter.limit ?? 25,
      hasMore: (filter.offset ?? 0) + result.items.length < result.total,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get entity inbox:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity inbox' } }, 500);
  }
});

// GET /api/entities/:id/inbox/count - Get unread inbox count
app.get('/api/entities/:id/inbox/count', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    const count = inboxService.getUnreadCount(id);
    return c.json({ count });
  } catch (error) {
    console.error('[stoneforge] Failed to get inbox count:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get inbox count' } }, 500);
  }
});

// POST /api/entities/:id/inbox/mark-all-read - Mark all inbox items as read
app.post('/api/entities/:id/inbox/mark-all-read', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    const count = inboxService.markAllAsRead(id);

    // Broadcast bulk update event for real-time updates
    // Since this is a bulk operation, broadcast a single event with count info
    if (count > 0) {
      broadcastInboxEvent(
        `bulk-${id}`, // Pseudo ID for bulk operation
        id,
        'updated',
        null,
        { bulkMarkRead: true, count }
      );
    }

    return c.json({ markedCount: count });
  } catch (error) {
    console.error('[stoneforge] Failed to mark all as read:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to mark all as read' } }, 500);
  }
});

// PATCH /api/inbox/:itemId - Update inbox item status
app.patch('/api/inbox/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    const body = await c.req.json<{
      status: 'read' | 'unread' | 'archived';
    }>();

    if (!body.status) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'status is required' } }, 400);
    }

    // Get old item state for event broadcasting
    const oldItem = inboxService.getInboxItem(itemId);
    if (!oldItem) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Inbox item not found' } }, 404);
    }

    let item;
    switch (body.status) {
      case 'read':
        item = inboxService.markAsRead(itemId);
        break;
      case 'unread':
        item = inboxService.markAsUnread(itemId);
        break;
      case 'archived':
        item = inboxService.archive(itemId);
        break;
      default:
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid status. Must be read, unread, or archived' } }, 400);
    }

    // Broadcast inbox event for real-time updates
    broadcastInboxEvent(
      itemId,
      item.recipientId,
      'updated',
      { status: oldItem.status, readAt: oldItem.readAt },
      { status: item.status, readAt: item.readAt }
    );

    return c.json(item);
  } catch (error) {
    const errorObj = error as { code?: string };
    if (errorObj.code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Inbox item not found' } }, 404);
    }
    console.error('[stoneforge] Failed to update inbox item:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update inbox item' } }, 500);
  }
});

// GET /api/inbox/all - Global inbox view across all entities (TB89)
// NOTE: This route MUST be defined before /api/inbox/:itemId to prevent "all" being matched as itemId
// Supports filtering by entityId to show a specific user's inbox
app.get('/api/inbox/all', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse query parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const statusParam = url.searchParams.get('status');
    const hydrateParam = url.searchParams.get('hydrate');
    const entityIdParam = url.searchParams.get('entityId');

    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Build filter for status
    const filter: InboxFilter = {
      limit,
      offset,
    };
    if (statusParam) {
      filter.status = statusParam as InboxStatus;
    }

    // Get inbox items - optionally filtered by entityId
    // This requires a raw query since InboxService only supports per-entity queries
    // Handle comma-separated statuses (e.g., "unread,read")
    let statusCondition = '';
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        statusCondition = `AND status = '${statuses[0]}'`;
      } else {
        statusCondition = `AND status IN (${statuses.map(s => `'${s}'`).join(', ')})`;
      }
    }
    const entityCondition = entityIdParam ? `AND recipient_id = '${entityIdParam}'` : '';
    const countResult = storageBackend.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM inbox_items WHERE 1=1 ${statusCondition} ${entityCondition}`,
      []
    );
    const total = countResult?.count ?? 0;

    type InboxItemRow = {
      id: string;
      recipient_id: string;
      message_id: string;
      channel_id: string;
      source_type: string;
      status: string;
      read_at: string | null;
      created_at: string;
    };

    const rows = storageBackend.query<InboxItemRow>(
      `SELECT id, recipient_id, message_id, channel_id, source_type, status, read_at, created_at
       FROM inbox_items
       WHERE 1=1 ${statusCondition} ${entityCondition}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Map rows to inbox items
    let items: Record<string, unknown>[] = rows.map(row => ({
      id: row.id,
      recipientId: row.recipient_id as EntityId,
      messageId: row.message_id,
      channelId: row.channel_id,
      sourceType: row.source_type as 'direct' | 'mention',
      status: row.status as InboxStatus,
      readAt: row.read_at,
      createdAt: row.created_at,
    }));

    // Hydrate items if requested
    if (hydrateParam === 'true') {
      items = await Promise.all(items.map(async (item) => {
        const hydratedItem: Record<string, unknown> = { ...item };

        // Hydrate message
        try {
          const message = await api.get(item.messageId as unknown as ElementId);
          if (message && message.type === 'message') {
            const typedMessage = message as Message;
            // Get content preview
            let contentPreview = '';
            if (typedMessage.contentRef) {
              const contentDoc = await api.get(typedMessage.contentRef as unknown as ElementId);
              if (contentDoc && contentDoc.type === 'document') {
                const typedDoc = contentDoc as Document;
                contentPreview = typeof typedDoc.content === 'string'
                  ? typedDoc.content.substring(0, 100)
                  : '';
              }
            }
            hydratedItem.message = {
              id: message.id,
              sender: typedMessage.sender,
              contentRef: typedMessage.contentRef,
              contentPreview,
              createdAt: message.createdAt,
            };
          }
        } catch {
          // Message might be deleted
        }

        // Hydrate channel
        try {
          const channel = await api.get(item.channelId as unknown as ElementId);
          if (channel && channel.type === 'channel') {
            const typedChannel = channel as Channel;
            hydratedItem.channel = {
              id: channel.id,
              name: typedChannel.name,
              channelType: typedChannel.channelType,
            };
          }
        } catch {
          // Channel might be deleted
        }

        // Hydrate recipient entity
        try {
          const recipient = await api.get(item.recipientId as unknown as ElementId);
          if (recipient && recipient.type === 'entity') {
            hydratedItem.recipient = recipient;
          }
        } catch {
          // Recipient might be deleted
        }

        // Hydrate sender entity (from message)
        if (hydratedItem.message && (hydratedItem.message as { sender?: string }).sender) {
          try {
            const sender = await api.get((hydratedItem.message as { sender: string }).sender as unknown as ElementId);
            if (sender && sender.type === 'entity') {
              hydratedItem.sender = sender;
            }
          } catch {
            // Sender might be deleted
          }
        }

        return hydratedItem;
      }));
    }

    return c.json({
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get global inbox:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get global inbox' } }, 500);
  }
});

// GET /api/inbox/count - Global inbox unread count (TB137)
// NOTE: This route MUST be defined before /api/inbox/:itemId to prevent "count" being matched as itemId
// Supports filtering by entityId to get count for a specific user
app.get('/api/inbox/count', async (c) => {
  try {
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const entityIdParam = url.searchParams.get('entityId');

    // Build WHERE conditions
    const conditions: string[] = [];
    if (statusParam) {
      conditions.push(`status = '${statusParam}'`);
    } else {
      conditions.push(`status = 'unread'`);
    }
    if (entityIdParam) {
      conditions.push(`recipient_id = '${entityIdParam}'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = storageBackend.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM inbox_items ${whereClause}`,
      []
    );

    return c.json({ count: countResult?.count ?? 0 });
  } catch (error) {
    console.error('[stoneforge] Failed to get global inbox count:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get global inbox count' } }, 500);
  }
});

// GET /api/inbox/:itemId - Get single inbox item
app.get('/api/inbox/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    const item = inboxService.getInboxItem(itemId);

    if (!item) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Inbox item not found' } }, 404);
    }

    return c.json(item);
  } catch (error) {
    console.error('[stoneforge] Failed to get inbox item:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get inbox item' } }, 500);
  }
});

// ============================================================================
// Entity Hierarchy Endpoints
// ============================================================================

// GET /api/entities/:id/reports - Get direct reports for an entity
app.get('/api/entities/:id/reports', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Get all entities and filter for direct reports
    const allEntities = await api.list({ type: 'entity' }) as Entity[];
    const reports = getDirectReports(allEntities, id);

    return c.json(reports);
  } catch (error) {
    console.error('[stoneforge] Failed to get entity reports:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity reports' } }, 500);
  }
});

// GET /api/entities/:id/chain - Get management chain for an entity
app.get('/api/entities/:id/chain', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Load all entities for chain lookup
    const allEntities = await api.list({ type: 'entity' }) as Entity[];

    // Create a sync getEntity function for chain lookup
    const getEntityById = (entityId: EntityId): Entity | null => {
      return allEntities.find(e => (e.id as string) === (entityId as string)) || null;
    };

    // Get the management chain
    const chain = getManagementChain(entity as Entity, getEntityById);

    return c.json(chain);
  } catch (error) {
    console.error('[stoneforge] Failed to get management chain:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get management chain' } }, 500);
  }
});

// PATCH /api/entities/:id/manager - Set or clear manager for an entity
app.patch('/api/entities/:id/manager', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;
    const body = await c.req.json<{
      managerId: string | null;
    }>();

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // If setting a manager (not clearing)
    if (body.managerId !== null) {
      // Verify manager exists
      const manager = await api.get(body.managerId as unknown as ElementId);
      if (!manager || manager.type !== 'entity') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Manager entity not found' } }, 404);
      }

      // Check for self-assignment
      if (body.managerId === id) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Entity cannot be its own manager' } }, 400);
      }

      // Check for cycles using detectReportingCycle
      const allEntities = await api.list({ type: 'entity' }) as Entity[];

      // Create a getEntity function for cycle detection
      const getEntityForCycle = (entityId: EntityId): Entity | null => {
        return allEntities.find(e => (e.id as string) === (entityId as string)) || null;
      };

      // Check if setting this manager would create a cycle
      const cycleResult = detectReportingCycle(id, body.managerId as EntityId, getEntityForCycle);
      if (cycleResult.hasCycle) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Setting this manager would create a reporting cycle' } }, 400);
      }
    }

    // Update the entity with new reportsTo value
    const updates: Record<string, unknown> = {
      reportsTo: body.managerId as EntityId | null,
    };

    const updated = await api.update(id as unknown as ElementId, updates);
    return c.json(updated);
  } catch (error) {
    console.error('[stoneforge] Failed to set entity manager:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to set entity manager';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

// ============================================================================
// Dependencies Endpoints
// ============================================================================

app.get('/api/dependencies/:id/tree', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const tree = await api.getDependencyTree(id);
    return c.json(tree);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Element not found' } }, 404);
    }
    console.error('[stoneforge] Failed to get dependency tree:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get dependency tree' } }, 500);
  }
});

app.get('/api/dependencies/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const dependencies = await api.getDependencies(id);
    const dependents = await api.getDependents(id);
    return c.json({ dependencies, dependents });
  } catch (error) {
    console.error('[stoneforge] Failed to get dependencies:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get dependencies' } }, 500);
  }
});

// POST /api/dependencies - Create a dependency
app.post('/api/dependencies', async (c) => {
  try {
    const body = await c.req.json<{
      blockedId: string;
      blockerId: string;
      type: string;
      metadata?: Record<string, unknown>;
      actor?: string;
    }>();

    // Validate required fields
    if (!body.blockedId || !body.blockerId || !body.type) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'blockedId, blockerId, and type are required' } },
        400
      );
    }

    const dependency = await api.addDependency({
      blockedId: body.blockedId as ElementId,
      blockerId: body.blockerId as ElementId,
      type: body.type as 'blocks' | 'parent-child' | 'awaits' | 'relates-to' | 'references' | 'supersedes' | 'duplicates' | 'caused-by' | 'validates' | 'authored-by' | 'assigned-to' | 'approved-by' | 'replies-to',
      metadata: body.metadata,
      actor: body.actor as EntityId | undefined,
    });

    // Events are automatically recorded in the database by addDependency
    // and will be picked up by the event broadcaster's polling mechanism

    return c.json(dependency, 201);
  } catch (error) {
    const errorObj = error as { code?: string; message?: string; name?: string };
    // Handle cycle detection
    if (errorObj.code === 'CYCLE_DETECTED') {
      return c.json(
        { error: { code: 'CYCLE_DETECTED', message: errorObj.message || 'Adding this dependency would create a cycle' } },
        400
      );
    }
    // Handle duplicate dependency
    if (errorObj.code === 'DUPLICATE_DEPENDENCY' || errorObj.name === 'ConflictError') {
      return c.json(
        { error: { code: 'CONFLICT', message: errorObj.message || 'Dependency already exists' } },
        409
      );
    }
    // Handle not found
    if (errorObj.code === 'NOT_FOUND' || errorObj.name === 'NotFoundError') {
      return c.json(
        { error: { code: 'NOT_FOUND', message: errorObj.message || 'Source or target element not found' } },
        404
      );
    }
    // Handle validation errors
    if (errorObj.code === 'VALIDATION_ERROR' || errorObj.code === 'INVALID_DEPENDENCY_TYPE' || errorObj.name === 'ValidationError') {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: errorObj.message || 'Invalid dependency type' } },
        400
      );
    }
    console.error('[stoneforge] Failed to create dependency:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create dependency' } }, 500);
  }
});

// DELETE /api/dependencies/:blockedId/:blockerId/:type - Remove a dependency
app.delete('/api/dependencies/:blockedId/:blockerId/:type', async (c) => {
  try {
    const blockedId = c.req.param('blockedId') as ElementId;
    const blockerId = c.req.param('blockerId') as ElementId;
    const type = c.req.param('type') as 'blocks' | 'parent-child' | 'awaits' | 'relates-to' | 'references' | 'supersedes' | 'duplicates' | 'caused-by' | 'validates' | 'authored-by' | 'assigned-to' | 'approved-by' | 'replies-to';
    const actor = c.req.query('actor') as EntityId | undefined;

    await api.removeDependency(blockedId, blockerId, type, actor);

    // Events are automatically recorded in the database by removeDependency
    // and will be picked up by the event broadcaster's polling mechanism

    return c.json({ success: true, message: 'Dependency removed' });
  } catch (error) {
    const errorObj = error as { code?: string; message?: string; name?: string };
    if (errorObj.code === 'NOT_FOUND' || errorObj.name === 'NotFoundError') {
      return c.json(
        { error: { code: 'NOT_FOUND', message: errorObj.message || 'Dependency not found' } },
        404
      );
    }
    console.error('[stoneforge] Failed to remove dependency:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove dependency' } }, 500);
  }
});

// ============================================================================
// Events Endpoints
// ============================================================================

app.get('/api/events', async (c) => {
  try {
    // Parse query parameters for filtering
    const url = new URL(c.req.url);
    const eventType = url.searchParams.get('eventType');
    const actor = url.searchParams.get('actor');
    const elementId = url.searchParams.get('elementId');
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const paginatedParam = url.searchParams.get('paginated');

    // Build filter object - cast to EventFilter type
    const filter: Record<string, unknown> = {};

    if (eventType) {
      // Support comma-separated event types
      filter.eventType = eventType.includes(',') ? eventType.split(',') : eventType;
    }
    if (actor) {
      filter.actor = actor;
    }
    if (elementId) {
      filter.elementId = elementId;
    }
    if (after) {
      filter.after = after;
    }
    if (before) {
      filter.before = before;
    }

    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    filter.limit = limit;
    filter.offset = offset;

    const events = await api.listEvents(filter as Parameters<typeof api.listEvents>[0]);

    // If paginated=true, return paginated response format with accurate total count
    if (paginatedParam === 'true') {
      // Get accurate total count (excluding limit/offset for count query)
      const countFilter = { ...filter };
      delete countFilter.limit;
      delete countFilter.offset;
      const total = await api.countEvents(countFilter as Parameters<typeof api.countEvents>[0]);
      const hasMore = offset + events.length < total;
      return c.json({
        items: events,
        total: total,
        offset: offset,
        limit: limit,
        hasMore: hasMore,
      });
    }

    return c.json(events);
  } catch (error) {
    console.error('[stoneforge] Failed to get events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get events' } }, 500);
  }
});

// Get count of events matching filter (for eager loading pagination)
app.get('/api/events/count', async (c) => {
  try {
    const url = new URL(c.req.url);
    const eventType = url.searchParams.get('eventType');
    const actor = url.searchParams.get('actor');
    const elementId = url.searchParams.get('elementId');
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');

    const filter: Record<string, unknown> = {};

    if (eventType) {
      filter.eventType = eventType.includes(',') ? eventType.split(',') : eventType;
    }
    if (actor) {
      filter.actor = actor;
    }
    if (elementId) {
      filter.elementId = elementId;
    }
    if (after) {
      filter.after = after;
    }
    if (before) {
      filter.before = before;
    }

    const count = await api.countEvents(filter as Parameters<typeof api.countEvents>[0]);
    return c.json({ count });
  } catch (error) {
    console.error('[stoneforge] Failed to count events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to count events' } }, 500);
  }
});

// ============================================================================
// Workflows Endpoints (TB25)
// ============================================================================

app.get('/api/workflows', async (c) => {
  try {
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const ephemeralParam = url.searchParams.get('ephemeral');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const filter: Record<string, unknown> = {
      type: 'workflow',
      orderBy: 'updated_at',
      orderDir: 'desc',
    };

    if (statusParam) {
      filter.status = statusParam;
    }
    if (ephemeralParam !== null) {
      filter.ephemeral = ephemeralParam === 'true';
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const workflows = await api.list(filter as Parameters<typeof api.list>[0]);
    return c.json(workflows);
  } catch (error) {
    console.error('[stoneforge] Failed to get workflows:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflows' } }, 500);
  }
});

app.get('/api/workflows/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const hydrateProgress = url.searchParams.get('hydrate.progress') === 'true';

    const workflow = await api.get(id);

    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Optionally hydrate progress
    if (hydrateProgress) {
      const progress = await api.getWorkflowProgress(id);
      return c.json({ ...workflow, _progress: progress });
    }

    return c.json(workflow);
  } catch (error) {
    console.error('[stoneforge] Failed to get workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow' } }, 500);
  }
});

app.get('/api/workflows/:id/tasks', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // First verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Build filter for getTasksInWorkflow
    const filter: Record<string, unknown> = {};

    if (statusParam) {
      filter.status = statusParam;
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const tasks = await api.getTasksInWorkflow(id, filter as Parameters<typeof api.getTasksInWorkflow>[1]);
    return c.json(tasks);
  } catch (error) {
    console.error('[stoneforge] Failed to get workflow tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow tasks' } }, 500);
  }
});

app.get('/api/workflows/:id/progress', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // First verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    const progress = await api.getWorkflowProgress(id);
    return c.json(progress);
  } catch (error) {
    console.error('[stoneforge] Failed to get workflow progress:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow progress' } }, 500);
  }
});

// TB122: Check if a task can be deleted from a workflow
app.get('/api/workflows/:id/can-delete-task/:taskId', async (c) => {
  try {
    const workflowId = c.req.param('id') as ElementId;
    const taskId = c.req.param('taskId') as ElementId;

    // Verify workflow exists
    const workflow = await api.get(workflowId);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Get tasks in workflow
    const tasks = await api.getTasksInWorkflow(workflowId);

    // Check if this task is in the workflow
    const taskInWorkflow = tasks.some(t => t.id === taskId);
    if (!taskInWorkflow) {
      return c.json({ canDelete: false, reason: 'Task is not in this workflow' });
    }

    // Check if this is the last task
    const isLastTask = tasks.length === 1;
    if (isLastTask) {
      return c.json({
        canDelete: false,
        reason: "Cannot delete the last task in a workflow. Workflows must have at least one task. Use 'sf workflow delete' to delete the entire workflow.",
        isLastTask: true
      });
    }

    return c.json({ canDelete: true });
  } catch (error) {
    console.error('[stoneforge] Failed to check if task can be deleted:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check if task can be deleted' } }, 500);
  }
});

app.post('/api/workflows', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required and must be a string' } }, 400);
    }

    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
    }

    // Validate title length
    if (body.title.length < 1 || body.title.length > 500) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
    }

    // TB122: Workflows must have at least one task
    // Accept either:
    // 1. initialTaskId - existing task to add to the workflow
    // 2. initialTask - object with task details to create and add
    const hasInitialTaskId = body.initialTaskId && typeof body.initialTaskId === 'string';
    const hasInitialTask = body.initialTask && typeof body.initialTask === 'object' && body.initialTask.title;

    if (!hasInitialTaskId && !hasInitialTask) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Workflows must have at least one task. Provide either initialTaskId (existing task ID) or initialTask (object with title to create new task).'
        }
      }, 400);
    }

    // Validate initialTaskId exists if provided
    if (hasInitialTaskId) {
      const existingTask = await api.get(body.initialTaskId as ElementId);
      if (!existingTask) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Initial task not found' } }, 404);
      }
      if (existingTask.type !== 'task') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTaskId must reference a task' } }, 400);
      }
    }

    // Validate initialTask title if provided
    if (hasInitialTask) {
      if (typeof body.initialTask.title !== 'string' || body.initialTask.title.length < 1 || body.initialTask.title.length > 500) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTask.title must be between 1 and 500 characters' } }, 400);
      }
    }

    // Create the workflow using the factory function
    const workflowInput: CreateWorkflowInput = {
      title: body.title,
      createdBy: body.createdBy as EntityId,
      status: (body.status as WorkflowStatus) || ('pending' as WorkflowStatus),
      ephemeral: body.ephemeral ?? false,
      tags: body.tags || [],
      variables: body.variables || {},
      descriptionRef: body.descriptionRef,
      playbookId: body.playbookId,
    };

    const workflow = await createWorkflow(workflowInput);
    const created = await api.create(workflow as unknown as Element & Record<string, unknown>);

    // Now add or create the initial task
    let taskId: ElementId;
    let createdTask = null;

    if (hasInitialTaskId) {
      taskId = body.initialTaskId as ElementId;
    } else {
      // Create a new task using the proper factory function
      const taskInput = {
        title: body.initialTask.title,
        status: (body.initialTask.status || 'open') as 'open',
        priority: body.initialTask.priority || 3,
        complexity: body.initialTask.complexity || 3,
        tags: body.initialTask.tags || [],
        createdBy: body.createdBy as EntityId,
      };
      const task = await createTask(taskInput);
      createdTask = await api.create(task as unknown as Element & Record<string, unknown>);
      taskId = createdTask.id as ElementId;
    }

    // Add parent-child dependency from task to workflow
    await api.addDependency({
      blockedId: taskId,
      blockerId: created.id as ElementId,
      type: 'parent-child',
      actor: body.createdBy as EntityId,
    });

    // Return the workflow along with the initial task info
    return c.json({
      ...created,
      initialTask: createdTask || { id: taskId }
    }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    if ((error as { code?: string }).code === 'ALREADY_EXISTS') {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in another collection' } }, 409);
    }
    console.error('[stoneforge] Failed to create workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create workflow' } }, 500);
  }
});

app.post('/api/workflows/instantiate', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.playbook || typeof body.playbook !== 'object') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'playbook is required and must be an object' } }, 400);
    }

    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
    }

    // TB122: Validate playbook has at least one step
    const playbook = body.playbook as Playbook;
    if (!playbook.steps || !Array.isArray(playbook.steps) || playbook.steps.length === 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot instantiate workflow: playbook has no steps defined. Workflows must have at least one task.'
        }
      }, 400);
    }

    // Build instantiation input
    const createInput: CreateWorkflowFromPlaybookInput = {
      playbook: body.playbook as Playbook,
      variables: body.variables || {},
      createdBy: body.createdBy as EntityId,
      title: body.title,
      ephemeral: body.ephemeral ?? false,
      tags: body.tags || [],
      metadata: body.metadata || {},
    };

    // Instantiate the workflow from playbook
    const result = await createWorkflowFromPlaybook(createInput);

    // TB122: Verify at least one task was created (steps may have been filtered by conditions)
    if (result.tasks.length === 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot instantiate workflow: all playbook steps were filtered by conditions. At least one task must be created.'
        }
      }, 400);
    }

    // Create the workflow and all tasks in the database
    const createdWorkflow = await api.create(result.workflow as unknown as Element & Record<string, unknown>);

    // Create all tasks
    const createdTasks = [];
    for (const task of result.tasks) {
      const createdTask = await api.create(task.task as unknown as Element & Record<string, unknown>);
      createdTasks.push(createdTask);
    }

    // Create all dependencies
    for (const dep of [...result.blocksDependencies, ...result.parentChildDependencies]) {
      await api.addDependency(dep);
    }

    return c.json({
      workflow: createdWorkflow,
      tasks: createdTasks,
      skippedSteps: result.skippedSteps,
      resolvedVariables: result.resolvedVariables,
    }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[stoneforge] Failed to instantiate workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to instantiate workflow' } }, 500);
  }
});

app.patch('/api/workflows/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // First verify workflow exists
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (existing.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Extract allowed updates
    const updates: Record<string, unknown> = {};
    const allowedFields = ['title', 'status', 'tags', 'metadata', 'descriptionRef', 'failureReason', 'cancelReason'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Validate title if provided
    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || updates.title.length < 1 || updates.title.length > 500) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
      }
    }

    // Validate status if provided
    if (updates.status !== undefined) {
      const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
      if (!validStatuses.includes(updates.status as string)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } }, 400);
      }
    }

    const updated = await api.update(id, updates);
    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[stoneforge] Failed to update workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update workflow' } }, 500);
  }
});

// Delete workflow (delete ephemeral workflow and all its tasks)
app.delete('/api/workflows/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const force = url.searchParams.get('force') === 'true';

    // Verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Check if workflow is ephemeral (unless force is specified)
    if (!(workflow as Workflow).ephemeral && !force) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot delete durable workflow. Use force=true to override.',
        },
      }, 400);
    }

    // Delete the workflow and its tasks
    const result = await api.deleteWorkflow(id);

    return c.json(result);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    console.error('[stoneforge] Failed to delete workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete workflow' } }, 500);
  }
});

// Promote workflow (promote ephemeral to durable)
app.post('/api/workflows/:id/promote', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // Verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Check if workflow is ephemeral
    if (!(workflow as Workflow).ephemeral) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Workflow is already durable',
        },
      }, 400);
    }

    // Promote to durable by setting ephemeral to false
    const updated = await api.update(id, { ephemeral: false } as unknown as Partial<Element>);

    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[stoneforge] Failed to promote workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to promote workflow' } }, 500);
  }
});

// ============================================================================
// Playbook Endpoints
// ============================================================================

// Default playbook search paths
const PLAYBOOK_SEARCH_PATHS = [
  resolve(PROJECT_ROOT, '.stoneforge/playbooks'),
  resolve(PROJECT_ROOT, 'playbooks'),
];

app.get('/api/playbooks', async (c) => {
  try {
    const discovered = discoverPlaybookFiles(PLAYBOOK_SEARCH_PATHS, { recursive: true });

    // Return basic info about discovered playbooks
    const playbooks = discovered.map((p: DiscoveredPlaybook) => ({
      name: p.name,
      path: p.path,
      directory: p.directory,
    }));

    return c.json(playbooks);
  } catch (error) {
    console.error('[stoneforge] Failed to list playbooks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list playbooks' } }, 500);
  }
});

app.get('/api/playbooks/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const discovered = discoverPlaybookFiles(PLAYBOOK_SEARCH_PATHS, { recursive: true });

    // Find the playbook by name
    const found = discovered.find((p: DiscoveredPlaybook) => p.name.toLowerCase() === name.toLowerCase());

    if (!found) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Playbook not found' } }, 404);
    }

    // Load the full playbook
    const playbookInput = loadPlaybookFromFile(found.path, 'system' as EntityId);

    // Create a Playbook object to return (without actually storing it)
    const playbook = createPlaybook(playbookInput);

    return c.json({
      ...playbook,
      filePath: found.path,
      directory: found.directory,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get playbook:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get playbook' } }, 500);
  }
});

// ============================================================================
// Teams Endpoints
// ============================================================================

app.get('/api/teams', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse pagination and filter parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');
    const searchParam = url.searchParams.get('search');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'team',
    };

    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    } else {
      filter.limit = 50; // Default page size
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }
    if (orderByParam) {
      filter.orderBy = orderByParam;
    } else {
      filter.orderBy = 'updated_at';
    }
    if (orderDirParam) {
      filter.orderDir = orderDirParam;
    } else {
      filter.orderDir = 'desc';
    }

    // Get paginated results
    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

    // Apply client-side filtering for search (not supported in base filter)
    let filteredItems = result.items;

    if (searchParam) {
      const query = searchParam.toLowerCase();
      filteredItems = filteredItems.filter((t) => {
        const team = t as unknown as { name: string; id: string; tags?: string[] };
        return (
          team.name.toLowerCase().includes(query) ||
          team.id.toLowerCase().includes(query) ||
          (team.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    // Return paginated response format
    return c.json({
      items: filteredItems,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get teams:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get teams' } }, 500);
  }
});

app.post('/api/teams', async (c) => {
  try {
    const body = await c.req.json();
    const { name, members, createdBy, tags, metadata, descriptionRef } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }, 400);
    }

    // Validate members array - TB123: Teams must have at least one member
    if (!members || !Array.isArray(members) || members.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Teams must have at least one member' } }, 400);
    }
    // Check each member is a valid string
    for (const member of members) {
      if (typeof member !== 'string' || member.length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Each member must be a valid entity ID' } }, 400);
      }
    }
    // Check for duplicate members
    const uniqueMembers = new Set(members);
    if (uniqueMembers.size !== members.length) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Duplicate members are not allowed' } }, 400);
    }

    // Check for duplicate team name
    const existingTeams = await api.list({ type: 'team' });
    const duplicateName = existingTeams.some((t) => {
      const team = t as unknown as { name: string };
      return team.name.toLowerCase() === name.toLowerCase().trim();
    });
    if (duplicateName) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Team with this name already exists' } }, 400);
    }

    const teamInput: CreateTeamInput = {
      name: name.trim(),
      members: members || [],
      createdBy: (createdBy || 'el-0000') as EntityId,
      tags: tags || [],
      metadata: metadata || {},
      ...(descriptionRef !== undefined && { descriptionRef }),
    };

    const team = await createTeam(teamInput);
    const created = await api.create(team as unknown as Element & Record<string, unknown>);

    return c.json(created, 201);
  } catch (error) {
    console.error('[stoneforge] Failed to create team:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create team';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

app.get('/api/teams/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    return c.json(team);
  } catch (error) {
    console.error('[stoneforge] Failed to get team:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get team' } }, 500);
  }
});

app.patch('/api/teams/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();
    const { name, tags, addMembers, removeMembers } = body;

    // Verify team exists
    const existing = await api.get(id);
    if (!existing || existing.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    const existingTeam = existing as unknown as { name: string; members: EntityId[]; tags: string[] };

    // Build updates object
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      // Validate name format
      if (typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be a non-empty string' } }, 400);
      }
      // Check for duplicate name (if changing)
      if (name.trim() !== existingTeam.name) {
        const existingTeams = await api.list({ type: 'team' });
        const duplicateName = existingTeams.some((t) => {
          const team = t as unknown as { name: string; id: string };
          return team.name.toLowerCase() === name.toLowerCase().trim() && team.id !== id;
        });
        if (duplicateName) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Team with this name already exists' } }, 400);
        }
      }
      updates.name = name.trim();
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Tags must be an array' } }, 400);
      }
      updates.tags = tags;
    }

    // Handle member additions/removals
    let currentMembers = [...existingTeam.members];

    if (addMembers !== undefined) {
      if (!Array.isArray(addMembers)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'addMembers must be an array' } }, 400);
      }
      for (const memberId of addMembers) {
        if (typeof memberId !== 'string' || memberId.length === 0) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Each member ID must be a non-empty string' } }, 400);
        }
        if (!currentMembers.includes(memberId as EntityId)) {
          currentMembers.push(memberId as EntityId);
        }
      }
    }

    if (removeMembers !== undefined) {
      if (!Array.isArray(removeMembers)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'removeMembers must be an array' } }, 400);
      }
      for (const memberId of removeMembers) {
        if (typeof memberId !== 'string' || memberId.length === 0) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Each member ID must be a non-empty string' } }, 400);
        }
        currentMembers = currentMembers.filter((m) => m !== memberId);
      }
    }

    // TB123: Prevent removing the last member - teams must have at least one member
    if (addMembers !== undefined || removeMembers !== undefined) {
      if (currentMembers.length === 0) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot remove the last member from a team. Teams must have at least one member.'
          }
        }, 400);
      }
      updates.members = currentMembers;
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid updates provided' } }, 400);
    }

    const updated = await api.update(id, updates);
    return c.json(updated);
  } catch (error) {
    console.error('[stoneforge] Failed to update team:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update team';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

app.delete('/api/teams/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // Verify team exists
    const existing = await api.get(id);
    if (!existing || existing.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    // Soft-delete the team
    await api.delete(id);

    return c.json({ success: true, id });
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }
    console.error('[stoneforge] Failed to delete team:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete team' } }, 500);
  }
});

app.get('/api/teams/:id/members', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    // Get member IDs from the team
    const teamData = team as unknown as { members: EntityId[] };
    const memberIds = teamData.members || [];

    // Fetch each member entity
    const members: Element[] = [];
    for (const memberId of memberIds) {
      try {
        const member = await api.get(memberId as unknown as ElementId);
        if (member && member.type === 'entity') {
          members.push(member);
        }
      } catch {
        // Skip members that can't be fetched
      }
    }

    return c.json(members);
  } catch (error) {
    console.error('[stoneforge] Failed to get team members:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get team members' } }, 500);
  }
});

app.get('/api/teams/:id/stats', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    const teamData = team as unknown as { members: EntityId[] };
    const memberIds = teamData.members || [];

    // Get all tasks to calculate team stats
    const allTasks = await api.list({ type: 'task' });

    // Calculate stats for the team
    let totalTasksAssigned = 0;
    let activeTasksAssigned = 0;
    let completedTasksAssigned = 0;
    let createdByTeamMembers = 0;
    const tasksByMember: Record<string, { assigned: number; active: number; completed: number }> = {};

    // Initialize member stats
    for (const memberId of memberIds) {
      tasksByMember[memberId as unknown as string] = { assigned: 0, active: 0, completed: 0 };
    }

    for (const task of allTasks) {
      const taskData = task as unknown as {
        assignee?: EntityId;
        createdBy?: EntityId;
        status?: string;
      };

      // Check if task is assigned to a team member
      if (taskData.assignee && memberIds.includes(taskData.assignee)) {
        totalTasksAssigned++;
        const memberKey = taskData.assignee as unknown as string;
        if (tasksByMember[memberKey]) {
          tasksByMember[memberKey].assigned++;
        }

        const status = taskData.status || 'open';
        if (status === 'closed') {
          completedTasksAssigned++;
          if (tasksByMember[memberKey]) {
            tasksByMember[memberKey].completed++;
          }
        } else if (status !== 'tombstone') {
          activeTasksAssigned++;
          if (tasksByMember[memberKey]) {
            tasksByMember[memberKey].active++;
          }
        }
      }

      // Check if task was created by a team member
      if (taskData.createdBy && memberIds.includes(taskData.createdBy)) {
        createdByTeamMembers++;
      }
    }

    // Calculate workload distribution (tasks per member as percentages)
    const workloadDistribution: { memberId: string; taskCount: number; percentage: number }[] = [];
    for (const memberId of memberIds) {
      const memberStats = tasksByMember[memberId as unknown as string];
      if (memberStats) {
        const percentage = totalTasksAssigned > 0
          ? Math.round((memberStats.assigned / totalTasksAssigned) * 100)
          : 0;
        workloadDistribution.push({
          memberId: memberId as unknown as string,
          taskCount: memberStats.assigned,
          percentage,
        });
      }
    }

    return c.json({
      memberCount: memberIds.length,
      totalTasksAssigned,
      activeTasksAssigned,
      completedTasksAssigned,
      createdByTeamMembers,
      tasksByMember,
      workloadDistribution,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get team stats:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get team stats' } }, 500);
  }
});

// TB123: Check if a member can be removed from a team
app.get('/api/teams/:id/can-remove-member/:entityId', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const entityId = c.req.param('entityId') as EntityId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    const teamData = team as unknown as { members: EntityId[] };
    const memberIds = teamData.members || [];

    // Check if entity is a member
    if (!memberIds.includes(entityId)) {
      return c.json({
        canRemove: false,
        reason: 'Entity is not a member of this team',
      });
    }

    // Check if this is the last member
    if (memberIds.length <= 1) {
      return c.json({
        canRemove: false,
        reason: 'Cannot remove the last member from a team. Teams must have at least one member.',
      });
    }

    return c.json({
      canRemove: true,
      reason: null,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to check can-remove-member:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check member removal' } }, 500);
  }
});

// ============================================================================
// Sync Endpoints
// ============================================================================

app.get('/api/sync/status', async (c) => {
  try {
    const dirtyElements = storageBackend.getDirtyElements();
    return c.json({
      dirtyElementCount: dirtyElements.length,
      dirtyDependencyCount: 0, // Not tracked separately currently
      hasPendingChanges: dirtyElements.length > 0,
      exportPath: resolve(PROJECT_ROOT, '.stoneforge'),
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get sync status:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get sync status' } }, 500);
  }
});

app.post('/api/sync/export', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const includeEphemeral = body.includeEphemeral ?? false;

    // Export to JSONL files in .stoneforge directory
    const result = await syncService.export({
      outputDir: resolve(PROJECT_ROOT, '.stoneforge'),
      full: true,
      includeEphemeral,
    });

    return c.json({
      success: true,
      elementsExported: result.elementsExported,
      dependenciesExported: result.dependenciesExported,
      elementsFile: result.elementsFile,
      dependenciesFile: result.dependenciesFile,
      exportedAt: result.exportedAt,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to export:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to export data' } }, 500);
  }
});

app.post('/api/sync/import', async (c) => {
  try {
    const body = await c.req.json();

    // Validate request
    if (!body.elements || typeof body.elements !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'elements field is required and must be a JSONL string' } }, 400);
    }

    const result = syncService.importFromStrings(
      body.elements,
      body.dependencies ?? '',
      {
        dryRun: body.dryRun ?? false,
        force: body.force ?? false,
      }
    );

    return c.json({
      success: true,
      elementsImported: result.elementsImported,
      elementsSkipped: result.elementsSkipped,
      dependenciesImported: result.dependenciesImported,
      dependenciesSkipped: result.dependenciesSkipped,
      conflicts: result.conflicts,
      errors: result.errors,
      importedAt: result.importedAt,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to import:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to import data' } }, 500);
  }
});

// ============================================================================
// Uploads Endpoints (TB94e - Image Support)
// ============================================================================

/**
 * Ensure uploads directory exists
 */
async function ensureUploadsDir(): Promise<void> {
  try {
    await mkdir(UPLOADS_DIR, { recursive: true });
  } catch {
    // Directory may already exist, which is fine
  }
}

/**
 * POST /api/uploads
 * Upload an image file. Returns the URL to access the uploaded file.
 *
 * Accepts multipart/form-data with:
 * - file: The image file (required)
 *
 * Returns:
 * - { url: string, filename: string, size: number, mimeType: string }
 */
app.post('/api/uploads', async (c) => {
  try {
    await ensureUploadsDir();

    // Parse form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: 'No file provided. Use multipart/form-data with a "file" field.' }
      }, 400);
    }

    // Validate file type
    const mimeType = file.type;
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid file type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
        }
      }, 400);
    }

    // Validate file size
    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum size: 10MB`
        }
      }, 400);
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate hash-based filename for deduplication
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const ext = MIME_TO_EXT[mimeType] || extname(file.name) || '.bin';
    const filename = `${hash}${ext}`;
    const filepath = resolve(UPLOADS_DIR, filename);

    // Write file to disk
    await Bun.write(filepath, buffer);

    console.log(`[stoneforge] Uploaded image: ${filename} (${file.size} bytes)`);

    return c.json({
      url: `/api/uploads/${filename}`,
      filename,
      size: file.size,
      mimeType,
    }, 201);
  } catch (error) {
    console.error('[stoneforge] Failed to upload file:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to upload file' } }, 500);
  }
});

/**
 * GET /api/uploads/:filename/usage
 * Track which documents reference a specific image.
 * Scans all documents for image URLs containing the filename.
 * NOTE: This route MUST be defined before /api/uploads/:filename to take precedence.
 */
app.get('/api/uploads/:filename/usage', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid filename' } }, 400);
    }

    // Check if file exists
    const filepath = resolve(UPLOADS_DIR, filename);
    const file = Bun.file(filepath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
    }

    // Search for documents that reference this image
    // Look for the filename in document content (images are stored as Markdown ![alt](url))
    const documents = await api.list({ type: 'document' });
    const usedIn: Array<{ id: string; title: string }> = [];

    for (const element of documents) {
      // Check if document content contains the filename
      // Images can be referenced as /api/uploads/filename or http://localhost:3456/api/uploads/filename
      const doc = element as unknown as { id: string; title?: string; content?: string };
      if (doc.content && typeof doc.content === 'string') {
        if (doc.content.includes(`/api/uploads/${filename}`) || doc.content.includes(filename)) {
          usedIn.push({
            id: doc.id,
            title: doc.title || 'Untitled',
          });
        }
      }
    }

    return c.json({
      filename,
      count: usedIn.length,
      documents: usedIn,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to get upload usage:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get upload usage' } }, 500);
  }
});

/**
 * GET /api/uploads/:filename
 * Serve an uploaded file.
 */
app.get('/api/uploads/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid filename' } }, 400);
    }

    const filepath = resolve(UPLOADS_DIR, filename);

    // Check if file exists
    const file = Bun.file(filepath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
    }

    // Determine content type from extension
    const ext = extname(filename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Read and return file
    const arrayBuffer = await file.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year (immutable since hash-named)
      },
    });
  } catch (error) {
    console.error('[stoneforge] Failed to serve file:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to serve file' } }, 500);
  }
});

/**
 * GET /api/uploads
 * List all uploaded files with metadata.
 */
app.get('/api/uploads', async (c) => {
  try {
    await ensureUploadsDir();

    const files = await readdir(UPLOADS_DIR);

    // Get file info for each file
    const fileInfos = await Promise.all(
      files.map(async (filename) => {
        try {
          const filepath = resolve(UPLOADS_DIR, filename);
          const stats = await stat(filepath);
          const ext = extname(filename).toLowerCase();
          const contentTypeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
          };

          return {
            filename,
            url: `/api/uploads/${filename}`,
            size: stats.size,
            mimeType: contentTypeMap[ext] || 'application/octet-stream',
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      })
    );

    // Filter out any failed reads and sort by creation time (newest first)
    const validFiles = fileInfos
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({
      files: validFiles,
      total: validFiles.length,
    });
  } catch (error) {
    console.error('[stoneforge] Failed to list uploads:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list uploads' } }, 500);
  }
});

/**
 * DELETE /api/uploads/:filename
 * Delete an uploaded file.
 */
app.delete('/api/uploads/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid filename' } }, 400);
    }

    const filepath = resolve(UPLOADS_DIR, filename);

    // Check if file exists
    const file = Bun.file(filepath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
    }

    // Delete the file
    await unlink(filepath);

    console.log(`[stoneforge] Deleted upload: ${filename}`);

    return c.json({ success: true, filename });
  } catch (error) {
    console.error('[stoneforge] Failed to delete upload:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete upload' } }, 500);
  }
});

  // Return the app and services
  return { app, api, syncService, autoExportService, inboxService, broadcaster, storageBackend };
}

// ============================================================================
// WebSocket handler interface (used by both Bun and Node server starters)
// ============================================================================

interface WsHandlers {
  handleOpen(ws: ServerWebSocket<ClientData>): void;
  handleMessage(ws: ServerWebSocket<ClientData>, message: string | Buffer): void;
  handleClose(ws: ServerWebSocket<ClientData>): void;
  handleError(ws: ServerWebSocket<ClientData>, error: Error): void;
}

// ============================================================================
// Dual-runtime server starters
// ============================================================================

const isBun = typeof globalThis.Bun !== 'undefined';

function startBunServer(
  app: InstanceType<typeof Hono>,
  options: { port: number; host: string },
  wsHandlers: WsHandlers,
) {
  const Bun = (globalThis as any).Bun;
  const server = Bun.serve({
    port: options.port,
    hostname: options.host,
    fetch(request: Request, server: any) {
      // Handle WS upgrade
      const url = new URL(request.url);
      if (url.pathname === '/ws') {
        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader?.toLowerCase() === 'websocket') {
          const success = server.upgrade(request, { data: {} });
          if (success) return undefined;
          return new Response('WebSocket upgrade failed', { status: 500 });
        }
      }
      return app.fetch(request);
    },
    websocket: {
      open(ws: ServerWebSocket<ClientData>) { wsHandlers.handleOpen(ws); },
      message(ws: ServerWebSocket<ClientData>, message: string | Buffer) { wsHandlers.handleMessage(ws, message); },
      close(ws: ServerWebSocket<ClientData>) { wsHandlers.handleClose(ws); },
      error(ws: ServerWebSocket<ClientData>, error: Error) { wsHandlers.handleError(ws, error); },
    },
  });

  console.log(`[stoneforge] Bun server listening on http://${options.host}:${server.port}`);
  return server;
}

function startNodeServer(
  app: InstanceType<typeof Hono>,
  options: { port: number; host: string },
  wsHandlers: WsHandlers,
) {
  import('ws').then(({ WebSocketServer }) => {
    import('http').then(({ createServer }) => {
      const httpServer = createServer(async (req, res) => {
        const url = `http://${options.host}:${options.port}${req.url || '/'}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }

        const body = await new Promise<Buffer>((resolve) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
        });

        const request = new Request(url, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body as unknown as BodyInit,
        });

        try {
          const response = await app.fetch(request);
          res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
          const arrayBuffer = await response.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err) {
          console.error('[stoneforge] Request error:', err);
          res.writeHead(500).end('Internal Server Error');
        }
      });

      const wss = new WebSocketServer({ noServer: true });

      wss.on('connection', (ws: any) => {
        // Create an adapter matching the ServerWebSocket<ClientData> interface
        const adapter: ServerWebSocket<ClientData> = {
          data: {} as ClientData,
          send(data: string | ArrayBuffer) {
            ws.send(data);
          },
          close() {
            ws.close();
          },
          get readyState() {
            return ws.readyState;
          },
        };

        wsHandlers.handleOpen(adapter);

        ws.on('message', (data: Buffer | string) => {
          wsHandlers.handleMessage(adapter, typeof data === 'string' ? data : data.toString());
        });

        ws.on('close', () => {
          wsHandlers.handleClose(adapter);
        });

        ws.on('error', (error: Error) => {
          wsHandlers.handleError(adapter, error);
        });
      });

      httpServer.on('upgrade', (req: any, socket: any, head: any) => {
        const pathname = new URL(req.url || '', `http://${options.host}`).pathname;
        if (pathname === '/ws') {
          wss.handleUpgrade(req, socket, head, (ws: any) => {
            wss.emit('connection', ws, req);
          });
        } else {
          socket.destroy();
        }
      });

      httpServer.listen(options.port, options.host, () => {
        console.log(`[stoneforge] Node server listening on http://${options.host}:${options.port}`);
      });
    });
  });
}

// ============================================================================
// startQuarryServer
// ============================================================================

export function startQuarryServer(options: QuarryServerOptions = {}): QuarryApp {
  const quarryApp = createQuarryApp(options);

  const port = options.port ?? parseInt(process.env.PORT || '3456', 10);
  const host = options.host ?? (process.env.HOST || 'localhost');

  // Serve pre-built web UI if webRoot is provided and exists
  if (options.webRoot) {
    registerStaticMiddleware(quarryApp.app, options.webRoot);
  }

  const wsHandlers: WsHandlers = {
    handleOpen,
    handleMessage,
    handleClose,
    handleError,
  };

  console.log(`[stoneforge] Starting server on http://${host}:${port}`);

  if (isBun) {
    startBunServer(quarryApp.app, { port, host }, wsHandlers);
  } else {
    startNodeServer(quarryApp.app, { port, host }, wsHandlers);
  }

  return quarryApp;
}
