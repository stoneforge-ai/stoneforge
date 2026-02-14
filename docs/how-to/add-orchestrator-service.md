# How to Add an Orchestrator Service

Step-by-step guide for adding new services to `@stoneforge/smithy`.

## Prerequisites

- Understanding of the orchestrator architecture
- Familiarity with service patterns in the codebase
- Access to `packages/smithy/`

## Steps

### 1. Create the Service File

Create `packages/smithy/src/services/{service-name}.ts`:

```typescript
/**
 * Notification Service
 *
 * Manages agent notifications and alerts.
 */

import type { ElementId, EntityId, Timestamp } from '@stoneforge/core';
import type { OrchestratorAPI } from '../api/orchestrator-api.js';
import type { AgentMetadata } from '../types/agent.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Notification priority levels
 */
export const NotificationPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type NotificationPriority = (typeof NotificationPriority)[keyof typeof NotificationPriority];

/**
 * Notification types
 */
export const NotificationType = {
  TASK_ASSIGNED: 'task-assigned',
  TASK_COMPLETED: 'task-completed',
  HELP_REQUESTED: 'help-requested',
  SYSTEM_ALERT: 'system-alert',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/**
 * Notification payload
 */
export interface Notification {
  readonly id: string;
  readonly type: NotificationType;
  readonly priority: NotificationPriority;
  readonly recipientId: EntityId;
  readonly senderId?: EntityId;
  readonly title: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: Timestamp;
  readonly readAt?: Timestamp;
}

/**
 * Options for sending notifications
 */
export interface SendNotificationOptions {
  type: NotificationType;
  priority?: NotificationPriority;
  recipientId: EntityId;
  senderId?: EntityId;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Service configuration
 */
export interface NotificationServiceConfig {
  /** Whether to auto-create inbox items */
  createInboxItems?: boolean;
  /** Default priority for notifications */
  defaultPriority?: NotificationPriority;
  /** Maximum notifications per agent (for cleanup) */
  maxNotificationsPerAgent?: number;
}

/**
 * Notification service interface
 */
export interface NotificationService {
  /** Send a notification to an agent */
  send(options: SendNotificationOptions): Promise<Notification>;

  /** Send notifications to multiple agents */
  sendBatch(
    recipientIds: EntityId[],
    options: Omit<SendNotificationOptions, 'recipientId'>
  ): Promise<Notification[]>;

  /** Get notifications for an agent */
  getNotifications(agentId: EntityId, options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Notification[]>;

  /** Mark notification as read */
  markAsRead(notificationId: string): Promise<void>;

  /** Mark all notifications as read for an agent */
  markAllAsRead(agentId: EntityId): Promise<number>;

  /** Get unread count for an agent */
  getUnreadCount(agentId: EntityId): Promise<number>;

  /** Clean up old notifications */
  cleanup(options?: { maxAge?: number; agentId?: EntityId }): Promise<number>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Creates a notification service
 */
export function createNotificationService(
  api: OrchestratorAPI,
  config: NotificationServiceConfig = {}
): NotificationService {
  const {
    createInboxItems = true,
    defaultPriority = NotificationPriority.MEDIUM,
    maxNotificationsPerAgent = 100,
  } = config;

  // Internal state
  const notifications = new Map<string, Notification>();
  const byRecipient = new Map<EntityId, Set<string>>();

  // Helper to generate notification ID
  function generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Helper to add notification to indexes
  function addToIndex(notification: Notification): void {
    notifications.set(notification.id, notification);

    if (!byRecipient.has(notification.recipientId)) {
      byRecipient.set(notification.recipientId, new Set());
    }
    byRecipient.get(notification.recipientId)!.add(notification.id);
  }

  // Helper to remove notification from indexes
  function removeFromIndex(notificationId: string): void {
    const notification = notifications.get(notificationId);
    if (notification) {
      notifications.delete(notificationId);
      byRecipient.get(notification.recipientId)?.delete(notificationId);
    }
  }

  return {
    async send(options): Promise<Notification> {
      const notification: Notification = {
        id: generateId(),
        type: options.type,
        priority: options.priority ?? defaultPriority,
        recipientId: options.recipientId,
        senderId: options.senderId,
        title: options.title,
        message: options.message,
        metadata: options.metadata,
        createdAt: new Date().toISOString() as Timestamp,
      };

      addToIndex(notification);

      // Create inbox item if configured
      if (createInboxItems) {
        // Create a message document
        const doc = await api.create({
          type: 'document',
          title: notification.title,
          content: notification.message,
          contentType: 'text',
          createdBy: options.senderId ?? ('system' as EntityId),
          metadata: {
            notificationType: options.type,
            notificationPriority: notification.priority,
            ...options.metadata,
          },
        });

        // Send via agent channel
        const registry = (api as any).agentRegistry;
        if (registry) {
          const channelId = await registry.getAgentChannelId(options.recipientId);
          if (channelId) {
            await api.create({
              type: 'message',
              channelId,
              contentRef: doc.id,
              senderId: options.senderId ?? ('system' as EntityId),
              createdBy: options.senderId ?? ('system' as EntityId),
            });
          }
        }
      }

      return notification;
    },

    async sendBatch(recipientIds, options): Promise<Notification[]> {
      const results: Notification[] = [];

      for (const recipientId of recipientIds) {
        const notification = await this.send({ ...options, recipientId });
        results.push(notification);
      }

      return results;
    },

    async getNotifications(agentId, options = {}): Promise<Notification[]> {
      const { unreadOnly = false, limit = 50, offset = 0 } = options;

      const ids = byRecipient.get(agentId) ?? new Set();
      let results: Notification[] = [];

      for (const id of ids) {
        const notification = notifications.get(id);
        if (notification) {
          if (unreadOnly && notification.readAt) continue;
          results.push(notification);
        }
      }

      // Sort by createdAt descending
      results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // Apply pagination
      return results.slice(offset, offset + limit);
    },

    async markAsRead(notificationId): Promise<void> {
      const notification = notifications.get(notificationId);
      if (notification && !notification.readAt) {
        const updated: Notification = {
          ...notification,
          readAt: new Date().toISOString() as Timestamp,
        };
        notifications.set(notificationId, updated);
      }
    },

    async markAllAsRead(agentId): Promise<number> {
      const ids = byRecipient.get(agentId) ?? new Set();
      let count = 0;

      for (const id of ids) {
        const notification = notifications.get(id);
        if (notification && !notification.readAt) {
          await this.markAsRead(id);
          count++;
        }
      }

      return count;
    },

    async getUnreadCount(agentId): Promise<number> {
      const ids = byRecipient.get(agentId) ?? new Set();
      let count = 0;

      for (const id of ids) {
        const notification = notifications.get(id);
        if (notification && !notification.readAt) {
          count++;
        }
      }

      return count;
    },

    async cleanup(options = {}): Promise<number> {
      const { maxAge = 7 * 24 * 60 * 60 * 1000, agentId } = options;
      const cutoff = Date.now() - maxAge;
      let removed = 0;

      for (const [id, notification] of notifications) {
        if (agentId && notification.recipientId !== agentId) continue;

        const createdTime = new Date(notification.createdAt).getTime();
        if (createdTime < cutoff) {
          removeFromIndex(id);
          removed++;
        }
      }

      return removed;
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

export type { NotificationService };
```

