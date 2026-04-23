/**
 * External Sync Type Definitions — Unit Tests
 *
 * Tests for enums, validation functions, type guards, metadata utilities,
 * and display name functions in the external-sync types module.
 */

import { describe, expect, test } from 'bun:test';
import {
  SyncAdapterType,
  SyncDirection,
  ConflictStrategy,
  VALID_SYNC_ADAPTER_TYPES,
  VALID_SYNC_DIRECTIONS,
  VALID_CONFLICT_STRATEGIES,
  isValidSyncAdapterType,
  isValidSyncDirection,
  isValidConflictStrategy,
  isExternalTask,
  isExternalDocument,
  isExternalMessage,
  isExternalSyncState,
  isProviderConfig,
  getExternalSyncState,
  setExternalSyncState,
  removeExternalSyncState,
  hasExternalSyncState,
  getSyncDirectionDisplayName,
  getConflictStrategyDisplayName,
  getSyncAdapterTypeDisplayName,
} from './external-sync.js';

// ============================================================================
// Enum Completeness
// ============================================================================

describe('SyncAdapterType', () => {
  test('has expected values', () => {
    expect(SyncAdapterType.TASK).toBe('task');
    expect(SyncAdapterType.DOCUMENT).toBe('document');
    expect(SyncAdapterType.MESSAGE).toBe('message');
  });

  test('VALID_SYNC_ADAPTER_TYPES contains all enum values', () => {
    expect(VALID_SYNC_ADAPTER_TYPES).toContain('task');
    expect(VALID_SYNC_ADAPTER_TYPES).toContain('document');
    expect(VALID_SYNC_ADAPTER_TYPES).toContain('message');
    expect(VALID_SYNC_ADAPTER_TYPES).toHaveLength(3);
  });
});

describe('SyncDirection', () => {
  test('has expected values', () => {
    expect(SyncDirection.PUSH).toBe('push');
    expect(SyncDirection.PULL).toBe('pull');
    expect(SyncDirection.BIDIRECTIONAL).toBe('bidirectional');
  });

  test('VALID_SYNC_DIRECTIONS contains all enum values', () => {
    expect(VALID_SYNC_DIRECTIONS).toContain('push');
    expect(VALID_SYNC_DIRECTIONS).toContain('pull');
    expect(VALID_SYNC_DIRECTIONS).toContain('bidirectional');
    expect(VALID_SYNC_DIRECTIONS).toHaveLength(3);
  });
});

describe('ConflictStrategy', () => {
  test('has expected values', () => {
    expect(ConflictStrategy.LAST_WRITE_WINS).toBe('last_write_wins');
    expect(ConflictStrategy.LOCAL_WINS).toBe('local_wins');
    expect(ConflictStrategy.REMOTE_WINS).toBe('remote_wins');
    expect(ConflictStrategy.MANUAL).toBe('manual');
  });

  test('VALID_CONFLICT_STRATEGIES contains all enum values', () => {
    expect(VALID_CONFLICT_STRATEGIES).toContain('last_write_wins');
    expect(VALID_CONFLICT_STRATEGIES).toContain('local_wins');
    expect(VALID_CONFLICT_STRATEGIES).toContain('remote_wins');
    expect(VALID_CONFLICT_STRATEGIES).toContain('manual');
    expect(VALID_CONFLICT_STRATEGIES).toHaveLength(4);
  });
});

// ============================================================================
// Validation Functions
// ============================================================================

describe('isValidSyncAdapterType', () => {
  test('returns true for valid adapter types', () => {
    expect(isValidSyncAdapterType('task')).toBe(true);
    expect(isValidSyncAdapterType('document')).toBe(true);
    expect(isValidSyncAdapterType('message')).toBe(true);
  });

  test('returns false for invalid values', () => {
    expect(isValidSyncAdapterType('invalid')).toBe(false);
    expect(isValidSyncAdapterType('')).toBe(false);
    expect(isValidSyncAdapterType(null)).toBe(false);
    expect(isValidSyncAdapterType(undefined)).toBe(false);
    expect(isValidSyncAdapterType(42)).toBe(false);
    expect(isValidSyncAdapterType(true)).toBe(false);
  });
});

