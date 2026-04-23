/**
 * Message Routes Factory
 *
 * Message creation, search, and thread replies.
 */

import { Hono } from 'hono';
import type { ElementId, EntityId, Channel, Message, Element, CreateMessageInput } from '@stoneforge/core';
import { createDocument, createMessage, DocumentCategory } from '@stoneforge/core';
import type { CollaborateServicesWithBroadcast } from './types.js';

export function createMessageRoutes(services: CollaborateServicesWithBroadcast) {
  const { api, inboxService, broadcastInboxEvent } = services;
  const app = new Hono();

  // POST /api/messages - Create a new message
  app.post('/api/messages', async (c) => {
    try {
      const body = await c.req.json();

      // Validate required fields
      if (!body.channelId || typeof body.channelId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'channelId is required' } }, 400);
      }
      if (!body.sender || typeof body.sender !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'sender is required' } }, 400);
      }
      if (!body.content || typeof body.content !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
      }

      // Verify channel exists
      const channel = await api.get(body.channelId as ElementId);
      if (!channel || channel.type !== 'channel') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
      }

      // Verify sender entity exists
      const senderEntity = await api.get(body.sender as ElementId);
      if (!senderEntity || senderEntity.type !== 'entity') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Sender entity not found' } }, 404);
      }

      // For group channels, verify sender is a member
      const typedChannelCheck = channel as Channel;
      if (typedChannelCheck.channelType === 'group') {
        if (!typedChannelCheck.members.includes(body.sender as EntityId)) {
          return c.json(
            { error: { code: 'FORBIDDEN', message: 'You must be a member of this channel to send messages' } },
            403
          );
        }
      }

      // Create a document for the message content
      const contentDoc = await createDocument({
        contentType: 'text',
        content: body.content,
        createdBy: body.sender as EntityId,
        category: DocumentCategory.MESSAGE_CONTENT,
        immutable: true,
      });
      const createdDoc = await api.create(contentDoc as unknown as Element & Record<string, unknown>);

      // Create the message with the content document reference
      const messageInput = {
        channelId: body.channelId,
        sender: body.sender,
        contentRef: createdDoc.id,
        ...(body.threadId && { threadId: body.threadId }),
        ...(body.tags && { tags: body.tags }),
      };
      const message = await createMessage(messageInput as unknown as CreateMessageInput);
      const createdMessage = await api.create(message as unknown as Element & Record<string, unknown>);

      // Handle attachments if provided
      const attachments: Element[] = [];
      if (body.attachmentIds && Array.isArray(body.attachmentIds)) {
        for (const docId of body.attachmentIds) {
          // Verify document exists
          const doc = await api.get(docId as ElementId);
          if (!doc || doc.type !== 'document') {
            return c.json({ error: { code: 'NOT_FOUND', message: `Document ${docId} not found` } }, 404);
          }
          // Create references dependency from message to document
          await api.addDependency({
            blockedId: createdMessage.id as ElementId,
            blockerId: docId as ElementId,
            type: 'references',
            actor: body.sender as EntityId,
          });
          attachments.push(doc);
        }
      }

      // TB89: Add inbox items for channel members (except sender)
      const typedChannel = channel as Channel;
      const senderId = body.sender as EntityId;
      const messageId = createdMessage.id as string;
      const channelIdStr = body.channelId as string;

      // Track entities that have already received inbox items (to avoid duplicates)
      const notifiedEntities = new Set<string>();

      // For direct channels: notify all members except sender
      if (typedChannel.channelType === 'direct') {
        for (const memberId of typedChannel.members) {
          if (memberId !== senderId && !notifiedEntities.has(memberId)) {
            try {
              inboxService.addToInbox({
                recipientId: memberId,
                messageId: messageId as any,
                channelId: channelIdStr as any,
                sourceType: 'direct',
                createdBy: senderId,
              });
              notifiedEntities.add(memberId);

              // Broadcast inbox event for real-time updates (if available)
              if (broadcastInboxEvent) {
                broadcastInboxEvent(
                  `inbox-${memberId}-${messageId}`,
                  memberId,
                  'created',
                  null,
                  { recipientId: memberId, messageId, channelId: channelIdStr, sourceType: 'direct' },
                  senderId
                );
              }
            } catch (error) {
              // Ignore duplicate inbox errors
              if ((error as { code?: string }).code !== 'ALREADY_EXISTS') {
                console.error(`[stoneforge] Failed to create inbox item for ${memberId}:`, error);
              }
            }
          }
        }
      }

      // Parse @mentions from message content and add inbox items
      const mentionPattern = /@(el-[a-z0-9]+)/gi;
      const mentions = body.content.match(mentionPattern) || [];

      for (const mention of mentions) {
        // Extract the entity ID from the mention (remove the @ prefix)
        const mentionedId = mention.substring(1) as EntityId;

        // Skip if it's the sender mentioning themselves or already notified
        if (mentionedId === senderId || notifiedEntities.has(mentionedId)) {
          continue;
        }

        // Verify the mentioned entity exists
        try {
          const mentionedEntity = await api.get(mentionedId as unknown as ElementId);
          if (mentionedEntity && mentionedEntity.type === 'entity') {
            inboxService.addToInbox({
              recipientId: mentionedId,
              messageId: messageId as any,
              channelId: channelIdStr as any,
              sourceType: 'mention',
              createdBy: senderId,
            });
            notifiedEntities.add(mentionedId);

            // Broadcast inbox event for real-time updates (if available)
            if (broadcastInboxEvent) {
              broadcastInboxEvent(
                `inbox-${mentionedId}-${messageId}`,
                mentionedId,
                'created',
                null,
                { recipientId: mentionedId, messageId, channelId: channelIdStr, sourceType: 'mention' },
                senderId
              );
            }
          }
        } catch (error) {
          // Ignore errors for mentions
          if ((error as { code?: string }).code !== 'ALREADY_EXISTS') {
            console.error(`[stoneforge] Failed to process mention ${mentionedId}:`, error);
          }
        }
      }

      // For thread replies: Notify the parent message sender
      if (body.threadId) {
        try {
          const parentMessage = await api.get(body.threadId as ElementId);
          if (parentMessage && parentMessage.type === 'message') {
            const parentSender = (parentMessage as Message).sender;
            // Notify parent message sender (if not replying to yourself and not already notified)
            if (parentSender !== senderId && !notifiedEntities.has(parentSender)) {
              inboxService.addToInbox({
                recipientId: parentSender,
                messageId: messageId as any,
                channelId: channelIdStr as any,
                sourceType: 'thread_reply',
                createdBy: senderId,
              });
              notifiedEntities.add(parentSender);

              // Broadcast inbox event for real-time updates (if available)
              if (broadcastInboxEvent) {
                broadcastInboxEvent(
                  `inbox-${parentSender}-${messageId}`,
                  parentSender,
                  'created',
                  null,
                  { recipientId: parentSender, messageId, channelId: channelIdStr, sourceType: 'thread_reply' },
                  senderId
                );
              }
            }
          }
        } catch (error) {
          // Ignore errors
          if ((error as { code?: string }).code !== 'ALREADY_EXISTS') {
            console.error(`[stoneforge] Failed to create thread reply inbox item:`, error);
          }
        }
      }

      // Return the message with content and attachments hydrated
      return c.json({
        ...createdMessage,
        _content: body.content,
        _attachments: attachments,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: (error as Error).message } }, 404);
      }
      if ((error as { code?: string }).code === 'MEMBER_REQUIRED') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Sender must be a channel member' } }, 403);
      }
      console.error('[stoneforge] Failed to create message:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create message' } }, 500);
    }
  });

  /**
   * GET /api/messages/search
   * Search messages by content across all channels or within a specific channel (TB103)
   *
   * Query params:
   * - q: Search query (required)
   * - channelId: Optional channel ID to limit search to
   * - limit: Max number of results (default: 20)
   *
   * NOTE: This route must come BEFORE /api/messages/:id/replies to avoid route matching issues
   */
  app.get('/api/messages/search', async (c) => {
    try {
      const url = new URL(c.req.url);
      const query = url.searchParams.get('q');
      const channelId = url.searchParams.get('channelId');
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 20;

      if (!query || query.trim().length === 0) {
        return c.json({ results: [], query: '' });
      }

      const searchQuery = query.trim().toLowerCase();

      // Get all messages (with reasonable limit to avoid performance issues)
      const filter: Record<string, unknown> = {
        type: 'message',
        limit: 1000,
        orderBy: 'created_at',
        orderDir: 'desc',
      };

      if (channelId) {
        filter.channelId = channelId;
      }

      const allMessages = await api.list(filter as Parameters<typeof api.list>[0]);

      // Filter messages with matching channelId if specified
      let filteredMessages = allMessages;
      if (channelId) {
        filteredMessages = allMessages.filter((msg) => {
          const message = msg as { channelId?: string };
          return message.channelId === channelId;
        });
      }

      // Hydrate content and search
      interface MessageSearchResult {
        id: string;
        channelId: string;
        sender: string;
        content: string;
        snippet: string;
        createdAt: string;
        threadId: string | null;
      }

      const results: MessageSearchResult[] = [];

      for (const msg of filteredMessages) {
        const message = msg as {
          id: string;
          channelId?: string;
          sender?: string;
          contentRef?: string;
          createdAt: string;
          threadId?: string;
        };

        // Hydrate content
        let content = '';
        if (message.contentRef) {
          const contentDoc = await api.get(message.contentRef as ElementId);
          if (contentDoc && contentDoc.type === 'document') {
            content = (contentDoc as { content?: string }).content || '';
          }
        }

        const contentLower = content.toLowerCase();

        if (contentLower.includes(searchQuery)) {
          // Generate snippet with surrounding context
          const matchIndex = contentLower.indexOf(searchQuery);
          const snippetStart = Math.max(0, matchIndex - 50);
          const snippetEnd = Math.min(content.length, matchIndex + searchQuery.length + 50);
          let snippetText = content.slice(snippetStart, snippetEnd);

          // Add ellipsis if truncated
          if (snippetStart > 0) snippetText = '...' + snippetText;
          if (snippetEnd < content.length) snippetText = snippetText + '...';

          // Clean up markdown/HTML for display
          snippetText = snippetText
            .replace(/#{1,6}\s*/g, '') // Remove heading markers
            .replace(/\*\*/g, '') // Remove bold markers
            .replace(/\*/g, '') // Remove italic markers
            .replace(/`/g, '') // Remove code markers
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove link syntax
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove image syntax
            .replace(/\n+/g, ' ') // Replace newlines with spaces
            .trim();

          results.push({
            id: message.id,
            channelId: message.channelId || '',
            sender: message.sender || '',
            content,
            snippet: snippetText,
            createdAt: message.createdAt,
            threadId: message.threadId || null,
          });

          // Stop when we have enough results
          if (results.length >= limit) break;
        }
      }

      return c.json({ results, query: query.trim() });
    } catch (error) {
      console.error('[stoneforge] Failed to search messages:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to search messages' } }, 500);
    }
  });

  // GET /api/messages/:id/replies - Get thread replies
  app.get('/api/messages/:id/replies', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const hydrateContent = url.searchParams.get('hydrate.content') === 'true';

      // Verify the parent message exists
      const parentMessage = await api.get(id);
      if (!parentMessage || parentMessage.type !== 'message') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Message not found' } }, 404);
      }

      // Get all messages that have this message as their threadId
      const filter: Record<string, unknown> = {
        type: 'message',
        threadId: id,
        orderBy: 'created_at',
        orderDir: 'asc',
      };

      const replies = await api.list(filter as Parameters<typeof api.list>[0]);

      // Optionally hydrate content
      if (hydrateContent) {
        const hydratedReplies = await Promise.all(
          replies.map(async (msg) => {
            const message = msg as { contentRef?: string };
            if (message.contentRef) {
              const content = await api.get(message.contentRef as ElementId);
              if (content && content.type === 'document') {
                return { ...msg, _content: (content as { content?: string }).content };
              }
            }
            return msg;
          })
        );
        return c.json(hydratedReplies);
      }

      return c.json(replies);
    } catch (error) {
      console.error('[stoneforge] Failed to get thread replies:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get thread replies' } }, 500);
    }
  });

  return app;
}
