/**
 * Daemon Commands - CLI operations for the dispatch daemon
 *
 * Provides commands for daemon management:
 * - daemon start: Start the dispatch daemon
 * - daemon stop: Stop the dispatch daemon
 * - daemon status: Show daemon status (including rate limit info)
 * - daemon sleep: Pause dispatch until a specified time
 * - daemon wake: Immediately resume dispatch
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
    isRunning?: boolean;
    running?: boolean;
    uptime?: number;
    tasksDispatched?: number;
    lastDispatchAt?: string;
    rateLimit?: {
      isPaused: boolean;
      limits: Array<{ executable: string; resetsAt: string }>;
      soonestReset?: string;
    };
  };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.status ?? ((data.isRunning ?? data.running) ? 'running' : 'stopped'));
  }

  // Human-readable output
  const lines: string[] = [];
  const isRunning = data.isRunning ?? data.running ?? data.status === 'running';

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

  // Rate limit / sleep status
  if (data.rateLimit) {
    const rl = data.rateLimit;
    lines.push('');
    lines.push(`Dispatch:  ${rl.isPaused ? '⏸ paused (rate limited)' : '▶ active'}`);

    if (rl.limits.length > 0) {
      lines.push('Rate-limited executables:');
      for (const limit of rl.limits) {
        const resetDate = new Date(limit.resetsAt);
        lines.push(`  - ${limit.executable}: resets ${formatRelativeTime(resetDate)}`);
      }
    }

    if (rl.soonestReset) {
      const soonest = new Date(rl.soonestReset);
      lines.push(`Soonest reset: ${formatRelativeTime(soonest)}`);
    }
  }

  return success(data, lines.join('\n'));
}

/**
 * Formats a date as a human-readable relative time string.
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff <= 0) {
    return 'now (expired)';
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (hours === 0 && minutes < 5) parts.push(`${seconds % 60}s`);

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${timeStr} (in ${parts.join(' ')})`;
}

export const daemonStatusCommand: Command = {
  name: 'status',
  description: 'Show daemon status',
  usage: 'sf daemon status [options]',
  help: `Show the current status of the dispatch daemon.

Displays whether the daemon is running, dispatch statistics, and
rate limit/sleep status including which executables are limited
and when they reset.

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
// Daemon Sleep Command
// ============================================================================

interface DaemonSleepOptions extends DaemonOptions {
  until?: string;
  duration?: string;
}

const daemonSleepOptions: CommandOption[] = [
  ...daemonOptions,
  {
    name: 'until',
    short: 'u',
    description: 'Sleep until a specific time (e.g., "3am", "Feb 22 at 9:30am", "tomorrow at 3pm")',
    hasValue: true,
  },
  {
    name: 'duration',
    short: 'd',
    description: 'Sleep for a duration in seconds',
    hasValue: true,
  },
];

async function daemonSleepHandler(
  _args: string[],
  options: GlobalOptions & DaemonSleepOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/sleep`;

  if (!options.until && !options.duration) {
    return failure(
      'Either --until or --duration is required.\n' +
      'Examples:\n' +
      '  sf daemon sleep --until "3am"\n' +
      '  sf daemon sleep --until "Feb 22 at 9:30am"\n' +
      '  sf daemon sleep --until "tomorrow at 3pm"\n' +
      '  sf daemon sleep --duration 3600',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (options.until && options.duration) {
    return failure(
      'Specify either --until or --duration, not both.',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const body: { until?: string; duration?: number } = {};

  if (options.until) {
    body.until = String(options.until);
  } else if (options.duration) {
    const duration = Number(options.duration);
    if (isNaN(duration) || duration <= 0) {
      return failure('Duration must be a positive number (seconds)', ExitCode.INVALID_ARGUMENTS);
    }
    body.duration = duration;
  }

  const result = await serverRequest(url, 'POST', body);

  if (!result.ok) {
    return failure(`Failed to put daemon to sleep: ${result.error}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { sleepUntil?: string; message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success(data.sleepUntil ?? 'sleeping');
  }

  const sleepUntilDate = data.sleepUntil ? new Date(data.sleepUntil) : undefined;
  const message = sleepUntilDate
    ? `Daemon dispatch paused until ${sleepUntilDate.toLocaleString()}`
    : (data.message ?? 'Daemon dispatch paused');

  return success(data, message);
}

export const daemonSleepCommand: Command = {
  name: 'sleep',
  description: 'Pause dispatch until a specified time',
  usage: 'sf daemon sleep [options]',
  help: `Pause the dispatch daemon until a specified time.

This manually puts the daemon into a rate-limit sleep state,
pausing all task dispatch until the specified time. Non-dispatch
polls (inbox, plan auto-complete, etc.) continue running.

Use this as a manual escape hatch when rate limit time parsing
fails or produces incorrect results.

Options:
  -s, --server <url>      Orchestrator server URL (default: ${DEFAULT_SERVER_URL})
  -u, --until <time>      Sleep until a specific time
  -d, --duration <secs>   Sleep for a duration in seconds

Time formats for --until:
  "3am"                   Next occurrence of 3:00 AM
  "9:30pm"                Next occurrence of 9:30 PM
  "Feb 22 at 9:30am"      Specific date and time
  "tomorrow at 3pm"       Tomorrow at 3:00 PM

Examples:
  sf daemon sleep --until "3am"
  sf daemon sleep --until "Feb 22 at 9:30am"
  sf daemon sleep --until "tomorrow at 3pm"
  sf daemon sleep --duration 3600`,
  options: daemonSleepOptions,
  handler: daemonSleepHandler as Command['handler'],
};

// ============================================================================
// Daemon Wake Command
// ============================================================================

async function daemonWakeHandler(
  _args: string[],
  options: GlobalOptions & DaemonOptions
): Promise<CommandResult> {
  const serverUrl = getServerUrl(options);
  const url = `${serverUrl}/api/daemon/wake`;

  const result = await serverRequest(url, 'POST');

  if (!result.ok) {
    return failure(`Failed to wake daemon: ${result.error}`, ExitCode.GENERAL_ERROR);
  }

  const mode = getOutputMode(options);
  const data = result.data as { message?: string };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    return success('awake');
  }

  return success(data, data.message ?? 'Daemon dispatch resumed. Rate limits cleared.');
}

export const daemonWakeCommand: Command = {
  name: 'wake',
  description: 'Immediately resume dispatch',
  usage: 'sf daemon wake [options]',
  help: `Immediately resume daemon dispatch.

Clears all rate limit entries and the sleep timer, allowing
the daemon to resume normal task dispatch on the next poll cycle.

Options:
  -s, --server <url>    Orchestrator server URL (default: ${DEFAULT_SERVER_URL})

Examples:
  sf daemon wake
  sf daemon wake --server http://localhost:8080`,
  options: daemonOptions,
  handler: daemonWakeHandler as Command['handler'],
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
  status    Show daemon status (including rate limit info)
  sleep     Pause dispatch until a specified time
  wake      Immediately resume dispatch

Options:
  -s, --server <url>    Orchestrator server URL (default: ${DEFAULT_SERVER_URL})

Examples:
  sf daemon start
  sf daemon stop
  sf daemon status
  sf daemon sleep --until "3am"
  sf daemon sleep --duration 3600
  sf daemon wake`,
  subcommands: {
    start: daemonStartCommand,
    stop: daemonStopCommand,
    status: daemonStatusCommand,
    sleep: daemonSleepCommand,
    wake: daemonWakeCommand,
  },
  handler: daemonStatusHandler as Command['handler'], // Default to status
  options: daemonOptions,
};
