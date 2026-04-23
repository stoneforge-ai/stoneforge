/**
 * Agent Providers
 *
 * Provider abstraction layer that enables drop-in replacement of the
 * underlying agent CLI/SDK. The default provider is Claude Code.
 *
 * @module
 */

// Core types
export type {
  ProviderSessionId,
  AgentProviderConfig,
  AgentMessage,
  HeadlessSession,
  HeadlessSpawnOptions,
  HeadlessProvider,
  InteractiveSession,
  InteractiveSpawnOptions,
  InteractiveProvider,
  AgentProvider,
  ModelInfo,
} from './types.js';

// Errors
export { ProviderError } from './types.js';

// Registry
export {
  AgentProviderRegistry,
  getProviderRegistry,
} from './registry.js';

// Claude provider
export {
  ClaudeAgentProvider,
  ClaudeHeadlessProvider,
  ClaudeInteractiveProvider,
} from './claude/index.js';

// OpenCode provider
export {
  OpenCodeAgentProvider,
  OpenCodeHeadlessProvider,
  OpenCodeInteractiveProvider,
  OpenCodeEventMapper,
  AsyncQueue,
} from './opencode/index.js';

// Codex provider
export {
  CodexAgentProvider,
  CodexHeadlessProvider,
  CodexInteractiveProvider,
  CodexEventMapper,
} from './codex/index.js';
