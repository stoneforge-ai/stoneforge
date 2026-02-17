/**
 * Inbox Command Tests
 *
 * Tests for inbox CLI commands.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  inboxCommand,
  inboxReadCommand,
  inboxReadAllCommand,
  inboxUnreadCommand,
  inboxArchiveCommand,
  inboxCountCommand,
} from './inbox.js';
import { showCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import { createInboxService } from '../../services/inbox.js';
import { createEntity, EntityTypeValue } from '@stoneforge/core';
import { InboxSourceType, InboxStatus, type InboxItem } from '@stoneforge/core';
import type { Element, EntityId } from '@stoneforge/core';
import { createGroupChannel, createDirectChannel } from '@stoneforge/core';
import { createMessage } from '@stoneforge/core';
import { createDocument, ContentType } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_inbox_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

let testEntityId: string;
let testEntityName: string;
let testInboxItemId: string;

beforeEach(async () => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });

  // Initialize database
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);

  // Create a test entity
  const api = createQuarryAPI(backend);
  const entity = await createEntity({
    name: 'inbox-test-user',
    entityType: EntityTypeValue.HUMAN,
    createdBy: 'el-system' as EntityId,
  });
  const createdEntity = await api.create(entity as unknown as Element & Record<string, unknown>);
  testEntityId = createdEntity.id;
  testEntityName = 'inbox-test-user';

  // Create a second entity for the channel
  const entity2 = await createEntity({
    name: 'inbox-test-sender',
    entityType: EntityTypeValue.AGENT,
    createdBy: 'el-system' as EntityId,
  });
  const createdEntity2 = await api.create(entity2 as unknown as Element & Record<string, unknown>);

  // Create a test channel (direct channel between two entities)
  const channel = await createDirectChannel({
    entityA: testEntityId as EntityId,
    entityB: createdEntity2.id as EntityId,
    createdBy: testEntityId as EntityId,
  });
  const createdChannel = await api.create(channel as unknown as Element & Record<string, unknown>);

  // Create content documents for messages (sender is a channel member)
  const senderId = createdEntity2.id as EntityId;

  const contentDoc1 = await createDocument({
    title: 'Message 1 Content',
    contentType: ContentType.TEXT,
    content: 'Test message 1',
    createdBy: senderId,
  });
  const createdDoc1 = await api.create(contentDoc1 as unknown as Element & Record<string, unknown>);

  const contentDoc2 = await createDocument({
    title: 'Message 2 Content',
    contentType: ContentType.TEXT,
    content: 'Test message 2',
    createdBy: senderId,
  });
  const createdDoc2 = await api.create(contentDoc2 as unknown as Element & Record<string, unknown>);

  // Create test messages (sender must be a channel member)
  const message1 = await createMessage({
    channelId: createdChannel.id as any,
    sender: senderId,
    contentRef: createdDoc1.id as any,
    createdBy: senderId,
  });
  const createdMsg1 = await api.create(message1 as unknown as Element & Record<string, unknown>);

  const message2 = await createMessage({
    channelId: createdChannel.id as any,
    sender: senderId,
    contentRef: createdDoc2.id as any,
    createdBy: senderId,
  });
  const createdMsg2 = await api.create(message2 as unknown as Element & Record<string, unknown>);

  // The API automatically creates inbox items when messages are created
  // So we just need to get the inbox item ID for the first message
  const inboxService = createInboxService(backend);
  const inboxItems = inboxService.getInbox(testEntityId as EntityId, {});
  if (inboxItems.length > 0) {
    testInboxItemId = inboxItems[0].id;
  }
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Inbox List Tests
// ============================================================================

describe('inbox list command', () => {
  test('fails without entity argument', async () => {
    const options = createTestOptions();
    const result = await inboxCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('lists unread inbox items by default', async () => {
    const options = createTestOptions();
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as InboxItem[]).length).toBe(2);
  });

  test('supports entity lookup by ID', async () => {
    const options = createTestOptions();
    const result = await inboxCommand.handler!([testEntityId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as InboxItem[]).length).toBe(2);
  });

  test('supports entity lookup by name', async () => {
    const options = createTestOptions();
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('fails with non-existent entity', async () => {
    const options = createTestOptions();
    const result = await inboxCommand.handler!(['nonexistent-entity'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('--all includes read and archived items', async () => {
    // First mark one as read
    const backend = createStorage({ path: DB_PATH, create: true });
    const inboxService = createInboxService(backend);
    inboxService.markAsRead(testInboxItemId);

    const options = createTestOptions({ all: true } as GlobalOptions & { all: boolean });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as InboxItem[]).length).toBe(2);
  });

  test('--status filters by status', async () => {
    // First mark one as read
    const backend = createStorage({ path: DB_PATH, create: true });
    const inboxService = createInboxService(backend);
    inboxService.markAsRead(testInboxItemId);

    const options = createTestOptions({ status: 'read' } as GlobalOptions & { status: string });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as InboxItem[]).length).toBe(1);
    expect((result.data as InboxItem[])[0].status).toBe(InboxStatus.READ);
  });

  test('rejects invalid status', async () => {
    const options = createTestOptions({ status: 'invalid' } as GlobalOptions & { status: string });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid status');
  });

  test('--limit restricts number of items', async () => {
    const options = createTestOptions({ limit: '1' } as GlobalOptions & { limit: string });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as InboxItem[]).length).toBe(1);
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs only IDs in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('inbox-');
  });

  test('includes message content in results', async () => {
    const options = createTestOptions({ json: true });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
    const items = result.data as Array<InboxItem & { content?: string }>;
    expect(items.length).toBeGreaterThan(0);
    // Content should be hydrated from the message
    expect(items[0].content).toBeDefined();
    expect(typeof items[0].content).toBe('string');
  });

  test('--full flag shows complete content', async () => {
    const options = createTestOptions({ full: true } as GlobalOptions & { full: boolean });
    const result = await inboxCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toBeDefined();
    // The table output should contain content
    expect(result.message).toContain('CONTENT');
  });
});

// ============================================================================
// Inbox Read Tests
// ============================================================================

describe('inbox read command', () => {
  test('fails without item-id argument', async () => {
    const options = createTestOptions();
    const result = await inboxReadCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('marks item as read', async () => {
    const options = createTestOptions();
    const result = await inboxReadCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as InboxItem).status).toBe(InboxStatus.READ);
    expect((result.data as InboxItem).readAt).not.toBeNull();
  });

  test('fails with non-existent item', async () => {
    const options = createTestOptions();
    const result = await inboxReadCommand.handler!(['inbox-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await inboxReadCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('object');
    expect((result.data as InboxItem).id).toBe(testInboxItemId);
  });

  test('outputs only ID in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await inboxReadCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(testInboxItemId);
  });
});

// ============================================================================
// Inbox Read-All Tests
// ============================================================================

describe('inbox read-all command', () => {
  test('fails without entity argument', async () => {
    const options = createTestOptions();
    const result = await inboxReadAllCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('marks all items as read', async () => {
    const options = createTestOptions();
    const result = await inboxReadAllCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { count: number }).count).toBe(2);
  });

  test('supports entity lookup by ID', async () => {
    const options = createTestOptions();
    const result = await inboxReadAllCommand.handler!([testEntityId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number }).count).toBe(2);
  });

  test('fails with non-existent entity', async () => {
    const options = createTestOptions();
    const result = await inboxReadAllCommand.handler!(['nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await inboxReadAllCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number; entityId: string }).count).toBe(2);
    expect((result.data as { count: number; entityId: string }).entityId).toBe(testEntityId);
  });

  test('outputs only count in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await inboxReadAllCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe('2');
  });
});

// ============================================================================
// Inbox Unread Tests
// ============================================================================

describe('inbox unread command', () => {
  test('fails without item-id argument', async () => {
    const options = createTestOptions();
    const result = await inboxUnreadCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('marks item as unread', async () => {
    // First mark as read
    const backend = createStorage({ path: DB_PATH, create: true });
    const inboxService = createInboxService(backend);
    inboxService.markAsRead(testInboxItemId);

    const options = createTestOptions();
    const result = await inboxUnreadCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as InboxItem).status).toBe(InboxStatus.UNREAD);
    expect((result.data as InboxItem).readAt).toBeNull();
  });

  test('fails with non-existent item', async () => {
    const options = createTestOptions();
    const result = await inboxUnreadCommand.handler!(['inbox-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Inbox Archive Tests
// ============================================================================

describe('inbox archive command', () => {
  test('fails without item-id argument', async () => {
    const options = createTestOptions();
    const result = await inboxArchiveCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('archives inbox item', async () => {
    const options = createTestOptions();
    const result = await inboxArchiveCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as InboxItem).status).toBe(InboxStatus.ARCHIVED);
  });

  test('fails with non-existent item', async () => {
    const options = createTestOptions();
    const result = await inboxArchiveCommand.handler!(['inbox-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await inboxArchiveCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as InboxItem).id).toBe(testInboxItemId);
    expect((result.data as InboxItem).status).toBe(InboxStatus.ARCHIVED);
  });
});

// ============================================================================
// Inbox Count Tests
// ============================================================================

describe('inbox count command', () => {
  test('fails without entity argument', async () => {
    const options = createTestOptions();
    const result = await inboxCountCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('returns unread count', async () => {
    const options = createTestOptions();
    const result = await inboxCountCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number }).count).toBe(2);
  });

  test('supports entity lookup by ID', async () => {
    const options = createTestOptions();
    const result = await inboxCountCommand.handler!([testEntityId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number }).count).toBe(2);
  });

  test('reflects read items in count', async () => {
    // Mark one as read
    const backend = createStorage({ path: DB_PATH, create: true });
    const inboxService = createInboxService(backend);
    inboxService.markAsRead(testInboxItemId);

    const options = createTestOptions();
    const result = await inboxCountCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number }).count).toBe(1);
  });

  test('fails with non-existent entity', async () => {
    const options = createTestOptions();
    const result = await inboxCountCommand.handler!(['nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await inboxCountCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number; entityId: string; entityName: string }).count).toBe(2);
    expect((result.data as { count: number; entityId: string; entityName: string }).entityId).toBe(testEntityId);
    expect((result.data as { count: number; entityId: string; entityName: string }).entityName).toBe(testEntityName);
  });

  test('outputs only count in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await inboxCountCommand.handler!([testEntityName], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe('2');
  });
});

// ============================================================================
// Inbox Command Structure Tests
// ============================================================================

describe('inbox command structure', () => {
  test('has correct name', () => {
    expect(inboxCommand.name).toBe('inbox');
  });

  test('has description', () => {
    expect(inboxCommand.description).toBeDefined();
    expect(inboxCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(inboxCommand.usage).toBeDefined();
    expect(inboxCommand.usage).toContain('inbox');
  });

  test('has help text', () => {
    expect(inboxCommand.help).toBeDefined();
    expect(inboxCommand.help).toContain('inbox');
  });

  test('has read subcommand', () => {
    expect(inboxCommand.subcommands).toBeDefined();
    expect(inboxCommand.subcommands!.read).toBeDefined();
    expect(inboxCommand.subcommands!.read.name).toBe('read');
  });

  test('has read-all subcommand', () => {
    expect(inboxCommand.subcommands!['read-all']).toBeDefined();
    expect(inboxCommand.subcommands!['read-all'].name).toBe('read-all');
  });

  test('has unread subcommand', () => {
    expect(inboxCommand.subcommands!.unread).toBeDefined();
    expect(inboxCommand.subcommands!.unread.name).toBe('unread');
  });

  test('has archive subcommand', () => {
    expect(inboxCommand.subcommands!.archive).toBeDefined();
    expect(inboxCommand.subcommands!.archive.name).toBe('archive');
  });

  test('has count subcommand', () => {
    expect(inboxCommand.subcommands!.count).toBeDefined();
    expect(inboxCommand.subcommands!.count.name).toBe('count');
  });

  test('has list options', () => {
    expect(inboxCommand.options).toBeDefined();
    expect(inboxCommand.options!.length).toBeGreaterThan(0);
  });

  test('has --all option', () => {
    const allOption = inboxCommand.options!.find((o) => o.name === 'all');
    expect(allOption).toBeDefined();
    expect(allOption!.short).toBe('a');
  });

  test('has --status option', () => {
    const statusOption = inboxCommand.options!.find((o) => o.name === 'status');
    expect(statusOption).toBeDefined();
    expect(statusOption!.short).toBe('s');
    expect(statusOption!.hasValue).toBe(true);
  });

  test('has --limit option', () => {
    const limitOption = inboxCommand.options!.find((o) => o.name === 'limit');
    expect(limitOption).toBeDefined();
    expect(limitOption!.short).toBe('l');
    expect(limitOption!.hasValue).toBe(true);
  });
});

// ============================================================================
// E2E Tests
// ============================================================================

describe('inbox E2E scenarios', () => {
  test('complete workflow: list -> read -> count -> unread -> archive', async () => {
    const options = createTestOptions();

    // 1. List unread items
    let result = await inboxCommand.handler!([testEntityName], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as InboxItem[]).length).toBe(2);

    // 2. Check count
    result = await inboxCountCommand.handler!([testEntityName], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number }).count).toBe(2);

    // 3. Mark one as read
    result = await inboxReadCommand.handler!([testInboxItemId], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // 4. Count should decrease
    result = await inboxCountCommand.handler!([testEntityName], options);
    expect((result.data as { count: number }).count).toBe(1);

    // 5. Mark as unread
    result = await inboxUnreadCommand.handler!([testInboxItemId], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // 6. Count should increase back
    result = await inboxCountCommand.handler!([testEntityName], options);
    expect((result.data as { count: number }).count).toBe(2);

    // 7. Archive
    result = await inboxArchiveCommand.handler!([testInboxItemId], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // 8. Archived items not in unread list
    result = await inboxCommand.handler!([testEntityName], options);
    expect((result.data as InboxItem[]).length).toBe(1);

    // 9. But visible with --all
    result = await inboxCommand.handler!([testEntityName], { ...options, all: true } as any);
    expect((result.data as InboxItem[]).length).toBe(2);
  });

  test('read-all marks all items as read', async () => {
    const options = createTestOptions();

    // 1. Verify we have 2 unread
    let result = await inboxCountCommand.handler!([testEntityName], options);
    expect((result.data as { count: number }).count).toBe(2);

    // 2. Read all
    result = await inboxReadAllCommand.handler!([testEntityName], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number }).count).toBe(2);

    // 3. Count should be 0
    result = await inboxCountCommand.handler!([testEntityName], options);
    expect((result.data as { count: number }).count).toBe(0);
  });

  test('different output modes work correctly', async () => {
    // JSON mode
    let result = await inboxCommand.handler!([testEntityName], createTestOptions({ json: true }));
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);

    // Quiet mode
    result = await inboxCommand.handler!([testEntityName], createTestOptions({ quiet: true }));
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('inbox-');

    // Human mode (default) - has message
    result = await inboxCommand.handler!([testEntityName], createTestOptions());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toBeDefined();
  });
});

// ============================================================================
// Show Inbox Item Tests
// ============================================================================

describe('show inbox item command', () => {
  test('shows inbox item with message content', async () => {
    const options = createTestOptions({ json: true });
    const result = await showCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const data = result.data as { id: string; messageContent: string | null; recipientId: string };
    expect(data.id).toBe(testInboxItemId);
    expect(data.messageContent).toBeDefined();
    expect(typeof data.messageContent).toBe('string');
    expect(data.recipientId).toBeDefined();
  });

  test('fails with non-existent inbox item', async () => {
    const options = createTestOptions();
    const result = await showCommand.handler!(['inbox-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('outputs only ID in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await showCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(testInboxItemId);
  });

  test('human-readable output includes message content', async () => {
    const options = createTestOptions();
    const result = await showCommand.handler!([testInboxItemId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toBeDefined();
    // The output should include the inbox item ID
    expect(result.message).toContain(testInboxItemId);
  });
});