describe('isValidSyncDirection', () => {
  test('returns true for valid directions', () => {
    expect(isValidSyncDirection('push')).toBe(true);
    expect(isValidSyncDirection('pull')).toBe(true);
    expect(isValidSyncDirection('bidirectional')).toBe(true);
  });

  test('returns false for invalid values', () => {
    expect(isValidSyncDirection('sync')).toBe(false);
    expect(isValidSyncDirection('')).toBe(false);
    expect(isValidSyncDirection(null)).toBe(false);
    expect(isValidSyncDirection(undefined)).toBe(false);
    expect(isValidSyncDirection(123)).toBe(false);
  });
});

describe('isValidConflictStrategy', () => {
  test('returns true for valid strategies', () => {
    expect(isValidConflictStrategy('last_write_wins')).toBe(true);
    expect(isValidConflictStrategy('local_wins')).toBe(true);
    expect(isValidConflictStrategy('remote_wins')).toBe(true);
    expect(isValidConflictStrategy('manual')).toBe(true);
  });

  test('returns false for invalid values', () => {
    expect(isValidConflictStrategy('auto')).toBe(false);
    expect(isValidConflictStrategy('')).toBe(false);
    expect(isValidConflictStrategy(null)).toBe(false);
    expect(isValidConflictStrategy(undefined)).toBe(false);
    expect(isValidConflictStrategy({})).toBe(false);
  });
});

// ============================================================================
// Type Guards
// ============================================================================

