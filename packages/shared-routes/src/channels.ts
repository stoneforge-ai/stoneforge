/**
 * Channel Routes Factory
 *
 * CRUD operations for channels and channel membership.
 */

import { Hono } from 'hono';
import type { ElementId, EntityId, Channel, Entity, Visibility, JoinPolicy } from '@stoneforge/core';
import { createGroupChannel, createDirectChannel } from '@stoneforge/core';
import type { CreateGroupChannelInput, CreateDirectChannelInput, Element } from '@stoneforge/core';
import type { CollaborateServices } from './types.js';

export function createChannelRoutes(services: CollaborateServices) {
  const { api } = services;
  const app = new Hono();

  // GET /api/channels - List channels
  app.get('/api/channels', async (c) => {
    try {
      const url = new URL(c.req.url);

      // Parse pagination and filter parameters
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');
      const orderByParam = url.searchParams.get('orderBy');
      const orderDirParam = url.searchParams.get('orderDir');
      const searchParam = url.searchParams.get('search');
      const channelTypeParam = url.searchParams.get('channelType');

      // Build filter
      const filter: Record<string, unknown> = {
        type: 'channel',
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

      // Apply client-side filtering for search and channel type
      let filteredItems = result.items;

      if (channelTypeParam && channelTypeParam !== 'all') {
        filteredItems = filteredItems.filter((ch) => {
          const channel = ch as unknown as { channelType: string };
          return channel.channelType === channelTypeParam;
        });
      }

      if (searchParam) {
        const query = searchParam.toLowerCase();
        filteredItems = filteredItems.filter((ch) => {
          const channel = ch as unknown as { name: string; id: string; tags?: string[] };
          return (
            channel.name.toLowerCase().includes(query) ||
            channel.id.toLowerCase().includes(query) ||
            (channel.tags || []).some((tag) => tag.toLowerCase().includes(query))
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
      console.error('[stoneforge] Failed to get channels:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channels' } }, 500);
    }
  });

  // GET /api/channels/:id - Get single channel
  app.get('/api/channels/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const channel = await api.get(id);
      if (!channel) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }
      if (channel.type !== 'channel') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }
      return c.json(channel);
    } catch (error) {
      console.error('[stoneforge] Failed to get channel:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel' } }, 500);
    }
  });

  // POST /api/channels - Create channel
  app.post('/api/channels', async (c) => {
    try {
      const body = (await c.req.json()) as {
        channelType: 'group' | 'direct';
        name?: string;
        createdBy: string;
        members?: string[];
        description?: string | null;
        visibility?: Visibility;
        joinPolicy?: JoinPolicy;
        entityA?: string;
        entityB?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
      };

      // Validate channelType
      if (!body.channelType || !['group', 'direct'].includes(body.channelType)) {
        return c.json(
          { error: { code: 'VALIDATION_ERROR', message: 'channelType is required and must be "group" or "direct"' } },
          400
        );
      }

      // Validate createdBy
      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
      }

      let channel;

      if (body.channelType === 'group') {
        // Validate name for group channels
        if (!body.name || typeof body.name !== 'string') {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required for group channels' } }, 400);
        }

        const groupInput: CreateGroupChannelInput = {
          name: body.name,
          createdBy: body.createdBy as EntityId,
          members: body.members as EntityId[] | undefined,
          description: body.description,
          visibility: body.visibility,
          joinPolicy: body.joinPolicy,
          tags: body.tags,
          metadata: body.metadata,
        };

        channel = await createGroupChannel(groupInput);
      } else {
        // Direct channel
        if (!body.entityA || typeof body.entityA !== 'string') {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'entityA is required for direct channels' } }, 400);
        }
        if (!body.entityB || typeof body.entityB !== 'string') {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'entityB is required for direct channels' } }, 400);
        }

        // Look up entity names for channel naming
        const entityAData = await api.get<Entity>(body.entityA as ElementId);
        const entityBData = await api.get<Entity>(body.entityB as ElementId);
        const entityAName = (entityAData as Entity | null)?.name;
        const entityBName = (entityBData as Entity | null)?.name;

        const directInput: CreateDirectChannelInput = {
          entityA: body.entityA as EntityId,
          entityB: body.entityB as EntityId,
          createdBy: body.createdBy as EntityId,
          ...(entityAName && { entityAName }),
          ...(entityBName && { entityBName }),
          description: body.description,
          tags: body.tags,
          metadata: body.metadata,
        };

        channel = await createDirectChannel(directInput);
      }

      // Create the channel in database
      const created = await api.create(channel as unknown as Element & Record<string, unknown>);

      return c.json(created, 201);
    } catch (error) {
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[stoneforge] Failed to create channel:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create channel' } }, 500);
    }
  });

  // GET /api/channels/:id/messages - Get channel messages
  app.get('/api/channels/:id/messages', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);

      // Parse query params
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');
      const hydrateContent = url.searchParams.get('hydrate.content') === 'true';

      // First verify channel exists
      const channel = await api.get(id);
      if (!channel) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }
      if (channel.type !== 'channel') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }

      // Get messages for this channel
      const filter: Record<string, unknown> = {
        type: 'message',
        channelId: id,
        orderBy: 'created_at',
        orderDir: 'asc',
      };

      if (limitParam) {
        filter.limit = parseInt(limitParam, 10);
      }
      if (offsetParam) {
        filter.offset = parseInt(offsetParam, 10);
      }

      const messages = await api.list(filter as Parameters<typeof api.list>[0]);

      // Optionally hydrate content and attachments
      if (hydrateContent) {
        const hydratedMessages = await Promise.all(
          messages.map(async (msg) => {
            const message = msg as { id: ElementId; contentRef?: string };
            let result = { ...msg } as Record<string, unknown>;

            // Hydrate content
            if (message.contentRef) {
              const content = await api.get(message.contentRef as ElementId);
              if (content && content.type === 'document') {
                result._content = (content as { content?: string }).content;
              }
            }

            // Hydrate attachments (documents referenced by this message)
            const dependencies = await api.getDependencies(message.id);
            const attachmentDeps = dependencies.filter((dep) => dep.blockedId === message.id && dep.type === 'references');
            if (attachmentDeps.length > 0) {
              const attachments = await Promise.all(
                attachmentDeps.map(async (dep) => {
                  const doc = await api.get(dep.blockerId as ElementId);
                  if (doc && doc.type === 'document') {
                    return doc;
                  }
                  return null;
                })
              );
              result._attachments = attachments.filter(Boolean);
            }

            return result;
          })
        );
        return c.json(hydratedMessages);
      }

      return c.json(messages);
    } catch (error) {
      console.error('[stoneforge] Failed to get channel messages:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel messages' } }, 500);
    }
  });

  // GET /api/channels/:id/members - Get channel members
  app.get('/api/channels/:id/members', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const hydrate = url.searchParams.get('hydrate') === 'true';

      // Verify channel exists
      const channel = await api.get(id);
      if (!channel || channel.type !== 'channel') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }

      const channelData = channel as Channel;
      const memberIds = channelData.members || [];

      // Optionally hydrate member entities
      if (hydrate) {
        const hydratedMembers = await Promise.all(
          memberIds.map(async (memberId: string) => {
            const entity = await api.get(memberId as unknown as ElementId);
            return entity || { id: memberId, name: memberId, notFound: true };
          })
        );
        return c.json({
          members: hydratedMembers,
          permissions: channelData.permissions,
          channelType: channelData.channelType,
        });
      }

      return c.json({
        members: memberIds,
        permissions: channelData.permissions,
        channelType: channelData.channelType,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to get channel members:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel members' } }, 500);
    }
  });

  // POST /api/channels/:id/members - Add member to channel
  app.post('/api/channels/:id/members', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        entityId: string;
        actor: string;
      };

      // Validate required fields
      if (!body.entityId || typeof body.entityId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'entityId is required' } }, 400);
      }
      if (!body.actor || typeof body.actor !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor is required' } }, 400);
      }

      const result = await api.addChannelMember(id, body.entityId as EntityId, { actor: body.actor as EntityId });

      return c.json(result);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel or entity not found' } }, 404);
      }
      if (err.code === 'IMMUTABLE') {
        return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Cannot modify direct channel membership' } }, 403);
      }
      if (err.code === 'MEMBER_REQUIRED') {
        return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'No permission to modify members' } }, 403);
      }
      console.error('[stoneforge] Failed to add channel member:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add channel member' } }, 500);
    }
  });

  // DELETE /api/channels/:id/members/:entityId - Remove member from channel
  app.delete('/api/channels/:id/members/:entityId', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const entityId = c.req.param('entityId') as EntityId;
      const url = new URL(c.req.url);
      const actor = url.searchParams.get('actor');

      // Validate actor
      if (!actor) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor query parameter is required' } }, 400);
      }

      const result = await api.removeChannelMember(id, entityId, { actor: actor as EntityId });

      return c.json(result);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel not found' } }, 404);
      }
      if (err.code === 'IMMUTABLE') {
        return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Cannot modify direct channel membership' } }, 403);
      }
      if (err.code === 'MEMBER_REQUIRED') {
        return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'No permission to modify members' } }, 403);
      }
      console.error('[stoneforge] Failed to remove channel member:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove channel member' } }, 500);
    }
  });

  // POST /api/channels/:id/leave - Leave channel (self-removal)
  app.post('/api/channels/:id/leave', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        actor: string;
      };

      // Validate actor
      if (!body.actor || typeof body.actor !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor is required' } }, 400);
      }

      const result = await api.leaveChannel(id, body.actor as EntityId);

      return c.json(result);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel not found' } }, 404);
      }
      if (err.code === 'IMMUTABLE') {
        return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Cannot leave direct channel' } }, 403);
      }
      if (err.code === 'MEMBER_REQUIRED') {
        return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Not a member of this channel' } }, 403);
      }
      console.error('[stoneforge] Failed to leave channel:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to leave channel' } }, 500);
    }
  });

  // POST /api/channels/:id/merge - Merge another channel into this one
  app.post('/api/channels/:id/merge', async (c) => {
    try {
      const targetId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        sourceChannelId: string;
        newName?: string;
        actor: string;
      };

      if (!body.sourceChannelId || typeof body.sourceChannelId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'sourceChannelId is required' } }, 400);
      }
      if (!body.actor || typeof body.actor !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor is required' } }, 400);
      }

      const result = await api.mergeChannels(
        body.sourceChannelId as ElementId,
        targetId,
        { newName: body.newName, actor: body.actor as EntityId }
      );

      return c.json(result);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel not found' } }, 404);
      }
      if (err.code === 'IMMUTABLE') {
        return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Cannot merge non-group channels' } }, 403);
      }
      console.error('[stoneforge] Failed to merge channels:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to merge channels' } }, 500);
    }
  });

  // DELETE /api/channels/:id - Delete a channel
  app.delete('/api/channels/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const actor = url.searchParams.get('actor');

      // Validate actor
      if (!actor) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor query parameter is required' } }, 400);
      }

      // Verify channel exists
      const channel = await api.get(id);
      if (!channel) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }
      if (channel.type !== 'channel') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }

      // Delete the channel
      await api.delete(id, { actor: actor as EntityId, reason: 'Channel deleted by user' });

      return c.json({ success: true });
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel not found' } }, 404);
      }
      console.error('[stoneforge] Failed to delete channel:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete channel' } }, 500);
    }
  });

  return app;
}
