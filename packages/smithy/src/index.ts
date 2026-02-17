/**
 * @stoneforge/smithy
 *
 * Orchestrator SDK for Stoneforge - AI agent orchestration library extending the core SDK.
 *
 * This package provides the OrchestratorAPI which extends QuarryAPI with:
 * - Agent registration and management (Director, Worker, Steward)
 * - Session tracking with Claude Code integration
 * - Orchestrator-specific task metadata (branch, worktree, sessionId)
 * - Git worktree management for parallel development
 *
 * Note: Types from @stoneforge/core and @stoneforge/quarry are NOT re-exported here
 * to avoid naming conflicts. Import them directly:
 *   import { Task, Entity, ... } from '@stoneforge/core';
 *   import { QuarryAPI, createQuarryAPI, ... } from '@stoneforge/quarry';
 */

// Re-export all types
export * from './types/index.js';

// Re-export API
export * from './api/index.js';

// Re-export services (stubs for now)
export * from './services/index.js';

// Re-export runtime (stubs for now)
export * from './runtime/index.js';

// Re-export git utilities (stubs for now)
export * from './git/index.js';

// Re-export prompt loading utilities
export * from './prompts/index.js';

// Re-export CLI plugin
export { cliPlugin } from './cli/plugin.js';

// Re-export logger utility
export { createLogger, getLogLevel } from './utils/logger.js';
export type { Logger, LogLevel } from './utils/logger.js';
