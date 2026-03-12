/**
 * Plugin API Integration Tests
 *
 * Tests for TB-O23a: Plugin System REST endpoints
 *
 * These tests verify the plugin API endpoints work correctly.
 * They require the orchestrator server to be running.
 */

import { describe, it, expect, beforeAll, afterAll, setDefaultTimeout } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { resolve, dirname } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

// Integration tests spawn an orchestrator server which can take time to start.
// The default 5000ms test timeout is too short for beforeAll server startup.
// Use STARTUP_TIMEOUT_MS + buffer for individual test execution time.
setDefaultTimeout(30_000);

// Test configuration
const TEST_PORT = 3458; // Use a different port than default
const SERVER_URL = `http://localhost:${TEST_PORT}`;
const TEST_DB_PATH = '/tmp/stoneforge-plugin-api-test.db';
const STARTUP_POLL_INTERVAL_MS = 100;
// Orchestrator startup can take several seconds (git/worktree init, session restore).
// Use a generous timeout to avoid flaky startup failures on slower machines/CI.
const STARTUP_TIMEOUT_MS = Number(process.env.ORCHESTRATOR_TEST_STARTUP_TIMEOUT_MS ?? 20_000);

// Server process
let serverProcess: Subprocess<'ignore', 'pipe', 'pipe'> | null = null;

// ============================================================================
// Server Lifecycle
// ============================================================================

