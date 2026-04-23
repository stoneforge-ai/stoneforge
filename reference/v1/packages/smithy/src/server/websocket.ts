/**
 * WebSocket Handler
 *
 * WebSocket connection management for interactive terminals.
 */

import type { EntityId } from '@stoneforge/core';
import type { SpawnedSessionEvent } from '../index.js';
import { trackListeners } from '../index.js';
import { createLogger } from '../utils/logger.js';
import type { Services } from './services.js';
import type { ServerWebSocket, WSClientData } from './types.js';

const logger = createLogger('orchestrator:ws');

interface WSClient {
  ws: ServerWebSocket<WSClientData>;
  cleanup?: () => void;
}

const wsClients = new Map<string, WSClient>();

function generateClientId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function notifyClientsOfNewSession(
  agentId: EntityId,
  session: { id: string; mode: 'headless' | 'interactive' },
  events: import('events').EventEmitter
): void {
  for (const [clientId, client] of wsClients) {
    if (client.ws.data.agentId === agentId) {
      client.ws.data.sessionId = session.id;
      client.ws.data.isInteractive = session.mode === 'interactive';

      if (client.cleanup) {
        client.cleanup();
      }

      const onEvent = (event: SpawnedSessionEvent) => {
        client.ws.send(JSON.stringify({ type: 'event', event }));
      };

      const onPtyData = (ptyData: string) => {
        client.ws.send(JSON.stringify({ type: 'pty-data', data: ptyData }));
      };

      const onError = (error: Error) => {
        client.ws.send(JSON.stringify({ type: 'error', error: error.message }));
      };

      const onExit = (code: number | null, signal: string | number | null) => {
        client.ws.send(JSON.stringify({ type: 'exit', code, signal }));
        client.ws.data.sessionId = undefined;
        client.ws.data.isInteractive = undefined;
      };

      client.cleanup = trackListeners(events, {
        'event': onEvent,
        'pty-data': onPtyData,
        'error': onError,
        'exit': onExit,
      });

      client.ws.send(
        JSON.stringify({
          type: 'session-started',
          agentId,
          sessionId: session.id,
          isInteractive: session.mode === 'interactive',
        })
      );

      logger.debug(`Notified client ${clientId} of new session for agent ${agentId}`);
    }
  }
}

export function handleWSOpen(ws: ServerWebSocket<WSClientData>): void {
  const clientId = generateClientId();
  ws.data = { id: clientId };
  wsClients.set(clientId, { ws });
  logger.debug(`Client connected: ${clientId}`);
}

export function handleWSMessage(
  ws: ServerWebSocket<WSClientData>,
  message: string | Buffer,
  services: Services
): void {
  const { sessionManager, spawnerService } = services;

  try {
    const data = JSON.parse(message.toString()) as {
      type: string;
      agentId?: string;
      input?: string;
      cols?: number;
      rows?: number;
    };

    switch (data.type) {
      case 'subscribe': {
        if (data.agentId) {
          ws.data.agentId = data.agentId as EntityId;

          const client = wsClients.get(ws.data.id);
          if (client?.cleanup) {
            client.cleanup();
            client.cleanup = undefined;
          }

          const activeSession = sessionManager.getActiveSession(data.agentId as EntityId);
          if (activeSession) {
            ws.data.sessionId = activeSession.id;
            ws.data.isInteractive = activeSession.mode === 'interactive';

            const events = spawnerService.getEventEmitter(activeSession.id);
            if (events) {
              const onEvent = (event: SpawnedSessionEvent) => {
                ws.send(JSON.stringify({ type: 'event', event }));
              };

              const onPtyData = (ptyData: string) => {
                ws.send(JSON.stringify({ type: 'pty-data', data: ptyData }));
              };

              const onError = (error: Error) => {
                ws.send(JSON.stringify({ type: 'error', error: error.message }));
              };

              const onExit = (code: number | null, signal: string | number | null) => {
                ws.send(JSON.stringify({ type: 'exit', code, signal }));
              };

              wsClients.get(ws.data.id)!.cleanup = trackListeners(events, {
                'event': onEvent,
                'pty-data': onPtyData,
                'error': onError,
                'exit': onExit,
              });
            }
          }
          ws.send(
            JSON.stringify({
              type: 'subscribed',
              agentId: data.agentId,
              hasSession: !!activeSession,
              isInteractive: activeSession?.mode === 'interactive',
            })
          );
        }
        break;
      }

      case 'input': {
        if (ws.data.sessionId && data.input && !ws.data.isInteractive) {
          spawnerService.sendInput(ws.data.sessionId, data.input).catch((err) => {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          });
        } else if (ws.data.sessionId && data.input && ws.data.isInteractive) {
          spawnerService.writeToPty(ws.data.sessionId, data.input).catch((err) => {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          });
          sessionManager.recordUserInput(ws.data.sessionId);
        }
        break;
      }

      case 'resize': {
        if (ws.data.sessionId && ws.data.isInteractive && data.cols && data.rows) {
          spawnerService.resize(ws.data.sessionId, data.cols, data.rows).catch((err) => {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          });
        }
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }
    }
  } catch (err) {
    logger.error('Error handling message:', err);
  }
}

export function handleWSClose(ws: ServerWebSocket<WSClientData>): void {
  const client = wsClients.get(ws.data.id);
  if (client?.cleanup) {
    client.cleanup();
  }
  wsClients.delete(ws.data.id);
  logger.debug(`Client disconnected: ${ws.data.id}`);
}
