/**
 * Conflict Resolver Tests
 *
 * Tests for conflict detection, resolution strategies, field-level merge,
 * and manual conflict resolution.
 */

import { describe, expect, test } from 'bun:test';
import type {
  Element,
  ExternalTask,
  ExternalSyncState,
  TaskFieldMapConfig,
} from '@stoneforge/core';
import { asElementId, asEntityId } from '@stoneforge/core';
import {
  detectConflict,
  resolveConflict,
  resolveManualConflict,
  applyManualConflict,
  toExternalSyncConflict,
  computeExternalItemHash,
  SYNC_CONFLICT_TAG,
} from './conflict-resolver.js';
import type { ConflictInfo } from './conflict-resolver.js';
import { computeContentHashSync } from '../sync/hash.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockElement(overrides: Partial<Element> = {}): Element {
  return {
    id: asElementId('el-test1'),
    type: 'task',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    createdBy: asEntityId('el-user1'),
    tags: ['feature'],
    metadata: {},
    ...overrides,
    // Add task-specific fields for richer testing
    title: 'Local Task Title',
    status: 'open',
    priority: 3,
    taskType: 'task',
    ...(overrides as Record<string, unknown>),
  } as Element;
}

function createMockExternalTask(overrides: Partial<ExternalTask> = {}): ExternalTask {
  return {
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    provider: 'github',
    project: 'owner/repo',
    title: 'Remote Task Title',
    body: 'Remote body content',
    state: 'open',
    labels: ['bug'],
    assignees: ['octocat'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T14:00:00Z',
    ...overrides,
  };
}

function createMockSyncState(overrides: Partial<ExternalSyncState> = {}): ExternalSyncState {
  return {
    provider: 'github',
    project: 'owner/repo',
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    direction: 'bidirectional',
    adapterType: 'task',
    ...overrides,
  };
}

const mockFieldMapConfig: TaskFieldMapConfig = {
  provider: 'github',
  fields: [
    { localField: 'title', externalField: 'title', direction: 'bidirectional' },
    { localField: 'status', externalField: 'state', direction: 'bidirectional' },
    { localField: 'tags', externalField: 'labels', direction: 'bidirectional' },
    { localField: 'assignee', externalField: 'assignees', direction: 'bidirectional' },
  ],
};

// ============================================================================
// Conflict Detection
// ============================================================================

describe('detectConflict', () => {
  test('returns null when neither side changed', () => {
    const localElement = createMockElement();
    const localHash = computeContentHashSync(localElement).hash;

    const remoteItem = createMockExternalTask();
    const remoteHash = computeExternalItemHash(remoteItem);

    const syncState = createMockSyncState({
      lastPushedHash: localHash,
      lastPulledHash: remoteHash,
    });

    const result = detectConflict(localElement, remoteItem, syncState);
    expect(result).toBeNull();
  });

  test('returns null when only local changed', () => {
    const localElement = createMockElement({ tags: ['feature', 'updated'] });

    const remoteItem = createMockExternalTask();
    const remoteHash = computeExternalItemHash(remoteItem);

    const syncState = createMockSyncState({
      lastPushedHash: 'old-hash-that-no-longer-matches',
      lastPulledHash: remoteHash,
    });

    const result = detectConflict(localElement, remoteItem, syncState);
    expect(result).toBeNull();
  });

  test('returns null when only remote changed', () => {
    const localElement = createMockElement();
    const localHash = computeContentHashSync(localElement).hash;

    const remoteItem = createMockExternalTask({ title: 'Changed Title' });

    const syncState = createMockSyncState({
      lastPushedHash: localHash,
      lastPulledHash: 'old-remote-hash',
    });

    const result = detectConflict(localElement, remoteItem, syncState);
    expect(result).toBeNull();
  });

  test('returns conflict info when both sides changed', () => {
    const localElement = createMockElement({ tags: ['feature', 'changed'] });
    const remoteItem = createMockExternalTask({ title: 'Changed Remote Title' });

    const syncState = createMockSyncState({
      lastPushedHash: 'old-local-hash',
      lastPulledHash: 'old-remote-hash',
    });

    const result = detectConflict(localElement, remoteItem, syncState);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('el-test1');
    expect(result!.externalId).toBe('42');
    expect(result!.provider).toBe('github');
    expect(result!.project).toBe('owner/repo');
  });

  test('detects conflict when no hashes exist (never synced)', () => {
    const localElement = createMockElement();
    const remoteItem = createMockExternalTask();

    const syncState = createMockSyncState({
      // No lastPushedHash or lastPulledHash
    });

    const result = detectConflict(localElement, remoteItem, syncState);
    expect(result).not.toBeNull();
  });

  test('includes field-level analysis when options provided', () => {
    const localElement = createMockElement({
      tags: ['feature', 'new-tag'],
    } as Partial<Element>);
    const remoteItem = createMockExternalTask({ title: 'Changed Remote Title' });

    const syncState = createMockSyncState({
      lastPushedHash: 'old-local-hash',
      lastPulledHash: 'old-remote-hash',
    });

    const localBaseline = { title: 'Local Task Title', status: 'open', tags: ['feature'], assignee: undefined };
    const remoteBaseline = { title: 'Remote Task Title', state: 'open', labels: ['bug'], assignees: ['octocat'] };

    const result = detectConflict(localElement, remoteItem, syncState, {
      fieldMapConfig: mockFieldMapConfig,
      localBaseline,
      remoteBaseline,
    });

    expect(result).not.toBeNull();
    // tags changed locally
    expect(result!.localChangedFields).toContain('tags');
    // title changed remotely
    expect(result!.remoteChangedFields).toContain('title');
    // No overlapping field conflicts (different fields changed)
    expect(result!.conflictingFields).toHaveLength(0);
    expect(result!.canFieldMerge).toBe(true);
  });

  test('detects conflicting fields when same field changed on both sides', () => {
    const localElement = createMockElement();
    // override title to differ from baseline
    (localElement as unknown as Record<string, unknown>).title = 'Changed Local Title';
    const remoteItem = createMockExternalTask({ title: 'Changed Remote Title' });

    const syncState = createMockSyncState({
      lastPushedHash: 'old-local-hash',
      lastPulledHash: 'old-remote-hash',
    });

    const localBaseline = { title: 'Original Title', status: 'open', tags: ['feature'], assignee: undefined };
    const remoteBaseline = { title: 'Original Title', state: 'open', labels: ['bug'], assignees: ['octocat'] };

    const result = detectConflict(localElement, remoteItem, syncState, {
      fieldMapConfig: mockFieldMapConfig,
      localBaseline,
      remoteBaseline,
    });

    expect(result).not.toBeNull();
    expect(result!.conflictingFields).toContain('title');
    expect(result!.localChangedFields).toContain('title');
    expect(result!.remoteChangedFields).toContain('title');
  });

  test('without field options reports wildcard conflicts', () => {
    const localElement = createMockElement({ tags: ['changed'] });
    const remoteItem = createMockExternalTask({ title: 'Changed' });

    const syncState = createMockSyncState({
      lastPushedHash: 'old-local-hash',
      lastPulledHash: 'old-remote-hash',
    });

    const result = detectConflict(localElement, remoteItem, syncState);
    expect(result).not.toBeNull();
    expect(result!.localChangedFields).toEqual(['*']);
    expect(result!.remoteChangedFields).toEqual(['*']);
    expect(result!.conflictingFields).toEqual(['*']);
    expect(result!.canFieldMerge).toBe(false);
  });
});

// ============================================================================
// computeExternalItemHash
// ============================================================================

describe('computeExternalItemHash', () => {
  test('produces consistent hashes for identical items', () => {
    const item1 = createMockExternalTask();
    const item2 = createMockExternalTask();

    expect(computeExternalItemHash(item1)).toBe(computeExternalItemHash(item2));
  });

  test('produces different hashes when content changes', () => {
    const item1 = createMockExternalTask();
    const item2 = createMockExternalTask({ title: 'Different Title' });

    expect(computeExternalItemHash(item1)).not.toBe(computeExternalItemHash(item2));
  });

  test('ignores volatile fields like timestamps', () => {
    const item1 = createMockExternalTask({ updatedAt: '2024-01-01T00:00:00Z' });
    const item2 = createMockExternalTask({ updatedAt: '2024-06-01T00:00:00Z' });

    expect(computeExternalItemHash(item1)).toBe(computeExternalItemHash(item2));
  });

  test('is sensitive to label order but sorts for determinism', () => {
    const item1 = createMockExternalTask({ labels: ['a', 'b', 'c'] });
    const item2 = createMockExternalTask({ labels: ['c', 'a', 'b'] });

    // Labels are sorted internally, so order doesn't matter
    expect(computeExternalItemHash(item1)).toBe(computeExternalItemHash(item2));
  });

  test('distinguishes different states', () => {
    const item1 = createMockExternalTask({ state: 'open' });
    const item2 = createMockExternalTask({ state: 'closed' });

    expect(computeExternalItemHash(item1)).not.toBe(computeExternalItemHash(item2));
  });
});

// ============================================================================
// Conflict Resolution — Strategies
// ============================================================================

describe('resolveConflict', () => {
  const baseConflict: ConflictInfo = {
    elementId: 'el-test1',
    externalId: '42',
    provider: 'github',
    project: 'owner/repo',
    localUpdatedAt: '2024-01-15T12:00:00.000Z',
    remoteUpdatedAt: '2024-01-15T14:00:00Z',
    localChangedFields: ['*'],
    remoteChangedFields: ['*'],
    conflictingFields: ['*'],
    canFieldMerge: false,
  };

  describe('last_write_wins', () => {
    test('chooses remote when remote is newer', () => {
      const localElement = createMockElement({ updatedAt: '2024-01-15T12:00:00.000Z' });
      const remoteItem = createMockExternalTask({ updatedAt: '2024-01-15T14:00:00Z' });

      const result = resolveConflict(baseConflict, 'last_write_wins', localElement, remoteItem);

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('remote');
      expect(result.strategy).toBe('last_write_wins');
      expect(result.localUpdates).toBeDefined();
    });

    test('chooses local when local is newer', () => {
      const conflict: ConflictInfo = {
        ...baseConflict,
        localUpdatedAt: '2024-01-15T16:00:00.000Z',
        remoteUpdatedAt: '2024-01-15T14:00:00Z',
      };

      const localElement = createMockElement({ updatedAt: '2024-01-15T16:00:00.000Z' });
      const remoteItem = createMockExternalTask({ updatedAt: '2024-01-15T14:00:00Z' });

      const result = resolveConflict(conflict, 'last_write_wins', localElement, remoteItem);

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('local');
      expect(result.remoteUpdates).toBeDefined();
    });

    test('chooses local when timestamps are equal', () => {
      const conflict: ConflictInfo = {
        ...baseConflict,
        localUpdatedAt: '2024-01-15T14:00:00.000Z',
        remoteUpdatedAt: '2024-01-15T14:00:00.000Z',
      };

      const result = resolveConflict(conflict, 'last_write_wins');

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('local');
    });
  });

  describe('local_wins', () => {
    test('always resolves with local winner', () => {
      const result = resolveConflict(baseConflict, 'local_wins');

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('local');
      expect(result.strategy).toBe('local_wins');
    });
  });

  describe('remote_wins', () => {
    test('always resolves with remote winner', () => {
      const remoteItem = createMockExternalTask();

      const result = resolveConflict(baseConflict, 'remote_wins', undefined, remoteItem);

      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('remote');
      expect(result.strategy).toBe('remote_wins');
      expect(result.localUpdates).toBeDefined();
    });

    test('includes pullable fields in localUpdates', () => {
      const remoteItem = createMockExternalTask({
        title: 'Remote Title',
        body: 'Remote Body',
        state: 'closed',
      });

      const result = resolveConflict(baseConflict, 'remote_wins', undefined, remoteItem);

      expect(result.localUpdates).toEqual({
        title: 'Remote Title',
        body: 'Remote Body',
        state: 'closed',
        labels: ['bug'],
        assignees: ['octocat'],
      });
    });
  });

  describe('manual', () => {
    test('marks conflict as unresolved', () => {
      const localElement = createMockElement();
      const remoteItem = createMockExternalTask();

      const result = resolveConflict(baseConflict, 'manual', localElement, remoteItem);

      expect(result.resolved).toBe(false);
      expect(result.strategy).toBe('manual');
      expect(result.manualConflict).toBeDefined();
      expect(result.manualConflict!.local).toBeDefined();
      expect(result.manualConflict!.remote).toBeDefined();
    });

    test('stores both versions in manualConflict', () => {
      const localElement = createMockElement();
      const remoteItem = createMockExternalTask({
        title: 'Remote Title',
        body: 'Remote Body',
      });

      const result = resolveConflict(baseConflict, 'manual', localElement, remoteItem);

      expect(result.manualConflict!.remote.title).toBe('Remote Title');
      expect(result.manualConflict!.remote.body).toBe('Remote Body');
    });
  });
});

// ============================================================================
// Field-Level Merge
// ============================================================================

describe('field-level merge', () => {
  test('merges automatically when different fields changed', () => {
    // Local changed title, remote changed labels
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['title'],
      remoteChangedFields: ['labels'],
      conflictingFields: [],
      canFieldMerge: true,
    };

    const localElement = createMockElement();
    (localElement as unknown as Record<string, unknown>).title = 'Updated Local Title';
    const remoteItem = createMockExternalTask({ labels: ['bug', 'enhancement'] });

    const result = resolveConflict(conflict, 'last_write_wins', localElement, remoteItem, {
      fieldMapConfig: mockFieldMapConfig,
    });

    expect(result.resolved).toBe(true);
    expect(result.winner).toBe('merged');
    // Remote's labels should be pulled locally
    expect(result.localUpdates).toEqual({ tags: ['bug', 'enhancement'] });
    // Local's title should be pushed to remote
    expect(result.remoteUpdates).toEqual({ title: 'Updated Local Title' });
  });

  test('applies strategy to conflicting fields only', () => {
    // Both changed title (conflict) and local also changed tags (no conflict)
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T16:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['title', 'tags'],
      remoteChangedFields: ['title'],
      conflictingFields: ['title'],
      canFieldMerge: true,
    };

    const localElement = createMockElement();
    (localElement as unknown as Record<string, unknown>).title = 'Local Changed Title';
    const remoteItem = createMockExternalTask({ title: 'Remote Changed Title' });

    // local_wins strategy for the conflicting title field
    const result = resolveConflict(conflict, 'local_wins', localElement, remoteItem, {
      fieldMapConfig: mockFieldMapConfig,
    });

    expect(result.resolved).toBe(true);
    expect(result.winner).toBe('merged');
    // title conflicted — local_wins, so local title pushed to remote
    expect(result.remoteUpdates).toBeDefined();
    expect(result.remoteUpdates!.title).toBe('Local Changed Title');
  });

  test('manual strategy with field merge stores only conflicting fields', () => {
    // title conflicts (changed on both sides), status only changed remotely
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['title'],
      remoteChangedFields: ['title', 'state'],
      conflictingFields: ['title'],
      canFieldMerge: true,
    };

    const localElement = createMockElement();
    (localElement as unknown as Record<string, unknown>).title = 'Local Title';
    const remoteItem = createMockExternalTask({
      title: 'Remote Title',
      state: 'closed',
    });

    const result = resolveConflict(conflict, 'manual', localElement, remoteItem, {
      fieldMapConfig: mockFieldMapConfig,
    });

    // Non-conflicting field (state/status) is still merged from remote
    expect(result.localUpdates).toBeDefined();
    expect(result.localUpdates!.status).toBe('closed');
    // title is the conflicting field stored in manual conflict
    expect(result.resolved).toBe(false);
    expect(result.manualConflict).toBeDefined();
    expect(result.manualConflict!.local.title).toBe('Local Title');
    expect(result.manualConflict!.remote.title).toBe('Remote Title');
  });
});