### 2. Add Tests

Create `packages/smithy/src/services/notification-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createNotificationService,
  NotificationType,
  NotificationPriority,
  type NotificationService,
} from './notification-service.js';

describe('NotificationService', () => {
  let service: NotificationService;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      create: async (input: any) => ({
        id: `mock-${Date.now()}`,
        ...input,
      }),
    };

    service = createNotificationService(mockApi, {
      createInboxItems: false, // Disable for unit tests
    });
  });

  describe('send', () => {
    it('creates a notification', async () => {
      const notification = await service.send({
        type: NotificationType.TASK_ASSIGNED,
        recipientId: 'agent-1' as any,
        title: 'New Task',
        message: 'You have been assigned a task',
      });

      expect(notification.id).toBeDefined();
      expect(notification.type).toBe(NotificationType.TASK_ASSIGNED);
      expect(notification.recipientId).toBe('agent-1');
      expect(notification.priority).toBe(NotificationPriority.MEDIUM);
    });

    it('uses provided priority', async () => {
      const notification = await service.send({
        type: NotificationType.SYSTEM_ALERT,
        priority: NotificationPriority.URGENT,
        recipientId: 'agent-1' as any,
        title: 'Alert',
        message: 'Urgent alert',
      });

      expect(notification.priority).toBe(NotificationPriority.URGENT);
    });
  });

  describe('getNotifications', () => {
    it('returns notifications for agent', async () => {
      await service.send({
        type: NotificationType.TASK_ASSIGNED,
        recipientId: 'agent-1' as any,
        title: 'Task 1',
        message: 'Message 1',
      });

      await service.send({
        type: NotificationType.TASK_COMPLETED,
        recipientId: 'agent-1' as any,
        title: 'Task 2',
        message: 'Message 2',
      });

      const notifications = await service.getNotifications('agent-1' as any);

      expect(notifications).toHaveLength(2);
    });

    it('filters unread only', async () => {
      const n1 = await service.send({
        type: NotificationType.TASK_ASSIGNED,
        recipientId: 'agent-1' as any,
        title: 'Task 1',
        message: 'Message 1',
      });

      await service.send({
        type: NotificationType.TASK_COMPLETED,
        recipientId: 'agent-1' as any,
        title: 'Task 2',
        message: 'Message 2',
      });

      await service.markAsRead(n1.id);

      const unread = await service.getNotifications('agent-1' as any, { unreadOnly: true });

      expect(unread).toHaveLength(1);
    });
  });

  describe('markAsRead', () => {
    it('marks notification as read', async () => {
      const notification = await service.send({
        type: NotificationType.TASK_ASSIGNED,
        recipientId: 'agent-1' as any,
        title: 'Task',
        message: 'Message',
      });

      await service.markAsRead(notification.id);

      const notifications = await service.getNotifications('agent-1' as any);
      expect(notifications[0].readAt).toBeDefined();
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread count', async () => {
      await service.send({
        type: NotificationType.TASK_ASSIGNED,
        recipientId: 'agent-1' as any,
        title: 'Task 1',
        message: 'Message 1',
      });

      await service.send({
        type: NotificationType.TASK_COMPLETED,
        recipientId: 'agent-1' as any,
        title: 'Task 2',
        message: 'Message 2',
      });

      const count = await service.getUnreadCount('agent-1' as any);

      expect(count).toBe(2);
    });
  });
});
```

