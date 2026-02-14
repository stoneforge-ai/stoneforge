/**
 * OpenCode Interactive Provider
 *
 * Implements the InteractiveProvider interface by spawning the `opencode` CLI
 * in a PTY. Mirrors the Claude interactive provider pattern.
 *
 * @module
 */

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

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ============================================================================
// OpenCode Interactive Session
// ============================================================================

class OpenCodeInteractiveSession implements InteractiveSession {
  private ptyProcess: IPty;
  private sessionId: ProviderSessionId | undefined;

  readonly pid?: number;

  constructor(ptyProcess: IPty) {
    this.ptyProcess = ptyProcess;
    this.pid = ptyProcess.pid;

    // Listen for session ID in output
    this.ptyProcess.onData((data: string) => {
      if (!this.sessionId) {
        // OpenCode may output session ID in different formats
        const sessionMatch = data.match(/Session:\s*([a-zA-Z0-9_-]+)/);
        if (sessionMatch) {
          this.sessionId = sessionMatch[1];
        }
      }
    });
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
// OpenCode Interactive Provider
// ============================================================================

/**
 * OpenCode interactive provider that spawns the `opencode` CLI in a PTY.
 */
export class OpenCodeInteractiveProvider implements InteractiveProvider {
  readonly name = 'opencode-interactive';
  private readonly executablePath: string;

  constructor(executablePath = 'opencode') {
    this.executablePath = executablePath;
  }

  async spawn(options: InteractiveSpawnOptions): Promise<InteractiveSession> {
    const args = this.buildArgs(options);

    // Build environment with permission bypass
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...options.environmentVariables,
      OPENCODE_PERMISSION: JSON.stringify({ '*': 'allow' }),
    };
    if (options.stoneforgeRoot) {
      env.STONEFORGE_ROOT = options.stoneforgeRoot;
    }

    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;

    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';

    // Build the CLI command string (simple args only — not the prompt).
    // Use `exec` so the CLI replaces the shell process — when the CLI exits,
    // the PTY exits immediately (no lingering shell to clean up).
    const opencodeCommand = 'exec ' + [shellQuote(this.executablePath), ...args].join(' ');

    // Spawn PTY using bash -l -c to run the command in a login shell.
    // When an initial prompt is provided, it's passed as a bash positional
    // parameter ($1) via the process argv — bypasses shell parsing entirely.
    const shellArgs: string[] = process.platform === 'win32'
      ? []
      : options.initialPrompt
        ? ['-l', '-c', opencodeCommand + ' "$1"', '_', options.initialPrompt]
        : ['-l', '-c', opencodeCommand];

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: options.workingDirectory,
      env,
    });

    const session = new OpenCodeInteractiveSession(ptyProcess);

    // On Windows, write the command to cmd.exe stdin (bash -c handles this on Unix)
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          ptyProcess.write(opencodeCommand + '\r');
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

  private buildArgs(options: InteractiveSpawnOptions): string[] {
    const args: string[] = [];

    if (options.resumeSessionId) {
      args.push('--continue', shellQuote(options.resumeSessionId));
    }

    // Pass model via --model flag (format: provider/model, e.g., 'anthropic/claude-sonnet-4-5-20250929')
    if (options.model) {
      args.push('--model', shellQuote(options.model));
    }

    return args;
  }
}
