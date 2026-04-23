/**
 * External Sync Daemon Service
 *
 * Background polling daemon that automates external service synchronization
 * (e.g., GitHub Issues, Linear). Follows the dispatch daemon lifecycle pattern:
 * - setInterval with configurable pollIntervalMs
 * - running flag to prevent concurrent cycles
 * - Tracks currentPollCycle promise for clean shutdown
 * - Each cycle: iterate all configured providers, run sync engine push + pull
 * - Log cycle results (pushed/pulled/conflicts/errors)
 *
 * Zero-overhead guarantee: The daemon is only instantiated when external sync
 * is enabled AND at least one provider has a configured token. Unconfigured
 * workspaces pay no cost — no daemon object, no timers, no polling.
 *
 * @module
 */

import type { ExternalSyncResult } from '@stoneforge/core';
import type { SyncEngine } from '@stoneforge/quarry';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('external-sync-daemon');

// ============================================================================
// Constants
// ============================================================================

/**
 * Default poll interval in milliseconds for external sync daemon (60 seconds)
 */
export const EXTERNAL_SYNC_DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * Minimum poll interval in milliseconds (10 seconds)
 */
export const EXTERNAL_SYNC_MIN_POLL_INTERVAL_MS = 10_000;

/**
 * Maximum poll interval in milliseconds (30 minutes)
 */
export const EXTERNAL_SYNC_MAX_POLL_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Shutdown timeout in milliseconds — how long stop() waits for in-flight cycle
 */
const SHUTDOWN_TIMEOUT_MS = 30_000;

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the External Sync Daemon
 */
export interface ExternalSyncDaemonConfig {
  /**
   * Poll interval in milliseconds.
   * Default: 60000 (60 seconds)
   */
  readonly pollIntervalMs?: number;
}

// ============================================================================
// ExternalSyncDaemon Interface
// ============================================================================

/**
 * External Sync Daemon interface for automated bidirectional sync
 * with external services (GitHub, Linear, etc.).
 *
 * The daemon provides methods for:
 * - Starting and stopping the polling loop
 * - Manual trigger of a sync cycle
 * - Querying last sync result
 */
export interface ExternalSyncDaemon {
  /**
   * Start the polling loop.
   * No-op if already running.
   */
  start(): Promise<void>;

  /**
   * Stop the polling loop.
   * Waits for any in-flight cycle to complete before returning.
   */
  stop(): Promise<void>;

  /**
   * Whether the daemon is currently running.
   */
  isRunning(): boolean;

  /**
   * Force an immediate sync cycle.
   * Can be called whether the daemon is running or not.
   */
  triggerSync(): Promise<ExternalSyncResult>;

  /**
   * Get the result of the last completed sync cycle.
   * Returns null if no cycle has completed yet.
   */
  getLastResult(): ExternalSyncResult | null;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Internal normalized configuration
 */
interface NormalizedConfig {
  pollIntervalMs: number;
}

function normalizeConfig(config?: ExternalSyncDaemonConfig): NormalizedConfig {
  let pollIntervalMs = config?.pollIntervalMs ?? EXTERNAL_SYNC_DEFAULT_POLL_INTERVAL_MS;

  // Clamp to valid range
  if (pollIntervalMs < EXTERNAL_SYNC_MIN_POLL_INTERVAL_MS) {
    pollIntervalMs = EXTERNAL_SYNC_MIN_POLL_INTERVAL_MS;
  } else if (pollIntervalMs > EXTERNAL_SYNC_MAX_POLL_INTERVAL_MS) {
    pollIntervalMs = EXTERNAL_SYNC_MAX_POLL_INTERVAL_MS;
  }

  return { pollIntervalMs };
}

/**
 * ExternalSyncDaemon implementation.
 *
 * Wraps a SyncEngine in a setInterval-based polling loop.
 * Each cycle runs the engine's sync() method (push then pull)
 * across all configured providers.
 */
export class ExternalSyncDaemonImpl implements ExternalSyncDaemon {
  private running = false;
  private pollIntervalHandle?: NodeJS.Timeout;
  private currentPollCycle?: Promise<void>;
  private lastResult: ExternalSyncResult | null = null;

  private readonly config: NormalizedConfig;
  private readonly syncEngine: SyncEngine;

