/**
 * Test Utilities for Orchestration E2E Tests
 *
 * Provides helper functions for waiting, polling, and assertions
 * used across the orchestration test suite.
 *
 * @module
 */

import type { EntityId, ElementId, Task } from '@stoneforge/core';
import type { SessionManager, SessionRecord } from '../runtime/session-manager.js';
import type { OrchestratorAPI } from '../api/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the waitFor polling function
 */
export interface WaitForOptions {
  /** Maximum time to wait in milliseconds (default: 30000) */
  readonly timeout?: number;
  /** Polling interval in milliseconds (default: 1000) */
  readonly interval?: number;
  /** Description for error messages */
  readonly description?: string;
}

/**
 * Result of an assertion check
 */
export interface AssertionResult {
  readonly passed: boolean;
  readonly message: string;
  readonly actual?: unknown;
  readonly expected?: unknown;
}

// ============================================================================
// Polling Utilities
// ============================================================================

/**
 * Waits for a condition to become true, polling at regular intervals.
 *
 * @param condition - Async function that returns truthy when condition is met
 * @param options - Wait options
 * @returns The truthy value returned by the condition
 * @throws Error if timeout is reached before condition is met
 *
 * @example
 * ```typescript
 * const task = await waitFor(async () => {
 *   const tasks = await api.listTasks({ status: 'open' });
 *   return tasks.find(t => t.title.includes('health'));
 * }, { timeout: 90000, interval: 2000 });
 * ```
 */
export async function waitFor<T>(
  condition: () => Promise<T | null | undefined | false>,
  options: WaitForOptions = {}
): Promise<T> {
  const timeout = options.timeout ?? 30000;
  const interval = options.interval ?? 1000;
  const description = options.description ?? 'condition';

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();

    if (result) {
      return result;
    }

    await sleep(interval);
  }

  throw new Error(
    `Timeout waiting for ${description} after ${timeout}ms`
  );
}

/**
 * Waits for a value to change from its initial state.
 *
 * @param getValue - Function that returns the current value
 * @param initialValue - The initial value to compare against
 * @param options - Wait options
 * @returns The new value after it changes
 */
export async function waitForChange<T>(
  getValue: () => Promise<T>,
  initialValue: T,
  options: WaitForOptions = {}
): Promise<T> {
  return waitFor(async () => {
    const current = await getValue();
    return current !== initialValue ? current : null;
  }, options);
}

/**
 * Waits for multiple conditions to all become true.
 *
 * @param conditions - Array of condition functions
 * @param options - Wait options
 * @returns Array of results from all conditions
 */
export async function waitForAll<T extends unknown[]>(
  conditions: { [K in keyof T]: () => Promise<T[K] | null | undefined | false> },
  options: WaitForOptions = {}
): Promise<T> {
  const timeout = options.timeout ?? 30000;
  const interval = options.interval ?? 1000;

  const startTime = Date.now();
  const results: unknown[] = new Array(conditions.length).fill(null);
  const resolved = new Set<number>();

  while (Date.now() - startTime < timeout) {
    for (let i = 0; i < conditions.length; i++) {
      if (resolved.has(i)) continue;

      const result = await conditions[i]();
      if (result) {
        results[i] = result;
        resolved.add(i);
      }
    }

    if (resolved.size === conditions.length) {
      return results as T;
    }

    await sleep(interval);
  }

  const missing = conditions.length - resolved.size;
  throw new Error(
    `Timeout: ${missing} of ${conditions.length} conditions not met after ${timeout}ms`
  );
}

// ============================================================================
// Timing Utilities
// ============================================================================

/**
 * Sleeps for a specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Measures the execution time of an async function.
 *
 * @param fn - Function to measure
 * @returns Object with result and duration in milliseconds
 */
export async function measure<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

/**
 * Creates a timeout promise that rejects after specified milliseconds.
 */
export function timeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(message ?? `Timeout after ${ms}ms`)),
      ms
    )
  );
}

/**
 * Races a promise against a timeout.
 *
 * @param promise - The promise to race
 * @param ms - Timeout in milliseconds
 * @param message - Optional timeout error message
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  return Promise.race([promise, timeout(ms, message)]);
}

// ============================================================================
// Assertion Utilities
// ============================================================================

/**
 * Creates an assertion result
 */
