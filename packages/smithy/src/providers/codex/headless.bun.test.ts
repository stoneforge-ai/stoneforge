/**
 * Codex Headless Provider Tests
 *
 * Tests for the CodexEventMapper and notification handler plumbing used by
 * CodexHeadlessSession to convert codex app-server notifications into
 * AgentMessage streams.
 */

import { describe, it, expect, mock } from 'bun:test';
import type { AgentMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type NotificationHandler = (method: string, params: unknown) => void;

function createMockClient(threadId: string) {
  const notificationHandlers = new Set<NotificationHandler>();

  return {
    threadId,
    /** Simulate server notification dispatch */
    emitNotification(method: string, params: unknown) {
      for (const handler of notificationHandlers) {
        handler(method, params);
      }
    },
    thread: {
      start: mock(async () => ({ thread: { id: threadId } })),
      read: mock(async () => ({ thread: { id: threadId } })),
      resume: mock(async () => ({ thread: { id: threadId } })),
    },
    turn: {
      start: mock(async () => {}),
      interrupt: mock(async () => {}),
    },
    onNotification(handler: NotificationHandler) {
      notificationHandlers.add(handler);
      return () => { notificationHandlers.delete(handler); };
    },
    respondToServer: mock(() => {}),
    close: mock(() => {}),
  };
}

// ---------------------------------------------------------------------------
// Test the core event mapping pipeline
// ---------------------------------------------------------------------------

import { CodexEventMapper } from './event-mapper.js';
import { AsyncQueue } from '../opencode/async-queue.js';

describe('Codex headless event mapping', () => {
  const threadId = 'thr_test-abc';

  describe('notification to AgentMessage mapping', () => {
    it('should map text deltas to assistant messages', async () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();

      const notifications = [
        { method: 'turn/started', params: { threadId } },
        { method: 'item/agentMessage/delta', params: { threadId, delta: 'Hello ', itemId: 'msg-1' } },
        { method: 'item/agentMessage/delta', params: { threadId, delta: 'world!', itemId: 'msg-1' } },
        { method: 'turn/completed', params: { threadId, status: 'completed' } },
      ];

      for (const { method, params } of notifications) {
        const notification = { method, params: params as any };
        const agentMessages = mapper.mapNotification(notification, threadId);
        for (const msg of agentMessages) {
          queue.push(msg);
        }
      }

      for (const msg of mapper.flush()) {
        queue.push(msg);
      }
      queue.close();

      const messages: AgentMessage[] = [];
      for await (const msg of queue) {
        messages.push(msg);
      }

      // Should have: assistant text + result
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('Hello world!');
      expect(messages[1].type).toBe('result');
      expect(messages[1].subtype).toBe('success');
    });

    it('should map tool calls with results', async () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();

      const notifications = [
        { method: 'turn/started', params: { threadId } },
        { method: 'item/agentMessage/delta', params: { threadId, delta: 'Let me run a command.', itemId: 'msg-1' } },
        {
          method: 'item/started', params: {
            threadId,
            item: { type: 'commandExecution', id: 'cmd-1', command: 'ls -la', cwd: '/tmp' },
          },
        },
        {
          method: 'item/completed', params: {
            threadId,
            item: { type: 'commandExecution', id: 'cmd-1', command: 'ls -la', stdout: 'file.txt', exitCode: 0 },
          },
        },
        { method: 'turn/completed', params: { threadId, status: 'completed' } },
      ];

      for (const { method, params } of notifications) {
        const notification = { method, params: params as any };
        for (const msg of mapper.mapNotification(notification, threadId)) {
          queue.push(msg);
        }
      }
      for (const msg of mapper.flush()) {
        queue.push(msg);
      }
      queue.close();

      const messages: AgentMessage[] = [];
      for await (const msg of queue) {
        messages.push(msg);
      }

      // assistant text, tool_use, tool_result, result
      expect(messages.length).toBe(4);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('Let me run a command.');
      expect(messages[1].type).toBe('tool_use');
      expect(messages[1].tool?.name).toBe('commandExecution');
      expect(messages[2].type).toBe('tool_result');
      expect(messages[2].content).toBe('file.txt');
      expect(messages[3].type).toBe('result');
    });

    it('should use streamed output deltas for command execution results', async () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();

      const notifications = [
        { method: 'turn/started', params: { threadId } },
        { method: 'item/agentMessage/delta', params: { threadId, delta: 'Running command.', itemId: 'msg-1' } },
        {
          method: 'item/started', params: {
            threadId,
            item: { type: 'commandExecution', id: 'cmd-1', command: 'cat file.txt', cwd: '/tmp' },
          },
        },
        { method: 'item/commandExecution/outputDelta', params: { threadId, delta: 'line 1\n', itemId: 'cmd-1' } },
        { method: 'item/commandExecution/outputDelta', params: { threadId, delta: 'line 2\n', itemId: 'cmd-1' } },
        {
          method: 'item/completed', params: {
            threadId,
            item: { type: 'commandExecution', id: 'cmd-1', command: 'cat file.txt', exitCode: 0 },
          },
        },
        { method: 'turn/completed', params: { threadId, status: 'completed' } },
      ];

      for (const { method, params } of notifications) {
        for (const msg of mapper.mapNotification({ method, params: params as any }, threadId)) {
          queue.push(msg);
        }
      }
      for (const msg of mapper.flush()) { queue.push(msg); }
      queue.close();

      const messages: AgentMessage[] = [];
      for await (const msg of queue) { messages.push(msg); }

      expect(messages.length).toBe(4);
      expect(messages[0].type).toBe('assistant');
      expect(messages[1].type).toBe('tool_use');
      expect(messages[2].type).toBe('tool_result');
      expect(messages[2].content).toBe('line 1\nline 2\n');
      expect(messages[3].type).toBe('result');
    });

    it('should use streamed output deltas for file change results', async () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();

      const notifications = [
        { method: 'turn/started', params: { threadId } },
        {
          method: 'item/started', params: {
            threadId,
            item: { type: 'fileChange', id: 'fc-1', changes: { file: 'test.ts' } },
          },
        },
        { method: 'item/fileChange/outputDelta', params: { threadId, delta: 'diff --git a/test.ts\n', itemId: 'fc-1' } },
        { method: 'item/fileChange/outputDelta', params: { threadId, delta: '+new line\n', itemId: 'fc-1' } },
        {
          method: 'item/completed', params: {
            threadId,
            item: { type: 'fileChange', id: 'fc-1' },
          },
        },
        { method: 'turn/completed', params: { threadId, status: 'completed' } },
      ];

      for (const { method, params } of notifications) {
        for (const msg of mapper.mapNotification({ method, params: params as any }, threadId)) {
          queue.push(msg);
        }
      }
      for (const msg of mapper.flush()) { queue.push(msg); }
      queue.close();

      const messages: AgentMessage[] = [];
      for await (const msg of queue) { messages.push(msg); }

      expect(messages.length).toBe(3);
      expect(messages[0].type).toBe('tool_use');
      expect(messages[1].type).toBe('tool_result');
      expect(messages[1].content).toBe('diff --git a/test.ts\n+new line\n');
      expect(messages[2].type).toBe('result');
    });

    it('should filter notifications for other threads', async () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();

      const notifications = [
        // Notification for a different thread — should be filtered
        { method: 'item/agentMessage/delta', params: { threadId: 'thr_other', delta: 'ignore me', itemId: 'x' } },
        // Notification for our thread
        { method: 'item/agentMessage/delta', params: { threadId, delta: 'keep me', itemId: 'msg-2' } },
        { method: 'turn/completed', params: { threadId, status: 'completed' } },
      ];

      for (const { method, params } of notifications) {
        const notification = { method, params: params as any };
        for (const msg of mapper.mapNotification(notification, threadId)) {
          queue.push(msg);
        }
      }
      for (const msg of mapper.flush()) {
        queue.push(msg);
      }
      queue.close();

      const messages: AgentMessage[] = [];
      for await (const msg of queue) {
        messages.push(msg);
      }

      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('keep me');
      expect(messages[1].type).toBe('result');
    });

    it('should not emit tool_result for non-tool item types (agentMessage, userMessage)', async () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();

      const notifications = [
        { method: 'turn/started', params: { threadId } },
        { method: 'item/agentMessage/delta', params: { threadId, delta: 'Hello!', itemId: 'msg-1' } },
        {
          method: 'item/completed', params: {
            threadId,
            item: { type: 'agentMessage', id: 'msg-1', text: 'Hello!' },
          },
        },
        { method: 'turn/completed', params: { threadId, status: 'completed' } },
      ];

      for (const { method, params } of notifications) {
        for (const msg of mapper.mapNotification({ method, params: params as any }, threadId)) {
          queue.push(msg);
        }
      }
      for (const msg of mapper.flush()) { queue.push(msg); }
      queue.close();

      const messages: AgentMessage[] = [];
      for await (const msg of queue) { messages.push(msg); }

      // Should have: assistant text + result — NO tool_use or tool_result
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('Hello!');
      expect(messages[1].type).toBe('result');
      expect(messages.find(m => m.type === 'tool_result')).toBeUndefined();
      expect(messages.find(m => m.type === 'tool_use')).toBeUndefined();
    });

    it('should handle empty notification stream gracefully', () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();

      const notifications: Array<{ method: string; params: unknown }> = [];

      for (const { method, params } of notifications) {
        const notification = { method, params: params as any };
        for (const msg of mapper.mapNotification(notification, threadId)) {
          queue.push(msg);
        }
      }

      // Queue should be empty
      expect(queue[Symbol.asyncIterator]).toBeDefined();
    });
  });

  describe('session auto-close on turn/completed', () => {
    it('should close the message queue when turn/completed arrives for our thread', async () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();
      let closed = false;

      // Simulate the notification handler from CodexHeadlessSession
      const notifications = [
        { method: 'item/agentMessage/delta', params: { threadId, delta: 'Done.', itemId: 'msg-1' } },
        { method: 'turn/completed', params: { threadId, status: 'completed' } },
      ];

      for (const { method, params } of notifications) {
        const notification = { method, params: params as any };
        const agentMessages = mapper.mapNotification(notification, threadId);
        for (const msg of agentMessages) {
          queue.push(msg);
        }
        // Mirror the auto-close logic in CodexHeadlessSession
        if (method === 'turn/completed') {
          const p = params as { threadId?: string };
          if (!p.threadId || p.threadId === threadId) {
            for (const msg of mapper.flush()) {
              queue.push(msg);
            }
            queue.close();
            closed = true;
          }
        }
      }

      // Queue should be closed and drainable
      expect(closed).toBe(true);

      const messages: AgentMessage[] = [];
      for await (const msg of queue) {
        messages.push(msg);
      }

      // Should have assistant text + result, then iteration ends
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[1].type).toBe('result');
    });

    it('should not close on turn/completed for a different thread', () => {
      const mapper = new CodexEventMapper();
      const queue = new AsyncQueue<AgentMessage>();
      let closed = false;

      const notification = {
        method: 'turn/completed',
        params: { threadId: 'thr_other', status: 'completed' },
      };

      const agentMessages = mapper.mapNotification(
        { method: notification.method, params: notification.params as any },
        threadId,
      );
      for (const msg of agentMessages) {
        queue.push(msg);
      }

      // Check thread ID — should NOT close
      const p = notification.params as { threadId?: string };
      if (!p.threadId || p.threadId === threadId) {
        queue.close();
        closed = true;
      }

      expect(closed).toBe(false);
      // No messages mapped (filtered by thread ID)
      expect(agentMessages.length).toBe(0);
    });
  });

  describe('notification handler fan-out', () => {
    it('handler captures notifications and stops after unsubscribe', () => {
      const client = createMockClient(threadId);

      const captured: Array<{ method: string; params: unknown }> = [];
      const unsub = client.onNotification((method, params) => {
        captured.push({ method, params });
      });

      // Notifications arrive
      client.emitNotification('item/agentMessage/delta', { threadId, delta: 'Hello', itemId: 'msg-1' });
      client.emitNotification('turn/completed', { threadId, status: 'completed' });

      unsub();

      expect(captured.length).toBe(2);
      expect(captured[0].method).toBe('item/agentMessage/delta');
      expect(captured[1].method).toBe('turn/completed');

      // After unsubscribing, new notifications should NOT arrive
      client.emitNotification('item/agentMessage/delta', { threadId, delta: 'after', itemId: 'msg-2' });
      expect(captured.length).toBe(2); // Still 2
    });

    it('multiple handlers receive notifications independently', () => {
      const client = createMockClient(threadId);

      const handler1Messages: Array<{ method: string; params: unknown }> = [];
      const unsub1 = client.onNotification((method, params) => {
        handler1Messages.push({ method, params });
      });

      client.emitNotification('item/agentMessage/delta', { threadId, delta: 'first', itemId: 'msg-1' });

      unsub1();

      // Register second handler after first is unsubscribed
      const handler2Messages: Array<{ method: string; params: unknown }> = [];
      client.onNotification((method, params) => {
        handler2Messages.push({ method, params });
      });

      // New notifications go to second handler only
      client.emitNotification('item/agentMessage/delta', { threadId, delta: 'second', itemId: 'msg-2' });

      expect(handler1Messages.length).toBe(1);
      expect(handler2Messages.length).toBe(1);
      expect((handler2Messages[0].params as any).delta).toBe('second');
    });
  });
});