// ============================================================================
// Manual Conflict Resolution
// ============================================================================

describe('applyManualConflict', () => {
  test('adds sync-conflict tag', () => {
    const element = createMockElement({ tags: ['feature'] });
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['*'],
      remoteChangedFields: ['*'],
      conflictingFields: ['*'],
      canFieldMerge: false,
    };

    const { metadata, tags } = applyManualConflict(
      element,
      conflict,
      { title: 'Local' },
      { title: 'Remote' }
    );

    expect(tags).toContain(SYNC_CONFLICT_TAG);
    expect(tags).toContain('feature');
  });

  test('does not duplicate sync-conflict tag', () => {
    const element = createMockElement({ tags: ['feature', SYNC_CONFLICT_TAG] });
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['*'],
      remoteChangedFields: ['*'],
      conflictingFields: ['*'],
      canFieldMerge: false,
    };

    const { tags } = applyManualConflict(
      element,
      conflict,
      { title: 'Local' },
      { title: 'Remote' }
    );

    const conflictTagCount = tags.filter((t) => t === SYNC_CONFLICT_TAG).length;
    expect(conflictTagCount).toBe(1);
  });

  test('stores both versions in metadata', () => {
    const element = createMockElement();
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['*'],
      remoteChangedFields: ['*'],
      conflictingFields: ['*'],
      canFieldMerge: false,
    };

    const { metadata } = applyManualConflict(
      element,
      conflict,
      { title: 'Local Title' },
      { title: 'Remote Title' }
    );

    const syncState = metadata._externalSync as Record<string, unknown>;
    const conflictData = syncState.conflict as Record<string, unknown>;
    expect(conflictData.local).toEqual({ title: 'Local Title' });
    expect(conflictData.remote).toEqual({ title: 'Remote Title' });
    expect(conflictData.provider).toBe('github');
  });

  test('preserves existing sync state in metadata', () => {
    const element = createMockElement({
      metadata: {
        _externalSync: {
          provider: 'github',
          project: 'owner/repo',
          externalId: '42',
        },
      },
    });

    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['*'],
      remoteChangedFields: ['*'],
      conflictingFields: ['*'],
      canFieldMerge: false,
    };

    const { metadata } = applyManualConflict(element, conflict, {}, {});

    const syncState = metadata._externalSync as Record<string, unknown>;
    expect(syncState.provider).toBe('github');
    expect(syncState.project).toBe('owner/repo');
    expect(syncState.conflict).toBeDefined();
  });
});

