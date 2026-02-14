/**
 * Daemon Commands - CLI operations for the dispatch daemon
 *
 * Provides commands for daemon management:
 * - daemon start: Start the dispatch daemon
 * - daemon stop: Stop the dispatch daemon
 * - daemon status: Show daemon status
 */

import * as readline from 'node:readline';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getOutputMode } from '@stoneforge/quarry/cli';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SERVER_URL = 'http://localhost:3456';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Gets the server URL from options or default
 */
function getServerUrl(options: DaemonOptions): string {
  return options.server ?? DEFAULT_SERVER_URL;
}

/**
 * Makes a request to the orchestrator server
 */
async function serverRequest(
  url: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? `Server returned ${response.status}`,
      };
    }

    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return {
        ok: false,
        error: 'Cannot connect to orchestrator server. Is it running?',
      };
    }
    return { ok: false, error: message };
  }
}

/**
 * Prompts user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// ============================================================================
// Common Options
// ============================================================================

interface DaemonOptions {
  server?: string;
}

const daemonOptions: CommandOption[] = [
  {
    name: 'server',
    short: 's',
    description: `Orchestrator server URL (default: ${DEFAULT_SERVER_URL})`,
    hasValue: true,
  },
];

// ============================================================================
// Daemon Start Command
// ============================================================================

async function daemonStartHandler(
  _args: string[],
  options: GlobalOptions & DaemonOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/start`;

  const result = await serverRequest(url, 'POST');

  if (!result.ok) {
    return failure(`Failed to start daemon: ${result.error}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { status?: string; message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.status ?? 'started');
  }

  return success(data, data.message ?? 'Daemon started');
}

export const daemonStartCommand: Command = {
  name: 'start',
  description: 'Start the dispatch daemon',
  usage: 'sf daemon start [options]',
  help: `Start the dispatch daemon.

The daemon handles automatic task dispatch to agents based on
configured rules and agent availability.

Options:
  -s, --server <url>    Orchestrator server URL (default: ${DEFAULT_SERVER_URL})

Examples:
  sf daemon start
  sf daemon start --server http://localhost:8080`,
  options: daemonOptions,
  handler: daemonStartHandler as Command['handler'],
};

// ============================================================================
// Daemon Stop Command
// ============================================================================

interface DaemonStopOptions extends DaemonOptions {
  force?: boolean;
}

const daemonStopOptions: CommandOption[] = [
  ...daemonOptions,
  {
    name: 'force',
    short: 'f',
    description: 'Skip confirmation prompt',
  },
];

async function daemonStopHandler(
  _args: string[],
  options: GlobalOptions & DaemonStopOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);

  // First check the daemon status
  const statusUrl = `${serverUrl}/api/daemon/status`;
  const statusResult = await serverRequest(statusUrl, 'GET');

  if (!statusResult.ok) {
    return failure(`Failed to check daemon status: ${statusResult.error}`, ExitCode.GENERAL_ERROR);
  }

  const statusData = statusResult.data as { running?: boolean; status?: string };

  // If daemon is not running, nothing to stop
  if (!statusData.running && statusData.status !== 'running') {
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ status: 'not_running', message: 'Daemon is not running' });
    }
    return success(null, 'Daemon is not running');
  }

  // Confirm before stopping unless --force is set
  if (!options.force) {
    const confirmed = await confirm(
      'Stopping the daemon will halt all automatic task dispatch. Continue?'
    );
    if (!confirmed) {
      return success(null, 'Cancelled');
    }
  }

  // Stop the daemon
  const stopUrl = `${serverUrl}/api/daemon/stop`;
  const result = await serverRequest(stopUrl, 'POST');

  if (!result.ok) {
    return failure(`Failed to stop daemon: ${result.error}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { status?: string; message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.status ?? 'stopped');
  }

  return success(data, data.message ?? 'Daemon stopped');
}

export const daemonStopCommand: Command = {
  name: 'stop',
  description: 'Stop the dispatch daemon',
  usage: 'sf daemon stop [options]',
  help: `Stop the dispatch daemon.

This will halt all automatic task dispatch. You will be prompted
for confirmation unless --force is specified.

Options:
  -s, --server <url>    Orchestrator server URL (default: ${DEFAULT_SERVER_URL})
  -f, --force           Skip confirmation prompt

Examples:
  sf daemon stop
  sf daemon stop --force
  sf daemon stop --server http://localhost:8080`,
  options: daemonStopOptions,
  handler: daemonStopHandler as Command['handler'],
};

// ============================================================================
// Daemon Status Command
// ============================================================================

async function daemonStatusHandler(
  _args: string[],
  options: GlobalOptions & DaemonOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/status`;

  const result = await serverRequest(url, 'GET');

  if (!result.ok) {
    return failure(`Failed to get daemon status: ${result.error}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as {
    status?: string;
    running?: boolean;
    uptime?: number;
    tasksDispatched?: number;
    lastDispatchAt?: string;
  };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.status ?? (data.running ? 'running' : 'stopped'));
  }

  // Human-readable output
  const lines: string[] = [];
  const isRunning = data.running ?? data.status === 'running';

  lines.push(`Status:    ${isRunning ? 'running' : 'stopped'}`);

  if (data.uptime !== undefined) {
    const uptimeSeconds = Math.floor(data.uptime / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    lines.push(`Uptime:    ${hours}h ${minutes}m ${seconds}s`);
  }

  if (data.tasksDispatched !== undefined) {
    lines.push(`Dispatched: ${data.tasksDispatched} task(s)`);
  }

  if (data.lastDispatchAt) {
    lines.push(`Last dispatch: ${data.lastDispatchAt}`);
  }

  return success(data, lines.join('\n'));
}

export const daemonStatusCommand: Command = {
  name: 'status',
  description: 'Show daemon status',
  usage: 'sf daemon status [options]',
  help: `Show the current status of the dispatch daemon.

Displays whether the daemon is running, uptime, and dispatch statistics.

Options:
  -s, --server <url>    Orchestrator server URL (default: ${DEFAULT_SERVER_URL})

Examples:
  sf daemon status
  sf daemon status --json
  sf daemon status --server http://localhost:8080`,
  options: daemonOptions,
  handler: daemonStatusHandler as Command['handler'],
};

// ============================================================================
// Main Daemon Command
// ============================================================================

export const daemonCommand: Command = {
  name: 'daemon',
  description: 'Manage the dispatch daemon',
  usage: 'sf daemon <subcommand> [options]',
  help: `Manage the dispatch daemon.

The dispatch daemon handles automatic task assignment to agents
based on configured rules and agent availability.

Subcommands:
  start     Start the dispatch daemon
  stop      Stop the dispatch daemon
  status    Show daemon status

Options:
  -s, --server <url>    Orchestrator server URL (default: ${DEFAULT_SERVER_URL})

Examples:
  sf daemon start
  sf daemon stop
  sf daemon status`,
  subcommands: {
    start: daemonStartCommand,
    stop: daemonStopCommand,
    status: daemonStatusCommand,
  },
  handler: daemonStatusHandler as Command['handler'], // Default to status
  options: daemonOptions,
};
