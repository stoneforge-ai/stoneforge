/**
 * Message Command Tests
 *
 * Tests for message send, list, and thread CLI commands.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { messageCommand } from './message.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import { createGroupChannel } from '@stoneforge/core';
import { createDocument, ContentType } from '@stoneforge/core';
import type { Element, EntityId } from '@stoneforge/core';
import type { Message } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_message_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

// Use proper entity ID format for test users
const TEST_USER = 'el-user1' as EntityId;
const OTHER_USER = 'el-user2' as EntityId;
const NON_MEMBER = 'el-user3' as EntityId;

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: TEST_USER,
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

let testChannelId: string;

beforeEach(async () => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });

  // Initialize database
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);

  // Create a test channel for message tests
  const api = createQuarryAPI(backend);
  const channel = await createGroupChannel({
    name: 'test-channel',
    createdBy: TEST_USER,
    members: [OTHER_USER],
  });
  const created = await api.create(channel as unknown as Element & Record<string, unknown>);
  testChannelId = created.id;
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Message Send Tests
// ============================================================================

describe('msg send command', () => {
  test('fails without channel option', async () => {
    const options = createTestOptions({ content: 'Hello' } as GlobalOptions & { content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--channel');
  });

  test('fails without content or file', async () => {
    const options = createTestOptions({ channel: testChannelId } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('content');
  });

  test('fails with both content and file', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Hello',
      file: 'test.txt',
    } as GlobalOptions & { channel: string; content: string; file: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Cannot specify both');
  });

  test('sends a message to a channel', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Hello, World!',
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as Message).id).toMatch(/^el-/);
    expect(result.message).toContain('Sent message');
    expect(result.message).toContain(testChannelId);
  });

  test('sends a message from file content', async () => {
    const testFilePath = join(TEST_DIR, 'message.txt');
    writeFileSync(testFilePath, 'Message from file');

    const options = createTestOptions({
      channel: testChannelId,
      file: testFilePath,
    } as GlobalOptions & { channel: string; file: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });

  test('fails with non-existent channel', async () => {
    const options = createTestOptions({
      channel: 'el-nonexistent',
      content: 'Hello',
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails when not a member of channel', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Hello',
      actor: NON_MEMBER,
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.PERMISSION);
    expect(result.error).toContain('not a member');
  });

  test('sends a threaded reply', async () => {
    // First send a root message
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root message',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    expect(rootResult.exitCode).toBe(ExitCode.SUCCESS);
    const rootMessageId = (rootResult.data as Message).id;

    // Send a reply
    const replyOptions = createTestOptions({
      channel: testChannelId,
      content: 'Reply message',
      thread: rootMessageId,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    const replyResult = await messageCommand.subcommands!.send.handler!([], replyOptions);

    expect(replyResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((replyResult.data as Message).threadId).toBe(rootMessageId);
    expect(replyResult.message).toContain('reply to');
  });

  test('fails with thread parent in different channel', async () => {
    // Create another channel
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    const otherChannel = await createGroupChannel({
      name: 'other-channel',
      createdBy: TEST_USER,
      members: [OTHER_USER],  // creator + 1 member = 2 members
    });
    const createdChannel = await api.create(otherChannel as unknown as Element & Record<string, unknown>);

    // Send message in other channel
    const otherDoc = await createDocument({
      content: 'Other channel message',
      contentType: ContentType.TEXT,
      createdBy: TEST_USER,
    });
    const createdDoc = await api.create(otherDoc as unknown as Element & Record<string, unknown>);

    const { createMessage } = await import('@stoneforge/core');
    const otherMessage = await createMessage({
      channelId: createdChannel.id as unknown as ChannelId,
      sender: TEST_USER,
      contentRef: createdDoc.id as unknown as DocumentId,
    });
    const createdMessage = await api.create(otherMessage as unknown as Element & Record<string, unknown>);

    // Try to reply in test channel to message in other channel
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Reply',
      thread: createdMessage.id,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('different channel');
  });

  test('sends message with tags', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Tagged message',
      tag: ['important', 'urgent'],
    } as GlobalOptions & { channel: string; content: string; tag: string[] });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message).tags).toEqual(['important', 'urgent']);
  });

  test('outputs only ID in quiet mode', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Quiet message',
      quiet: true,
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toMatch(/^el-/);
  });
});

// ============================================================================
// Message List Tests
// ============================================================================

describe('msg list command', () => {
  test('fails without channel option', async () => {
    const options = createTestOptions();
    const result = await messageCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--channel');
  });

  test('returns empty list when no messages', async () => {
    const options = createTestOptions({
      channel: testChannelId,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No messages found');
  });

  test('lists messages in channel', async () => {
    // Send some messages
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Message 1',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);
    await messageCommand.subcommands!.send.handler!([], { ...sendOptions, content: 'Message 2' });

    // List messages
    const listOptions = createTestOptions({
      channel: testChannelId,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(2);
  });

  test('filters by sender', async () => {
    // Send message as test-user
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Test user message',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);

    // Send message as other-user
    const otherOptions = createTestOptions({
      channel: testChannelId,
      content: 'Other user message',
      actor: OTHER_USER as EntityId,
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], otherOptions);

    // List only test-user messages
    const listOptions = createTestOptions({
      channel: testChannelId,
      sender: TEST_USER,
    } as GlobalOptions & { channel: string; sender: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(1);
    expect((result.data as Message[])[0].sender).toBe(TEST_USER);
  });

  test('filters root-only messages', async () => {
    // Send root message
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root message',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    // Send reply
    const replyOptions = createTestOptions({
      channel: testChannelId,
      content: 'Reply',
      thread: rootId,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    await messageCommand.subcommands!.send.handler!([], replyOptions);

    // List only root messages
    const listOptions = createTestOptions({
      channel: testChannelId,
      rootOnly: true,
    } as GlobalOptions & { channel: string; rootOnly: boolean });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(1);
    expect((result.data as Message[])[0].threadId).toBeNull();
  });

  test('respects limit option', async () => {
    // Send 5 messages
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Message',
    } as GlobalOptions & { channel: string; content: string });
    for (let i = 0; i < 5; i++) {
      await messageCommand.subcommands!.send.handler!([], { ...sendOptions, content: `Message ${i}` });
    }

    // List with limit
    const listOptions = createTestOptions({
      channel: testChannelId,
      limit: '3',
    } as GlobalOptions & { channel: string; limit: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(3);
  });

  test('fails with non-existent channel', async () => {
    const options = createTestOptions({
      channel: 'el-nonexistent',
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('outputs JSON in JSON mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'JSON test',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);

    const listOptions = createTestOptions({
      channel: testChannelId,
      json: true,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs only IDs in quiet mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Quiet test',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);

    const listOptions = createTestOptions({
      channel: testChannelId,
      quiet: true,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});

// ============================================================================
// Message Thread Tests
// ============================================================================

describe('msg thread command', () => {
  test('fails without message ID argument', async () => {
    const options = createTestOptions();
    const result = await messageCommand.subcommands!.thread.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with non-existent message', async () => {
    const options = createTestOptions();
    const result = await messageCommand.subcommands!.thread.handler!(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('shows thread with root and replies', async () => {
    // Send root message
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root message',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    // Send replies
    for (let i = 1; i <= 3; i++) {
      const replyOptions = createTestOptions({
        channel: testChannelId,
        content: `Reply ${i}`,
        thread: rootId,
      } as GlobalOptions & { channel: string; content: string; thread: string });
      await messageCommand.subcommands!.send.handler!([], replyOptions);
    }

    // Get thread
    const threadOptions = createTestOptions();
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(4); // root + 3 replies
    expect(result.message).toContain('3 replies');
  });

  test('respects limit option', async () => {
    // Send root and replies
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    for (let i = 1; i <= 5; i++) {
      const replyOptions = createTestOptions({
        channel: testChannelId,
        content: `Reply ${i}`,
        thread: rootId,
      } as GlobalOptions & { channel: string; content: string; thread: string });
      await messageCommand.subcommands!.send.handler!([], replyOptions);
    }

    // Get thread with limit
    const threadOptions = createTestOptions({ limit: '3' } as GlobalOptions & { limit: string });
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(3);
  });

  test('outputs JSON in JSON mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'JSON thread test',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    const threadOptions = createTestOptions({ json: true });
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs only IDs in quiet mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Quiet thread test',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    const threadOptions = createTestOptions({ quiet: true });
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});

// ============================================================================
// Message Command Structure Tests
// ============================================================================

describe('message command structure', () => {
  test('has correct name', () => {
    expect(messageCommand.name).toBe('message');
  });

  test('has description', () => {
    expect(messageCommand.description).toBeDefined();
    expect(messageCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(messageCommand.usage).toBeDefined();
    expect(messageCommand.usage).toContain('message');
  });

  test('has help text', () => {
    expect(messageCommand.help).toBeDefined();
    expect(messageCommand.help).toContain('immutable');
  });

  test('has send subcommand', () => {
    expect(messageCommand.subcommands).toBeDefined();
    expect(messageCommand.subcommands!.send).toBeDefined();
    expect(messageCommand.subcommands!.send.name).toBe('send');
  });

  test('has list subcommand', () => {
    expect(messageCommand.subcommands).toBeDefined();
    expect(messageCommand.subcommands!.list).toBeDefined();
    expect(messageCommand.subcommands!.list.name).toBe('list');
  });

  test('has thread subcommand', () => {
    expect(messageCommand.subcommands).toBeDefined();
    expect(messageCommand.subcommands!.thread).toBeDefined();
    expect(messageCommand.subcommands!.thread.name).toBe('thread');
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await messageCommand.handler!(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unknown subcommand');
  });

  test('returns error when no subcommand provided', async () => {
    const options = createTestOptions();
    const result = await messageCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });
});

// ============================================================================
// Send Command Options Tests
// ============================================================================

describe('msg send command options', () => {
  test('has --channel option', () => {
    const channelOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'channel');
    expect(channelOption).toBeDefined();
    expect(channelOption!.short).toBe('c');
    // Not required since --to or --reply-to can be used instead
    expect(channelOption!.required).toBeUndefined();
  });

  test('has --to option', () => {
    const toOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'to');
    expect(toOption).toBeDefined();
    expect(toOption!.short).toBe('T');
    expect(toOption!.hasValue).toBe(true);
  });

  test('has --replyTo option', () => {
    const replyToOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'replyTo');
    expect(replyToOption).toBeDefined();
    expect(replyToOption!.short).toBe('r');
    expect(replyToOption!.hasValue).toBe(true);
  });

  test('has --content option', () => {
    const contentOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'content');
    expect(contentOption).toBeDefined();
    expect(contentOption!.short).toBe('m');
  });

  test('has --file option', () => {
    const fileOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'file');
    expect(fileOption).toBeDefined();
    // No short form since -f is now global --from alias
    expect(fileOption!.short).toBeUndefined();
  });

  test('has --thread option', () => {
    const threadOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'thread');
    expect(threadOption).toBeDefined();
    expect(threadOption!.short).toBe('t');
  });

  test('has --attachment option', () => {
    const attachmentOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'attachment');
    expect(attachmentOption).toBeDefined();
    expect(attachmentOption!.short).toBe('a');
  });

  test('has --tag option', () => {
    const tagOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'tag');
    expect(tagOption).toBeDefined();
  });
});

// ============================================================================
// Reply Command Tests
// ============================================================================

describe('msg reply command', () => {
  test('is registered as subcommand', () => {
    expect(messageCommand.subcommands!.reply).toBeDefined();
    expect(messageCommand.subcommands!.reply.name).toBe('reply');
  });

  test('has --content option', () => {
    const contentOption = messageCommand.subcommands!.reply.options?.find((o) => o.name === 'content');
    expect(contentOption).toBeDefined();
    expect(contentOption!.short).toBe('m');
  });

  test('has --file option', () => {
    const fileOption = messageCommand.subcommands!.reply.options?.find((o) => o.name === 'file');
    expect(fileOption).toBeDefined();
  });

  test('has --attachment option', () => {
    const attachmentOption = messageCommand.subcommands!.reply.options?.find((o) => o.name === 'attachment');
    expect(attachmentOption).toBeDefined();
    expect(attachmentOption!.short).toBe('a');
  });

  test('does not have --channel option', () => {
    const channelOption = messageCommand.subcommands!.reply.options?.find((o) => o.name === 'channel');
    expect(channelOption).toBeUndefined();
  });

  test('does not have --to option', () => {
    const toOption = messageCommand.subcommands!.reply.options?.find((o) => o.name === 'to');
    expect(toOption).toBeUndefined();
  });

  test('does not have --thread option', () => {
    const threadOption = messageCommand.subcommands!.reply.options?.find((o) => o.name === 'thread');
    expect(threadOption).toBeUndefined();
  });
});

// ============================================================================
// List Command Options Tests
// ============================================================================

describe('msg list command options', () => {
  test('has --channel option', () => {
    const channelOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'channel');
    expect(channelOption).toBeDefined();
    expect(channelOption!.short).toBe('c');
    expect(channelOption!.required).toBe(true);
  });

  test('has --sender option', () => {
    const senderOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'sender');
    expect(senderOption).toBeDefined();
    expect(senderOption!.short).toBe('s');
  });

  test('has --limit option', () => {
    const limitOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'limit');
    expect(limitOption).toBeDefined();
    expect(limitOption!.short).toBe('l');
  });

  test('has --rootOnly option', () => {
    const rootOnlyOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'rootOnly');
    expect(rootOnlyOption).toBeDefined();
    expect(rootOnlyOption!.short).toBe('r');
  });
});

// ============================================================================
// Thread Command Options Tests
// ============================================================================

describe('msg thread command options', () => {
  test('has --limit option', () => {
    const limitOption = messageCommand.subcommands!.thread.options?.find((o) => o.name === 'limit');
    expect(limitOption).toBeDefined();
    expect(limitOption!.short).toBe('l');
  });
});

// ============================================================================
// E2E Tests: Direct Messaging Flow
// ============================================================================

describe('E2E: Direct Messaging Flow', () => {
  test('complete direct message conversation between two users', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create a direct channel between TEST_USER and OTHER_USER
    const { createDirectChannel } = await import('@stoneforge/core');
    const directChannel = await createDirectChannel({
      entityA: TEST_USER,
      entityB: OTHER_USER,
      createdBy: TEST_USER,
    });
    const createdChannel = await api.create(directChannel as unknown as Element & Record<string, unknown>);

    // User 1 sends initial message
    const sendOptions1 = createTestOptions({
      channel: createdChannel.id,
      content: 'Hello! How are you?',
    } as GlobalOptions & { channel: string; content: string });
    const msg1Result = await messageCommand.subcommands!.send.handler!([], sendOptions1);
    expect(msg1Result.exitCode).toBe(ExitCode.SUCCESS);

    // User 2 replies
    const sendOptions2 = createTestOptions({
      channel: createdChannel.id,
      content: "I'm doing great, thanks!",
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string });
    const msg2Result = await messageCommand.subcommands!.send.handler!([], sendOptions2);
    expect(msg2Result.exitCode).toBe(ExitCode.SUCCESS);

    // User 1 sends another message
    const sendOptions3 = createTestOptions({
      channel: createdChannel.id,
      content: 'Great to hear! Want to grab coffee?',
    } as GlobalOptions & { channel: string; content: string });
    const msg3Result = await messageCommand.subcommands!.send.handler!([], sendOptions3);
    expect(msg3Result.exitCode).toBe(ExitCode.SUCCESS);

    // List all messages in the conversation
    const listOptions = createTestOptions({
      channel: createdChannel.id,
    } as GlobalOptions & { channel: string });
    const listResult = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const messages = listResult.data as Message[];
    expect(messages.length).toBe(3);

    // Verify message senders alternate
    const senders = messages.map((m) => m.sender);
    expect(senders).toContain(TEST_USER);
    expect(senders).toContain(OTHER_USER);

    backend.close();
  });

  test('non-participant cannot send to direct channel', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create a direct channel between TEST_USER and OTHER_USER
    const { createDirectChannel } = await import('@stoneforge/core');
    const directChannel = await createDirectChannel({
      entityA: TEST_USER,
      entityB: OTHER_USER,
      createdBy: TEST_USER,
    });
    const createdChannel = await api.create(directChannel as unknown as Element & Record<string, unknown>);

    // Non-participant (NON_MEMBER) tries to send message
    const sendOptions = createTestOptions({
      channel: createdChannel.id,
      content: 'Trying to intrude!',
      actor: NON_MEMBER,
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], sendOptions);

    expect(result.exitCode).toBe(ExitCode.PERMISSION);
    expect(result.error).toContain('not a member');

    backend.close();
  });
});

// ============================================================================
// E2E Tests: Group Channel Messaging Flow
// ============================================================================

describe('E2E: Group Channel Messaging Flow', () => {
  test('multiple users exchange messages in group channel', async () => {
    const THIRD_USER = 'el-user4' as EntityId;

    // Create channel with multiple members
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    const { createGroupChannel } = await import('@stoneforge/core');
    const groupChannel = await createGroupChannel({
      name: 'team-discussion',
      createdBy: TEST_USER,
      members: [OTHER_USER, THIRD_USER],
    });
    const createdChannel = await api.create(groupChannel as unknown as Element & Record<string, unknown>);

    // TEST_USER starts the discussion
    const msg1Options = createTestOptions({
      channel: createdChannel.id,
      content: 'Welcome everyone to the team channel!',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], msg1Options);

    // OTHER_USER responds
    const msg2Options = createTestOptions({
      channel: createdChannel.id,
      content: 'Thanks for setting this up!',
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], msg2Options);

    // THIRD_USER chimes in
    const msg3Options = createTestOptions({
      channel: createdChannel.id,
      content: 'Excited to collaborate!',
      actor: THIRD_USER,
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], msg3Options);

    // List all messages
    const listOptions = createTestOptions({
      channel: createdChannel.id,
    } as GlobalOptions & { channel: string });
    const listResult = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const messages = listResult.data as Message[];
    expect(messages.length).toBe(3);

    // All three users should have sent messages
    const senders = new Set(messages.map((m) => String(m.sender)));
    expect(senders.size).toBe(3);
    expect(senders.has(TEST_USER)).toBe(true);
    expect(senders.has(OTHER_USER)).toBe(true);
    expect(senders.has(THIRD_USER)).toBe(true);

    backend.close();
  });

  test('new member can message after being added', async () => {
    const NEW_MEMBER = 'el-newbie' as EntityId;

    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    const { createGroupChannel } = await import('@stoneforge/core');
    const groupChannel = await createGroupChannel({
      name: 'growing-team',
      createdBy: TEST_USER,
      members: [OTHER_USER],
    });
    const createdChannel = await api.create(groupChannel as unknown as Element & Record<string, unknown>);

    // NEW_MEMBER tries to send before being added - should fail
    const failOptions = createTestOptions({
      channel: createdChannel.id,
      content: 'Hello!',
      actor: NEW_MEMBER,
    } as GlobalOptions & { channel: string; content: string });
    const failResult = await messageCommand.subcommands!.send.handler!([], failOptions);
    expect(failResult.exitCode).toBe(ExitCode.PERMISSION);

    // Add NEW_MEMBER to channel
    await api.addChannelMember(createdChannel.id as ElementId, NEW_MEMBER, {
      actor: TEST_USER,
    });

    // NOW NEW_MEMBER can send
    const successOptions = createTestOptions({
      channel: createdChannel.id,
      content: 'Hello team! Glad to be here!',
      actor: NEW_MEMBER,
    } as GlobalOptions & { channel: string; content: string });
    const successResult = await messageCommand.subcommands!.send.handler!([], successOptions);
    expect(successResult.exitCode).toBe(ExitCode.SUCCESS);

    backend.close();
  });

  test('removed member cannot send messages', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    const { createGroupChannel } = await import('@stoneforge/core');
    const groupChannel = await createGroupChannel({
      name: 'restricted-channel',
      createdBy: TEST_USER,
      members: [OTHER_USER],
    });
    const createdChannel = await api.create(groupChannel as unknown as Element & Record<string, unknown>);

    // OTHER_USER sends a message while still a member
    const msg1Options = createTestOptions({
      channel: createdChannel.id,
      content: 'I am still a member',
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string });
    const msg1Result = await messageCommand.subcommands!.send.handler!([], msg1Options);
    expect(msg1Result.exitCode).toBe(ExitCode.SUCCESS);

    // Remove OTHER_USER from channel
    await api.removeChannelMember(createdChannel.id as ElementId, OTHER_USER, {
      actor: TEST_USER,
    });

    // OTHER_USER tries to send after being removed - should fail
    const msg2Options = createTestOptions({
      channel: createdChannel.id,
      content: 'Can I still send?',
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string });
    const msg2Result = await messageCommand.subcommands!.send.handler!([], msg2Options);
    expect(msg2Result.exitCode).toBe(ExitCode.PERMISSION);
    expect(msg2Result.error).toContain('not a member');

    backend.close();
  });
});

// ============================================================================
// E2E Tests: Threaded Conversation Flow
// ============================================================================

describe('E2E: Threaded Conversation Flow', () => {
  test('complete thread lifecycle: post, reply, view thread', async () => {
    // Send a root message
    const rootOptions = createTestOptions({
      channel: testChannelId,
      content: 'Starting a discussion about the new feature',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], rootOptions);
    expect(rootResult.exitCode).toBe(ExitCode.SUCCESS);
    const rootMessage = rootResult.data as Message;

    // OTHER_USER replies to the thread
    const reply1Options = createTestOptions({
      channel: testChannelId,
      content: 'I think we should consider option A',
      thread: rootMessage.id,
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    await messageCommand.subcommands!.send.handler!([], reply1Options);

    // TEST_USER replies to the thread
    const reply2Options = createTestOptions({
      channel: testChannelId,
      content: 'Good point, but option B has better performance',
      thread: rootMessage.id,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    await messageCommand.subcommands!.send.handler!([], reply2Options);

    // OTHER_USER adds another reply
    const reply3Options = createTestOptions({
      channel: testChannelId,
      content: "Let's run some benchmarks to compare",
      thread: rootMessage.id,
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    await messageCommand.subcommands!.send.handler!([], reply3Options);

    // View the complete thread
    const threadOptions = createTestOptions();
    const threadResult = await messageCommand.subcommands!.thread.handler!([rootMessage.id], threadOptions);

    expect(threadResult.exitCode).toBe(ExitCode.SUCCESS);
    const threadMessages = threadResult.data as Message[];
    expect(threadMessages.length).toBe(4); // root + 3 replies
    expect(threadResult.message).toContain('3 replies');

    // Verify thread structure
    const root = threadMessages.find((m) => m.threadId === null);
    expect(root).toBeDefined();
    expect(root!.id).toBe(rootMessage.id);

    const replies = threadMessages.filter((m) => m.threadId === rootMessage.id);
    expect(replies.length).toBe(3);
  });

  test('nested discussion with multiple root messages', async () => {
    // Send first root message
    const root1Options = createTestOptions({
      channel: testChannelId,
      content: 'Topic 1: UI Design',
    } as GlobalOptions & { channel: string; content: string });
    const root1Result = await messageCommand.subcommands!.send.handler!([], root1Options);
    const root1 = root1Result.data as Message;

    // Send second root message
    const root2Options = createTestOptions({
      channel: testChannelId,
      content: 'Topic 2: Backend Architecture',
    } as GlobalOptions & { channel: string; content: string });
    const root2Result = await messageCommand.subcommands!.send.handler!([], root2Options);
    const root2 = root2Result.data as Message;

    // Reply to first topic
    const reply1Options = createTestOptions({
      channel: testChannelId,
      content: 'Let us use a modern design system',
      thread: root1.id,
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    await messageCommand.subcommands!.send.handler!([], reply1Options);

    // Reply to second topic
    const reply2Options = createTestOptions({
      channel: testChannelId,
      content: 'Microservices would be ideal',
      thread: root2.id,
      actor: OTHER_USER,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    await messageCommand.subcommands!.send.handler!([], reply2Options);

    // List root-only messages
    const listOptions = createTestOptions({
      channel: testChannelId,
      rootOnly: true,
    } as GlobalOptions & { channel: string; rootOnly: boolean });
    const listResult = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const rootMessages = listResult.data as Message[];
    expect(rootMessages.length).toBe(2);
    expect(rootMessages.every((m) => m.threadId === null)).toBe(true);

    // Each thread should have exactly 1 reply
    const thread1Result = await messageCommand.subcommands!.thread.handler!([root1.id], createTestOptions());
    expect((thread1Result.data as Message[]).length).toBe(2); // root + 1 reply

    const thread2Result = await messageCommand.subcommands!.thread.handler!([root2.id], createTestOptions());
    expect((thread2Result.data as Message[]).length).toBe(2); // root + 1 reply
  });
});

// ============================================================================
// E2E Tests: Channel Lifecycle with Messaging
// ============================================================================

describe('E2E: Channel Lifecycle with Messaging', () => {
  test('full workflow: create channel, exchange messages, verify history', async () => {
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // 1. Create a new channel
    const { createGroupChannel } = await import('@stoneforge/core');
    const channel = await createGroupChannel({
      name: 'project-alpha',
      createdBy: TEST_USER,
      members: [OTHER_USER],
    });
    const createdChannel = await api.create(channel as unknown as Element & Record<string, unknown>);

    // 2. Exchange messages over time (simulating a real conversation)
    const conversations = [
      { user: TEST_USER, content: 'Project kickoff!' },
      { user: OTHER_USER, content: 'Excited to start!' },
      { user: TEST_USER, content: 'Here is the timeline' },
      { user: OTHER_USER, content: 'Looks good to me' },
      { user: TEST_USER, content: 'Let us begin with phase 1' },
    ];

    for (const conv of conversations) {
      const options = createTestOptions({
        channel: createdChannel.id,
        content: conv.content,
        actor: conv.user,
      } as GlobalOptions & { channel: string; content: string });
      const result = await messageCommand.subcommands!.send.handler!([], options);
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
    }

    // 3. List all messages and verify order
    const listOptions = createTestOptions({
      channel: createdChannel.id,
    } as GlobalOptions & { channel: string });
    const listResult = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const messages = listResult.data as Message[];
    expect(messages.length).toBe(5);

    // 4. Filter by sender
    const user1Messages = createTestOptions({
      channel: createdChannel.id,
      sender: TEST_USER,
    } as GlobalOptions & { channel: string; sender: string });
    const user1Result = await messageCommand.subcommands!.list.handler!([], user1Messages);
    expect((user1Result.data as Message[]).length).toBe(3);

    const user2Messages = createTestOptions({
      channel: createdChannel.id,
      sender: OTHER_USER,
    } as GlobalOptions & { channel: string; sender: string });
    const user2Result = await messageCommand.subcommands!.list.handler!([], user2Messages);
    expect((user2Result.data as Message[]).length).toBe(2);

    backend.close();
  });

  test('messages persist across database connections', async () => {
    // Create channel and send messages
    let backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    let api = createQuarryAPI(backend);

    const { createGroupChannel } = await import('@stoneforge/core');
    const channel = await createGroupChannel({
      name: 'persistent-channel',
      createdBy: TEST_USER,
      members: [OTHER_USER],
    });
    const createdChannel = await api.create(channel as unknown as Element & Record<string, unknown>);
    const channelId = createdChannel.id;

    // Send message
    const sendOptions = createTestOptions({
      channel: channelId,
      content: 'This message should persist',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);

    // Close database connection
    backend.close();

    // Reopen database and verify message persists
    backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    api = createQuarryAPI(backend);

    const listOptions = createTestOptions({
      channel: channelId,
    } as GlobalOptions & { channel: string });
    const listResult = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const messages = listResult.data as Message[];
    expect(messages.length).toBe(1);

    backend.close();
  });
});

// ============================================================================
// E2E Tests: Messaging Output Formats
// ============================================================================

describe('E2E: Messaging Output Formats', () => {
  test('JSON output for API integration', async () => {
    // Send a few messages
    for (let i = 1; i <= 3; i++) {
      const options = createTestOptions({
        channel: testChannelId,
        content: `Message ${i}`,
      } as GlobalOptions & { channel: string; content: string });
      await messageCommand.subcommands!.send.handler!([], options);
    }

    // List in JSON mode
    const jsonOptions = createTestOptions({
      channel: testChannelId,
      json: true,
    } as GlobalOptions & { channel: string });
    const jsonResult = await messageCommand.subcommands!.list.handler!([], jsonOptions);

    expect(jsonResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(jsonResult.data)).toBe(true);

    // Each message should have all required fields
    const messages = jsonResult.data as Message[];
    for (const msg of messages) {
      expect(msg.id).toMatch(/^el-/);
      expect(msg.type).toBe('message');
      expect(msg.channelId).toBe(testChannelId);
      expect(msg.sender).toBeDefined();
      expect(msg.createdAt).toBeDefined();
    }
  });

  test('quiet output for scripting', async () => {
    // Send messages
    for (let i = 1; i <= 3; i++) {
      const options = createTestOptions({
        channel: testChannelId,
        content: `Quiet message ${i}`,
      } as GlobalOptions & { channel: string; content: string });
      await messageCommand.subcommands!.send.handler!([], options);
    }

    // List in quiet mode
    const quietOptions = createTestOptions({
      channel: testChannelId,
      quiet: true,
    } as GlobalOptions & { channel: string });
    const quietResult = await messageCommand.subcommands!.list.handler!([], quietOptions);

    expect(quietResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof quietResult.data).toBe('string');

    // Should be newline-separated IDs
    const ids = (quietResult.data as string).split('\n');
    expect(ids.length).toBe(3);
    ids.forEach((id) => expect(id).toMatch(/^el-/));
  });
});
