/**
 * Agent Provider Types
 *
 * Defines the provider abstraction layer that enables drop-in replacement
 * of the underlying agent CLI/SDK (e.g., Claude Code, OpenCode) without
 * changing orchestration logic.
 *
 * @module
 */

// ============================================================================
// Provider Session ID
// ============================================================================

/** Provider-agnostic session ID (replaces Claude-specific session IDs) */
export type ProviderSessionId = string;

// ============================================================================
// Agent Provider Configuration
// ============================================================================

/** Configuration for an agent provider */
export interface AgentProviderConfig {
  /** Path to CLI executable (e.g., 'claude', 'opencode') */
  readonly executablePath?: string;
  /** Working directory */
  readonly workingDirectory?: string;
  /** Environment variables */
  readonly environmentVariables?: Record<string, string>;
  /** Timeout in ms */
  readonly timeout?: number;
  /** Stoneforge root directory */
  readonly stoneforgeRoot?: string;
  /** Provider-specific options */
  readonly providerOptions?: Record<string, unknown>;
}

// ============================================================================
// Agent Messages
// ============================================================================

/** Provider-agnostic message from the agent */
export interface AgentMessage {
  readonly type: 'system' | 'assistant' | 'user' | 'tool_use' | 'tool_result' | 'result' | 'error';
  readonly subtype?: string;
  readonly sessionId?: string;
  readonly content?: string;
  readonly tool?: {
    readonly name?: string;
    readonly id?: string;
    readonly input?: unknown;
  };
  /** Raw provider-specific message data */
  readonly raw: unknown;
}

// ============================================================================
// Headless Provider
// ============================================================================

/** Handle for a running headless agent session */
export interface HeadlessSession {
  /** Send a user message to the agent */
  sendMessage(content: string): void;
  /** Iterate over agent messages */
  [Symbol.asyncIterator](): AsyncIterator<AgentMessage>;
  /** Interrupt the current operation */
  interrupt(): Promise<void>;
  /** Close the session */
  close(): void;
}

/** Options for spawning a headless session */
export interface HeadlessSpawnOptions {
  readonly workingDirectory: string;
  readonly initialPrompt?: string;
  readonly resumeSessionId?: ProviderSessionId;
  readonly environmentVariables?: Record<string, string>;
  readonly stoneforgeRoot?: string;
  readonly timeout?: number;
  /** Model identifier to use (e.g., 'claude-sonnet-4-20250514'). If not set, uses provider default. */
  readonly model?: string;
}

/** Headless agent provider (SDK/API-based) */
export interface HeadlessProvider {
  readonly name: string;

  /** Spawn a new headless session */
  spawn(options: HeadlessSpawnOptions): Promise<HeadlessSession>;

  /** Check if provider is available (e.g., SDK installed) */
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Interactive Provider
// ============================================================================

/** Handle for a running interactive (PTY) agent session */
export interface InteractiveSession {
  /** PTY process PID */
  readonly pid?: number;
  /** Write data to the PTY */
  write(data: string): void;
  /** Resize the terminal */
  resize(cols: number, rows: number): void;
  /** Kill the PTY */
  kill(): void;
  /** Event: data from the PTY */
  onData(callback: (data: string) => void): void;
  /** Event: PTY exit */
  onExit(callback: (code: number, signal?: number) => void): void;
  /** Extract provider session ID from output (if available) */
  getSessionId(): ProviderSessionId | undefined;
}

/** Options for spawning an interactive session */
export interface InteractiveSpawnOptions {
  readonly workingDirectory: string;
  readonly initialPrompt?: string;
  readonly resumeSessionId?: ProviderSessionId;
  readonly environmentVariables?: Record<string, string>;
  readonly stoneforgeRoot?: string;
  readonly cols?: number;
  readonly rows?: number;
  /** Model identifier to use (e.g., 'claude-sonnet-4-20250514'). If not set, uses provider default. */
  readonly model?: string;
}

/** Interactive (PTY) agent provider */
export interface InteractiveProvider {
  readonly name: string;

  /** Spawn a new interactive session */
  spawn(options: InteractiveSpawnOptions): Promise<InteractiveSession>;

  /** Check if provider is available (e.g., CLI installed) */
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Model Information
// ============================================================================

/** Information about an available model */
export interface ModelInfo {
  /** Model identifier (e.g., 'claude-sonnet-4-20250514') */
  readonly id: string;
  /** Human-readable display name (e.g., 'Claude Sonnet 4') */
  readonly displayName: string;
  /** Optional description of the model's capabilities */
  readonly description?: string;
  /** Whether this is the provider's default model */
  readonly isDefault?: boolean;
  /** Provider name for disambiguation (e.g., 'anthropic', 'openai') */
  readonly providerName?: string;
}

// ============================================================================
// Combined Agent Provider
// ============================================================================

/** Combined provider that supports both headless and interactive modes */
export interface AgentProvider {
  readonly name: string;
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;

  /** Check if provider is available (CLI installed, SDK importable, etc.) */
  isAvailable(): Promise<boolean>;

  /**
   * Human-readable installation instructions shown when provider is not available.
   * e.g., "Install OpenCode SDK: npm install @opencode-ai/sdk"
   */
  getInstallInstructions(): string;

  /** List available models for this provider */
  listModels(): Promise<ModelInfo[]>;
}

// ============================================================================
// Provider Errors
// ============================================================================

/**
 * Error thrown when a provider operation fails (e.g., SDK crash, auth failure).
 * Route handlers can catch this to return 503 instead of 500.
 */
export class ProviderError extends Error {
  readonly providerName: string;

  constructor(message: string, providerName: string) {
    super(message);
    this.name = 'ProviderError';
    this.providerName = providerName;
  }
}
