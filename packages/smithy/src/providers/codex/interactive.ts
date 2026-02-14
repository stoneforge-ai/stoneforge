/**
 * Codex Interactive Provider
 *
 * Implements the InteractiveProvider interface by spawning the `codex` CLI
 * in a PTY. Mirrors the OpenCode interactive provider pattern.
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
// Codex Interactive Session
// ============================================================================

class CodexInteractiveSession implements InteractiveSession {
  private ptyProcess: IPty;
  private sessionId: ProviderSessionId | undefined;

  readonly pid?: number;

  constructor(ptyProcess: IPty) {
    this.ptyProcess = ptyProcess;
    this.pid = ptyProcess.pid;

    // Listen for thread/session ID in output and auto-respond to terminal queries.
    // Codex sends DSR (Device Status Report) \x1b[6n on startup to query cursor
    // position. When no terminal emulator (e.g. xterm.js) is connected to respond,
    // codex times out and exits. We auto-respond with a default cursor position
    // so codex can start regardless of whether a terminal client is attached.
    this.ptyProcess.onData((data: string) => {
      if (data.includes('\x1b[6n')) {
        this.ptyProcess.write('\x1b[1;1R');
      }

      if (!this.sessionId) {
        const match = data.match(/(?:Thread|Session|thr_)[:=\s]*([a-z0-9_-]+)/i);
        if (match) {
          this.sessionId = match[1];
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
// Codex Interactive Provider
// ============================================================================

/**
 * Codex interactive provider that spawns the `codex` CLI in a PTY.
 */
export class CodexInteractiveProvider implements InteractiveProvider {
  readonly name = 'codex-interactive';
  private readonly executablePath: string;

  constructor(executablePath = 'codex') {
    this.executablePath = executablePath;
  }

  async spawn(options: InteractiveSpawnOptions): Promise<InteractiveSession> {
    const args = this.buildArgs(options);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...options.environmentVariables,
    };
    if (options.stoneforgeRoot) {
      env.STONEFORGE_ROOT = options.stoneforgeRoot;
    }

    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;

    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';

    // Build the CLI command string (simple args only — not the prompt).
    // Use `exec` so the CLI replaces the shell process.
    const codexCommand = 'exec ' + [shellQuote(this.executablePath), ...args].join(' ');

    // Spawn PTY using bash -l -c to run the command in a login shell.
    // When an initial prompt is provided, it's passed as a bash positional
    // parameter ($1) via the process argv — bypasses shell parsing entirely.
    const shellArgs: string[] = process.platform === 'win32'
      ? []
      : options.initialPrompt
        ? ['-l', '-c', codexCommand + ' "$1"', '_', options.initialPrompt]
        : ['-l', '-c', codexCommand];

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: options.workingDirectory,
      env,
    });

    const session = new CodexInteractiveSession(ptyProcess);

    // On Windows, write the command to cmd.exe stdin (bash -c handles this on Unix)
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          ptyProcess.write(codexCommand + '\r');
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
      args.push('resume', shellQuote(options.resumeSessionId), '--full-auto');
    } else {
      args.push('--full-auto', '--cd', shellQuote(options.workingDirectory));
    }

    // Add model flag if provided
    if (options.model) {
      args.push('--model', shellQuote(options.model));
    }

    return args;
  }
}
