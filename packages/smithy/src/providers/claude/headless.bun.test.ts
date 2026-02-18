/**
 * Claude Headless Provider Tests
 *
 * Tests for the ClaudeHeadlessProvider, covering:
 * - Model passthrough to SDK options
 * - Login shell spawning for custom executables
 * - Shell command construction with correct args
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import type { HeadlessSpawnOptions } from '../types.js';
import type { Options as SDKOptions, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';

// ============================================================================
// Module-level mocks
// ============================================================================

/**
 * Captured SDK options from the most recent sdkQuery call.
 * We mock the SDK to capture these instead of actually spawning.
 */
let capturedSdkOptions: SDKOptions | undefined;

/**
 * Captured child_process.spawn calls: [command, args, options].
 */
let capturedSpawnCalls: Array<{ command: string; args: string[]; options: unknown }> = [];

// Mock child_process.spawn to capture calls without actually spawning
const mockChildProcess = {
  stdin: { write: mock(() => {}), end: mock(() => {}) },
  stdout: { on: mock(() => {}) },
  stderr: { on: mock(() => {}) },
  killed: false,
  exitCode: null,
  pid: 12345,
  kill: mock(() => true),
  on: mock(() => {}),
  once: mock(() => {}),
  off: mock(() => {}),
};

mock.module('node:child_process', () => ({
  spawn: (command: string, args: string[], options: unknown) => {
    capturedSpawnCalls.push({ command, args, options });
    return mockChildProcess;
  },
}));

// Mock the SDK query function to capture options and return a minimal async generator
mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ options }: { prompt: unknown; options?: SDKOptions }) => {
    capturedSdkOptions = options;
    // Return a minimal Query-like async generator that completes immediately
    const gen = (async function* () {
      // Yield nothing — tests only inspect captured options
    })();
    // Add required Query methods
    Object.assign(gen, {
      interrupt: mock(async () => {}),
      close: mock(() => {}),
      streamInput: mock(async () => {}),
    });
    return gen;
  },
}));

// ============================================================================
// Tests
// ============================================================================