  constructor(
    syncEngine: SyncEngine,
    config?: ExternalSyncDaemonConfig,
  ) {
    this.config = normalizeConfig(config);
    this.syncEngine = syncEngine;
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    logger.info(`External sync daemon starting (poll interval: ${this.config.pollIntervalMs}ms)`);

    // Start the main poll loop
    this.pollIntervalHandle = setInterval(() => {
      // Skip if a cycle is already in flight
      if (this.currentPollCycle) {
        logger.debug('Skipping poll cycle — previous cycle still in flight');
        return;
      }

      this.currentPollCycle = this.runSyncCycle().finally(() => {
        this.currentPollCycle = undefined;
      });
    }, this.config.pollIntervalMs);

    // Unref the interval so it doesn't prevent process exit
    if (this.pollIntervalHandle.unref) {
      this.pollIntervalHandle.unref();
    }

    // Run an initial cycle immediately
    this.currentPollCycle = this.runSyncCycle().finally(() => {
      this.currentPollCycle = undefined;
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.pollIntervalHandle) {
      clearInterval(this.pollIntervalHandle);
      this.pollIntervalHandle = undefined;
    }

    // Wait for in-flight cycle to complete
    if (this.currentPollCycle) {
      try {
        await Promise.race([
          this.currentPollCycle,
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('External sync daemon shutdown timeout')), SHUTDOWN_TIMEOUT_MS)
          ),
        ]);
      } catch {
        /* timeout or error — proceed with shutdown */
      }
      this.currentPollCycle = undefined;
    }

    logger.info('External sync daemon stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ----------------------------------------
  // Manual Trigger
  // ----------------------------------------

  async triggerSync(): Promise<ExternalSyncResult> {
    const result = await this.syncEngine.sync({ all: true });
    this.lastResult = result;
    return result;
  }

  // ----------------------------------------
  // Query
  // ----------------------------------------

  getLastResult(): ExternalSyncResult | null {
    return this.lastResult;
  }

  // ----------------------------------------
  // Internal
  // ----------------------------------------

  /**
   * Run a single sync cycle: push then pull via the sync engine.
   * Catches and logs errors so the polling loop continues.
   */
  private async runSyncCycle(): Promise<void> {
    if (!this.running) {
      return;
    }

    const cycleStart = Date.now();
    logger.debug('External sync cycle starting');

    try {
      const result = await this.syncEngine.sync({ all: true });
      this.lastResult = result;

      const durationMs = Date.now() - cycleStart;

      if (result.errors.length > 0) {
        logger.warn(
          `External sync cycle completed with errors in ${durationMs}ms: ` +
            `pushed=${result.pushed}, pulled=${result.pulled}, ` +
            `conflicts=${result.conflicts.length}, errors=${result.errors.length}`
        );
        for (const err of result.errors) {
          logger.warn(`  Sync error [${err.provider}/${err.elementId || 'unknown'}]: ${err.message}`);
        }
      } else if (result.pushed > 0 || result.pulled > 0 || result.conflicts.length > 0) {
        logger.info(
          `External sync cycle completed in ${durationMs}ms: ` +
            `pushed=${result.pushed}, pulled=${result.pulled}, ` +
            `conflicts=${result.conflicts.length}, skipped=${result.skipped}`
        );
      } else {
        logger.debug(`External sync cycle completed in ${durationMs}ms (no changes)`);
      }
    } catch (error) {
      const durationMs = Date.now() - cycleStart;
      logger.error(`External sync cycle failed after ${durationMs}ms:`, error);

      // Store an error result so getLastResult() reflects the failure
      this.lastResult = {
        success: false,
        provider: '',
        project: '',
        adapterType: 'task',
        pushed: 0,
        pulled: 0,
        skipped: 0,
        conflicts: [],
        errors: [
          {
            provider: '',
            project: '',
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        ],
      };
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an ExternalSyncDaemon instance.
 *
 * @param syncEngine - The sync engine to drive push/pull operations
 * @param config - Optional daemon configuration (poll interval, etc.)
 * @returns A new ExternalSyncDaemon, ready to start()
 */
export function createExternalSyncDaemon(
  syncEngine: SyncEngine,
  config?: ExternalSyncDaemonConfig,
): ExternalSyncDaemon {
  return new ExternalSyncDaemonImpl(syncEngine, config);
}
