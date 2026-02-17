/**
 * Activity/Events Routes
 *
 * Event listing and SSE streaming for real-time activity.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventEmitter } from 'node:events';
import type { EntityId, ElementId } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type { SpawnedSessionEvent } from '@stoneforge/smithy';
import { createLogger, trackListeners } from '@stoneforge/smithy';
import type { Services } from '../services.js';
import { generateActivitySummary } from '../formatters.js';

const logger = createLogger('orchestrator');

/**
 * Global event bus for notifying SSE clients about new sessions.
 * When a new session starts, SSE streams need to dynamically subscribe
 * to that session's events. This bus bridges the gap between session
 * creation (in session routes) and SSE stream handlers (in event routes).
 */
const sseSessionBus = new EventEmitter();
sseSessionBus.setMaxListeners(100); // Support many concurrent SSE clients

interface NewSessionInfo {
  sessionId: string;
  agentId: EntityId | string;
  agentRole: string;
  events: EventEmitter;
}

/**
 * Notify all SSE stream clients that a new session has started.
 * Call this from session start/resume endpoints after the session is created.
 */
export function notifySSEClientsOfNewSession(info: NewSessionInfo): void {
  sseSessionBus.emit('new-session', info);
}

export function createEventRoutes(services: Services) {
  const { api, sessionManager, spawnerService, dispatchDaemon } = services;
  const app = new Hono();

  // GET /api/events
  app.get('/api/events', async (c) => {
    try {
      const url = new URL(c.req.url);
      const elementId = url.searchParams.get('elementId') as ElementId | null;
      const elementTypeParam = url.searchParams.get('elementType');
      const eventTypeParam = url.searchParams.get('eventType');
      const actor = url.searchParams.get('actor') as EntityId | null;
      const after = url.searchParams.get('after');
      const before = url.searchParams.get('before');
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');

      const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 200);
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

      const filter = {
        ...(elementId && { elementId }),
        ...(eventTypeParam && {
          eventType: eventTypeParam.includes(',') ? eventTypeParam.split(',') : eventTypeParam,
        }),
        ...(actor && { actor }),
        ...(after && { after }),
        ...(before && { before }),
        limit: limit + 1,
        offset,
      };

      const events = await api.listEvents(filter as Parameters<typeof api.listEvents>[0]);
      const hasMore = events.length > limit;
      const resultEvents = hasMore ? events.slice(0, limit) : events;

      const enrichedEvents = await Promise.all(
        resultEvents.map(async (event) => {
          let elementType: string | undefined;
          let elementTitle: string | undefined;
          let actorName: string | undefined;

          try {
            const element = await api.get(event.elementId);
            if (element) {
              elementType = element.type;
              if ('title' in element) {
                elementTitle = element.title as string;
              } else if ('name' in element) {
                elementTitle = element.name as string;
              }
            }
          } catch {
            // Element may have been deleted
          }

          if (elementTypeParam && elementType) {
            const requestedTypes = elementTypeParam.split(',');
            if (!requestedTypes.includes(elementType)) {
              return null;
            }
          }

          try {
            const actorEntity = await api.get(event.actor as unknown as ElementId);
            if (actorEntity && 'name' in actorEntity) {
              actorName = actorEntity.name as string;
            }
          } catch {
            // Actor may be a system entity
          }

          const summary = generateActivitySummary(event, elementType, elementTitle);

          return {
            id: event.id,
            elementId: event.elementId,
            elementType,
            elementTitle,
            eventType: event.eventType,
            actor: event.actor,
            actorName,
            oldValue: event.oldValue,
            newValue: event.newValue,
            createdAt: event.createdAt,
            summary,
          };
        })
      );

      const filteredEvents = enrichedEvents.filter(Boolean);

      return c.json({ events: filteredEvents, hasMore, total: filteredEvents.length });
    } catch (error) {
      logger.error('Failed to list events:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/events/stream
  app.get('/api/events/stream', async (c) => {
    const url = new URL(c.req.url);
    const category = url.searchParams.get('category');

    return streamSSE(c, async (stream) => {
      let eventId = 0;

      await stream.writeSSE({
        id: String(++eventId),
        event: 'connected',
        data: JSON.stringify({ timestamp: createTimestamp(), category: category || 'all' }),
      });

      const sessionCleanups: (() => void)[] = [];
      // Track which sessions we've already subscribed to (avoid duplicate listeners)
      const subscribedSessions = new Set<string>();

      /**
       * Subscribe to a session's events and forward them to the SSE stream.
       * Used both for sessions that exist at connection time and for new sessions
       * that start while the SSE connection is open.
       */
      const subscribeToSession = (
        sessionId: string,
        agentId: EntityId | string,
        agentRole: string,
        sessionEvents: import('events').EventEmitter
      ) => {
        if (subscribedSessions.has(sessionId)) return;
        subscribedSessions.add(sessionId);

        const onEvent = async (event: SpawnedSessionEvent) => {
          if (category === 'agents' || category === 'sessions' || category === 'all') {
            try {
              await stream.writeSSE({
                id: String(++eventId),
                event: 'session_event',
                data: JSON.stringify({
                  type: event.type,
                  sessionId,
                  agentId,
                  agentRole,
                  content: event.message,
                  timestamp: createTimestamp(),
                  // Include tool info for tool events so UI can display activity
                  ...(event.tool && { tool: event.tool.name }),
                }),
              });
            } catch {
              // Stream closed — cleanup will happen via onAbort
            }
          }
        };
        sessionCleanups.push(trackListeners(sessionEvents, { 'event': onEvent }));
      };

      // Subscribe to all currently running sessions
      const sessions = sessionManager.listSessions({ status: ['starting', 'running'] });

      for (const session of sessions) {
        const events = spawnerService.getEventEmitter(session.id);
        if (events) {
          subscribeToSession(session.id, session.agentId, session.agentRole, events);
        }
      }

      // Listen for new sessions that start while this SSE connection is open
      const onNewSession = (info: NewSessionInfo) => {
        subscribeToSession(info.sessionId, info.agentId, info.agentRole, info.events);
      };
      sseSessionBus.on('new-session', onNewSession);

      // Forward daemon warnings/errors to SSE clients as toast notifications
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let onDaemonNotification: ((data: any) => void) | undefined;
      if (dispatchDaemon) {
        onDaemonNotification = async (data: { type: string; title: string; message?: string }) => {
          try {
            await stream.writeSSE({
              id: String(++eventId),
              event: 'notification',
              data: JSON.stringify(data),
            });
          } catch {
            // Stream closed
          }
        };
        dispatchDaemon.on('daemon:notification', onDaemonNotification);
      }

      const heartbeatInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            id: String(++eventId),
            event: 'heartbeat',
            data: JSON.stringify({ timestamp: createTimestamp() }),
          });
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      stream.onAbort(() => {
        clearInterval(heartbeatInterval);
        sseSessionBus.off('new-session', onNewSession);
        for (const cleanup of sessionCleanups) {
          cleanup();
        }
        if (dispatchDaemon && onDaemonNotification) {
          dispatchDaemon.off('daemon:notification', onDaemonNotification);
        }
      });

      await new Promise(() => {});
    });
  });

  // GET /api/events/:id
  app.get('/api/events/:id', async (c) => {
    try {
      const eventId = parseInt(c.req.param('id'), 10);
      if (isNaN(eventId) || eventId < 1) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'Invalid event ID' } }, 400);
      }

      const events = await api.listEvents({ limit: 1 });
      const event = events.find((e) => e.id === eventId);

      if (!event) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
      }

      let elementType: string | undefined;
      let elementTitle: string | undefined;
      let actorName: string | undefined;

      try {
        const element = await api.get(event.elementId);
        if (element) {
          elementType = element.type;
          if ('title' in element) {
            elementTitle = element.title as string;
          } else if ('name' in element) {
            elementTitle = element.name as string;
          }
        }
      } catch {
        // Element deleted
      }

      try {
        const actorEntity = await api.get(event.actor as unknown as ElementId);
        if (actorEntity && 'name' in actorEntity) {
          actorName = actorEntity.name as string;
        }
      } catch {
        // System entity
      }

      const summary = generateActivitySummary(event, elementType, elementTitle);

      return c.json({
        event: {
          id: event.id,
          elementId: event.elementId,
          elementType,
          elementTitle,
          eventType: event.eventType,
          actor: event.actor,
          actorName,
          oldValue: event.oldValue,
          newValue: event.newValue,
          createdAt: event.createdAt,
          summary,
        },
      });
    } catch (error) {
      logger.error('Failed to get event:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
