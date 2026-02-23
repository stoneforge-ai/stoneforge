/**
 * XTerminal - Interactive terminal component using xterm.js
 *
 * This component provides a full-featured terminal emulator for interactive
 * agent sessions. It connects via WebSocket to the orchestrator server
 * and supports PTY communication.
 */

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export type TerminalStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Methods exposed via ref */
export interface XTerminalHandle {
  /** Refresh the terminal by re-fitting to current dimensions */
  refresh: () => void;
  /** Write data to terminal */
  write: (data: string) => void;
  /** Write a line to terminal */
  writeln: (data: string) => void;
  /** Clear terminal */
  clear: () => void;
  /** Focus terminal */
  focus: () => void;
  /** Fit terminal to container */
  fit: () => void;
  /** Send input to the PTY terminal (as if user typed it) */
  sendInput: (data: string) => void;
  /** Get current terminal dimensions (cols/rows) */
  getDimensions: () => { cols: number; rows: number } | null;
}

export interface XTerminalProps {
  /** Agent ID to connect to */
  agentId?: string;
  /** WebSocket URL (defaults to orchestrator server) */
  wsUrl?: string;
  /** API URL for file uploads (defaults to orchestrator server) */
  apiUrl?: string;
  /** Called when terminal status changes */
  onStatusChange?: (status: TerminalStatus) => void;
  /** Called when terminal connects successfully */
  onConnected?: () => void;
  /** Called when terminal receives data */
  onData?: (data: string) => void;
  /** Theme variant */
  theme?: 'dark' | 'light';
  /** Font size in pixels */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Whether to auto-fit terminal to container */
  autoFit?: boolean;
  /** Whether terminal should be interactive (accept input) */
  interactive?: boolean;
  /** Whether to auto-focus the terminal on mount */
  autoFocus?: boolean;
  /** Whether this terminal controls PTY resize (default: true).
   * Set to false for secondary viewers to prevent resize conflicts. */
  controlsResize?: boolean;
  /** Whether to enable file drag and drop (default: true for interactive terminals) */
  enableFileDrop?: boolean;
  /** Test ID for testing */
  'data-testid'?: string;
}

// Theme configurations
const DARK_THEME = {
  background: '#1a1a1a',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  cursorAccent: '#1a1a1a',
  selectionBackground: '#404040',
  selectionForeground: '#ffffff',
  black: '#1a1a1a',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#6272a4',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#e0e0e0',
  brightBlack: '#555555',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
};

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

const DEFAULT_WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
const DEFAULT_API_URL = window.location.origin;

