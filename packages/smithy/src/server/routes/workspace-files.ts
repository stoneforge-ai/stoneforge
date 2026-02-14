/**
 * Workspace Files Routes
 *
 * HTTP API routes for browsing, reading, writing, and searching workspace files.
 * Replaces browser's File System Access API for cross-browser compatibility.
 */

import { resolve, relative, join, normalize, dirname } from 'node:path';
import { readdir, readFile, writeFile, stat, mkdir, unlink, rename as fsRename, rm } from 'node:fs/promises';
import { Hono } from 'hono';
import { PROJECT_ROOT } from '../config.js';

/**
 * Directories to skip when traversing the file tree.
 */
const IGNORED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.vscode',
  '.idea',
  '.DS_Store',
  '.stoneforge-worktrees',
];

/**
 * Maximum file size for reading (5MB).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Maximum file size for searching (1MB).
 */
const MAX_SEARCH_FILE_SIZE = 1 * 1024 * 1024;

/**
 * Default maximum search results.
 */
const DEFAULT_MAX_RESULTS = 200;

/**
 * Maximum matches per file during search.
 */
const MAX_MATCHES_PER_FILE = 20;

/**
 * File entry in the directory tree.
 */
interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  children?: FileEntry[];
}

/**
 * Search match within a file.
 */
interface SearchMatch {
  line: number;
  column: number;
  length: number;
  lineContent: string;
}

/**
 * Search result for a single file.
 */
interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

/**
 * Body for search requests.
 */
interface SearchRequestBody {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includePattern?: string;
  excludePattern?: string;
  maxResults?: number;
}

/**
 * Validates that a path is within the workspace root (prevents path traversal).
 * Returns the resolved absolute path if valid, or null if invalid.
 */
function validatePath(relativePath: string, workspaceRoot: string): string | null {
  // Normalize and resolve the path
  const normalizedPath = normalize(relativePath);
  const absolutePath = resolve(workspaceRoot, normalizedPath);

  // Ensure the resolved path is within the workspace root
  const relativeFromRoot = relative(workspaceRoot, absolutePath);

  // If the relative path starts with '..' or is absolute, it's outside the workspace
  if (relativeFromRoot.startsWith('..') || resolve(relativeFromRoot) === relativeFromRoot) {
    return null;
  }

  return absolutePath;
}

/**
 * Checks if a file is likely binary by checking for null bytes in the first 8KB.
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const handle = await readFile(filePath, { flag: 'r' });
    const sample = handle.subarray(0, 8192);
    return sample.includes(0);
  } catch {
    return true; // Assume binary if we can't read
  }
}

/**
 * Converts a glob pattern to a regex.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Checks if a filename matches a glob pattern.
 */
function matchesGlob(filename: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(filename);
}

/**
 * Recursively reads a directory tree.
 */