async function startServer(): Promise<void> {
  const serverPath = resolve(dirname(import.meta.path), 'index.ts');

  // Start the server
  serverProcess = spawn({
    cmd: ['bun', 'run', serverPath],
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      // Use a test database in /tmp to work in both main repo and worktrees
      STONEFORGE_DB_PATH: TEST_DB_PATH,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdoutPromise = serverProcess.stdout
    ? new Response(serverProcess.stdout).text().catch(() => '')
    : Promise.resolve('');
  const stderrPromise = serverProcess.stderr
    ? new Response(serverProcess.stderr).text().catch(() => '')
    : Promise.resolve('');

  let exitCode: number | null = null;
  serverProcess.exited
    .then((code) => {
      exitCode = code;
    })
    .catch(() => {
      exitCode = -1;
    });

  const truncateOutput = (text: string, max = 4000) => {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n... (truncated ${text.length - max} chars)`;
  };

  // Wait for server to start
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exitCode !== null) {
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
      throw new Error(
        `Server exited before startup (exit code ${exitCode}).\n` +
          `stdout:\n${truncateOutput(stdout)}\n` +
          `stderr:\n${truncateOutput(stderr)}`
      );
    }
    try {
      const response = await fetch(`${SERVER_URL}/api/health`);
      if (response.ok) {
        console.log('[test] Server started successfully');
        return;
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(STARTUP_POLL_INTERVAL_MS);
  }

  if (serverProcess) {
    serverProcess.kill();
  }
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  throw new Error(
    `Server failed to start within ${STARTUP_TIMEOUT_MS}ms.\n` +
      `stdout:\n${truncateOutput(stdout)}\n` +
      `stderr:\n${truncateOutput(stderr)}`
  );
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function cleanupTestDb(): void {
  // Clean up SQLite database files (main db, write-ahead log, and shared memory)
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${TEST_DB_PATH}${suffix}`;
    if (existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Plugin API Integration Tests', () => {
  beforeAll(async () => {
    // Clean up any stale test database from previous runs
    cleanupTestDb();
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
    cleanupTestDb();
  });

  describe('GET /api/plugins/builtin', () => {
    it('should list all built-in plugins', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/builtin`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.plugins).toBeDefined();
      expect(Array.isArray(data.plugins)).toBe(true);
      expect(data.count).toBeGreaterThan(0);

      // Check for expected built-in plugins
      const names = data.plugins.map((p: { name: string }) => p.name);
      expect(names).toContain('gc-ephemeral-tasks');
      expect(names).toContain('cleanup-stale-worktrees');
      expect(names).toContain('gc-ephemeral-workflows');
      expect(names).toContain('health-check-agents');
    });
  });

  describe('GET /api/plugins/builtin/:name', () => {
    it('should get details of a built-in plugin', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/builtin/gc-ephemeral-tasks`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.plugin).toBeDefined();
      expect(data.plugin.name).toBe('gc-ephemeral-tasks');
      expect(data.plugin.type).toBe('command');
      expect(data.plugin.command).toContain('sf gc workflows');
    });

    it('should return 404 for unknown plugin', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/builtin/unknown-plugin`);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/plugins/validate', () => {
    it('should validate a valid command plugin', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'command',
          name: 'test-plugin',
          command: 'echo hello',
        }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.valid).toBe(true);
      expect(data.errors).toHaveLength(0);
    });

    it('should reject an invalid plugin', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'command',
          name: '', // Empty name
          command: 'echo hello',
        }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.valid).toBe(false);
      expect(data.errors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/plugins/execute', () => {
    it('should execute a simple command plugin', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin: {
            type: 'command',
            name: 'echo-test',
            command: 'echo "hello from test"',
          },
        }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.result).toBeDefined();
      expect(data.result.success).toBe(true);
      expect(data.result.pluginName).toBe('echo-test');
      expect(data.result.pluginType).toBe('command');
      expect(data.result.stdout).toContain('hello from test');
      expect(data.result.exitCode).toBe(0);
      expect(data.result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should capture exit code for failed commands', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin: {
            type: 'command',
            name: 'fail-test',
            command: 'exit 42',
          },
        }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.result.success).toBe(false);
      expect(data.result.exitCode).toBe(42);
    });
  });

  describe('POST /api/plugins/execute-batch', () => {
    it('should execute multiple plugins in sequence', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/execute-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugins: [
            { type: 'command', name: 'first', command: 'echo "first"' },
            { type: 'command', name: 'second', command: 'echo "second"' },
          ],
        }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.total).toBe(2);
      expect(data.succeeded).toBe(2);
      expect(data.failed).toBe(0);
      expect(data.allSucceeded).toBe(true);
      expect(data.results).toHaveLength(2);
    });

    it('should continue on error by default', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/execute-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugins: [
            { type: 'command', name: 'first', command: 'echo "first"' },
            { type: 'command', name: 'fail', command: 'exit 1' },
            { type: 'command', name: 'third', command: 'echo "third"' },
          ],
        }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.total).toBe(3);
      expect(data.succeeded).toBe(2);
      expect(data.failed).toBe(1);
      expect(data.skipped).toBe(0);
      expect(data.allSucceeded).toBe(false);
    });

    it('should stop on error when option is set', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/execute-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugins: [
            { type: 'command', name: 'first', command: 'echo "first"' },
            { type: 'command', name: 'fail', command: 'exit 1' },
            { type: 'command', name: 'third', command: 'echo "third"' },
          ],
          options: { stopOnError: true },
        }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.total).toBe(3);
      expect(data.succeeded).toBe(1);
      expect(data.failed).toBe(1);
      expect(data.skipped).toBe(1);
    });
  });

  describe('POST /api/plugins/execute-builtin/:name', () => {
    it('should execute a built-in plugin by name', async () => {
      // Execute cleanup-stale-worktrees which runs git worktree prune
      // This should work in any git repository
      const response = await fetch(`${SERVER_URL}/api/plugins/execute-builtin/cleanup-stale-worktrees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.result).toBeDefined();
      expect(data.result.pluginName).toBe('cleanup-stale-worktrees');
      expect(data.result.pluginType).toBe('command');
      // Note: May succeed or fail depending on git setup, but should have valid structure
      expect(typeof data.result.success).toBe('boolean');
    });

    it('should return 404 for unknown built-in plugin', async () => {
      const response = await fetch(`${SERVER_URL}/api/plugins/execute-builtin/unknown-plugin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });
});
