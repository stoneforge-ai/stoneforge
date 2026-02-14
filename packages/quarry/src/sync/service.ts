/**
 * Sync Service - Full export and import implementation
 *
 * Implements the sync operations specified in api/sync.md:
 * - Full and incremental export to JSONL
 * - Import with merge strategy
 * - Conflict resolution
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, Timestamp, EntityId, Dependency, DependencyType } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type {
  ExportResult,
  ImportResult as SyncImportResult,
  ExportOptions as SyncExportOptions,
  ImportOptions as SyncImportOptions,
  ImportError,
  ConflictRecord,
  DependencyConflictRecord,
} from './types.js';
import {
  serializeElement,
  serializeDependency,
  parseElements,
  parseDependencies,
  sortElementsForExport,
  sortDependenciesForExport,
} from './serialization.js';
import { mergeElements, mergeDependencies } from './merge.js';

// ============================================================================
// Types
// ============================================================================

interface ElementRow {
  id: string;
  type: string;
  data: string;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string | null;
  [key: string]: unknown;
}

interface TagRow {
  element_id: string;
  tag: string;
  [key: string]: unknown;
}

interface DependencyRow {
  blocked_id: string;
  blocker_id: string;
  type: string;
  created_at: string;
  created_by: string;
  metadata: string | null;
  [key: string]: unknown;
}

// ============================================================================
// Sync Service Implementation
// ============================================================================

/**
 * Service for handling JSONL export and import operations
 */
export class SyncService {
  constructor(private backend: StorageBackend) {}

  // --------------------------------------------------------------------------
  // Export Operations
  // --------------------------------------------------------------------------

  /**
   * Export elements to JSONL format
   *
   * @param options - Export configuration
   * @returns Export result with file paths and counts
   */
  async export(options: SyncExportOptions): Promise<ExportResult> {
    const now = createTimestamp();

    // Ensure output directory exists
    if (!existsSync(options.outputDir)) {
      await mkdir(options.outputDir, { recursive: true });
    }

    // Get elements to export
    const elements = options.full
      ? this.getAllElements(options.includeEphemeral ?? false)
      : this.getDirtyElementsData();

    // Sort elements for export (entities first, then by creation time)
    const sortedElements = sortElementsForExport(elements);

    // Get dependencies
    const dependencies = this.getAllDependencies();
    const sortedDependencies = sortDependenciesForExport(dependencies);

    // Build file paths
    const elementsFile = options.elementsFile ?? 'elements.jsonl';
    const dependenciesFile = options.dependenciesFile ?? 'dependencies.jsonl';
    const elementsPath = join(options.outputDir, elementsFile);
    const dependenciesPath = join(options.outputDir, dependenciesFile);

    // Serialize to JSONL (skip invalid elements with a warning)
    const { content: elementsContent, skipped: skippedCount } =
      this.serializeElementsSafe(sortedElements);
    const dependenciesContent = sortedDependencies.map((d) => serializeDependency(d)).join('\n');

    if (skippedCount > 0) {
      console.warn(`[sync] Skipped ${skippedCount} invalid element(s) during export`);
    }

    // Write files
    await writeFile(elementsPath, elementsContent + (elementsContent ? '\n' : ''));
    await writeFile(dependenciesPath, dependenciesContent + (dependenciesContent ? '\n' : ''));

    // Clear dirty tracking after successful export
    if (!options.full) {
      this.backend.clearDirty();
    }

    return {
      elementsExported: sortedElements.length - skippedCount,
      dependenciesExported: sortedDependencies.length,
      incremental: !options.full,
      elementsFile: elementsPath,
      dependenciesFile: dependenciesPath,
      exportedAt: now,
    };
  }

  /**
   * Export synchronously (useful for CLI and testing)
   */
  exportSync(options: SyncExportOptions): ExportResult {
    const now = createTimestamp();

    // Ensure output directory exists
    if (!existsSync(options.outputDir)) {
      mkdirSync(options.outputDir, { recursive: true });
    }

    // Get elements to export
    const elements = options.full
      ? this.getAllElements(options.includeEphemeral ?? false)
      : this.getDirtyElementsData();

    // Sort elements for export
    const sortedElements = sortElementsForExport(elements);

    // Get dependencies
    const dependencies = this.getAllDependencies();
    const sortedDependencies = sortDependenciesForExport(dependencies);

    // Build file paths
    const elementsFile = options.elementsFile ?? 'elements.jsonl';
    const dependenciesFile = options.dependenciesFile ?? 'dependencies.jsonl';
    const elementsPath = join(options.outputDir, elementsFile);
    const dependenciesPath = join(options.outputDir, dependenciesFile);

    // Serialize to JSONL (skip invalid elements with a warning)
    const { content: elementsContent, skipped: skippedCount } =
      this.serializeElementsSafe(sortedElements);
    const dependenciesContent = sortedDependencies.map((d) => serializeDependency(d)).join('\n');

    if (skippedCount > 0) {
      console.warn(`[sync] Skipped ${skippedCount} invalid element(s) during export`);
    }

    // Write files
    writeFileSync(elementsPath, elementsContent + (elementsContent ? '\n' : ''));
    writeFileSync(dependenciesPath, dependenciesContent + (dependenciesContent ? '\n' : ''));

    // Clear dirty tracking after successful export
    if (!options.full) {
      this.backend.clearDirty();
    }

    return {
      elementsExported: sortedElements.length - skippedCount,
      dependenciesExported: sortedDependencies.length,
      incremental: !options.full,
      elementsFile: elementsPath,
      dependenciesFile: dependenciesPath,
      exportedAt: now,
    };
  }