### 3. Export from Services Index

Edit `packages/smithy/src/services/index.ts`:

```typescript
export * from './notification-service.js';
```

### 4. Export from Package

Edit `packages/smithy/src/index.ts`:

```typescript
export {
  createNotificationService,
  NotificationType,
  NotificationPriority,
  type NotificationService,
  type Notification,
  type SendNotificationOptions,
  type NotificationServiceConfig,
} from './services/notification-service.js';
```

### 5. Add to OrchestratorAPI (optional)

If the service should be accessible from the API:

```typescript
// In api/orchestrator-api.ts

import { createNotificationService, type NotificationService } from '../services/notification-service.js';

export interface OrchestratorAPI extends QuarryAPI {
  // ... existing methods
  readonly notifications: NotificationService;
}

export function createOrchestratorAPI(storage: StorageBackend): OrchestratorAPI {
  const api = createQuarryAPI(storage);

  const notifications = createNotificationService(api as any);

  return {
    ...api,
    notifications,
    // ... other methods
  };
}
```

### 6. Run Tests

```bash
cd packages/smithy
bun test notification
```

## Service Patterns

### Dependency Injection

```typescript
export function createMyService(
  api: OrchestratorAPI,
  deps: {
    assignmentService: TaskAssignmentService;
    registry: AgentRegistry;
  }
): MyService {
  const { assignmentService, registry } = deps;
  // Use injected dependencies
}
```

### Event Emitter Pattern

```typescript
import { EventEmitter } from 'events';

export interface MyServiceEvents {
  'item:created': (item: Item) => void;
  'item:updated': (item: Item) => void;
}

export interface MyService {
  on<K extends keyof MyServiceEvents>(event: K, listener: MyServiceEvents[K]): void;
  off<K extends keyof MyServiceEvents>(event: K, listener: MyServiceEvents[K]): void;
}

export function createMyService(): MyService {
  const emitter = new EventEmitter();

  return {
    on(event, listener) {
      emitter.on(event, listener);
    },
    off(event, listener) {
      emitter.off(event, listener);
    },
    // ... other methods that emit events
  };
}
```

### Cleanup/Dispose Pattern

```typescript
export interface MyService {
  // ... methods
  dispose(): void;
}

export function createMyService(): MyService {
  const intervals: NodeJS.Timeout[] = [];

  const service: MyService = {
    // ... methods

    dispose() {
      intervals.forEach(clearInterval);
      intervals.length = 0;
    },
  };

  // Start background tasks
  intervals.push(setInterval(() => { /* ... */ }, 60000));

  return service;
}
```

## Checklist

- [ ] Service file created with types and implementation
- [ ] Configuration interface defined
- [ ] Factory function implemented (`createXxxService`)
- [ ] Tests written and passing
- [ ] Exported from services/index.ts
- [ ] Exported from package index
- [ ] Added to OrchestratorAPI (if needed)
- [ ] Documentation updated