describe('ClaudeHeadlessProvider', () => {
  beforeEach(() => {
    capturedSdkOptions = undefined;
    capturedSpawnCalls = [];
  });

  describe('spawn() model passthrough', () => {
    it('should include model in SDK options when provided', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider();
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
        model: 'claude-sonnet-4-20250514',
      };

      const session = await provider.spawn(options);
      session.close();

      expect(capturedSdkOptions).toBeDefined();
      expect(capturedSdkOptions!.model).toBe('claude-sonnet-4-20250514');
    });

    it('should not include model in SDK options when not provided', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider();
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      expect(capturedSdkOptions).toBeDefined();
      expect(capturedSdkOptions!.model).toBeUndefined();
    });

    it('should preserve other SDK options when model is specified', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider();
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
        model: 'claude-opus-4-20250514',
        resumeSessionId: 'session-123',
      };

      const session = await provider.spawn(options);
      session.close();

      expect(capturedSdkOptions).toBeDefined();
      expect(capturedSdkOptions!.model).toBe('claude-opus-4-20250514');
      expect(capturedSdkOptions!.resume).toBe('session-123');
      expect(capturedSdkOptions!.cwd).toBe('/test/dir');
    });
  });

  describe('spawnClaudeCodeProcess for custom executable', () => {
    it('should NOT set spawnClaudeCodeProcess when using default "claude"', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider('claude');
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      expect(capturedSdkOptions).toBeDefined();
      expect(capturedSdkOptions!.spawnClaudeCodeProcess).toBeUndefined();
    });

    it('should NOT set spawnClaudeCodeProcess when no executable path is set', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider();
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      expect(capturedSdkOptions).toBeDefined();
      expect(capturedSdkOptions!.spawnClaudeCodeProcess).toBeUndefined();
    });

    it('should set spawnClaudeCodeProcess when custom executable is configured', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider('claude2');
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      expect(capturedSdkOptions).toBeDefined();
      expect(capturedSdkOptions!.spawnClaudeCodeProcess).toBeDefined();
      expect(typeof capturedSdkOptions!.spawnClaudeCodeProcess).toBe('function');
    });
  });

  describe('login shell command construction', () => {
    it('should spawn /bin/bash with -l -c args containing the custom executable', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider('claude2');
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      // Retrieve the captured spawnClaudeCodeProcess function
      expect(capturedSdkOptions).toBeDefined();
      const spawnFn = capturedSdkOptions!.spawnClaudeCodeProcess;
      expect(spawnFn).toBeDefined();

      // Invoke the spawn function with mock SpawnOptions
      const mockSpawnOpts: SpawnOptions = {
        command: 'claude2',
        args: ['--print', '--output-format', 'json'],
        cwd: '/test/dir',
        env: { HOME: '/home/test', PATH: '/usr/bin' },
        signal: new AbortController().signal,
      };

      capturedSpawnCalls = [];
      spawnFn!(mockSpawnOpts);

      // Verify child_process.spawn was called correctly
      expect(capturedSpawnCalls).toHaveLength(1);
      const call = capturedSpawnCalls[0];
      expect(call.command).toBe('/bin/bash');
      expect(call.args[0]).toBe('-l');
      expect(call.args[1]).toBe('-c');
      // The third arg should be the shell command string
      expect(call.args).toHaveLength(3);
      const shellCmd = call.args[2];
      expect(shellCmd).toContain("'claude2'");
      expect(shellCmd).toContain("'--print'");
      expect(shellCmd).toContain("'--output-format'");
      expect(shellCmd).toContain("'json'");
    });

    it('should pass cwd and env through to child_process.spawn', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider('my-custom-claude');
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      const spawnFn = capturedSdkOptions!.spawnClaudeCodeProcess!;
      const testEnv = { HOME: '/home/test', CUSTOM_VAR: 'value' };

      const mockSpawnOpts: SpawnOptions = {
        command: 'my-custom-claude',
        args: ['--arg1'],
        cwd: '/work/dir',
        env: testEnv,
        signal: new AbortController().signal,
      };

      capturedSpawnCalls = [];
      spawnFn(mockSpawnOpts);

      expect(capturedSpawnCalls).toHaveLength(1);
      const call = capturedSpawnCalls[0];
      const spawnOptions = call.options as { cwd?: string; env?: unknown; stdio?: unknown };
      expect(spawnOptions.cwd).toBe('/work/dir');
      expect(spawnOptions.env).toBe(testEnv);
      expect(spawnOptions.stdio).toEqual(['pipe', 'pipe', 'pipe']);
    });

    it('should shell-quote executable and args to prevent injection', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider("my'exec");
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      const spawnFn = capturedSdkOptions!.spawnClaudeCodeProcess!;

      const mockSpawnOpts: SpawnOptions = {
        command: "my'exec",
        args: ["--arg='val'", 'normal-arg'],
        cwd: '/test/dir',
        env: {},
        signal: new AbortController().signal,
      };

      capturedSpawnCalls = [];
      spawnFn(mockSpawnOpts);

      const shellCmd = capturedSpawnCalls[0].args[2];
      // The executable name with quote should be properly escaped
      expect(shellCmd).toContain("'my'\\''exec'");
      // Arg with quotes should also be properly escaped
      expect(shellCmd).toContain("'--arg='\\''val'\\'''");
    });

    it('should kill the child process when abort signal fires', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider('claude2');
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      const spawnFn = capturedSdkOptions!.spawnClaudeCodeProcess!;
      const abortController = new AbortController();

      const mockSpawnOpts: SpawnOptions = {
        command: 'claude2',
        args: [],
        cwd: '/test/dir',
        env: {},
        signal: abortController.signal,
      };

      capturedSpawnCalls = [];
      // Reset kill mock
      mockChildProcess.kill = mock(() => true);
      spawnFn(mockSpawnOpts);

      // Signal abort
      abortController.abort();

      // The spawn function wires abort → child.kill('SIGTERM')
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should kill immediately if signal is already aborted', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider('claude2');
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
      };

      const session = await provider.spawn(options);
      session.close();

      const spawnFn = capturedSdkOptions!.spawnClaudeCodeProcess!;
      const abortController = new AbortController();
      abortController.abort(); // Already aborted before calling spawn

      const mockSpawnOpts: SpawnOptions = {
        command: 'claude2',
        args: [],
        cwd: '/test/dir',
        env: {},
        signal: abortController.signal,
      };

      capturedSpawnCalls = [];
      mockChildProcess.kill = mock(() => true);
      spawnFn(mockSpawnOpts);

      // Should kill immediately since signal was already aborted
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('provider setup', () => {
    it('should have correct provider name', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider();
      expect(provider.name).toBe('claude-headless');
    });

    it('should accept custom executable path', async () => {
      const { ClaudeHeadlessProvider } = await import('./headless.js');
      const provider = new ClaudeHeadlessProvider('/usr/local/bin/claude-dev');
      expect(provider.name).toBe('claude-headless');
    });
  });
});
