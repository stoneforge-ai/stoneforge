/**
 * Codex Event Mapper Tests
 *
 * Tests for mapping Codex JSON-RPC notifications to AgentMessage format.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CodexEventMapper } from './event-mapper.js';
import type { CodexNotification } from './event-mapper.js';

describe('CodexEventMapper', () => {
  let mapper: CodexEventMapper;
  const threadId = 'thr_test-123';

  beforeEach(() => {
    mapper = new CodexEventMapper();
  });

  describe('thread ID filtering', () => {
    it('should pass notifications with matching thread ID', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'hello', itemId: 'msg-1' },
      }, threadId);
      const messages = mapper.flush();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('assistant');
    });

    it('should filter notifications with different thread ID', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId: 'thr_other', delta: 'hello', itemId: 'msg-1' },
      }, threadId);
      const messages = mapper.flush();
      expect(messages.length).toBe(0);
    });

    it('should pass notifications without thread ID (broadcast)', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { delta: 'hello', itemId: 'msg-1' },
      }, threadId);
      const messages = mapper.flush();
      expect(messages.length).toBe(1);
    });
  });

  describe('text delta buffering', () => {
    it('should buffer text deltas and flush on turn/completed', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'Hello ', itemId: 'msg-1' },
      }, threadId);
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'world', itemId: 'msg-1' },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'turn/completed',
        params: { threadId, status: 'completed' },
      }, threadId);
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('Hello world');
      expect(messages[1].type).toBe('result');
    });

    it('should flush text when a tool item/started arrives', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'Let me read that file.', itemId: 'msg-1' },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-1', command: 'cat foo.txt', cwd: '/tmp' },
        },
      }, threadId);
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('Let me read that file.');
      expect(messages[1].type).toBe('tool_use');
    });

    it('should accumulate multiple deltas into one message', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'A', itemId: 'msg-1' },
      }, threadId);
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'B', itemId: 'msg-1' },
      }, threadId);
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'C', itemId: 'msg-1' },
      }, threadId);

      const messages = mapper.flush();
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('ABC');
    });

    it('should flush old text when a new item starts sending deltas', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'Part 1', itemId: 'msg-1' },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'Part 2', itemId: 'msg-2' },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('Part 1');

      const remaining = mapper.flush();
      expect(remaining.length).toBe(1);
      expect(remaining[0].content).toBe('Part 2');
    });

    it('should return empty for text delta events (buffered, not emitted)', () => {
      const messages = mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'hello', itemId: 'msg-1' },
      }, threadId);
      expect(messages.length).toBe(0);
    });

    it('should not emit anything for empty delta', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: '', itemId: 'msg-1' },
      }, threadId);
      const messages = mapper.flush();
      expect(messages.length).toBe(0);
    });

    it('should not emit anything for missing delta', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, itemId: 'msg-1' },
      }, threadId);
      const messages = mapper.flush();
      expect(messages.length).toBe(0);
    });
  });

  describe('tool items - commandExecution', () => {
    it('should emit tool_use on item/started', () => {
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-1', command: 'ls -la', cwd: '/home' },
        },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_use');
      expect(messages[0].tool?.name).toBe('commandExecution');
      expect(messages[0].tool?.id).toBe('cmd-1');
      expect(messages[0].tool?.input).toEqual({ command: 'ls -la', cwd: '/home' });
    });

    it('should emit tool_result on item/completed', () => {
      // First emit tool_use
      mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-2', command: 'echo hi' },
        },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'item/completed',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-2', command: 'echo hi', stdout: 'hi\n', exitCode: 0 },
        },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_result');
      expect(messages[0].content).toBe('hi\n');
      expect(messages[0].tool?.id).toBe('cmd-2');
    });

    it('should emit tool_result with exit code when no stdout', () => {
      mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-3', command: 'true' },
        },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'item/completed',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-3', command: 'true', exitCode: 0 },
        },
      }, threadId);
      expect(messages[0].content).toBe('exit code: 0');
    });
  });

  describe('tool items - fileChange', () => {
    it('should emit tool_use on item/started', () => {
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'fileChange', id: 'fc-1', changes: [{ file: 'test.ts' }] },
        },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_use');
      expect(messages[0].tool?.name).toBe('fileChange');
      expect(messages[0].tool?.input).toEqual({ changes: [{ file: 'test.ts' }] });
    });

    it('should emit tool_result on item/completed', () => {
      mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'fileChange', id: 'fc-2', changes: [] },
        },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'item/completed',
        params: {
          threadId,
          item: { type: 'fileChange', id: 'fc-2', content: 'file written' },
        },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_result');
      expect(messages[0].content).toBe('file written');
    });
  });

  describe('tool items - mcpToolCall', () => {
    it('should emit tool_use with tool name on item/started', () => {
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'mcpToolCall', id: 'mcp-1', tool: 'search', arguments: { query: 'test' } },
        },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_use');
      expect(messages[0].tool?.name).toBe('search');
      expect(messages[0].tool?.input).toEqual({ query: 'test' });
    });

    it('should use fallback name when tool is missing', () => {
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'mcpToolCall', id: 'mcp-2' } as any,
        },
      }, threadId);
      expect(messages[0].tool?.name).toBe('mcpToolCall');
    });

    it('should emit tool_result on item/completed', () => {
      mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'mcpToolCall', id: 'mcp-3', tool: 'read' },
        },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'item/completed',
        params: {
          threadId,
          item: { type: 'mcpToolCall', id: 'mcp-3', tool: 'read', result: 'file contents' },
        },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_result');
      expect(messages[0].content).toBe('file contents');
    });
  });

  describe('tool deduplication', () => {
    it('should not duplicate tool_use for same item ID', () => {
      const notification: CodexNotification = {
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-dup', command: 'ls' },
        },
      };
      const first = mapper.mapNotification(notification, threadId);
      expect(first.length).toBe(1);
      expect(first[0].type).toBe('tool_use');

      const second = mapper.mapNotification(notification, threadId);
      expect(second.length).toBe(0);
    });

    it('should not duplicate tool_result for same item ID', () => {
      mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-dup2', command: 'ls' },
        },
      }, threadId);

      const completed: CodexNotification = {
        method: 'item/completed',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-dup2', stdout: 'ok', exitCode: 0 },
        },
      };
      const first = mapper.mapNotification(completed, threadId);
      expect(first.length).toBe(1);
      expect(first[0].type).toBe('tool_result');

      const second = mapper.mapNotification(completed, threadId);
      expect(second.length).toBe(0);
    });

    it('should emit both tool_use and tool_result on completed if started was missed', () => {
      const messages = mapper.mapNotification({
        method: 'item/completed',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-skip', command: 'echo test', stdout: 'test', exitCode: 0 },
        },
      }, threadId);
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('tool_use');
      expect(messages[1].type).toBe('tool_result');
    });
  });

  describe('turn completion', () => {
    it('should map turn/completed with status=completed to success result', () => {
      const messages = mapper.mapNotification({
        method: 'turn/completed',
        params: { threadId, status: 'completed' },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('result');
      expect(messages[0].subtype).toBe('success');
    });

    it('should map turn/completed with status=failed to error', () => {
      const messages = mapper.mapNotification({
        method: 'turn/completed',
        params: { threadId, status: 'failed', error: { message: 'Out of tokens' } },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('error');
      expect(messages[0].content).toBe('Out of tokens');
    });

    it('should map turn/completed with status=interrupted', () => {
      const messages = mapper.mapNotification({
        method: 'turn/completed',
        params: { threadId, status: 'interrupted' },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('result');
      expect(messages[0].subtype).toBe('interrupted');
    });

    it('should handle turn/completed with string error', () => {
      const messages = mapper.mapNotification({
        method: 'turn/completed',
        params: { threadId, status: 'failed', error: 'Something broke' },
      }, threadId);
      expect(messages[0].content).toBe('Something broke');
    });

    it('should handle turn/completed failed with no error message', () => {
      const messages = mapper.mapNotification({
        method: 'turn/completed',
        params: { threadId, status: 'failed' },
      }, threadId);
      expect(messages[0].content).toBe('Unknown error');
    });

    it('should flush buffered text on turn/completed', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'partial', itemId: 'msg-1' },
      }, threadId);

      const messages = mapper.mapNotification({
        method: 'turn/completed',
        params: { threadId, status: 'completed' },
      }, threadId);
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('partial');
      expect(messages[1].type).toBe('result');
    });
  });

  describe('ignored notification types', () => {
    it('should skip turn/started', () => {
      expect(mapper.mapNotification({
        method: 'turn/started',
        params: { threadId },
      }, threadId).length).toBe(0);
    });

    it('should skip item/reasoning/delta', () => {
      expect(mapper.mapNotification({
        method: 'item/reasoning/delta',
        params: { threadId, delta: 'thinking...' },
      }, threadId).length).toBe(0);
    });

    it('should skip item/reasoning/completed', () => {
      expect(mapper.mapNotification({
        method: 'item/reasoning/completed',
        params: { threadId },
      }, threadId).length).toBe(0);
    });

    it('should skip item/commandExecution/outputDelta', () => {
      expect(mapper.mapNotification({
        method: 'item/commandExecution/outputDelta',
        params: { threadId, delta: 'stdout chunk' },
      }, threadId).length).toBe(0);
    });

    it('should skip item/fileChange/outputDelta', () => {
      expect(mapper.mapNotification({
        method: 'item/fileChange/outputDelta',
        params: { threadId, delta: 'diff chunk' },
      }, threadId).length).toBe(0);
    });

    it('should skip turn/diff/updated', () => {
      expect(mapper.mapNotification({
        method: 'turn/diff/updated',
        params: { threadId },
      }, threadId).length).toBe(0);
    });

    it('should skip turn/plan/updated', () => {
      expect(mapper.mapNotification({
        method: 'turn/plan/updated',
        params: { threadId },
      }, threadId).length).toBe(0);
    });

    it('should skip unknown notification methods', () => {
      expect(mapper.mapNotification({
        method: 'some/unknown/method',
        params: { threadId },
      }, threadId).length).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear deduplication state and text buffer', () => {
      // Buffer text and emit a tool_use
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'buffered', itemId: 'msg-1' },
      }, threadId);
      mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-r1', command: 'test' },
        },
      }, threadId);

      mapper.reset();

      // Text buffer should be cleared
      expect(mapper.flush().length).toBe(0);

      // Same tool ID should emit again after reset
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: 'cmd-r1', command: 'test' },
        },
      }, threadId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_use');
    });
  });

  describe('flush', () => {
    it('should emit buffered text on explicit flush', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'final text', itemId: 'msg-1' },
      }, threadId);

      const messages = mapper.flush();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('final text');
    });

    it('should return empty if nothing buffered', () => {
      expect(mapper.flush().length).toBe(0);
    });

    it('should return empty on second flush', () => {
      mapper.mapNotification({
        method: 'item/agentMessage/delta',
        params: { threadId, delta: 'text', itemId: 'msg-1' },
      }, threadId);
      mapper.flush();
      expect(mapper.flush().length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle item/started with no item', () => {
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: { threadId },
      }, threadId);
      expect(messages.length).toBe(0);
    });

    it('should handle item/started with no item id', () => {
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'commandExecution', id: '', command: 'ls' } as any,
        },
      }, threadId);
      expect(messages.length).toBe(0);
    });

    it('should handle item/completed with no item', () => {
      const messages = mapper.mapNotification({
        method: 'item/completed',
        params: { threadId },
      }, threadId);
      expect(messages.length).toBe(0);
    });

    it('should handle notification with no params', () => {
      const messages = mapper.mapNotification({
        method: 'item/agentMessage/delta',
      }, threadId);
      expect(messages.length).toBe(0);
    });

    it('should handle unknown item types in item/started', () => {
      const messages = mapper.mapNotification({
        method: 'item/started',
        params: {
          threadId,
          item: { type: 'unknownType', id: 'uk-1' } as any,
        },
      }, threadId);
      // Unknown types should flush text but not emit tool_use
      expect(messages.length).toBe(0);
    });
  });
});
