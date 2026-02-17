/**
 * Server Startup
 *
 * Cross-runtime server initialization for Bun and Node.js.
 */

import type { Hono } from 'hono';
import { createLogger } from '@stoneforge/smithy';
import { PORT, HOST } from './config.js';
import type { Services } from './services.js';
import type { ServerWebSocket, WSClientData } from './types.js';
import { handleWSOpen, handleWSMessage, handleWSClose } from './websocket.js';
import type { LspWSClientData } from './lsp-websocket.js';
import { handleLspWSOpen, handleLspWSMessage, handleLspWSClose } from './lsp-websocket.js';
import type { EventsWSClientData } from './events-websocket.js';
import { handleEventsWSOpen, handleEventsWSMessage, handleEventsWSClose } from './events-websocket.js';
import type { LspManager } from './services/lsp-manager.js';

const logger = createLogger('orchestrator');

const isBun = typeof globalThis.Bun !== 'undefined';

/**
 * Union of all possible WebSocket data types.
 * Bun uses a single websocket handler for all paths, so we discriminate via wsType.
 */
type AnyWSData = WSClientData | EventsWSClientData | (LspWSClientData & { wsType?: 'lsp' });

export function startServer(app: Hono, services: Services, lspManager?: LspManager): void {
  if (isBun) {
    startBunServer(app, services, lspManager);
  } else {
    startNodeServer(app, services, lspManager);
  }
}

function startBunServer(app: Hono, services: Services, lspManager?: LspManager): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Bun = (globalThis as any).Bun;
  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: app.fetch,
    websocket: {
      open(ws: ServerWebSocket<AnyWSData>) {
        const data = ws.data;
        if (data.wsType === 'events') {
          handleEventsWSOpen(ws as ServerWebSocket<EventsWSClientData>);
        } else if (data.wsType === 'lsp') {
          // LSP open is handled after upgrade with language param
        } else {
          handleWSOpen(ws as ServerWebSocket<WSClientData>);
        }
      },
      message(ws: ServerWebSocket<AnyWSData>, message: string | Buffer) {
        const data = ws.data;
        if (data.wsType === 'events') {
          handleEventsWSMessage(ws as ServerWebSocket<EventsWSClientData>, message);
        } else if (data.wsType === 'lsp') {
          handleLspWSMessage(ws as ServerWebSocket<LspWSClientData>, message);
        } else {
          handleWSMessage(ws as ServerWebSocket<WSClientData>, message, services);
        }
      },
      close(ws: ServerWebSocket<AnyWSData>) {
        const data = ws.data;
        if (data.wsType === 'events') {
          handleEventsWSClose(ws as ServerWebSocket<EventsWSClientData>);
        } else if (data.wsType === 'lsp') {
          handleLspWSClose(ws as ServerWebSocket<LspWSClientData>);
        } else {
          handleWSClose(ws as ServerWebSocket<WSClientData>);
        }
      },
    },
  });

  // Terminal WebSocket endpoint
  app.get('/ws', (c) => {
    const upgraded = server.upgrade(c.req.raw, { data: { id: '', wsType: 'terminal' } });
    return upgraded ? new Response(null, { status: 101 }) : c.json({ error: 'WebSocket upgrade failed' }, 400);
  });

  // Event-subscription WebSocket endpoint
  app.get('/ws/events', (c) => {
    const upgraded = server.upgrade(c.req.raw, { data: { id: '', wsType: 'events' } });
    return upgraded ? new Response(null, { status: 101 }) : c.json({ error: 'WebSocket upgrade failed' }, 400);
  });

  // LSP WebSocket endpoint
  app.get('/ws/lsp', (c) => {
    const language = c.req.query('language');
    if (!language) {
      return c.json({ error: 'Language query parameter is required' }, 400);
    }
    if (!lspManager) {
      return c.json({ error: 'LSP manager not available' }, 503);
    }
    const upgraded = server.upgrade(c.req.raw, { data: { id: '', language, wsType: 'lsp', isLsp: true } });
    return upgraded ? new Response(null, { status: 101 }) : c.json({ error: 'WebSocket upgrade failed' }, 400);
  });

  logger.info(`Server running at http://${HOST}:${PORT} (Bun)`);
  logger.info(`WebSocket available at ws://${HOST}:${PORT}/ws`);
  logger.info(`Events WebSocket available at ws://${HOST}:${PORT}/ws/events`);
  if (lspManager) {
    logger.info(`LSP WebSocket available at ws://${HOST}:${PORT}/ws/lsp?language=<lang>`);
  }
}

