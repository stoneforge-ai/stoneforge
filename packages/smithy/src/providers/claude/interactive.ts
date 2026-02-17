/**
 * Claude Interactive Provider
 *
 * Implements the InteractiveProvider interface by spawning the `claude` CLI
 * in a PTY. Extracted from the original spawner.ts to enable provider abstraction.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type {
  InteractiveProvider,
  InteractiveSession,
  InteractiveSpawnOptions,
  ProviderSessionId,
} from '../types.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Shell-quotes a string for safe inclusion in a bash command.
 */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Ensures node-pty's spawn-helper binary has execute permissions.
 * Package managers (especially bun) can strip the execute bit from native
 * binaries, and bun doesn't run postinstall scripts by default.
 * Only runs once per process.
 */
let spawnHelperFixed = false;
function ensureSpawnHelperPermissions(): void {
  if (spawnHelperFixed || process.platform === 'win32') return;
  spawnHelperFixed = true;
  try {
    const require = createRequire(import.meta.url);
    const nodePtyDir = dirname(require.resolve('node-pty/package.json'));
    const prebuildsDir = join(nodePtyDir, 'prebuilds');
    if (!existsSync(prebuildsDir)) return;
    for (const entry of readdirSync(prebuildsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const helper = join(prebuildsDir, entry.name, 'spawn-helper');
      if (existsSync(helper)) chmodSync(helper, 0o755);
    }
  } catch {
    // Best-effort — if we can't fix permissions, pty.spawn() will throw
    // a clear error anyway.
  }
}

// ============================================================================
// Claude Interactive Session
// ============================================================================

/**
 * A running Claude CLI interactive (PTY) session.
 */
class ClaudeInteractiveSession implements InteractiveSession {
  private ptyProcess: IPty;
  private sessionId: ProviderSessionId | undefined;

  readonly pid?: number;

  constructor(ptyProcess: IPty, sessionId?: ProviderSessionId) {
    this.ptyProcess = ptyProcess;
    this.pid = ptyProcess.pid;
    this.sessionId = sessionId;
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(): void {
    this.ptyProcess.kill();
  }

  onData(callback: (data: string) => void): void {
    this.ptyProcess.onData(callback);
  }

  onExit(callback: (code: number, signal?: number) => void): void {
    this.ptyProcess.onExit((e) => callback(e.exitCode, e.signal));
  }

  getSessionId(): ProviderSessionId | undefined {
    return this.sessionId;
  }
}

// ============================================================================
// Claude Interactive Provider
// ============================================================================

/**
 * Claude interactive provider that spawns the `claude` CLI in a PTY.
 */
export class ClaudeInteractiveProvider implements InteractiveProvider {
  readonly name = 'claude-interactive';
  private readonly executablePath: string;

  constructor(executablePath = 'claude') {
    this.executablePath = executablePath;
  }

  async spawn(options: InteractiveSpawnOptions): Promise<InteractiveSession> {
    // For new sessions, generate a UUID so we know the session ID upfront.
    // The Claude CLI accepts --session-id <uuid> to use a specific ID.
    // For resumed sessions, the ID comes from resumeSessionId.
    const sessionId = options.resumeSessionId ?? randomUUID();
    const args = this.buildArgs(options, sessionId);

    // Build environment
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...options.environmentVariables,
    };
    if (options.stoneforgeRoot) {
      env.STONEFORGE_ROOT = options.stoneforgeRoot;
    }

    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;

    // Build the CLI command string (simple args only — not the prompt)
    const claudeCommand = [shellQuote(this.executablePath), ...args].join(' ');

    // Spawn PTY using bash -l -c to run the command in a login shell.
    // When an initial prompt is provided, it's passed as a bash positional
    // parameter ($1) via the process argv — this bypasses shell parsing entirely,
    // so the prompt never needs escaping regardless of newlines, quotes, backticks,
    // or other special characters. The prompt goes through execvp() as a raw OS
    // process argument and bash expands "$1" to the exact value.
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const shellArgs: string[] = process.platform === 'win32'
      ? []
      : options.initialPrompt
        ? ['-l', '-c', claudeCommand + ' "$1"', '_', options.initialPrompt]
        : ['-l', '-c', claudeCommand];

    ensureSpawnHelperPermissions();

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: options.workingDirectory,
      env,
    });

    const session = new ClaudeInteractiveSession(ptyProcess, sessionId);

    // On Windows, write the command to cmd.exe stdin (bash -c handles this on Unix)
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          ptyProcess.write(claudeCommand + '\r');
          resolve();
        }, 100);
      });
    }

    return session;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`${this.executablePath} --version`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private buildArgs(options: InteractiveSpawnOptions, sessionId: string): string[] {
    const args: string[] = [
      '--dangerously-skip-permissions',
    ];

    if (options.resumeSessionId) {
      args.push('--resume', shellQuote(options.resumeSessionId));
    } else {
      args.push('--session-id', shellQuote(sessionId));
    }

    // Pass model if specified
    if (options.model) {
      args.push('--model', shellQuote(options.model));
    }

    return args;
  }
}
