/**
 * OpenCode Interactive Provider Tests
 *
 * Tests that the OpenCode interactive provider correctly constructs
 * shell commands, particularly the --prompt flag for initial prompts.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Mock node-pty before importing the provider
const mockPtyProcess = {
  pid: 12345,
  onData: mock(() => {}),
  onExit: mock(() => {}),
  write: mock(() => {}),
  resize: mock(() => {}),
  kill: mock(() => {}),
};

const mockSpawn = mock(() => mockPtyProcess);

mock.module('node-pty', () => ({
  spawn: mockSpawn,
}));

// Import after mocking
const { OpenCodeInteractiveProvider } = await import('./interactive.js');

describe('OpenCodeInteractiveProvider', () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockPtyProcess.onData.mockClear();
    mockPtyProcess.onExit.mockClear();
    mockPtyProcess.write.mockClear();
  });

  describe('spawn', () => {
    it('should include --prompt flag when initialPrompt is provided', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');
      const prompt = 'You are a helpful assistant. Do the task.';

      await provider.spawn({
        workingDirectory: '/tmp/test',
        initialPrompt: prompt,
      });

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      const [shell, args] = mockSpawn.mock.calls[0];
      expect(shell).toBe('/bin/bash');

      // args should be: ['-l', '-c', '<command> --prompt "$1"', '_', <prompt>]
      expect(args).toHaveLength(5);
      expect(args[0]).toBe('-l');
      expect(args[1]).toBe('-c');
      expect(args[2]).toContain('--prompt "$1"');
      expect(args[3]).toBe('_');
      expect(args[4]).toBe(prompt);
    });

    it('should NOT include --prompt or $1 when no initialPrompt is provided', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');

      await provider.spawn({
        workingDirectory: '/tmp/test',
      });

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      const [_shell, args] = mockSpawn.mock.calls[0];

      // args should be: ['-l', '-c', '<command>']
      expect(args).toHaveLength(3);
      expect(args[0]).toBe('-l');
      expect(args[1]).toBe('-c');
      expect(args[2]).not.toContain('$1');
      expect(args[2]).not.toContain('--prompt');
    });

    it('should use exec to replace the shell process', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');

      await provider.spawn({
        workingDirectory: '/tmp/test',
      });

      const [_shell, args] = mockSpawn.mock.calls[0];
      expect(args[2]).toMatch(/^exec /);
    });

    it('should pass --model flag when model is provided', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');

      await provider.spawn({
        workingDirectory: '/tmp/test',
        model: 'anthropic/claude-sonnet-4-5-20250929',
      });

      const [_shell, args] = mockSpawn.mock.calls[0];
      const command = args[2] as string;
      expect(command).toContain('--model');
    });

    it('should pass --session flag when resumeSessionId is provided', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');

      await provider.spawn({
        workingDirectory: '/tmp/test',
        resumeSessionId: 'session-abc123',
      });

      const [_shell, args] = mockSpawn.mock.calls[0];
      const command = args[2] as string;
      expect(command).toContain('--session');
    });

    it('should include working directory as positional arg in the command', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');

      await provider.spawn({
        workingDirectory: '/tmp/test-project',
      });

      const [_shell, args] = mockSpawn.mock.calls[0];
      const command = args[2] as string;
      // The command should end with the shell-quoted directory path
      expect(command).toContain("'/tmp/test-project'");
    });

    it('should include working directory after flags in the command', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');

      await provider.spawn({
        workingDirectory: '/tmp/test-project',
        model: 'anthropic/claude-sonnet-4-5-20250929',
        initialPrompt: 'Hello',
      });

      const [_shell, args] = mockSpawn.mock.calls[0];
      const command = args[2] as string;
      // Directory should appear after --model flag and before --prompt
      expect(command).toContain('--model');
      expect(command).toContain("'/tmp/test-project'");
      // Directory should be the last arg before --prompt "$1"
      expect(command).toMatch(/\/tmp\/test-project'.*--prompt "\$1"$/);
    });

    it('should set OPENCODE_PERMISSION env var for permission bypass', async () => {
      const provider = new OpenCodeInteractiveProvider('/usr/bin/opencode');

      await provider.spawn({
        workingDirectory: '/tmp/test',
      });

      const [_shell, _args, opts] = mockSpawn.mock.calls[0];
      expect(opts.env.OPENCODE_PERMISSION).toBe(JSON.stringify({ '*': 'allow' }));
    });
  });
});
