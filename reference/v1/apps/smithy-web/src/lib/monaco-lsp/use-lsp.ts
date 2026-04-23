/**
 * React Hook for LSP Management
 *
 * Provides a React hook for managing LSP connections in Monaco editor components.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchLspStatus,
  isLspAvailableForLanguage,
  connectLsp,
  disconnectLsp,
  getLspConnectionState,
  subscribeToConnectionState,
  type LspStatusResponse,
} from './lsp-client';
import { isPotentialLspLanguage } from './languages';
import type * as monaco from 'monaco-editor';

/**
 * LSP connection state
 */
export type LspState = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error';

/**
 * Hook options
 */
interface UseLspOptions {
  /** Monaco instance */
  monaco?: typeof monaco;
  /** Language ID */
  language: string;
  /** Document URI for workspace configuration */
  documentUri?: string;
  /** Whether to auto-connect when available */
  autoConnect?: boolean;
}

/**
 * Hook return value
 */
interface UseLspResult {
  /** Current connection state */
  state: LspState;
  /** Whether the language server is available */
  available: boolean;
  /** Error message if state is 'error' */
  error: string | null;
  /** Connect to the language server */
  connect: () => Promise<void>;
  /** Disconnect from the language server */
  disconnect: () => Promise<void>;
  /** Full LSP status from server */
  status: LspStatusResponse | null;
  /** Refresh status from server */
  refreshStatus: () => Promise<void>;
}

/**
 * React hook for managing LSP connections
 */
export function useLsp({
  monaco: monacoInstance,
  language,
  documentUri,
  autoConnect = true,
}: UseLspOptions): UseLspResult {
  const [state, setState] = useState<LspState>('idle');
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LspStatusResponse | null>(null);
  const mountedRef = useRef(true);

  // Refresh status from server
  const refreshStatus = useCallback(async () => {
    try {
      const newStatus = await fetchLspStatus(true);
      if (mountedRef.current) {
        setStatus(newStatus);
      }
    } catch (err) {
      console.error('[useLsp] Error fetching status:', err);
    }
  }, []);

  // Check availability when language changes
  useEffect(() => {
    if (!isPotentialLspLanguage(language)) {
      setAvailable(false);
      setState('unavailable');
      return;
    }

    let cancelled = false;

    isLspAvailableForLanguage(language).then((isAvailable) => {
      if (cancelled || !mountedRef.current) return;
      setAvailable(isAvailable);
      if (!isAvailable) {
        setState('unavailable');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  // Connect function
  const connect = useCallback(async () => {
    if (!monacoInstance) {
      setError('Monaco instance not available');
      setState('error');
      return;
    }

    if (!isPotentialLspLanguage(language)) {
      setState('unavailable');
      return;
    }

    const isAvailable = await isLspAvailableForLanguage(language);
    if (!isAvailable) {
      setState('unavailable');
      return;
    }

    setState('connecting');
    setError(null);

    try {
      const client = await connectLsp(language, monacoInstance, documentUri);
      if (mountedRef.current) {
        if (client) {
          setState('connected');
        } else {
          setState('unavailable');
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setState('error');
      }
    }
  }, [monacoInstance, language, documentUri]);

  // Disconnect function
  const disconnect = useCallback(async () => {
    await disconnectLsp(language);
    if (mountedRef.current) {
      setState('idle');
      setError(null);
    }
  }, [language]);

  // Auto-connect when available
  useEffect(() => {
    if (!autoConnect || !monacoInstance || !available || state !== 'idle') {
      return;
    }

    // Check if already connected
    if (getLspConnectionState(language) === 'connected') {
      setState('connected');
      return;
    }

    connect();
  }, [autoConnect, monacoInstance, available, state, language, connect]);

  // Fetch initial status
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Part C: Subscribe to connection state changes for disconnect detection
  // This ensures the hook is notified when WebSocket closes unexpectedly
  useEffect(() => {
    const unsubscribe = subscribeToConnectionState((changedLanguage, connectionState) => {
      if (changedLanguage !== language || !mountedRef.current) return;

      if (connectionState === 'connected' && state !== 'connected' && state !== 'connecting') {
        setState('connected');
      } else if (connectionState === 'disconnected' && state === 'connected') {
        // LSP disconnected - revert to idle so built-in features can be re-enabled
        setState('idle');
        console.log(`[useLsp] LSP disconnected for ${language}, reverting to idle state`);
      }
    });

    return unsubscribe;
  }, [language, state]);

  // Initial sync of state with actual connection state
  useEffect(() => {
    const connectionState = getLspConnectionState(language);
    if (connectionState === 'connected' && state !== 'connected' && state !== 'connecting') {
      setState('connected');
    } else if (connectionState === 'disconnected' && state === 'connected') {
      setState('idle');
    }
  }, [language, state]);

  return {
    state,
    available,
    error,
    connect,
    disconnect,
    status,
    refreshStatus,
  };
}
