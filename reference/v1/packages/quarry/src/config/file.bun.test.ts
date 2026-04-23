/**
 * File Configuration Tests
 *
 * Tests for file discovery, YAML parsing, and worktree root-finding.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  findStoneforgeDir,
  discoverConfigFile,
  STONEFORGE_DIR,
  CONFIG_FILE_NAME,
  getGlobalConfigDir,
  getGlobalConfigPath,
} from './file.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stoneforge-test-'));
  return tempDir;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// findStoneforgeDir Tests
// ============================================================================

describe('findStoneforgeDir', () => {
  let tempDir: string;
  const originalEnv = process.env.STONEFORGE_ROOT;

  beforeEach(() => {
    tempDir = createTempDir();
    delete process.env.STONEFORGE_ROOT;
  });

  afterEach(() => {
    cleanup(tempDir);
    if (originalEnv === undefined) {
      delete process.env.STONEFORGE_ROOT;
    } else {
      process.env.STONEFORGE_ROOT = originalEnv;
    }
  });

  test('finds .stoneforge in current directory', () => {
    const stoneforgePath = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(stoneforgePath);

    const result = findStoneforgeDir(tempDir);
    expect(result).toBe(stoneforgePath);
  });

  test('finds .stoneforge in parent directory', () => {
    const subDir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subDir);
    const stoneforgePath = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(stoneforgePath);

    const result = findStoneforgeDir(subDir);
    expect(result).toBe(stoneforgePath);
  });

  test('finds .stoneforge in ancestor directory', () => {
    const subDir = path.join(tempDir, 'a', 'b', 'c');
    fs.mkdirSync(subDir, { recursive: true });
    const stoneforgePath = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(stoneforgePath);

    const result = findStoneforgeDir(subDir);
    expect(result).toBe(stoneforgePath);
  });

  test('returns undefined when not found', () => {
    const result = findStoneforgeDir(tempDir);
    expect(result).toBeUndefined();
  });

  test('prioritizes STONEFORGE_ROOT environment variable', () => {
    // Create .stoneforge in temp dir (walk-up search would find this)
    const localStoneforgePath = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(localStoneforgePath);

    // Create separate root location
    const rootDir = createTempDir();
    const rootStoneforgePath = path.join(rootDir, STONEFORGE_DIR);
    fs.mkdirSync(rootStoneforgePath);

    try {
      // Set STONEFORGE_ROOT to point to separate location
      process.env.STONEFORGE_ROOT = rootDir;

      // Should find the root location, not the local one
      const result = findStoneforgeDir(tempDir);
      expect(result).toBe(rootStoneforgePath);
    } finally {
      cleanup(rootDir);
    }
  });

  test('falls back to walk-up search when STONEFORGE_ROOT is set but .stoneforge does not exist', () => {
    // Create .stoneforge in temp dir (walk-up search finds this)
    const localStoneforgePath = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(localStoneforgePath);

    // Create a directory without .stoneforge
    const rootDir = createTempDir();

    try {
      // Set STONEFORGE_ROOT to point to directory without .stoneforge
      process.env.STONEFORGE_ROOT = rootDir;

      // Should fall back and find the local one
      const result = findStoneforgeDir(tempDir);
      expect(result).toBe(localStoneforgePath);
    } finally {
      cleanup(rootDir);
    }
  });

  test('ignores STONEFORGE_ROOT if .stoneforge path is a file not directory', () => {
    // Create .stoneforge in temp dir (walk-up search finds this)
    const localStoneforgePath = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(localStoneforgePath);

    // Create a root with .stoneforge as a file (not directory)
    const rootDir = createTempDir();
    const rootStoneforgePath = path.join(rootDir, STONEFORGE_DIR);
    fs.writeFileSync(rootStoneforgePath, 'not a directory');

    try {
      // Set STONEFORGE_ROOT to point to directory with .stoneforge file
      process.env.STONEFORGE_ROOT = rootDir;

      // Should fall back and find the local one since root's .stoneforge is not a directory
      const result = findStoneforgeDir(tempDir);
      expect(result).toBe(localStoneforgePath);
    } finally {
      cleanup(rootDir);
    }
  });

  test('STONEFORGE_ROOT works with worktree simulation', () => {
    // Simulate workspace root with .stoneforge
    const workspaceRoot = createTempDir();
    const workspaceStoneforge = path.join(workspaceRoot, STONEFORGE_DIR);
    fs.mkdirSync(workspaceStoneforge);

    // Simulate worktree inside .stoneforge directory (no separate .stoneforge folder in worktree)
    const worktree = path.join(tempDir, '.stoneforge', '.worktrees', 'worker-alice-task-123');
    fs.mkdirSync(worktree, { recursive: true });

    try {
      // Set STONEFORGE_ROOT to workspace (as spawner would)
      process.env.STONEFORGE_ROOT = workspaceRoot;

      // When running from worktree, should find workspace's .stoneforge
      const result = findStoneforgeDir(worktree);
      expect(result).toBe(workspaceStoneforge);
    } finally {
      cleanup(workspaceRoot);
    }
  });
});

// ============================================================================
// discoverConfigFile Tests
// ============================================================================

describe('discoverConfigFile', () => {
  let tempDir: string;
  const originalEnv = process.env.STONEFORGE_ROOT;

  beforeEach(() => {
    tempDir = createTempDir();
    delete process.env.STONEFORGE_ROOT;
  });

  afterEach(() => {
    cleanup(tempDir);
    if (originalEnv === undefined) {
      delete process.env.STONEFORGE_ROOT;
    } else {
      process.env.STONEFORGE_ROOT = originalEnv;
    }
  });

  test('returns override path when provided', () => {
    const overridePath = path.join(tempDir, 'custom', 'config.yaml');
    const result = discoverConfigFile(overridePath, tempDir);

    expect(result.path).toBe(overridePath);
    expect(result.exists).toBe(false);
  });

  test('discovers config in .stoneforge directory', () => {
    const stoneforgeDir = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(stoneforgeDir);
    const configPath = path.join(stoneforgeDir, CONFIG_FILE_NAME);
    fs.writeFileSync(configPath, 'actor: test');

    const result = discoverConfigFile(undefined, tempDir);
    expect(result.path).toBe(configPath);
    expect(result.exists).toBe(true);
    expect(result.stoneforgeDir).toBe(stoneforgeDir);
  });

  test('returns expected path even when config does not exist', () => {
    const stoneforgeDir = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(stoneforgeDir);

    const result = discoverConfigFile(undefined, tempDir);
    expect(result.path).toBe(path.join(stoneforgeDir, CONFIG_FILE_NAME));
    expect(result.exists).toBe(false);
    expect(result.stoneforgeDir).toBe(stoneforgeDir);
  });

  test('respects STONEFORGE_ROOT for config discovery', () => {
    // Create .stoneforge in local dir
    const localStoneforgeDir = path.join(tempDir, STONEFORGE_DIR);
    fs.mkdirSync(localStoneforgeDir);
    fs.writeFileSync(path.join(localStoneforgeDir, CONFIG_FILE_NAME), 'actor: local');

    // Create .stoneforge in root dir
    const rootDir = createTempDir();
    const rootStoneforgeDir = path.join(rootDir, STONEFORGE_DIR);
    fs.mkdirSync(rootStoneforgeDir);
    const rootConfigPath = path.join(rootStoneforgeDir, CONFIG_FILE_NAME);
    fs.writeFileSync(rootConfigPath, 'actor: root');

    try {
      process.env.STONEFORGE_ROOT = rootDir;

      const result = discoverConfigFile(undefined, tempDir);
      expect(result.path).toBe(rootConfigPath);
      expect(result.exists).toBe(true);
      expect(result.stoneforgeDir).toBe(rootStoneforgeDir);
    } finally {
      cleanup(rootDir);
    }
  });
});

// ============================================================================
// Global Config Path Tests
// ============================================================================

describe('Global Config Paths', () => {
  test('getGlobalConfigDir returns path in home directory', () => {
    const result = getGlobalConfigDir();
    expect(result).toBe(path.join(os.homedir(), STONEFORGE_DIR));
  });

  test('getGlobalConfigPath returns config.yaml in global dir', () => {
    const result = getGlobalConfigPath();
    expect(result).toBe(path.join(os.homedir(), STONEFORGE_DIR, CONFIG_FILE_NAME));
  });
});
