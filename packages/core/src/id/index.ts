/**
 * ID Generation System
 *
 * Provides unique, collision-resistant identifiers for all elements.
 * Uses content-based hashing (SHA256 + Base36) to prevent collisions
 * in concurrent multi-agent scenarios.
 */

export {
  // Types
  type IdComponents,
  type ParsedId,
  type IdGeneratorInput,
  type IdGeneratorConfig,
  type IdLogLevel,
  type IdGeneratorLogger,
  type IdMetricsEventType,
  type IdMetricsEvent,
  type IdMetricsSnapshot,
  type IdMetricsCollector,

  // Constants
  ID_PREFIX,
  BASE36_CHARS,
  MIN_HASH_LENGTH,
  MAX_HASH_LENGTH,
  MAX_HIERARCHY_DEPTH,
  MAX_NONCE,
  ROOT_ID_PATTERN,
  HIERARCHICAL_ID_PATTERN,

  // Validation
  isValidIdFormat,
  isValidRootId,
  isValidHierarchicalId,
  validateIdFormat,

  // Parsing
  parseId,
  getIdRoot,
  getIdParent,
  getIdDepth,

  // Hash utilities
  sha256,
  toBase36,
  truncateHash,

  // ID Generation
  generateIdHash,
  generateId,
  generateChildId,

  // Length calculation
  calculateIdLength,

  // Metrics and Logging
  DefaultIdMetricsCollector,
  ConsoleIdLogger,
} from './generator.js';