  /**
   * Export to string (for API and in-memory use)
   */
  exportToString(options?: { includeEphemeral?: boolean; includeDependencies?: boolean }): {
    elements: string;
    dependencies?: string;
  } {
    const elements = this.getAllElements(options?.includeEphemeral ?? false);
    const sortedElements = sortElementsForExport(elements);
    const { content: elementsContent } = this.serializeElementsSafe(sortedElements);

    let dependenciesContent: string | undefined;
    if (options?.includeDependencies !== false) {
      const dependencies = this.getAllDependencies();
      const sortedDependencies = sortDependenciesForExport(dependencies);
      dependenciesContent = sortedDependencies.map((d) => serializeDependency(d)).join('\n');
    }

    return {
      elements: elementsContent,
      dependencies: dependenciesContent,
    };
  }

  // --------------------------------------------------------------------------
  // Import Operations
  // --------------------------------------------------------------------------

  /**
   * Import elements from JSONL files
   *
   * @param options - Import configuration
   * @returns Import result with counts and conflicts
   */
  async import(options: SyncImportOptions): Promise<SyncImportResult> {
    // Build file paths
    const elementsFile = options.elementsFile ?? 'elements.jsonl';
    const dependenciesFile = options.dependenciesFile ?? 'dependencies.jsonl';
    const elementsPath = join(options.inputDir, elementsFile);
    const dependenciesPath = join(options.inputDir, dependenciesFile);

    // Read files
    let elementsContent = '';
    let dependenciesContent = '';

    if (existsSync(elementsPath)) {
      elementsContent = await readFile(elementsPath, 'utf-8');
    }
    if (existsSync(dependenciesPath)) {
      dependenciesContent = await readFile(dependenciesPath, 'utf-8');
    }

    return this.importFromStrings(elementsContent, dependenciesContent, options);
  }

  /**
   * Import synchronously
   */
  importSync(options: SyncImportOptions): SyncImportResult {
    // Build file paths
    const elementsFile = options.elementsFile ?? 'elements.jsonl';
    const dependenciesFile = options.dependenciesFile ?? 'dependencies.jsonl';
    const elementsPath = join(options.inputDir, elementsFile);
    const dependenciesPath = join(options.inputDir, dependenciesFile);

    // Read files
    let elementsContent = '';
    let dependenciesContent = '';

    if (existsSync(elementsPath)) {
      elementsContent = readFileSync(elementsPath, 'utf-8');
    }
    if (existsSync(dependenciesPath)) {
      dependenciesContent = readFileSync(dependenciesPath, 'utf-8');
    }

    return this.importFromStrings(elementsContent, dependenciesContent, options);
  }

