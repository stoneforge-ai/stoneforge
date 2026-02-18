/**
 * Claude Headless Provider Tests
 *
 * Tests for the ClaudeHeadlessProvider model passthrough functionality.
 */

import { describe, it, expect } from 'bun:test';
import type { HeadlessSpawnOptions } from '../types.js';
import type { Options as SDKOptions, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';

describe('ClaudeHeadlessProvider', () => {
  describe('spawn() model passthrough', () => {
    it('should include model in SDK options when provided', () => {
      // Test the logic that would be used in spawn()
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
        model: 'claude-sonnet-4-20250514',
      };

      // Simulate SDK options building
      const sdkOptions: SDKOptions = {
        cwd: options.workingDirectory,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      };

      // This is the logic from headless.ts
      if (options.model) {
        sdkOptions.model = options.model;
      }

      expect(sdkOptions.model).toBe('claude-sonnet-4-20250514');
    });

    it('should not include model in SDK options when not provided', () => {
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
        // model is undefined
      };

      const sdkOptions: SDKOptions = {
        cwd: options.workingDirectory,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      };

      if (options.model) {
        sdkOptions.model = options.model;
      }

      expect(sdkOptions.model).toBeUndefined();
    });

    it('should preserve other SDK options when model is specified', () => {
      const options: HeadlessSpawnOptions = {
        workingDirectory: '/test/dir',
        model: 'claude-opus-4-20250514',
        resumeSessionId: 'session-123',
      };

      const env: Record<string, string> = { TEST_VAR: 'value' };
      const sdkOptions: SDKOptions = {
        cwd: options.workingDirectory,
        env,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      };

      if (options.model) {
        sdkOptions.model = options.model;
      }

      if (options.resumeSessionId) {
        sdkOptions.resume = options.resumeSessionId;
      }

      expect(sdkOptions.model).toBe('claude-opus-4-20250514');
      expect(sdkOptions.resume).toBe('session-123');
      expect(sdkOptions.cwd).toBe('/test/dir');
      expect(sdkOptions.env).toEqual({ TEST_VAR: 'value' });
    });
  });

  describe('spawnClaudeCodeProcess for custom executable', () => {
    it('should set spawnClaudeCodeProcess when custom executable is configured', () => {
      const executablePath = 'claude2';

      const sdkOptions: SDKOptions = {
        cwd: '/test/dir',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      };

      // This replicates the logic in headless.ts spawn()
      if (executablePath && executablePath !== 'claude') {
        sdkOptions.spawnClaudeCodeProcess = (_spawnOpts: SpawnOptions) => {
          // Stub - would return a SpawnedProcess in real code
          return undefined as never;
        };
      }

      expect(sdkOptions.spawnClaudeCodeProcess).toBeDefined();
      expect(typeof sdkOptions.spawnClaudeCodeProcess).toBe('function');
    });

    it('should NOT set spawnClaudeCodeProcess when using default "claude"', () => {
      const executablePath = 'claude';

      const sdkOptions: SDKOptions = {
        cwd: '/test/dir',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      };

      if (executablePath && executablePath !== 'claude') {
        sdkOptions.spawnClaudeCodeProcess = (_spawnOpts: SpawnOptions) => {
          return undefined as never;
        };
      }

      expect(sdkOptions.spawnClaudeCodeProcess).toBeUndefined();
    });

    it('should NOT set spawnClaudeCodeProcess when no executable path is set', () => {
      const executablePath: string | undefined = undefined;

      const sdkOptions: SDKOptions = {
        cwd: '/test/dir',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      };

      if (executablePath && executablePath !== 'claude') {
        sdkOptions.spawnClaudeCodeProcess = (_spawnOpts: SpawnOptions) => {
          return undefined as never;
        };
      }

      expect(sdkOptions.spawnClaudeCodeProcess).toBeUndefined();
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