function createAssertionResult(
  passed: boolean,
  message: string,
  actual?: unknown,
  expected?: unknown
): AssertionResult {
  return { passed, message, actual, expected };
}

/**
 * Asserts that a value is defined (not null or undefined).
 */
export function assertDefined<T>(
  value: T | null | undefined,
  name: string
): AssertionResult {
  if (value === null || value === undefined) {
    return createAssertionResult(
      false,
      `Expected ${name} to be defined, got ${value}`,
      value,
      'defined'
    );
  }
  return createAssertionResult(true, `${name} is defined`);
}

/**
 * Asserts that two values are equal.
 */
export function assertEqual<T>(
  actual: T,
  expected: T,
  name: string
): AssertionResult {
  if (actual !== expected) {
    return createAssertionResult(
      false,
      `Expected ${name} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      actual,
      expected
    );
  }
  return createAssertionResult(true, `${name} equals ${JSON.stringify(expected)}`);
}

/**
 * Asserts that a string contains a substring.
 */
export function assertContains(
  str: string,
  substring: string,
  name: string
): AssertionResult {
  if (!str.includes(substring)) {
    return createAssertionResult(
      false,
      `Expected ${name} to contain "${substring}"`,
      str,
      `contains "${substring}"`
    );
  }
  return createAssertionResult(true, `${name} contains "${substring}"`);
}

/**
 * Asserts that a value matches a regular expression.
 */
export function assertMatches(
  str: string,
  pattern: RegExp,
  name: string
): AssertionResult {
  if (!pattern.test(str)) {
    return createAssertionResult(
      false,
      `Expected ${name} to match ${pattern}`,
      str,
      pattern.toString()
    );
  }
  return createAssertionResult(true, `${name} matches ${pattern}`);
}

/**
 * Asserts that an array has a specific length.
 */
export function assertLength<T>(
  arr: T[],
  length: number,
  name: string
): AssertionResult {
  if (arr.length !== length) {
    return createAssertionResult(
      false,
      `Expected ${name} to have length ${length}, got ${arr.length}`,
      arr.length,
      length
    );
  }
  return createAssertionResult(true, `${name} has length ${length}`);
}

/**
 * Asserts that an array contains at least one item.
 */
export function assertNotEmpty<T>(
  arr: T[],
  name: string
): AssertionResult {
  if (arr.length === 0) {
    return createAssertionResult(
      false,
      `Expected ${name} to not be empty`,
      arr.length,
      '>0'
    );
  }
  return createAssertionResult(true, `${name} is not empty (${arr.length} items)`);
}

/**
 * Asserts that a condition is true.
 */
export function assertTrue(
  condition: boolean,
  message: string
): AssertionResult {
  if (!condition) {
    return createAssertionResult(false, message, false, true);
  }
  return createAssertionResult(true, message);
}

// ============================================================================
// Test Result Utilities
// ============================================================================

/**
 * Result of a single test
 */
export interface TestResult {
  readonly passed: boolean;
  readonly message: string;
  readonly duration: number;
  readonly details?: Record<string, unknown>;
}

/**
 * Creates a passing test result
 */
export function pass(
  message: string,
  details?: Record<string, unknown>
): TestResult {
  return {
    passed: true,
    message,
    duration: 0, // Will be set by runner
    details,
  };
}

/**
 * Creates a failing test result
 */
export function fail(
  message: string,
  details?: Record<string, unknown>
): TestResult {
  return {
    passed: false,
    message,
    duration: 0, // Will be set by runner
    details,
  };
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Generates a random string for unique identifiers.
 */
export function randomString(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a unique test identifier.
 */
export function uniqueId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${randomString(4)}`;
}

// ============================================================================
// Retry Utilities
// ============================================================================

/**
 * Options for retry operations
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  readonly maxAttempts?: number;
  /** Delay between attempts in milliseconds (default: 1000) */
  readonly delay?: number;
  /** Whether to use exponential backoff (default: false) */
  readonly exponentialBackoff?: boolean;
  /** Function to determine if error is retryable */
  readonly isRetryable?: (error: Error) => boolean;
}

/**
 * Retries an operation on failure.
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delay = options.delay ?? 1000;
  const exponentialBackoff = options.exponentialBackoff ?? false;
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !isRetryable(lastError)) {
        throw lastError;
      }

      const waitTime = exponentialBackoff
        ? delay * Math.pow(2, attempt - 1)
        : delay;
      await sleep(waitTime);
    }
  }

  throw lastError ?? new Error('Retry failed');
}

// ============================================================================
// Domain-Specific Polling Helpers
// ============================================================================

/**
 * Options for domain-specific wait helpers
 */
export interface DomainWaitOptions {
  readonly timeout?: number;
  readonly interval?: number;
}

/**
 * Waits for a task to reach a specific status.
 */
export async function waitForTaskStatus(
  api: OrchestratorAPI,
  taskId: ElementId,
  targetStatus: string,
  opts: DomainWaitOptions = {}
): Promise<Task> {
  return waitFor(
    async () => {
      const task = await api.get<Task>(taskId);
      if (!task) return null;
      return task.status === targetStatus ? task : null;
    },
    {
      timeout: opts.timeout ?? 60000,
      interval: opts.interval ?? 2000,
      description: `task ${taskId} to reach status '${targetStatus}'`,
    }
  );
}

/**
 * Waits for a task to be assigned to any agent.
 */
export async function waitForTaskAssignment(
  api: OrchestratorAPI,
  taskId: ElementId,
  opts: DomainWaitOptions = {}
): Promise<Task> {
  return waitFor(
    async () => {
      const task = await api.get<Task>(taskId);
      if (!task) return null;
      return task.assignee ? task : null;
    },
    {
      timeout: opts.timeout ?? 60000,
      interval: opts.interval ?? 2000,
      description: `task ${taskId} to be assigned`,
    }
  );
}

/**
 * Waits for a session to start for a given agent.
 */
export async function waitForSessionStart(
  sessionManager: SessionManager,
  agentId: EntityId,
  opts: DomainWaitOptions = {}
): Promise<SessionRecord> {
  return waitFor(
    async () => {
      const session = sessionManager.getActiveSession(agentId);
      return session ?? null;
    },
    {
      timeout: opts.timeout ?? 60000,
      interval: opts.interval ?? 2000,
      description: `session start for agent ${agentId}`,
    }
  );
}

/**
 * Waits for a session to end (terminate or suspend).
 */
export async function waitForSessionEnd(
  sessionManager: SessionManager,
  sessionId: string,
  opts: DomainWaitOptions = {}
): Promise<SessionRecord> {
  return waitFor(
    async () => {
      const session = sessionManager.getSession(sessionId);
      if (!session) return null;
      return session.status === 'terminated' || session.status === 'suspended'
        ? session
        : null;
    },
    {
      timeout: opts.timeout ?? 120000,
      interval: opts.interval ?? 3000,
      description: `session ${sessionId} to end`,
    }
  );
}

/**
 * Waits for task orchestrator metadata to satisfy a predicate.
 */
export async function waitForTaskMeta(
  api: OrchestratorAPI,
  taskId: ElementId,
  predicate: (meta: Record<string, unknown>) => boolean,
  opts: DomainWaitOptions = {}
): Promise<Record<string, unknown>> {
  return waitFor(
    async () => {
      const meta = await api.getTaskOrchestratorMeta(taskId);
      if (!meta) return null;
      return predicate(meta as Record<string, unknown>)
        ? (meta as Record<string, unknown>)
        : null;
    },
    {
      timeout: opts.timeout ?? 60000,
      interval: opts.interval ?? 2000,
      description: `task ${taskId} metadata to match predicate`,
    }
  );
}

/**
 * Waits for a git commit to appear in a worktree directory.
 * Returns the commit hash of the most recent commit.
 */
export async function waitForGitCommit(
  worktreePath: string,
  opts: DomainWaitOptions = {}
): Promise<string> {
  const { execSync } = await import('node:child_process');

  return waitFor(
    async () => {
      try {
        // Check if there's at least one commit beyond the initial
        const log = execSync('git log --oneline -2', {
          cwd: worktreePath,
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();

        const lines = log.split('\n');
        if (lines.length >= 2) {
          // There's at least 2 commits, return the latest hash
          return execSync('git rev-parse HEAD', {
            cwd: worktreePath,
            encoding: 'utf8',
            stdio: 'pipe',
          }).trim();
        }
        return null;
      } catch {
        return null;
      }
    },
    {
      timeout: opts.timeout ?? 120000,
      interval: opts.interval ?? 3000,
      description: `git commit in ${worktreePath}`,
    }
  );
}
