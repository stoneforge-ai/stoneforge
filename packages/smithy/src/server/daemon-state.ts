/**
 * Daemon State Persistence
 *
 * Persists the dispatch daemon's running state across server restarts.
 * This allows the daemon to remember whether it was intentionally stopped
 * by the user, so it doesn't auto-restart during dev mode hot reloads.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROJECT_ROOT } from './config.js';

const STATE_FILE = join(PROJECT_ROOT, '.stoneforge', 'daemon-state.json');

interface DaemonConfigOverrides {
  directorInboxForwardingEnabled?: boolean;
}

interface DaemonState {
  /** Whether the daemon should be running */
  shouldRun: boolean;
  /** When the state was last updated */
  updatedAt: string;
  /** Who/what updated the state */
  updatedBy: 'user' | 'server-startup' | 'server-shutdown';
  /** Persisted config overrides (survives server restarts) */
  configOverrides?: DaemonConfigOverrides;
}

/**
 * Get the persisted daemon state.
 * Returns undefined if no state file exists (first run).
 */
export function getDaemonState(): DaemonState | undefined {
  try {
    if (!existsSync(STATE_FILE)) {
      return undefined;
    }
    const content = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(content) as DaemonState;
  } catch (error) {
    console.warn('[daemon-state] Failed to read daemon state:', error);
    return undefined;
  }
}

/**
 * Save the daemon state.
 */
export function saveDaemonState(
  shouldRun: boolean,
  updatedBy: DaemonState['updatedBy']
): void {
  try {
    // Ensure the .stoneforge directory exists
    const dir = dirname(STATE_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const state: DaemonState = {
      shouldRun,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch (error) {
    console.error('[daemon-state] Failed to save daemon state:', error);
  }
}

/**
 * Check if the daemon should auto-start based on persisted state.
 *
 * Returns true if:
 * - No state file exists (first run, default to starting)
 * - State file indicates shouldRun is true
 *
 * Returns false if:
 * - State file indicates shouldRun is false (user intentionally stopped it)
 */
export function shouldDaemonAutoStart(): boolean {
  const state = getDaemonState();

  // No state file = first run, default to auto-start
  if (!state) {
    return true;
  }

  return state.shouldRun;
}

/**
 * Get persisted daemon config overrides.
 */
export function getDaemonConfigOverrides(): DaemonConfigOverrides {
  const state = getDaemonState();
  return state?.configOverrides ?? {};
}

/**
 * Save daemon config overrides (merges into existing state).
 */
export function saveDaemonConfigOverrides(overrides: DaemonConfigOverrides): void {
  const state = getDaemonState();
  const merged: DaemonState = {
    shouldRun: state?.shouldRun ?? true,
    updatedAt: new Date().toISOString(),
    updatedBy: state?.updatedBy ?? 'user',
    configOverrides: {
      ...state?.configOverrides,
      ...overrides,
    },
  };

  try {
    const dir = dirname(STATE_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  } catch (error) {
    console.error('[daemon-state] Failed to save daemon config overrides:', error);
  }
}