export const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(function XTerminal({
  agentId,
  wsUrl = DEFAULT_WS_URL,
  apiUrl = DEFAULT_API_URL,
  onStatusChange,
  onConnected,
  onData,
  theme = 'dark',
  fontSize = 13,
  fontFamily = '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
  autoFit = true,
  interactive = true,
  autoFocus = false,
  controlsResize = true,
  enableFileDrop,
  'data-testid': testId = 'xterminal',
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('disconnected');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  // Track session to avoid duplicate session-started messages
  const currentSessionRef = useRef<string | null>(null);
  // Track if we've shown initial connection message to avoid duplicates on reconnect
  const hasShownConnectionRef = useRef(false);
  // Track last sent dimensions to avoid duplicate resize messages
  const lastSentDimsRef = useRef<{ cols: number; rows: number } | null>(null);
  // Track if we're intentionally closing to prevent reconnection attempts
  const isIntentionalCloseRef = useRef(false);
  // Enable file drop by default for interactive terminals
  const fileDropEnabled = enableFileDrop ?? interactive;

  // Store callbacks in refs to avoid recreating dependent callbacks
  // This prevents WebSocket reconnection loops when parent passes inline functions
  const onStatusChangeRef = useRef(onStatusChange);
  const onConnectedRef = useRef(onConnected);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onConnectedRef.current = onConnected;
  }, [onStatusChange, onConnected]);

  // Update status and notify callback
  const updateStatus = useCallback((newStatus: TerminalStatus) => {
    setStatus(newStatus);
    onStatusChangeRef.current?.(newStatus);
  }, []);

  // Send data to WebSocket
  const sendToServer = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', input: data }));
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      fontSize,
      fontFamily,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
      convertEol: true,
      disableStdin: !interactive,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);

    if (autoFit) {
      fitAddon.fit();
    }

    // Handle user input
    if (interactive) {
      terminal.onData((data) => {
        sendToServer(data);
        onData?.(data);
      });
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Auto-focus if requested
    if (autoFocus && interactive) {
      // Delay focus slightly to ensure terminal is fully rendered
      setTimeout(() => terminal.focus(), 100);
    }

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [theme, fontSize, fontFamily, autoFit, interactive, autoFocus, sendToServer, onData]);

  // Handle resize
  useEffect(() => {
    if (!autoFit || !containerRef.current || !fitAddonRef.current) return;

    // Debounce timer for PTY resize messages
    let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const sendResizeToServer = () => {
      if (controlsResize && wsRef.current?.readyState === WebSocket.OPEN && fitAddonRef.current) {
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          // Skip if dimensions haven't changed
          const last = lastSentDimsRef.current;
          if (last && last.cols === dims.cols && last.rows === dims.rows) {
            return;
          }
          lastSentDimsRef.current = { cols: dims.cols, rows: dims.rows };
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      }
    };

    const handleResize = () => {
      try {
        // Always fit the terminal visually (this is fast and doesn't cause issues)
        fitAddonRef.current?.fit();

        // Debounce sending resize to PTY server to avoid rapid redraws
        if (resizeDebounceTimer) {
          clearTimeout(resizeDebounceTimer);
        }
        resizeDebounceTimer = setTimeout(sendResizeToServer, 150);
      } catch {
        // Ignore resize errors (can happen during unmount)
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer);
      }
    };
  }, [autoFit, controlsResize]);

  // WebSocket connection
  useEffect(() => {
    if (!agentId) {
      updateStatus('disconnected');
      return;
    }

    // Reset tracking refs when agentId changes
    hasShownConnectionRef.current = false;
    currentSessionRef.current = null;
    lastSentDimsRef.current = null;
    isIntentionalCloseRef.current = false;

    // Use a local variable to track if this effect instance has been cleaned up.
    // This is captured by closures (connect, onclose handlers) and will be
    // set to true when cleanup runs, preventing stale closures from reconnecting.
    let isCleanedUp = false;


    const connect = () => {
      updateStatus('connecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        // Subscribe to agent events
        ws.send(JSON.stringify({ type: 'subscribe', agentId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type: string;
            event?: { type: string; data?: unknown; content?: string; output?: string };
            data?: string; // For pty-data messages
            hasSession?: boolean;
            isInteractive?: boolean;
            sessionId?: string;
            error?: string;
          };

          switch (data.type) {
            case 'subscribed':
              updateStatus('connected');
              onConnectedRef.current?.();
              hasShownConnectionRef.current = true;
              // Send initial resize for existing sessions (only if this terminal controls resize)
              // IMPORTANT: Force send (skip deduplication) since PTY may have stale dimensions from before page refresh
              if (controlsResize && data.hasSession && fitAddonRef.current && terminalRef.current) {
                const dims = fitAddonRef.current.proposeDimensions();
                if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
                  lastSentDimsRef.current = { cols: dims.cols, rows: dims.rows };
                  wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                }
              }
              break;

            case 'pty-data':
              // Raw PTY data from interactive session
              if (data.data) {
                terminalRef.current?.write(data.data);
              }
              break;

            case 'event':
              if (data.event) {
                handleAgentEvent(data.event);
              }
              break;

            case 'error':
              terminalRef.current?.writeln(`\x1b[31m  Error: ${data.error}\x1b[0m`);
              break;

            case 'exit':
              terminalRef.current?.writeln('\x1b[90m  Session ended\x1b[0m');
              currentSessionRef.current = null;
              break;

            case 'pong':
              // Heartbeat response, ignore
              break;

            case 'session-started': {
              // A new session was started for this agent
              const sessionId = (data as { sessionId?: string }).sessionId;
              // Only process if this is a new session (avoid duplicates)
              if (sessionId && sessionId === currentSessionRef.current) {
                break; // Already processed this session
              }
              currentSessionRef.current = sessionId ?? null;
              // Reset last sent dimensions so new session gets a fresh resize
              lastSentDimsRef.current = null;

              // Clear previous output for the new session
              terminalRef.current?.clear();
              // Send initial resize for interactive sessions (only if this terminal controls resize)
              // IMPORTANT: Force send (skip deduplication) for new sessions to ensure PTY has correct dimensions
              if (controlsResize && (data as { isInteractive?: boolean }).isInteractive && fitAddonRef.current && terminalRef.current) {
                const dims = fitAddonRef.current.proposeDimensions();
                if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
                  lastSentDimsRef.current = { cols: dims.cols, rows: dims.rows };
                  wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                }
              }
              break;
            }
          }
        } catch (err) {
          console.error('[XTerminal] Error parsing message:', err);
        }
      };

      ws.onerror = () => {
        updateStatus('error');
        terminalRef.current?.writeln('\x1b[31m  WebSocket error\x1b[0m');
      };

      ws.onclose = () => {
        // Don't attempt to reconnect if we're intentionally closing
        // (e.g., during useEffect cleanup when agentId changes or component unmounts)
        if (isIntentionalCloseRef.current) {
          isIntentionalCloseRef.current = false;
          return;
        }

        // Don't attempt to reconnect if this effect has been cleaned up
        // (e.g., component unmounted or agentId changed)
        if (isCleanedUp) {
          return;
        }

        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          terminalRef.current?.writeln(
            `\x1b[33m  Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})...\x1b[0m`
          );
          setTimeout(() => {
            // Double-check the effect hasn't been cleaned up during the delay
            if (!isCleanedUp) {
              connect();
            }
          }, delay);
        } else {
          updateStatus('error');
          terminalRef.current?.writeln(
            '\x1b[31m  Connection lost. Max reconnect attempts reached.\x1b[0m'
          );
        }
      };
    };

    // Handle agent events
    const handleAgentEvent = (event: { type: string; data?: unknown; content?: string; output?: string }) => {
      const terminal = terminalRef.current;
      if (!terminal) return;

      switch (event.type) {
        case 'assistant':
          // Claude assistant response - may contain content
          if (event.content) {
            terminal.write(event.content);
          }
          break;

        case 'tool_use':
          // Tool invocation
          terminal.writeln(`\x1b[36m[Tool: ${(event.data as { name?: string })?.name ?? 'unknown'}]\x1b[0m`);
          break;

        case 'tool_result':
          // Tool result
          if (event.output) {
            terminal.writeln(`\x1b[90m${event.output}\x1b[0m`);
          }
          break;

        case 'system':
          // System message
          if (event.content) {
            terminal.writeln(`\x1b[33m[System] ${event.content}\x1b[0m`);
          }
          break;

        case 'error':
          // Error
          terminal.writeln(`\x1b[31m[Error] ${event.content ?? 'Unknown error'}\x1b[0m`);
          break;
      }
    };

    connect();

    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      // Mark this effect as cleaned up FIRST - this is checked by closures
      // to prevent stale reconnection attempts
      isCleanedUp = true;
      clearInterval(heartbeatInterval);
      if (wsRef.current) {
        // Mark as intentional close to prevent reconnection attempts
        isIntentionalCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  // Note: updateStatus uses refs internally so it's stable and doesn't need to be in deps
  }, [agentId, wsUrl, updateStatus]);

  // Public methods exposed via ref
  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const writeln = useCallback((data: string) => {
    terminalRef.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  // Refresh terminal by triggering a PTY resize cycle on the server
  // This causes the shell to receive SIGWINCH and redraw, which fixes broken states
  const refresh = useCallback(() => {
    if (!fitAddonRef.current || !terminalRef.current) return;

    const terminal = terminalRef.current;

    // Clear the texture atlas to force re-rendering of glyphs
    terminal.clearTextureAtlas();

    // Get current dimensions
    const dims = fitAddonRef.current.proposeDimensions();
    if (!dims) return;

    const originalCols = dims.cols;
    const originalRows = dims.rows;

    // Step 1: Send smaller size to PTY server (triggers SIGWINCH in shell)
    if (controlsResize && wsRef.current?.readyState === WebSocket.OPEN) {
      const smallerCols = Math.max(1, originalCols - 2);
      const smallerRows = Math.max(1, originalRows - 1);
      terminal.resize(smallerCols, smallerRows);
      wsRef.current.send(JSON.stringify({ type: 'resize', cols: smallerCols, rows: smallerRows }));
    }

    // Step 2: Wait for server to process, then restore original size
    setTimeout(() => {
      if (!terminalRef.current || !fitAddonRef.current) return;

      // Restore to proper container size
      fitAddonRef.current.fit();

      // Send original size to PTY server (triggers another SIGWINCH/redraw)
      if (controlsResize && wsRef.current?.readyState === WebSocket.OPEN) {
        const newDims = fitAddonRef.current.proposeDimensions();
        if (newDims) {
          lastSentDimsRef.current = { cols: newDims.cols, rows: newDims.rows };
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: newDims.cols, rows: newDims.rows }));
        }
      }

      // Force local refresh of all visible rows
      const rows = terminalRef.current.rows;
      terminalRef.current.refresh(0, rows - 1);
    }, 100);
  }, [controlsResize]);

  // Send input to the PTY terminal (as if user typed it)
  const sendInput = useCallback((data: string) => {
    sendToServer(data);
  }, [sendToServer]);

  // Get current terminal dimensions
  const getDimensions = useCallback((): { cols: number; rows: number } | null => {
    if (!fitAddonRef.current) return null;
    const dims = fitAddonRef.current.proposeDimensions();
    return dims ? { cols: dims.cols, rows: dims.rows } : null;
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    refresh,
    write,
    writeln,
    clear,
    focus,
    fit,
    sendInput,
    getDimensions,
  }), [refresh, write, writeln, clear, focus, fit, sendInput, getDimensions]);

  // Expose methods through window for testing
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__xterminal = {
      write,
      writeln,
      clear,
      focus,
      fit,
      sendInput,
      getStatus: () => status,
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__xterminal;
    };
  }, [write, writeln, clear, focus, fit, sendInput, status]);

  // Handle click to focus terminal
  const handleClick = useCallback(() => {
    if (interactive) {
      terminalRef.current?.focus();
    }
  }, [interactive]);

  // File upload function - uses base64 encoding to avoid Bun's multipart binary corruption
  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      // Read file as base64 to avoid binary corruption in Bun's multipart handling
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const response = await fetch(`${apiUrl}/api/terminal/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          data: base64,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Upload failed: ${response.status}`);
      }

      const data = await response.json() as { path: string; filename: string; size: number };
      return data.path;
    } catch (error) {
      console.error('[XTerminal] File upload failed:', error);
      terminalRef.current?.writeln(
        `\x1b[31m  File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m`
      );
      return null;
    }
  }, [apiUrl]);

  // Check if drag event contains files (not internal pane drag)
  const isFileDrag = useCallback((e: React.DragEvent<HTMLDivElement>): boolean => {
    const types = Array.from(e.dataTransfer.types);
    // Internal pane drags have our custom MIME type
    if (types.includes('application/x-workspace-pane')) {
      return false;
    }
    // Files from file explorer will have 'Files' in types
    // Internal pane drags also use 'text/plain' with pane ID
    return types.includes('Files') && !types.includes('text/plain');
  }, []);

  // Handle file drop
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    // Only handle file drags, not pane drags - let pane drags bubble up
    if (!isFileDrag(e)) {
      // For pane drags, we need to NOT call stopPropagation so the event bubbles
      // to the parent PaneWrapper which handles the swap
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!fileDropEnabled || !interactive) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setIsUploading(true);
    terminalRef.current?.writeln(`\x1b[90m  Uploading ${files.length} file(s)...\x1b[0m`);

    // Upload files and collect messages
    const messages: string[] = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Image files use terminal upload - session images are ephemeral
        const path = await uploadFile(file);
        if (path) {
          messages.push(path);
        }
      } else {
        // Non-image files use the terminal upload endpoint
        const path = await uploadFile(file);
        if (path) {
          messages.push(path);
        }
      }
    }

    setIsUploading(false);

    if (messages.length > 0) {
      // Send messages to the terminal
      const messagesText = messages.join('\n') + '\n';
      sendToServer(messagesText);

      // Show confirmation message
      terminalRef.current?.writeln(
        `\x1b[32m  ${messages.length} file(s) uploaded and path(s) inserted\x1b[0m`
      );
    }
  }, [fileDropEnabled, interactive, uploadFile, sendToServer, isFileDrag]);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // For pane drags, we need to call preventDefault() to allow the drop,
    // but NOT stopPropagation() so the event bubbles to the parent PaneWrapper
    if (!isFileDrag(e)) {
      // This is a pane drag - allow it to be dropped by calling preventDefault
      // The actual drop handling is done by the parent PaneWrapper
      e.preventDefault();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (fileDropEnabled && interactive) {
      setIsDragOver(true);
    }
  }, [fileDropEnabled, interactive, isFileDrag]);

  // Handle drag enter
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // For pane drags, call preventDefault to allow the drop, but let event bubble
    if (!isFileDrag(e)) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (fileDropEnabled && interactive) {
      setIsDragOver(true);
    }
  }, [fileDropEnabled, interactive, isFileDrag]);

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only handle file drags, not pane drags
    if (!isFileDrag(e)) return;

    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container (not entering a child)
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX >= rect.right ||
        clientY < rect.top ||
        clientY >= rect.bottom
      ) {
        setIsDragOver(false);
      }
    }
  }, [isFileDrag]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      data-status={status}
      data-drag-over={isDragOver}
      className="relative w-full h-full overflow-hidden cursor-text"
      style={{ minHeight: '200px' }}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {/* Drag and drop overlay */}
      {isDragOver && fileDropEnabled && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-primary)]/20 border-2 border-dashed border-[var(--color-primary)] rounded-lg pointer-events-none"
          data-testid="file-drop-overlay"
        >
          <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[var(--color-bg)]/90 shadow-lg">
            <svg
              className="w-10 h-10 text-[var(--color-primary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-sm font-medium text-[var(--color-text)]">
              Drop files to upload
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              File paths will be inserted at cursor
            </span>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {isUploading && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/50 pointer-events-none"
          data-testid="upload-progress-overlay"
        >
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-bg)] shadow-lg border border-[var(--color-border)]">
            <svg
              className="w-5 h-5 text-[var(--color-primary)] animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-[var(--color-text)]">Uploading...</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default XTerminal;
