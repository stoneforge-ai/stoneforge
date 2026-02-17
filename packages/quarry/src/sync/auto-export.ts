/**
 * Auto Export Service
 *
 * Polls for dirty elements and automatically triggers incremental JSONL exports.
 * Uses interval-based polling (same pattern as EventBroadcaster).
 */

import type { StorageBackend } from '@stoneforge/storage';
import type { SyncConfig } from '../config/types.js';
import { SyncService } from './service.js';

export interface AutoExportOptions {
  syncService: SyncService;
  backend: StorageBackend;
  syncConfig: SyncConfig;
  outputDir: string;
}

/**
 * Interval-based service that watches for dirty elements and exports them.
 */
export class AutoExportService {
  private syncService: SyncService;
  private backend: StorageBackend;
  private syncConfig: SyncConfig;
  private outputDir: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private exporting = false;

  constructor(options: AutoExportOptions) {
    this.syncService = options.syncService;
    this.backend = options.backend;
    this.syncConfig = options.syncConfig;
    this.outputDir = options.outputDir;
  }

  /**
   * Start the auto-export polling loop.
   * If autoExport is disabled in config, this is a no-op.
   */
  async start(): Promise<void> {
    if (!this.syncConfig.autoExport) {
      return;
    }

    if (this.pollInterval) {
      return;
    }

    // Initial full export to ensure JSONL files are in sync
    try {
      await this.syncService.export({
        outputDir: this.outputDir,
        full: true,
      });
      console.log('[auto-export] Initial full export complete');
    } catch (err) {
      console.error('[auto-export] Initial full export failed:', err);
    }

    // Start polling
    this.pollInterval = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[auto-export] Export tick failed:', err);
      });
    }, this.syncConfig.exportDebounce);

    console.log(
      `[auto-export] Started (polling every ${this.syncConfig.exportDebounce}ms)`
    );
  }

  /**
   * Stop the auto-export polling loop.
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[auto-export] Stopped');
    }
  }

  /**
   * Single poll tick: check for dirty elements and export if needed.
   */
  private async tick(): Promise<void> {
    if (this.exporting) {
      return;
    }

    const dirty = this.backend.getDirtyElements();
    if (dirty.length === 0) {
      return;
    }

    this.exporting = true;
    try {
      await this.syncService.export({
        outputDir: this.outputDir,
        full: false,
      });
    } finally {
      this.exporting = false;
    }
  }
}

/**
 * Create a new AutoExportService instance
 */
export function createAutoExportService(options: AutoExportOptions): AutoExportService {
  return new AutoExportService(options);
}