describe('resolveManualConflict', () => {
  test('keeps local version when keep=local', () => {
    const element = createMockElement({
      tags: ['feature', SYNC_CONFLICT_TAG],
      metadata: {
        _externalSync: {
          provider: 'github',
          conflict: {
            local: { title: 'Local Title' },
            remote: { title: 'Remote Title' },
          },
        },
      },
    });

    const result = resolveManualConflict(element, 'local');

    expect(result.fieldValues).toEqual({ title: 'Local Title' });
    expect(result.tags).not.toContain(SYNC_CONFLICT_TAG);
    expect(result.tags).toContain('feature');
  });

  test('keeps remote version when keep=remote', () => {
    const element = createMockElement({
      tags: ['feature', SYNC_CONFLICT_TAG],
      metadata: {
        _externalSync: {
          provider: 'github',
          conflict: {
            local: { title: 'Local Title' },
            remote: { title: 'Remote Title' },
          },
        },
      },
    });

    const result = resolveManualConflict(element, 'remote');

    expect(result.fieldValues).toEqual({ title: 'Remote Title' });
    expect(result.tags).not.toContain(SYNC_CONFLICT_TAG);
  });

  test('clears conflict metadata but preserves sync state', () => {
    const element = createMockElement({
      tags: [SYNC_CONFLICT_TAG],
      metadata: {
        _externalSync: {
          provider: 'github',
          project: 'owner/repo',
          externalId: '42',
          conflict: {
            local: { title: 'Local' },
            remote: { title: 'Remote' },
          },
        },
      },
    });

    const result = resolveManualConflict(element, 'local');

    const syncState = result.metadata._externalSync as Record<string, unknown>;
    expect(syncState.provider).toBe('github');
    expect(syncState.project).toBe('owner/repo');
    expect(syncState.conflict).toBeUndefined();
  });

  test('handles missing conflict data gracefully', () => {
    const element = createMockElement({
      tags: [SYNC_CONFLICT_TAG],
      metadata: {
        _externalSync: {
          provider: 'github',
        },
      },
    });

    const result = resolveManualConflict(element, 'local');

    expect(result.fieldValues).toEqual({});
    expect(result.tags).not.toContain(SYNC_CONFLICT_TAG);
  });
});

