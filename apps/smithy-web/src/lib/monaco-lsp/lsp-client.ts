/**
 * LSP Client Module
 *
 * Manages WebSocket connections to language servers running on the orchestrator server.
 * Uses a lightweight LSP client (vscode-ws-jsonrpc + vscode-jsonrpc) that works with
 * vanilla monaco-editor without requiring @codingame/monaco-vscode-api.
 */

import { LightweightLspClient } from './lightweight-client';

/**
 * LSP server status from the API
 */
export interface LspServerStatus {
  id: string;
  name: string;
  languages: string[];
  available: boolean;
  running: boolean;
}

/**
 * LSP status response from the API
 */
export interface LspStatusResponse {
  servers: LspServerStatus[];
  workspaceRoot: string;
}

/**
 * Active language client connection
 */
interface ActiveClient {
  client: LightweightLspClient;
  socket: WebSocket;
  language: string;
}

/**
 * Cached LSP status
 */
let cachedStatus: LspStatusResponse | null = null;
let statusFetchPromise: Promise<LspStatusResponse> | null = null;

/**
 * Map of active language clients by language ID
 */
const activeClients = new Map<string, ActiveClient>();

/**
 * Connection state change callback type
 */
export type ConnectionStateChangeCallback = (
  language: string,
  state: 'connected' | 'disconnected'
) => void;

/**
 * Set of listeners for connection state changes
 */
const connectionStateListeners = new Set<ConnectionStateChangeCallback>();

/**
 * Subscribe to connection state changes
 * Returns an unsubscribe function
 */
export function subscribeToConnectionState(
  callback: ConnectionStateChangeCallback
): () => void {
  connectionStateListeners.add(callback);
  return () => {
    connectionStateListeners.delete(callback);
  };
}

/**
 * Notify all listeners of a connection state change
 */
function notifyConnectionStateChange(
  language: string,
  state: 'connected' | 'disconnected'
): void {
  connectionStateListeners.forEach((callback) => {
    try {
      callback(language, state);
    } catch (err) {
      console.error('[lsp-client] Error in connection state callback:', err);
    }
  });
}

/**
 * Fetch LSP status from the server
 */
export async function fetchLspStatus(forceRefresh = false): Promise<LspStatusResponse> {
  if (cachedStatus && !forceRefresh) {
    return cachedStatus;
  }

  if (statusFetchPromise && !forceRefresh) {
    return statusFetchPromise;
  }

  statusFetchPromise = fetch('/api/lsp/status')
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch LSP status: ${res.statusText}`);
      }
      return res.json();
    })
    .then((data) => {
      cachedStatus = data;
      statusFetchPromise = null;
      return data;
    })
    .catch((err) => {
      statusFetchPromise = null;
      throw err;
    });

  return statusFetchPromise;
}

/**
 * Check if a language has LSP support available
 */
export async function isLspAvailableForLanguage(languageId: string): Promise<boolean> {
  try {
    const status = await fetchLspStatus();
    const server = status.servers.find((s) => s.languages.includes(languageId));
    return server?.available ?? false;
  } catch {
    return false;
  }
}

/**
 * Get the WebSocket URL for LSP connections
 */
function getLspWebSocketUrl(language: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/lsp?language=${encodeURIComponent(language)}`;
}

/**
 * Connect to a language server for a specific language
 */
export async function connectLsp(
  language: string,
  monacoInstance?: typeof import('monaco-editor'),
  _documentUri?: string
): Promise<LightweightLspClient | null> {
  // Check if already connected
  if (activeClients.has(language)) {
    const existing = activeClients.get(language)!;
    if (existing.socket.readyState === WebSocket.OPEN && existing.client.isConnected) {
      console.log(`[lsp-client] Already connected to ${language} server`);
      return existing.client;
    }
    // Clean up stale connection
    await disconnectLsp(language);
  }

  if (!monacoInstance) {
    console.log(`[lsp-client] Monaco instance required for ${language} LSP connection`);
    return null;
  }

  // Fetch status to check availability and get workspace root
  const status = await fetchLspStatus();
  const server = status.servers.find((s) => s.languages.includes(language));
  if (!server?.available) {
    console.log(`[lsp-client] No LSP server available for ${language}`);
    return null;
  }

  const workspaceRoot = status.workspaceRoot;
  console.log(`[lsp-client] Connecting to ${language} language server...`);

  return new Promise((resolve, reject) => {
    const url = getLspWebSocketUrl(language);
    const socket = new WebSocket(url);

    socket.onopen = async () => {
      console.log(`[lsp-client] WebSocket connected for ${language}`);

      try {
        const client = new LightweightLspClient({
          language,
          workspaceRoot,
        });

        await client.start(socket, monacoInstance);

        activeClients.set(language, { client, socket, language });

        // Notify listeners of successful connection
        notifyConnectionStateChange(language, 'connected');

        console.log(`[lsp-client] Language client started for ${language}`);
        resolve(client);
      } catch (error) {
        console.error(`[lsp-client] Error creating language client:`, error);
        socket.close();
        reject(error);
      }
    };

    socket.onerror = (error) => {
      console.error(`[lsp-client] WebSocket error for ${language}:`, error);
      reject(new Error(`WebSocket connection failed for ${language}`));
    };

    socket.onclose = (event) => {
      console.log(
        `[lsp-client] WebSocket closed for ${language}: code=${event.code}, reason=${event.reason}`
      );
      activeClients.delete(language);
      // Notify listeners of disconnection
      notifyConnectionStateChange(language, 'disconnected');
    };
  });
}

/**
 * Disconnect from a language server
 */
export async function disconnectLsp(language: string): Promise<void> {
  const active = activeClients.get(language);
  if (!active) {
    return;
  }

  console.log(`[lsp-client] Disconnecting from ${language} server...`);

  try {
    await active.client.stop();
  } catch (error) {
    console.warn(`[lsp-client] Error stopping client for ${language}:`, error);
  }

  activeClients.delete(language);
}

/**
 * Disconnect from all language servers
 */
export async function disconnectAllLsp(): Promise<void> {
  const languages = Array.from(activeClients.keys());
  await Promise.all(languages.map((lang) => disconnectLsp(lang)));
}

/**
 * Get the current connection state for a language
 */
export function getLspConnectionState(language: string): 'connected' | 'disconnected' {
  const active = activeClients.get(language);
  if (!active) {
    return 'disconnected';
  }
  return active.socket.readyState === WebSocket.OPEN && active.client.isConnected
    ? 'connected'
    : 'disconnected';
}

/**
 * Get all connected languages
 */
export function getConnectedLanguages(): string[] {
  return Array.from(activeClients.keys()).filter(
    (lang) => getLspConnectionState(lang) === 'connected'
  );
}

/**
 * Get the active client for a language (for document sync)
 */
export function getActiveClient(language: string): LightweightLspClient | null {
  const active = activeClients.get(language);
  return active?.client ?? null;
}

/**
 * Clear the cached LSP status
 */
export function clearLspStatusCache(): void {
  cachedStatus = null;
}