  /**
   * Import from JSONL strings (for API and in-memory use)
   */
  importFromStrings(
    elementsContent: string,
    dependenciesContent: string,
    options?: Partial<SyncImportOptions>
  ): SyncImportResult {
    const now = createTimestamp();
    const errors: ImportError[] = [];
    const conflicts: ConflictRecord[] = [];
    const dependencyConflicts: DependencyConflictRecord[] = [];
    const dryRun = options?.dryRun ?? false;
    const force = options?.force ?? false;

    let elementsImported = 0;
    let elementsSkipped = 0;
    let dependenciesImported = 0;
    let dependenciesSkipped = 0;

    // Parse elements
    const { elements: parsedElements, errors: parseErrors } = parseElements(elementsContent);
    for (const err of parseErrors) {
      errors.push({
        line: err.line,
        file: 'elements',
        message: err.message,
        content: err.content,
      });
    }

    // Parse dependencies
    const { dependencies: parsedDependencies, errors: depParseErrors } =
      parseDependencies(dependenciesContent);
    for (const err of depParseErrors) {
      errors.push({
        line: err.line,
        file: 'dependencies',
        message: err.message,
        content: err.content,
      });
    }

    // Sort elements for import order (entities first for referential integrity)
    const sortedElements = sortElementsForExport(parsedElements);

    // Process elements
    if (!dryRun) {
      this.backend.transaction((tx) => {
        for (const remoteElement of sortedElements) {
          const localElement = this.getElement(remoteElement.id);

          if (!localElement) {
            // New element - insert
            this.insertElement(tx, remoteElement);
            elementsImported++;
          } else {
            // Existing element - merge
            const mergeResult = mergeElements(localElement, remoteElement);

            if (mergeResult.localModified || force) {
              // Apply remote or merged changes
              const elementToSave = force ? remoteElement : mergeResult.element;
              this.updateElement(tx, elementToSave);
              elementsImported++;

              if (mergeResult.conflict) {
                conflicts.push(mergeResult.conflict);
              }
            } else {
              // No changes needed
              elementsSkipped++;
            }
          }
        }

        // Process dependencies
        const localDependencies = this.getAllDependencies();
        const mergeResult = mergeDependencies(localDependencies, parsedDependencies);

        // Add new dependencies
        for (const dep of mergeResult.added) {
          this.insertDependency(tx, dep);
          dependenciesImported++;
        }

        // Remove deleted dependencies
        for (const dep of mergeResult.removed) {
          this.deleteDependency(tx, dep);
        }

        dependencyConflicts.push(...mergeResult.conflicts);
        dependenciesSkipped = parsedDependencies.length - mergeResult.added.length;
      });
    } else {
      // Dry run - compute what would change without actually changing
      for (const remoteElement of sortedElements) {
        const localElement = this.getElement(remoteElement.id);

        if (!localElement) {
          elementsImported++;
        } else {
          const mergeResult = mergeElements(localElement, remoteElement);
          if (mergeResult.localModified || force) {
            elementsImported++;
            if (mergeResult.conflict) {
              conflicts.push(mergeResult.conflict);
            }
          } else {
            elementsSkipped++;
          }
        }
      }

      // Dry run for dependencies
      const localDependencies = this.getAllDependencies();
      const mergeResult = mergeDependencies(localDependencies, parsedDependencies);
      dependenciesImported = mergeResult.added.length;
      dependenciesSkipped = parsedDependencies.length - mergeResult.added.length;
      dependencyConflicts.push(...mergeResult.conflicts);
    }

    return {
      elementsImported,
      elementsSkipped,
      dependenciesImported,
      dependenciesSkipped,
      conflicts,
      dependencyConflicts,
      errors,
      importedAt: now,
    };
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Get all elements from storage
   */
  private getAllElements(includeEphemeral: boolean): Element[] {
    // Query all elements
    let sql = 'SELECT * FROM elements WHERE deleted_at IS NULL';
    if (!includeEphemeral) {
      // Exclude ephemeral workflows (with ephemeral: true)
      sql += " AND JSON_EXTRACT(data, '$.ephemeral') IS NOT true";
    }
    sql += ' ORDER BY created_at';

    const rows = this.backend.query<ElementRow>(sql);
    let elements = rows.map((row) => this.rowToElement(row));

    // If not including ephemeral, also filter out tasks that are children of ephemeral workflows
    if (!includeEphemeral) {
      elements = this.filterOutEphemeralTasks(elements);
    }

    return elements;
  }

  /**
   * Filter out tasks that are children of ephemeral workflows
   */
  private filterOutEphemeralTasks(elements: Element[]): Element[] {
    // Find ephemeral workflow IDs
    const ephemeralWorkflowIds = new Set<string>();
    for (const el of elements) {
      if (el.type === 'workflow' && (el as unknown as { ephemeral?: boolean }).ephemeral) {
        ephemeralWorkflowIds.add(el.id);
      }
    }

    if (ephemeralWorkflowIds.size === 0) {
      return elements;
    }

    // Find task IDs that are children of ephemeral workflows via parent-child dependency
    const ephemeralTaskIds = new Set<string>();
    const depRows = this.backend.query<DependencyRow>(
      "SELECT * FROM dependencies WHERE type = 'parent-child'"
    );

    for (const row of depRows) {
      // In parent-child, blockedId is the child (task), blockerId is the parent (workflow)
      if (ephemeralWorkflowIds.has(row.blocker_id)) {
        ephemeralTaskIds.add(row.blocked_id);
      }
    }

    // Filter out ephemeral workflows (already filtered) and their tasks
    return elements.filter((el) => !ephemeralTaskIds.has(el.id));
  }

  /**
   * Get dirty elements data (for incremental export)
   */
  private getDirtyElementsData(): Element[] {
    const dirtyRecords = this.backend.getDirtyElements();
    const elements: Element[] = [];

    for (const record of dirtyRecords) {
      const row = this.backend.queryOne<ElementRow>(
        'SELECT * FROM elements WHERE id = ?',
        [record.elementId]
      );
      if (row) {
        elements.push(this.rowToElement(row));
      }
    }

    return elements;
  }

  /**
   * Get all dependencies from storage
   */
  private getAllDependencies(): Dependency[] {
    const rows = this.backend.query<DependencyRow>('SELECT * FROM dependencies ORDER BY created_at');

    return rows.map((row) => ({
      blockedId: row.blocked_id as ElementId,
      blockerId: row.blocker_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at as Timestamp,
      createdBy: row.created_by as EntityId,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    }));
  }

  /**
   * Get a single element by ID
   */
  private getElement(id: ElementId): Element | null {
    const row = this.backend.queryOne<ElementRow>('SELECT * FROM elements WHERE id = ?', [id]);

    if (!row) {
      return null;
    }

    return this.rowToElement(row);
  }

  /**
   * Convert database row to Element
   */
  private rowToElement(row: ElementRow): Element {
    const data = JSON.parse(row.data);

    // Get tags for this element
    const tagRows = this.backend.query<TagRow>('SELECT tag FROM tags WHERE element_id = ?', [
      row.id,
    ]);
    const tags = tagRows.map((r) => r.tag);

    return {
      id: row.id as ElementId,
      type: data.type ?? row.type,
      createdAt: row.created_at as Timestamp,
      updatedAt: row.updated_at as Timestamp,
      createdBy: row.created_by as EntityId,
      tags,
      metadata: data.metadata ?? {},
      ...data,
    } as Element;
  }

  /**
   * Serialize elements to JSONL, skipping any that fail validation.
   */
  private serializeElementsSafe(elements: Element[]): { content: string; skipped: number } {
    const lines: string[] = [];
    let skipped = 0;
    for (const el of elements) {
      try {
        lines.push(serializeElement(el));
      } catch {
        console.warn(`[sync] Skipping invalid element ${el.id} (type=${el.type})`);
        skipped++;
      }
    }
    return { content: lines.join('\n'), skipped };
  }

  /**
   * Insert an element into storage (within transaction)
   */
  private insertElement(
    tx: {
      run: (sql: string, params?: unknown[]) => void;
    },
    element: Element
  ): void {
    // Extract base fields
    const { id, type, createdAt, updatedAt, createdBy, tags, ...typeData } = element;

    const data = JSON.stringify(typeData);

    // Check for deletedAt (tombstone)
    const deletedAt = 'deletedAt' in element ? (element as { deletedAt?: string }).deletedAt : null;

    tx.run(
      `INSERT OR REPLACE INTO elements (id, type, data, created_at, updated_at, created_by, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, type, data, createdAt, updatedAt, createdBy, deletedAt ?? null]
    );

    // Update tags
    tx.run('DELETE FROM tags WHERE element_id = ?', [id]);
    for (const tag of tags) {
      tx.run('INSERT INTO tags (element_id, tag) VALUES (?, ?)', [id, tag]);
    }
  }

  /**
   * Update an element in storage (within transaction)
   */
  private updateElement(
    tx: {
      run: (sql: string, params?: unknown[]) => void;
    },
    element: Element
  ): void {
    // Extract base fields
    const { id, type, createdAt, updatedAt, createdBy, tags, ...typeData } = element;

    const data = JSON.stringify(typeData);

    // Check for deletedAt (tombstone)
    const deletedAt = 'deletedAt' in element ? (element as { deletedAt?: string }).deletedAt : null;

    tx.run(
      `UPDATE elements SET data = ?, updated_at = ?, deleted_at = ?
       WHERE id = ?`,
      [data, updatedAt, deletedAt ?? null, id]
    );

    // Update tags
    tx.run('DELETE FROM tags WHERE element_id = ?', [id]);
    for (const tag of tags) {
      tx.run('INSERT INTO tags (element_id, tag) VALUES (?, ?)', [id, tag]);
    }
  }

  /**
   * Insert a dependency into storage (within transaction)
   */
  private insertDependency(
    tx: {
      run: (sql: string, params?: unknown[]) => void;
    },
    dep: Dependency
  ): void {
    tx.run(
      `INSERT OR IGNORE INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        dep.blockedId,
        dep.blockerId,
        dep.type,
        dep.createdAt,
        dep.createdBy,
        Object.keys(dep.metadata).length > 0 ? JSON.stringify(dep.metadata) : null,
      ]
    );
  }

  /**
   * Delete a dependency from storage (within transaction)
   */
  private deleteDependency(
    tx: {
      run: (sql: string, params?: unknown[]) => void;
    },
    dep: Dependency
  ): void {
    tx.run('DELETE FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?', [
      dep.blockedId,
      dep.blockerId,
      dep.type,
    ]);
  }
}

/**
 * Create a new SyncService instance
 */
export function createSyncService(backend: StorageBackend): SyncService {
  return new SyncService(backend);
}
