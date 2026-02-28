/**
 * Folder Filesystem Client
 *
 * Filesystem layer for the folder sync provider. Reads, writes, and lists
 * markdown files with YAML frontmatter in a local directory tree.
 *
 * Follows the same API client pattern as github-api.ts — a focused,
 * dependency-light module that handles I/O for a single provider.
 *
 * Uses the `yaml` package for frontmatter parsing/serialization.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

// ============================================================================
// Types
// ============================================================================

/**
 * YAML frontmatter fields recognized by the folder sync provider.
 * Additional fields are preserved as-is during round-trips.
 */
export interface FolderFrontmatter {
  /** Stoneforge element ID linked to this file */
  'stoneforge-id'?: string;
  /** Document category */
  category?: string;
  /** Tags for classification */
  tags?: string[];
  /** ISO 8601 timestamp of last sync */
  'synced-at'?: string;
  /** Additional arbitrary frontmatter fields (preserved on round-trip) */
  [key: string]: unknown;
}

/**
 * Result of reading a markdown file with frontmatter
 */
export interface FolderFileReadResult {
  /** Markdown body content (without frontmatter) */
  readonly content: string;
  /** Parsed YAML frontmatter (empty object if none) */
  readonly frontmatter: FolderFrontmatter;
  /** File modification time as Unix timestamp (milliseconds) */
  readonly mtime: number;
}

/**
 * Entry returned when listing files in a folder
 */
export interface FolderFileEntry {
  /** Path relative to the base directory (forward slashes) */
  readonly path: string;
  /** File modification time as Unix timestamp (milliseconds) */
  readonly mtime: number;
}

/**
 * Options for listing files
 */
export interface ListFilesOptions {
  /**
   * Only return files modified after this Unix timestamp (milliseconds).
   * Compares against the file's mtime.
   */
  since?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Typed error for folder filesystem failures.
 */
export class FolderFsError extends Error {
  /** The operation that failed */
  readonly operation: 'read' | 'write' | 'list';
  /** The file path involved (if applicable) */
  readonly filePath: string | null;
  /** The underlying system error code (e.g., 'ENOENT', 'EACCES') */
  readonly code: string | null;

  constructor(
    message: string,
    operation: 'read' | 'write' | 'list',
    filePath: string | null = null,
    code: string | null = null,
    cause?: Error
  ) {
    super(message);
    this.name = 'FolderFsError';
    this.operation = operation;
    this.filePath = filePath;
    this.code = code;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FolderFsError);
    }
  }

  /**
   * Whether this error is due to a missing file or directory
   */
  get isNotFound(): boolean {
    return this.code === 'ENOENT';
  }

  /**
   * Whether this error is due to a permission issue
   */
  get isPermissionError(): boolean {
    return this.code === 'EACCES' || this.code === 'EPERM';
  }
}

/**
 * Type guard for FolderFsError
 */
export function isFolderFsError(error: unknown): error is FolderFsError {
  return error instanceof FolderFsError;
}

// ============================================================================
// Frontmatter Parsing / Serialization
// ============================================================================

/** Frontmatter delimiter */
const FRONTMATTER_DELIMITER = '---';

/**
 * Parses YAML frontmatter from a markdown string.
 *
 * Expects the standard `---` delimited frontmatter block at the start of the file.
 * Returns the body content and parsed frontmatter separately.
 *
 * @param raw - Raw file content (may or may not have frontmatter)
 * @returns Parsed frontmatter and body content
 */
export function parseFrontmatter(raw: string): {
  content: string;
  frontmatter: FolderFrontmatter;
} {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return { content: raw, frontmatter: {} };
  }

  // Find the closing delimiter
  const afterOpening = trimmed.indexOf('\n');
  if (afterOpening === -1) {
    return { content: raw, frontmatter: {} };
  }

  const rest = trimmed.slice(afterOpening + 1);

  // Check for closing delimiter: could be at the very start (empty frontmatter)
  // or after a newline
  let closingIndex: number;
  let yamlBlock: string;

  if (rest.startsWith(FRONTMATTER_DELIMITER)) {
    // Empty frontmatter block: ---\n---
    closingIndex = 0;
    yamlBlock = '';
  } else {
    const nlClosing = rest.indexOf(`\n${FRONTMATTER_DELIMITER}`);
    if (nlClosing === -1) {
      // No closing delimiter found — treat entire file as content
      return { content: raw, frontmatter: {} };
    }
    closingIndex = nlClosing + 1; // point to the start of ---
    yamlBlock = rest.slice(0, nlClosing);
  }

  // Content starts after the closing delimiter line
  const closingLineEnd = rest.indexOf('\n', closingIndex);
  const body =
    closingLineEnd === -1 ? '' : rest.slice(closingLineEnd + 1);

  let parsed: unknown;
  try {
    parsed = yaml.parse(yamlBlock);
  } catch {
    // If YAML is malformed, treat the whole file as content
    return { content: raw, frontmatter: {} };
  }

  // yaml.parse can return null for empty YAML blocks
  const frontmatter: FolderFrontmatter =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as FolderFrontmatter)
      : {};

  return { content: body, frontmatter };
}

/**
 * Serializes frontmatter and content into a markdown string with YAML front matter.
 *
 * @param content - Markdown body content
 * @param frontmatter - Frontmatter key-value pairs
 * @returns Complete file content with frontmatter block
 */
export function serializeFrontmatter(
  content: string,
  frontmatter: FolderFrontmatter
): string {
  const hasFields = Object.keys(frontmatter).length > 0;

  if (!hasFields) {
    return content;
  }

  const yamlStr = yaml.stringify(frontmatter, {
    lineWidth: 0, // Don't wrap lines
  }).trimEnd();

  return `${FRONTMATTER_DELIMITER}\n${yamlStr}\n${FRONTMATTER_DELIMITER}\n${content}`;
}

