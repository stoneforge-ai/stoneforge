/**
 * LSP WebSocket Handler
 *
 * Bridges WebSocket connections to Language Server Protocol (LSP) processes.
 * Handles message formatting and bidirectional communication.
 */

import type { ChildProcess } from 'node:child_process';
import { createLogger } from '@stoneforge/smithy';
import type { LspManager } from './services/lsp-manager.js';
import type { ServerWebSocket } from './types.js';

const logger = createLogger('lsp-ws');

/**
 * LSP-specific WebSocket client data
 */
export interface LspWSClientData {
  id: string;
  language: string;
  serverId?: string;
}

/**
 * Parse the Content-Length header from LSP message buffer
 */
function parseContentLength(buffer: Buffer): number | null {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;

  const header = buffer.subarray(0, headerEnd).toString('utf-8');
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) return null;

  return parseInt(match[1], 10);
}

/**
 * Create an LSP message with Content-Length header
 */
function createLspMessage(content: string): string {
  const bytes = Buffer.byteLength(content, 'utf-8');
  return `Content-Length: ${bytes}\r\n\r\n${content}`;
}

/**
 * Map of active LSP WebSocket connections
 */
const lspClients = new Map<string, {
  ws: ServerWebSocket<LspWSClientData>;
  process: ChildProcess | null;
  buffer: Buffer;
  cleanup?: () => void;
}>();

/**
 * Generate a unique client ID
 */
function generateClientId(): string {
  return `lsp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Handle WebSocket open for LSP connections
 */
export function handleLspWSOpen(
  ws: ServerWebSocket<LspWSClientData>,
  language: string,
  lspManager: LspManager
): void {
  const clientId = generateClientId();
  ws.data = { id: clientId, language };

  lspClients.set(clientId, {
    ws,
    process: null,
    buffer: Buffer.alloc(0),
  });

  logger.debug(`Client ${clientId} connected for language: ${language}`);

  // Start the language server for this language
  lspManager.startServer(language).then((process) => {
    const client = lspClients.get(clientId);
    if (!client) {
      // Client disconnected before server started
      return;
    }

    if (!process) {
      logger.warn(`No server available for language: ${language}`);
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: `No language server available for ${language}`,
        },
      }));
      return;
    }

    client.process = process;
    ws.data.serverId = lspManager.getServerIdForLanguage(language);

    // Handle stdout from language server (LSP responses)
    const onData = (data: Buffer) => {
      const currentClient = lspClients.get(clientId);
      if (!currentClient) return;

      // Append to buffer
      currentClient.buffer = Buffer.concat([currentClient.buffer, data]);

      // Process complete messages
      while (true) {
        const contentLength = parseContentLength(currentClient.buffer);
        if (contentLength === null) break;

        const headerEnd = currentClient.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const messageStart = headerEnd + 4;
        const messageEnd = messageStart + contentLength;

        if (currentClient.buffer.length < messageEnd) {
          // Not enough data yet
          break;
        }

        // Extract the message
        const messageContent = currentClient.buffer.subarray(messageStart, messageEnd).toString('utf-8');

        // Send to WebSocket client (without Content-Length header)
        if (ws.readyState === 1) { // OPEN
          ws.send(messageContent);
        }

        // Remove processed message from buffer
        currentClient.buffer = currentClient.buffer.subarray(messageEnd);
      }
    };

    process.stdout?.on('data', onData);

    // Store cleanup function
    client.cleanup = () => {
      process.stdout?.off('data', onData);
    };

    logger.debug(`Server connected for client ${clientId}`);
  }).catch((error) => {
    logger.error(`Error starting server for ${language}:`, error);
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: `Failed to start language server: ${error instanceof Error ? error.message : String(error)}`,
      },
    }));
  });
}

/**
 * Handle WebSocket message for LSP connections
 */
export function handleLspWSMessage(
  ws: ServerWebSocket<LspWSClientData>,
  message: string | Buffer
): void {
  const client = lspClients.get(ws.data.id);
  if (!client) {
    logger.error(`Unknown client: ${ws.data.id}`);
    return;
  }

  if (!client.process || !client.process.stdin) {
    // Server not ready yet, queue the message or send error
    logger.debug(`Server not ready for client ${ws.data.id}, message queued`);
    return;
  }

  try {
    // Message from WebSocket is JSON, wrap it with Content-Length header for LSP
    const content = typeof message === 'string' ? message : message.toString('utf-8');
    const lspMessage = createLspMessage(content);

    client.process.stdin.write(lspMessage);
  } catch (error) {
    logger.error(`Error forwarding message:`, error);
  }
}

/**
 * Handle WebSocket close for LSP connections
 */
export function handleLspWSClose(ws: ServerWebSocket<LspWSClientData>): void {
  const client = lspClients.get(ws.data.id);
  if (client) {
    if (client.cleanup) {
      client.cleanup();
    }
    // Note: We don't kill the language server process here because it can serve multiple clients
    lspClients.delete(ws.data.id);
  }
  logger.debug(`Client disconnected: ${ws.data.id}`);
}

/**
 * Get the number of active LSP WebSocket connections
 */
export function getLspClientCount(): number {
  return lspClients.size;
}
