/**
 * Inbox Routes Factory
 *
 * Shared inbox endpoints for entities and agents.
 * Used by both main server and orchestrator-server.
 */

import { Hono } from 'hono';
import type { ElementId, EntityId, Message, Channel, Entity, Document, InboxFilter, InboxItem, MessageId, ChannelId } from '@stoneforge/core';
import { InboxStatus } from '@stoneforge/core';
import type { CollaborateServicesWithBroadcast } from './types.js';

export function createInboxRoutes(services: CollaborateServicesWithBroadcast) {
  const { api, inboxService, storageBackend, broadcastInboxEvent } = services;
  const app = new Hono();

  /**
   * GET /api/entities/:id/inbox
   * Get entity's inbox with pagination and optional hydration.
   *
   * Query params:
   * - limit: Max items to return (default: 25)
   * - offset: Pagination offset
   * - status: Filter by status (unread, read, archived, or comma-separated)
   * - sourceType: Filter by source type (direct, mention)
   * - hydrate: If 'true', hydrate message content, sender, channel, attachments
   */
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

      // Handle status filter (can be comma-separated)
      if (statusParam) {
        const statuses = statusParam.split(',').map((s) => s.trim()) as InboxStatus[];
        filter.status = statuses.length === 1 ? statuses[0] : statuses;
      }

      if (sourceTypeParam) {
        filter.sourceType = sourceTypeParam as 'direct' | 'mention';
      }

      const result = inboxService.getInboxPaginated(id, filter);
      let items: InboxItem[] | Array<InboxItem & Record<string, unknown>> = result.items;

      // Optionally hydrate items with full data
      if (hydrateParam === 'true') {
        items = await Promise.all(items.map(async (item: InboxItem) => {
          try {
            // Hydrate message
            const message = await api.get(item.messageId as unknown as ElementId);
            let messageData = null;
            let fullContent = '';
            let contentPreview = '';
            let contentType = 'text';
            let threadId: string | null = null;

            if (message && message.type === 'message') {
              const msgTyped = message as Message;
              threadId = msgTyped.threadId ?? null;

              // Hydrate content
              if (msgTyped.contentRef) {
                const contentDoc = await api.get(msgTyped.contentRef as unknown as ElementId);
                if (contentDoc && contentDoc.type === 'document') {
                  const doc = contentDoc as Document;
                  fullContent = doc.content ?? '';
                  contentPreview = fullContent.slice(0, 100);
                  contentType = doc.contentType ?? 'text';
                }
              }

              messageData = {
                id: msgTyped.id,
                sender: msgTyped.sender,
                contentRef: msgTyped.contentRef,
                contentPreview,
                fullContent,
                contentType,
                threadId,
                createdAt: msgTyped.createdAt,
              };
            }

            // Hydrate sender
            let senderData = null;
            if (messageData?.sender) {
              const sender = await api.get(messageData.sender as unknown as ElementId);
              if (sender && sender.type === 'entity') {
                const entityTyped = sender as Entity;
                senderData = {
                  id: entityTyped.id,
                  type: 'entity',
                  name: entityTyped.name,
                  entityType: entityTyped.entityType,
                  tags: entityTyped.tags,
                  createdAt: entityTyped.createdAt,
                  updatedAt: entityTyped.updatedAt,
                };
              }
            }

            // Hydrate channel
            let channelData = null;
            const channel = await api.get(item.channelId as unknown as ElementId);
            if (channel && channel.type === 'channel') {
              const channelTyped = channel as Channel;
              channelData = {
                id: channelTyped.id,
                name: channelTyped.name,
                channelType: channelTyped.channelType,
              };
            }

            // Hydrate attachments (documents referenced by this message)
            const attachments: Array<{ id: string; title: string; content?: string; contentType?: string }> = [];
            if (message) {
              const deps = await api.getDependencies(message.id as ElementId);
              const refDeps = deps.filter((d) => d.type === 'references');
              for (const dep of refDeps) {
                const doc = await api.get(dep.blockerId as ElementId);
                if (doc && doc.type === 'document') {
                  const docTyped = doc as Document;
                  const firstLine = (docTyped.content ?? '').split('\n')[0]?.slice(0, 50) || 'Untitled';
                  attachments.push({
                    id: docTyped.id,
                    title: firstLine,
                    content: docTyped.content?.slice(0, 500),
                    contentType: docTyped.contentType,
                  });
                }
              }
            }

            // Hydrate thread parent (if this is a reply)
            let threadParent = null;
            if (threadId) {
              const parentMsg = await api.get(threadId as unknown as ElementId);
              if (parentMsg && parentMsg.type === 'message') {
                const parentTyped = parentMsg as Message;
                let parentPreview = '';
                if (parentTyped.contentRef) {
                  const parentContent = await api.get(parentTyped.contentRef as unknown as ElementId);
                  if (parentContent && parentContent.type === 'document') {
                    parentPreview = ((parentContent as Document).content ?? '').slice(0, 100);
                  }
                }
                let parentSender = null;
                const parentSenderEntity = await api.get(parentTyped.sender as unknown as ElementId);
                if (parentSenderEntity && parentSenderEntity.type === 'entity') {
                  const entityTyped = parentSenderEntity as Entity;
                  parentSender = {
                    id: entityTyped.id,
                    name: entityTyped.name,
                    entityType: entityTyped.entityType,
                  };
                }
                threadParent = {
                  id: parentTyped.id,
                  sender: parentSender,
                  contentPreview: parentPreview,
                  createdAt: parentTyped.createdAt,
                };
              }
            }

            return {
              ...item,
              message: messageData,
              sender: senderData,
              channel: channelData,
              attachments: attachments.length > 0 ? attachments : undefined,
              threadParent,
            };
          } catch (err) {
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

  /**
   * GET /api/entities/:id/inbox/count
   * Get unread inbox count for an entity.
   */
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

  /**
   * POST /api/entities/:id/inbox/mark-all-read
   * Mark all inbox items as read for an entity.
   */
  app.post('/api/entities/:id/inbox/mark-all-read', async (c) => {
    try {
      const id = c.req.param('id') as EntityId;

      // Verify entity exists
      const entity = await api.get(id as unknown as ElementId);
      if (!entity || entity.type !== 'entity') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
      }

      const count = inboxService.markAllAsRead(id);

      // Broadcast bulk update event
      if (count > 0 && broadcastInboxEvent) {
        broadcastInboxEvent(
          `bulk-${id}`,
          id,
          'updated',
          null,
          { bulkMarkRead: true, count },
          id
        );
      }

      return c.json({ markedCount: count });
    } catch (error) {
      console.error('[stoneforge] Failed to mark all as read:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to mark all as read' } }, 500);
    }
  });

  /**
   * GET /api/inbox/all
   * Global inbox view across all entities.
   * Supports filtering by entityId to show a specific user's inbox.
   */
  app.get('/api/inbox/all', async (c) => {
    try {
      const url = new URL(c.req.url);

      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');
      const statusParam = url.searchParams.get('status');
      const hydrateParam = url.searchParams.get('hydrate');
      const entityIdParam = url.searchParams.get('entityId');

      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

      // We need to use raw SQL for global inbox (no specific recipientId)
      // Build WHERE conditions
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (statusParam) {
        const statuses = statusParam.split(',').map((s) => s.trim());
        if (statuses.length === 1) {
          conditions.push('status = ?');
          params.push(statuses[0]);
        } else {
          conditions.push(`status IN (${statuses.map(() => '?').join(',')})`);
          params.push(...statuses);
        }
      }

      if (entityIdParam) {
        conditions.push('recipient_id = ?');
        params.push(entityIdParam);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = storageBackend.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM inbox_items ${whereClause}`,
        params
      );
      const total = countResult?.count ?? 0;

      // Get items
      const rows = storageBackend.query<{
        id: string;
        recipient_id: string;
        message_id: string;
        channel_id: string;
        source_type: string;
        status: string;
        read_at: string | null;
        created_at: string;
      }>(
        `SELECT id, recipient_id, message_id, channel_id, source_type, status, read_at, created_at
         FROM inbox_items ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      let items: Array<InboxItem & Record<string, unknown>> = rows.map((row) => ({
        id: row.id,
        recipientId: row.recipient_id as EntityId,
        messageId: row.message_id as MessageId,
        channelId: row.channel_id as ChannelId,
        sourceType: row.source_type as 'direct' | 'mention',
        status: row.status as InboxStatus,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));

      // Hydrate items if requested
      if (hydrateParam === 'true') {
        items = await Promise.all(items.map(async (item) => {
          try {
            // Hydrate message
            const message = await api.get(item.messageId as unknown as ElementId);
            let messageData = null;
            let fullContent = '';
            let contentPreview = '';
            let contentType = 'text';
            let threadId: string | null = null;

            if (message && message.type === 'message') {
              const msgTyped = message as Message;
              threadId = msgTyped.threadId ?? null;

              if (msgTyped.contentRef) {
                const contentDoc = await api.get(msgTyped.contentRef as unknown as ElementId);
                if (contentDoc && contentDoc.type === 'document') {
                  const doc = contentDoc as Document;
                  fullContent = doc.content ?? '';
                  contentPreview = fullContent.slice(0, 100);
                  contentType = doc.contentType ?? 'text';
                }
              }

              messageData = {
                id: msgTyped.id,
                sender: msgTyped.sender,
                contentRef: msgTyped.contentRef,
                contentPreview,
                fullContent,
                contentType,
                threadId,
                createdAt: msgTyped.createdAt,
              };
            }

            // Hydrate sender
            let senderData = null;
            if (messageData?.sender) {
              const sender = await api.get(messageData.sender as unknown as ElementId);
              if (sender && sender.type === 'entity') {
                const entityTyped = sender as Entity;
                senderData = {
                  id: entityTyped.id,
                  type: 'entity',
                  name: entityTyped.name,
                  entityType: entityTyped.entityType,
                  tags: entityTyped.tags,
                  createdAt: entityTyped.createdAt,
                  updatedAt: entityTyped.updatedAt,
                };
              }
            }

            // Hydrate recipient
            let recipientData = null;
            const recipient = await api.get(item.recipientId as unknown as ElementId);
            if (recipient && recipient.type === 'entity') {
              const entityTyped = recipient as Entity;
              recipientData = {
                id: entityTyped.id,
                type: 'entity',
                name: entityTyped.name,
                entityType: entityTyped.entityType,
              };
            }

            // Hydrate channel
            let channelData = null;
            const channel = await api.get(item.channelId as unknown as ElementId);
            if (channel && channel.type === 'channel') {
              const channelTyped = channel as Channel;
              channelData = {
                id: channelTyped.id,
                name: channelTyped.name,
                channelType: channelTyped.channelType,
              };
            }

            // Hydrate attachments
            const attachments: Array<{ id: string; title: string; content?: string; contentType?: string }> = [];
            if (message) {
              const deps = await api.getDependencies(message.id as ElementId);
              const refDeps = deps.filter((d) => d.type === 'references');
              for (const dep of refDeps) {
                const doc = await api.get(dep.blockerId as ElementId);
                if (doc && doc.type === 'document') {
                  const docTyped = doc as Document;
                  const firstLine = (docTyped.content ?? '').split('\n')[0]?.slice(0, 50) || 'Untitled';
                  attachments.push({
                    id: docTyped.id,
                    title: firstLine,
                    content: docTyped.content?.slice(0, 500),
                    contentType: docTyped.contentType,
                  });
                }
              }
            }

            // Hydrate thread parent
            let threadParent = null;
            if (threadId) {
              const parentMsg = await api.get(threadId as unknown as ElementId);
              if (parentMsg && parentMsg.type === 'message') {
                const parentTyped = parentMsg as Message;
                let parentPreview = '';
                if (parentTyped.contentRef) {
                  const parentContent = await api.get(parentTyped.contentRef as unknown as ElementId);
                  if (parentContent && parentContent.type === 'document') {
                    parentPreview = ((parentContent as Document).content ?? '').slice(0, 100);
                  }
                }
                let parentSender = null;
                const parentSenderEntity = await api.get(parentTyped.sender as unknown as ElementId);
                if (parentSenderEntity && parentSenderEntity.type === 'entity') {
                  const entityTyped = parentSenderEntity as Entity;
                  parentSender = {
                    id: entityTyped.id,
                    name: entityTyped.name,
                    entityType: entityTyped.entityType,
                  };
                }
                threadParent = {
                  id: parentTyped.id,
                  sender: parentSender,
                  contentPreview: parentPreview,
                  createdAt: parentTyped.createdAt,
                };
              }
            }

            return {
              ...item,
              message: messageData,
              sender: senderData,
              recipient: recipientData,
              channel: channelData,
              attachments: attachments.length > 0 ? attachments : undefined,
              threadParent,
            };
          } catch (err) {
            console.warn(`[stoneforge] Failed to hydrate inbox item ${item.id}:`, err);
            return item;
          }
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

  /**
   * GET /api/inbox/count
   * Global inbox unread count.
   * Supports filtering by entityId to get count for a specific user.
   */
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

  /**
   * GET /api/inbox/:itemId
   * Get single inbox item.
   */
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

  /**
   * PATCH /api/inbox/:itemId
   * Update inbox item status.
   */
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
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } }, 400);
      }

      // Broadcast inbox event for real-time updates
      if (broadcastInboxEvent) {
        broadcastInboxEvent(
          itemId,
          item.recipientId,
          'updated',
          { status: oldItem.status, readAt: oldItem.readAt },
          { status: item.status, readAt: item.readAt },
          item.recipientId
        );
      }

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

  return app;
}