// ============================================================================
// Filesystem Operations
// ============================================================================

/**
 * Reads a markdown file with YAML frontmatter from a folder.
 *
 * @param basePath - Absolute path to the base directory
 * @param relativePath - Path relative to basePath (e.g., 'notes/meeting.md')
 * @returns Parsed file content, frontmatter, and modification time
 * @throws {FolderFsError} If the file cannot be read
 */
export async function readFile(
  basePath: string,
  relativePath: string
): Promise<FolderFileReadResult> {
  const fullPath = path.resolve(basePath, relativePath);

  // Security: ensure the resolved path is within basePath
  const resolvedBase = path.resolve(basePath);
  if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
    throw new FolderFsError(
      `Path traversal detected: "${relativePath}" resolves outside base directory`,
      'read',
      relativePath,
      'EACCES'
    );
  }

  try {
    const [raw, stat] = await Promise.all([
      fs.promises.readFile(fullPath, 'utf-8'),
      fs.promises.stat(fullPath),
    ]);

    const { content, frontmatter } = parseFrontmatter(raw);

    return {
      content,
      frontmatter,
      mtime: stat.mtimeMs,
    };
  } catch (err) {
    const sysErr = err as NodeJS.ErrnoException;
    throw new FolderFsError(
      `Failed to read file "${relativePath}": ${sysErr.message}`,
      'read',
      relativePath,
      sysErr.code ?? null,
      sysErr
    );
  }
}

/**
 * Writes a markdown file with YAML frontmatter to a folder.
 *
 * Writes atomically by first writing to a temporary file in the same directory,
 * then renaming. This prevents partial writes from corrupting files.
 *
 * @param basePath - Absolute path to the base directory
 * @param relativePath - Path relative to basePath (e.g., 'notes/meeting.md')
 * @param content - Markdown body content
 * @param frontmatter - YAML frontmatter key-value pairs
 * @throws {FolderFsError} If the file cannot be written
 */
export async function writeFile(
  basePath: string,
  relativePath: string,
  content: string,
  frontmatter: FolderFrontmatter
): Promise<void> {
  const fullPath = path.resolve(basePath, relativePath);

  // Security: ensure the resolved path is within basePath
  const resolvedBase = path.resolve(basePath);
  if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
    throw new FolderFsError(
      `Path traversal detected: "${relativePath}" resolves outside base directory`,
      'write',
      relativePath,
      'EACCES'
    );
  }

  const serialized = serializeFrontmatter(content, frontmatter);
  const dir = path.dirname(fullPath);
  const tmpPath = `${fullPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Ensure parent directories exist
    await fs.promises.mkdir(dir, { recursive: true });

    // Write to temp file, then rename for atomicity
    await fs.promises.writeFile(tmpPath, serialized, 'utf-8');
    await fs.promises.rename(tmpPath, fullPath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }

    const sysErr = err as NodeJS.ErrnoException;
    throw new FolderFsError(
      `Failed to write file "${relativePath}": ${sysErr.message}`,
      'write',
      relativePath,
      sysErr.code ?? null,
      sysErr
    );
  }
}

/**
 * Recursively lists all `.md` files in a directory tree.
 *
 * Excludes:
 * - Dotfiles (files starting with `.`)
 * - Files inside dot-directories (directories starting with `.`)
 *
 * @param basePath - Absolute path to the base directory
 * @param options - Optional filtering (e.g., `since` timestamp)
 * @returns Array of file entries with relative paths and modification times
 * @throws {FolderFsError} If the directory cannot be read
 */
export async function listFiles(
  basePath: string,
  options?: ListFilesOptions
): Promise<FolderFileEntry[]> {
  const resolvedBase = path.resolve(basePath);
  const entries: FolderFileEntry[] = [];

  try {
    await walkDirectory(resolvedBase, resolvedBase, entries, options?.since);
  } catch (err) {
    const sysErr = err as NodeJS.ErrnoException;
    throw new FolderFsError(
      `Failed to list files in "${basePath}": ${sysErr.message}`,
      'list',
      null,
      sysErr.code ?? null,
      sysErr
    );
  }

  // Sort by path for deterministic output
  entries.sort((a, b) => a.path.localeCompare(b.path));

  return entries;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Recursively walks a directory tree, collecting .md files.
 *
 * @param currentDir - Current directory being scanned
 * @param baseDir - Root base directory (for computing relative paths)
 * @param results - Accumulator array for found entries
 * @param since - Optional mtime filter (milliseconds)
 */
async function walkDirectory(
  currentDir: string,
  baseDir: string,
  results: FolderFileEntry[],
  since?: number
): Promise<void> {
  const dirEntries = await fs.promises.readdir(currentDir, {
    withFileTypes: true,
  });

  const promises: Promise<void>[] = [];

  for (const entry of dirEntries) {
    const name = entry.name;

    // Skip dotfiles and dot-directories
    if (name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(currentDir, name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      promises.push(walkDirectory(fullPath, baseDir, results, since));
    } else if (entry.isFile() && name.endsWith('.md')) {
      // Collect .md files
      promises.push(
        (async () => {
          const stat = await fs.promises.stat(fullPath);
          const mtime = stat.mtimeMs;

          // Apply since filter
          if (since !== undefined && mtime <= since) {
            return;
          }

          // Compute relative path with forward slashes
          const relativePath = path
            .relative(baseDir, fullPath)
            .split(path.sep)
            .join('/');

          results.push({ path: relativePath, mtime });
        })()
      );
    }
  }

  await Promise.all(promises);
}