// ============================================================================
// toExternalSyncConflict
// ============================================================================

describe('toExternalSyncConflict', () => {
  test('converts conflict info to sync conflict report', () => {
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['*'],
      remoteChangedFields: ['*'],
      conflictingFields: ['*'],
      canFieldMerge: false,
    };

    const resolved = resolveConflict(conflict, 'local_wins');
    const syncConflict = toExternalSyncConflict(conflict, resolved);

    expect(syncConflict.elementId).toBe('el-test1');
    expect(syncConflict.externalId).toBe('42');
    expect(syncConflict.provider).toBe('github');
    expect(syncConflict.project).toBe('owner/repo');
    expect(syncConflict.strategy).toBe('local_wins');
    expect(syncConflict.resolved).toBe(true);
    expect(syncConflict.winner).toBe('local');
  });

  test('maps merged winner to local in report', () => {
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['title'],
      remoteChangedFields: ['labels'],
      conflictingFields: [],
      canFieldMerge: true,
    };

    const localElement = createMockElement();
    const remoteItem = createMockExternalTask();

    const resolved = resolveConflict(conflict, 'local_wins', localElement, remoteItem, {
      fieldMapConfig: mockFieldMapConfig,
    });
    const syncConflict = toExternalSyncConflict(conflict, resolved);

    // 'merged' maps to 'local' in the simplified report
    expect(syncConflict.winner).toBe('local');
  });

  test('reports unresolved for manual strategy', () => {
    const conflict: ConflictInfo = {
      elementId: 'el-test1',
      externalId: '42',
      provider: 'github',
      project: 'owner/repo',
      localUpdatedAt: '2024-01-15T12:00:00.000Z',
      remoteUpdatedAt: '2024-01-15T14:00:00Z',
      localChangedFields: ['*'],
      remoteChangedFields: ['*'],
      conflictingFields: ['*'],
      canFieldMerge: false,
    };

    const resolved = resolveConflict(conflict, 'manual');
    const syncConflict = toExternalSyncConflict(conflict, resolved);

    expect(syncConflict.resolved).toBe(false);
    expect(syncConflict.strategy).toBe('manual');
    expect(syncConflict.winner).toBeUndefined();
  });
});

// ============================================================================
// SYNC_CONFLICT_TAG
// ============================================================================

describe('SYNC_CONFLICT_TAG', () => {
  test('has expected value', () => {
    expect(SYNC_CONFLICT_TAG).toBe('sync-conflict');
  });
});