describe('isExternalTask', () => {
  const validTask = {
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    provider: 'github',
    project: 'owner/repo',
    title: 'Test Issue',
    state: 'open' as const,
    labels: ['bug'],
    assignees: ['octocat'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  };

  test('returns true for valid ExternalTask', () => {
    expect(isExternalTask(validTask)).toBe(true);
  });

  test('returns true with optional fields', () => {
    expect(isExternalTask({ ...validTask, body: 'Description', closedAt: '2024-01-03T00:00:00Z' })).toBe(true);
  });

  test('returns false when missing required fields', () => {
    const { externalId, ...noId } = validTask;
    expect(isExternalTask(noId)).toBe(false);

    const { title, ...noTitle } = validTask;
    expect(isExternalTask(noTitle)).toBe(false);

    const { labels, ...noLabels } = validTask;
    expect(isExternalTask(noLabels)).toBe(false);

    const { assignees, ...noAssignees } = validTask;
    expect(isExternalTask(noAssignees)).toBe(false);
  });

  test('returns false for invalid state', () => {
    expect(isExternalTask({ ...validTask, state: 'pending' })).toBe(false);
  });

  test('returns false for non-objects', () => {
    expect(isExternalTask(null)).toBe(false);
    expect(isExternalTask(undefined)).toBe(false);
    expect(isExternalTask('string')).toBe(false);
    expect(isExternalTask(42)).toBe(false);
  });
});

describe('isExternalDocument', () => {
  const validDoc = {
    externalId: 'doc-1',
    url: 'https://notion.so/page/doc-1',
    provider: 'notion',
    project: 'workspace-1',
    title: 'Test Document',
    content: '# Hello\n\nWorld',
    contentType: 'markdown' as const,
    updatedAt: '2024-01-01T00:00:00Z',
  };

  test('returns true for valid ExternalDocument', () => {
    expect(isExternalDocument(validDoc)).toBe(true);
  });

  test('accepts all valid contentType values', () => {
    expect(isExternalDocument({ ...validDoc, contentType: 'html' })).toBe(true);
    expect(isExternalDocument({ ...validDoc, contentType: 'text' })).toBe(true);
  });

  test('returns false for invalid contentType', () => {
    expect(isExternalDocument({ ...validDoc, contentType: 'rtf' })).toBe(false);
  });

  test('returns false when missing required fields', () => {
    const { content, ...noContent } = validDoc;
    expect(isExternalDocument(noContent)).toBe(false);
  });

  test('returns false for non-objects', () => {
    expect(isExternalDocument(null)).toBe(false);
    expect(isExternalDocument('string')).toBe(false);
  });
});

describe('isExternalMessage', () => {
  const validMsg = {
    externalId: 'msg-1',
    url: 'https://slack.com/archives/C01/msg-1',
    provider: 'slack',
    channel: 'general',
    sender: 'user1',
    content: 'Hello team!',
    timestamp: '2024-01-01T00:00:00Z',
  };

  test('returns true for valid ExternalMessage', () => {
    expect(isExternalMessage(validMsg)).toBe(true);
  });

  test('returns false when missing required fields', () => {
    const { channel, ...noChannel } = validMsg;
    expect(isExternalMessage(noChannel)).toBe(false);

    const { sender, ...noSender } = validMsg;
    expect(isExternalMessage(noSender)).toBe(false);
  });

  test('returns false for non-objects', () => {
    expect(isExternalMessage(null)).toBe(false);
    expect(isExternalMessage(undefined)).toBe(false);
  });
});

describe('isExternalSyncState', () => {
  const validState = {
    provider: 'github',
    project: 'owner/repo',
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    direction: 'bidirectional' as const,
    adapterType: 'task' as const,
  };

  test('returns true for valid ExternalSyncState', () => {
    expect(isExternalSyncState(validState)).toBe(true);
  });

  test('returns true with optional fields', () => {
    expect(isExternalSyncState({
      ...validState,
      lastPushedAt: '2024-01-01T00:00:00Z',
      lastPulledAt: '2024-01-02T00:00:00Z',
      lastPushedHash: 'abc123',
      lastPulledHash: 'def456',
    })).toBe(true);
  });

  test('returns false for invalid direction', () => {
    expect(isExternalSyncState({ ...validState, direction: 'invalid' })).toBe(false);
  });

  test('returns false for invalid adapterType', () => {
    expect(isExternalSyncState({ ...validState, adapterType: 'invalid' })).toBe(false);
  });

  test('returns false when missing required fields', () => {
    const { provider, ...noProvider } = validState;
    expect(isExternalSyncState(noProvider)).toBe(false);
  });

  test('returns false for non-objects', () => {
    expect(isExternalSyncState(null)).toBe(false);
    expect(isExternalSyncState(undefined)).toBe(false);
  });
});

describe('isProviderConfig', () => {
  test('returns true for valid ProviderConfig', () => {
    expect(isProviderConfig({ provider: 'github' })).toBe(true);
    expect(isProviderConfig({ provider: 'github', token: 'ghp_123' })).toBe(true);
    expect(isProviderConfig({
      provider: 'github',
      token: 'ghp_123',
      apiBaseUrl: 'https://api.github.com',
      defaultProject: 'owner/repo',
    })).toBe(true);
  });

  test('returns false when provider is missing', () => {
    expect(isProviderConfig({ token: 'test' })).toBe(false);
  });

  test('returns false for non-string optional fields', () => {
    expect(isProviderConfig({ provider: 'github', token: 123 })).toBe(false);
  });

  test('returns false for non-objects', () => {
    expect(isProviderConfig(null)).toBe(false);
    expect(isProviderConfig('string')).toBe(false);
  });
});

// ============================================================================
// Metadata Utilities
// ============================================================================

describe('getExternalSyncState', () => {
  const validSyncState = {
    provider: 'github',
    project: 'owner/repo',
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    direction: 'bidirectional',
    adapterType: 'task',
  };

  test('returns sync state when present and valid', () => {
    const metadata = { _externalSync: validSyncState };
    const result = getExternalSyncState(metadata);
    expect(result).toEqual(validSyncState);
  });

  test('returns undefined when _externalSync is missing', () => {
    expect(getExternalSyncState({})).toBeUndefined();
  });

  test('returns undefined when _externalSync is null', () => {
    expect(getExternalSyncState({ _externalSync: null })).toBeUndefined();
  });

  test('returns undefined when _externalSync is not valid shape', () => {
    expect(getExternalSyncState({ _externalSync: 'not-an-object' })).toBeUndefined();
    expect(getExternalSyncState({ _externalSync: { provider: 'github' } })).toBeUndefined();
  });
});

describe('setExternalSyncState', () => {
  const syncState = {
    provider: 'github',
    project: 'owner/repo',
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    direction: 'bidirectional' as const,
    adapterType: 'task' as const,
  };

  test('adds _externalSync to metadata', () => {
    const metadata = { existingField: 'value' };
    const result = setExternalSyncState(metadata, syncState);
    expect(result._externalSync).toEqual(syncState);
    expect(result.existingField).toBe('value');
  });

  test('does not mutate original metadata', () => {
    const metadata = { existingField: 'value' };
    const result = setExternalSyncState(metadata, syncState);
    expect(metadata).not.toHaveProperty('_externalSync');
    expect(result).not.toBe(metadata);
  });

  test('overwrites existing _externalSync', () => {
    const metadata = { _externalSync: { old: 'state' } };
    const result = setExternalSyncState(metadata, syncState);
    expect(result._externalSync).toEqual(syncState);
  });
});

describe('removeExternalSyncState', () => {
  test('removes _externalSync from metadata', () => {
    const metadata = {
      _externalSync: { provider: 'github' },
      otherField: 'value',
    };
    const result = removeExternalSyncState(metadata);
    expect(result).not.toHaveProperty('_externalSync');
    expect(result.otherField).toBe('value');
  });

  test('does not mutate original metadata', () => {
    const metadata = {
      _externalSync: { provider: 'github' },
    };
    const result = removeExternalSyncState(metadata);
    expect(metadata).toHaveProperty('_externalSync');
    expect(result).not.toBe(metadata);
  });

  test('returns same shape when _externalSync is not present', () => {
    const metadata = { otherField: 'value' };
    const result = removeExternalSyncState(metadata);
    expect(result.otherField).toBe('value');
  });
});

describe('hasExternalSyncState', () => {
  const validSyncState = {
    provider: 'github',
    project: 'owner/repo',
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    direction: 'bidirectional',
    adapterType: 'task',
  };

  test('returns true when valid sync state exists', () => {
    expect(hasExternalSyncState({ _externalSync: validSyncState })).toBe(true);
  });

  test('returns false when no sync state', () => {
    expect(hasExternalSyncState({})).toBe(false);
  });

  test('returns false when sync state is invalid', () => {
    expect(hasExternalSyncState({ _externalSync: 'invalid' })).toBe(false);
  });
});

// ============================================================================
// Display Name Functions
// ============================================================================

describe('getSyncDirectionDisplayName', () => {
  test('returns correct display names for all directions', () => {
    expect(getSyncDirectionDisplayName('push')).toBe('Push');
    expect(getSyncDirectionDisplayName('pull')).toBe('Pull');
    expect(getSyncDirectionDisplayName('bidirectional')).toBe('Bidirectional');
  });

  test('returns the value itself for unknown directions', () => {
    expect(getSyncDirectionDisplayName('unknown' as any)).toBe('unknown');
  });
});

describe('getConflictStrategyDisplayName', () => {
  test('returns correct display names for all strategies', () => {
    expect(getConflictStrategyDisplayName('last_write_wins')).toBe('Last Write Wins');
    expect(getConflictStrategyDisplayName('local_wins')).toBe('Local Wins');
    expect(getConflictStrategyDisplayName('remote_wins')).toBe('Remote Wins');
    expect(getConflictStrategyDisplayName('manual')).toBe('Manual');
  });

  test('returns the value itself for unknown strategies', () => {
    expect(getConflictStrategyDisplayName('unknown' as any)).toBe('unknown');
  });
});

describe('getSyncAdapterTypeDisplayName', () => {
  test('returns correct display names for all adapter types', () => {
    expect(getSyncAdapterTypeDisplayName('task')).toBe('Task');
    expect(getSyncAdapterTypeDisplayName('document')).toBe('Document');
    expect(getSyncAdapterTypeDisplayName('message')).toBe('Message');
  });

  test('returns the value itself for unknown adapter types', () => {
    expect(getSyncAdapterTypeDisplayName('unknown' as any)).toBe('unknown');
  });
});