function startNodeServer(app: Hono, services: Services, lspManager?: LspManager): void {
  import('ws').then(({ WebSocketServer }) => {
    import('http').then(({ createServer }) => {
      import('url').then(({ parse: parseUrl }) => {
        const httpServer = createServer(async (req, res) => {
          const url = `http://${HOST}:${PORT}${req.url}`;
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }

          let body: string | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            body = Buffer.concat(chunks).toString();
          }

          const request = new Request(url, { method: req.method, headers, body });
          const response = await app.fetch(request);

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));

          if (response.body) {
            const reader = response.body.getReader();
            const pump = async (): Promise<void> => {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  res.end();
                  return;
                }
                res.write(value);
                return pump();
              } catch {
                res.end();
              }
            };
            await pump();
          } else {
            res.end(await response.text());
          }
        });

        // Main WebSocket server for agent terminal connections
        const wss = new WebSocketServer({ noServer: true });

        wss.on('connection', (ws) => {
          const wsData: WSClientData = {
            id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          };

          const WS_OPEN = 1;
          const wsAdapter: ServerWebSocket<WSClientData> = {
            data: wsData,
            send: (data: string | ArrayBuffer) => {
              if (ws.readyState === WS_OPEN) {
                ws.send(typeof data === 'string' ? data : Buffer.from(data));
              }
            },
            close: () => ws.close(),
            readyState: ws.readyState,
          };

          handleWSOpen(wsAdapter);
          ws.on('message', (msg) => {
            (wsAdapter as { readyState: number }).readyState = ws.readyState;
            handleWSMessage(wsAdapter, msg.toString(), services);
          });
          ws.on('close', () => handleWSClose(wsAdapter));
        });

        // Event-subscription WebSocket server
        const eventsWss = new WebSocketServer({ noServer: true });

        eventsWss.on('connection', (ws) => {
          const WS_OPEN = 1;
          const wsAdapter: ServerWebSocket<EventsWSClientData> = {
            data: {
              id: '',
              wsType: 'events',
              subscriptions: new Set(),
              eventListener: () => {},
            },
            send: (data: string | ArrayBuffer) => {
              if (ws.readyState === WS_OPEN) {
                ws.send(typeof data === 'string' ? data : Buffer.from(data));
              }
            },
            close: () => ws.close(),
            readyState: ws.readyState,
          };

          handleEventsWSOpen(wsAdapter);
          ws.on('message', (msg) => {
            (wsAdapter as { readyState: number }).readyState = ws.readyState;
            handleEventsWSMessage(wsAdapter, msg.toString());
          });
          ws.on('close', () => handleEventsWSClose(wsAdapter));
        });

        // LSP WebSocket server for language server connections
        const lspWss = new WebSocketServer({ noServer: true });

        lspWss.on('connection', (ws, req) => {
          const parsedUrl = parseUrl(req.url || '', true);
          const language = parsedUrl.query.language as string | undefined;

          if (!language) {
            ws.close(1002, 'Language query parameter is required');
            return;
          }

          if (!lspManager) {
            ws.close(1002, 'LSP manager not available');
            return;
          }

          const WS_OPEN = 1;
          const wsAdapter: ServerWebSocket<LspWSClientData> = {
            data: { id: '', language },
            send: (data: string | ArrayBuffer) => {
              if (ws.readyState === WS_OPEN) {
                ws.send(typeof data === 'string' ? data : Buffer.from(data));
              }
            },
            close: () => ws.close(),
            readyState: ws.readyState,
          };

          handleLspWSOpen(wsAdapter, language, lspManager);
          ws.on('message', (msg) => {
            (wsAdapter as { readyState: number }).readyState = ws.readyState;
            handleLspWSMessage(wsAdapter, msg.toString());
          });
          ws.on('close', () => handleLspWSClose(wsAdapter));
        });

        // Handle upgrade requests to route to appropriate WebSocket server
        httpServer.on('upgrade', (req, socket, head) => {
          const pathname = parseUrl(req.url || '').pathname;

          if (pathname === '/ws/events') {
            eventsWss.handleUpgrade(req, socket, head, (ws) => {
              eventsWss.emit('connection', ws, req);
            });
          } else if (pathname === '/ws/lsp') {
            lspWss.handleUpgrade(req, socket, head, (ws) => {
              lspWss.emit('connection', ws, req);
            });
          } else if (pathname === '/ws') {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit('connection', ws, req);
            });
          } else {
            socket.destroy();
          }
        });

        httpServer.listen(PORT, HOST, () => {
          logger.info(`Server running at http://${HOST}:${PORT} (Node.js)`);
          logger.info(`WebSocket available at ws://${HOST}:${PORT}/ws`);
          logger.info(`Events WebSocket available at ws://${HOST}:${PORT}/ws/events`);
          if (lspManager) {
            logger.info(`LSP WebSocket available at ws://${HOST}:${PORT}/ws/lsp?language=<lang>`);
          }
        });
      });
    });
  });
}