async function readDirectoryTree(
  dirPath: string,
  workspaceRoot: string,
  currentDepth: number,
  maxDepth: number
): Promise<FileEntry[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const entries: FileEntry[] = [];

  try {
    const dirents = await readdir(dirPath, { withFileTypes: true });

    // Sort: directories first, then alphabetically
    dirents.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const dirent of dirents) {
      // Skip ignored directories
      if (IGNORED_DIRECTORIES.includes(dirent.name)) {
        continue;
      }

      const fullPath = join(dirPath, dirent.name);
      const relativePath = relative(workspaceRoot, fullPath);

      if (dirent.isDirectory()) {
        const children = await readDirectoryTree(fullPath, workspaceRoot, currentDepth + 1, maxDepth);
        entries.push({
          name: dirent.name,
          path: relativePath,
          type: 'directory',
          children,
        });
      } else if (dirent.isFile()) {
        try {
          const fileStat = await stat(fullPath);
          entries.push({
            name: dirent.name,
            path: relativePath,
            type: 'file',
            size: fileStat.size,
            lastModified: fileStat.mtimeMs,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch (error) {
    console.error(`[orchestrator] Failed to read directory ${dirPath}:`, error);
  }

  return entries;
}

/**
 * Recursively searches files in a directory.
 */
async function searchDirectory(
  dirPath: string,
  workspaceRoot: string,
  searchRegex: RegExp,
  options: {
    includePattern?: string;
    excludePattern?: string;
    maxResults: number;
  },
  results: SearchFileResult[],
  totalMatches: { count: number }
): Promise<boolean> {
  // Check if we've hit the max results
  if (totalMatches.count >= options.maxResults) {
    return true; // Truncated
  }

  try {
    const dirents = await readdir(dirPath, { withFileTypes: true });

    for (const dirent of dirents) {
      if (totalMatches.count >= options.maxResults) {
        return true; // Truncated
      }

      // Skip ignored directories
      if (IGNORED_DIRECTORIES.includes(dirent.name)) {
        continue;
      }

      const fullPath = join(dirPath, dirent.name);
      const relativePath = relative(workspaceRoot, fullPath);

      if (dirent.isDirectory()) {
        const truncated = await searchDirectory(
          fullPath,
          workspaceRoot,
          searchRegex,
          options,
          results,
          totalMatches
        );
        if (truncated) return true;
      } else if (dirent.isFile()) {
        // Check include/exclude patterns
        if (options.includePattern && !matchesGlob(dirent.name, options.includePattern)) {
          continue;
        }
        if (options.excludePattern && matchesGlob(dirent.name, options.excludePattern)) {
          continue;
        }

        // Check file size
        try {
          const fileStat = await stat(fullPath);
          if (fileStat.size > MAX_SEARCH_FILE_SIZE) {
            continue;
          }
        } catch {
          continue;
        }

        // Check if binary
        if (await isBinaryFile(fullPath)) {
          continue;
        }

        // Search file contents
        const fileMatches = await searchFileContents(fullPath, searchRegex, totalMatches, options.maxResults);
        if (fileMatches.length > 0) {
          results.push({
            path: relativePath,
            matches: fileMatches,
          });
        }
      }
    }
  } catch (error) {
    console.error(`[orchestrator] Failed to search directory ${dirPath}:`, error);
  }

  return false;
}

/**
 * Searches a file's contents line by line.
 */
async function searchFileContents(
  filePath: string,
  searchRegex: RegExp,
  totalMatches: { count: number },
  maxResults: number
): Promise<SearchMatch[]> {
  const matches: SearchMatch[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (totalMatches.count >= maxResults || matches.length >= MAX_MATCHES_PER_FILE) {
        break;
      }

      const line = lines[i];
      // Reset regex lastIndex for global regex
      searchRegex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = searchRegex.exec(line)) !== null) {
        if (totalMatches.count >= maxResults || matches.length >= MAX_MATCHES_PER_FILE) {
          break;
        }

        matches.push({
          line: i + 1,
          column: match.index + 1,
          length: match[0].length,
          lineContent: line,
        });
        totalMatches.count++;

        // If not global regex, break to avoid infinite loop
        if (!searchRegex.global) {
          break;
        }
      }
    }
  } catch {
    // Skip files we can't read
  }

  return matches;
}

/**
 * Creates workspace file routes.
 */
export function createWorkspaceFilesRoutes() {
  const app = new Hono();
  const workspaceRoot = PROJECT_ROOT;

  // GET /api/workspace/tree - Returns recursive directory tree
  app.get('/api/workspace/tree', async (c) => {
    try {
      const root = c.req.query('root') || '.';
      const depthParam = c.req.query('depth');
      const depth = depthParam ? parseInt(depthParam, 10) : 10;

      // Validate depth
      if (isNaN(depth) || depth < 0 || depth > 50) {
        return c.json({ error: { code: 'INVALID_DEPTH', message: 'Depth must be between 0 and 50' } }, 400);
      }

      // Validate root path
      const validatedRoot = validatePath(root, workspaceRoot);
      if (!validatedRoot) {
        return c.json({ error: { code: 'INVALID_PATH', message: 'Path is outside workspace' } }, 400);
      }

      // Check if directory exists
      try {
        const rootStat = await stat(validatedRoot);
        if (!rootStat.isDirectory()) {
          return c.json({ error: { code: 'NOT_DIRECTORY', message: 'Path is not a directory' } }, 400);
        }
      } catch {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Directory not found' } }, 404);
      }

      const entries = await readDirectoryTree(validatedRoot, workspaceRoot, 0, depth);

      return c.json({ entries, root: workspaceRoot });
    } catch (error) {
      console.error('[orchestrator] Failed to read workspace tree:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/workspace/file - Reads a single file
  app.get('/api/workspace/file', async (c) => {
    try {
      const path = c.req.query('path');

      if (!path) {
        return c.json({ error: { code: 'MISSING_PATH', message: 'path query parameter is required' } }, 400);
      }

      // Validate path
      const validatedPath = validatePath(path, workspaceRoot);
      if (!validatedPath) {
        return c.json({ error: { code: 'INVALID_PATH', message: 'Path is outside workspace' } }, 400);
      }

      // Check if file exists and get stats
      let fileStat;
      try {
        fileStat = await stat(validatedPath);
      } catch {
        return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
      }

      if (!fileStat.isFile()) {
        return c.json({ error: { code: 'NOT_FILE', message: 'Path is not a file' } }, 400);
      }

      // Check file size
      if (fileStat.size > MAX_FILE_SIZE) {
        return c.json({ error: { code: 'FILE_TOO_LARGE', message: `File exceeds maximum size of ${MAX_FILE_SIZE} bytes` } }, 413);
      }

      // Read file content
      const content = await readFile(validatedPath, 'utf-8');
      const fileName = validatedPath.split('/').pop() || path;

      return c.json({
        content,
        name: fileName,
        path: relative(workspaceRoot, validatedPath),
        size: fileStat.size,
        lastModified: fileStat.mtimeMs,
      });
    } catch (error) {
      console.error('[orchestrator] Failed to read file:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // PUT /api/workspace/file - Writes content to a file
  app.put('/api/workspace/file', async (c) => {
    try {
      const body = await c.req.json() as { path?: string; content?: string };

      if (!body.path) {
        return c.json({ error: { code: 'MISSING_PATH', message: 'path is required' } }, 400);
      }

      if (body.content === undefined) {
        return c.json({ error: { code: 'MISSING_CONTENT', message: 'content is required' } }, 400);
      }

      // Validate path
      const validatedPath = validatePath(body.path, workspaceRoot);
      if (!validatedPath) {
        return c.json({ error: { code: 'INVALID_PATH', message: 'Path is outside workspace' } }, 400);
      }

      // Create parent directories if they don't exist
      const parentDir = validatedPath.substring(0, validatedPath.lastIndexOf('/'));
      if (parentDir) {
        await mkdir(parentDir, { recursive: true });
      }

      // Write file
      const buffer = Buffer.from(body.content, 'utf-8');
      await writeFile(validatedPath, buffer);

      return c.json({
        success: true,
        path: relative(workspaceRoot, validatedPath),
        bytesWritten: buffer.length,
      });
    } catch (error) {
      console.error('[orchestrator] Failed to write file:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // DELETE /api/workspace/file - Deletes a file or directory
  app.delete('/api/workspace/file', async (c) => {
    try {
      const path = c.req.query('path');

      if (!path) {
        return c.json({ error: { code: 'MISSING_PATH', message: 'path query parameter is required' } }, 400);
      }

      // Validate path
      const validatedPath = validatePath(path, workspaceRoot);
      if (!validatedPath) {
        return c.json({ error: { code: 'INVALID_PATH', message: 'Path is outside workspace' } }, 400);
      }

      // Check if path exists and get stats
      let pathStat;
      try {
        pathStat = await stat(validatedPath);
      } catch {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Path not found' } }, 404);
      }

      // Delete based on type
      if (pathStat.isDirectory()) {
        await rm(validatedPath, { recursive: true, force: true });
      } else {
        await unlink(validatedPath);
      }

      return c.json({
        success: true,
        path: relative(workspaceRoot, validatedPath),
      });
    } catch (error) {
      console.error('[orchestrator] Failed to delete file:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/workspace/rename - Renames or moves a file or directory
  app.post('/api/workspace/rename', async (c) => {
    try {
      const body = await c.req.json() as { oldPath?: string; newPath?: string };

      if (!body.oldPath) {
        return c.json({ error: { code: 'MISSING_OLD_PATH', message: 'oldPath is required' } }, 400);
      }

      if (!body.newPath) {
        return c.json({ error: { code: 'MISSING_NEW_PATH', message: 'newPath is required' } }, 400);
      }

      // Validate old path
      const validatedOldPath = validatePath(body.oldPath, workspaceRoot);
      if (!validatedOldPath) {
        return c.json({ error: { code: 'INVALID_PATH', message: 'oldPath is outside workspace' } }, 400);
      }

      // Validate new path
      const validatedNewPath = validatePath(body.newPath, workspaceRoot);
      if (!validatedNewPath) {
        return c.json({ error: { code: 'INVALID_PATH', message: 'newPath is outside workspace' } }, 400);
      }

      // Check if source exists
      try {
        await stat(validatedOldPath);
      } catch {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source path not found' } }, 404);
      }

      // Check if destination already exists
      try {
        await stat(validatedNewPath);
        return c.json({ error: { code: 'CONFLICT', message: 'Destination path already exists' } }, 409);
      } catch {
        // Destination does not exist, which is what we want
      }

      // Create parent directory if it doesn't exist
      const parentDir = dirname(validatedNewPath);
      await mkdir(parentDir, { recursive: true });

      // Perform the rename
      await fsRename(validatedOldPath, validatedNewPath);

      return c.json({
        success: true,
        oldPath: relative(workspaceRoot, validatedOldPath),
        newPath: relative(workspaceRoot, validatedNewPath),
      });
    } catch (error) {
      console.error('[orchestrator] Failed to rename file:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/workspace/mkdir - Creates a directory (with intermediate directories)
  app.post('/api/workspace/mkdir', async (c) => {
    try {
      const body = await c.req.json() as { path?: string };

      if (!body.path) {
        return c.json({ error: { code: 'MISSING_PATH', message: 'path is required' } }, 400);
      }

      // Validate path
      const validatedPath = validatePath(body.path, workspaceRoot);
      if (!validatedPath) {
        return c.json({ error: { code: 'INVALID_PATH', message: 'Path is outside workspace' } }, 400);
      }

      // Create directory (and any intermediate directories)
      await mkdir(validatedPath, { recursive: true });

      return c.json({
        success: true,
        path: relative(workspaceRoot, validatedPath),
      });
    } catch (error) {
      console.error('[orchestrator] Failed to create directory:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/workspace/search - Searches file contents
  app.post('/api/workspace/search', async (c) => {
    try {
      const body = await c.req.json() as SearchRequestBody;

      if (!body.query) {
        return c.json({ error: { code: 'MISSING_QUERY', message: 'query is required' } }, 400);
      }

      const maxResults = body.maxResults || DEFAULT_MAX_RESULTS;

      // Build search regex
      let searchPattern = body.query;

      if (!body.isRegex) {
        // Escape special regex characters
        searchPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

      if (body.wholeWord) {
        searchPattern = `\\b${searchPattern}\\b`;
      }

      const flags = body.caseSensitive ? 'g' : 'gi';

      let searchRegex: RegExp;
      try {
        searchRegex = new RegExp(searchPattern, flags);
      } catch {
        return c.json({ error: { code: 'INVALID_REGEX', message: 'Invalid regular expression' } }, 400);
      }

      const results: SearchFileResult[] = [];
      const totalMatches = { count: 0 };

      const truncated = await searchDirectory(
        workspaceRoot,
        workspaceRoot,
        searchRegex,
        {
          includePattern: body.includePattern,
          excludePattern: body.excludePattern,
          maxResults,
        },
        results,
        totalMatches
      );

      return c.json({
        results,
        totalMatches: totalMatches.count,
        truncated,
      });
    } catch (error) {
      console.error('[orchestrator] Failed to search workspace:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
