/**
 * Tests for the permission hook (PreToolUse blocking flow)
 */

import { describe, it, expect, vi } from 'vitest';
import { createPermissionHook } from './permission-monitor.js';
import type { ApprovalService } from './approval-service.js';
import type { ApprovalRequest } from './types.js';
import type { EntityId, Timestamp } from '@stoneforge/core';
import { EventEmitter } from 'node:events';

const TEST_AGENT_ID = 'el-test-agent' as EntityId;
const TEST_SESSION_ID = 'test-session-123';

const DEFAULT_ALLOWED_BASH = [
  'git status', 'git log', 'git diff', 'git branch',
  'ls', 'pwd', 'which', 'echo', 'cat', 'head', 'tail',
  'wc', 'sort', 'uniq', 'date',
  'npm test', 'npm run build', 'npm run lint',
];

function createMockApprovalService(overrides?: Partial<ApprovalService>): ApprovalService {
  return {
    createRequest: vi.fn().mockResolvedValue({
      id: 'apr-test-001',
      agentId: TEST_AGENT_ID,
      sessionId: TEST_SESSION_ID,
      toolName: 'Bash',
      toolArgs: { command: 'rm -rf /' },
      status: 'pending',
      requestedAt: '2026-01-01T00:00:00Z' as Timestamp,
    } satisfies ApprovalRequest),
    resolveRequest: vi.fn(),
    getRequest: vi.fn(),
    listRequests: vi.fn(),
    waitForResolution: vi.fn().mockResolvedValue({
      id: 'apr-test-001',
      agentId: TEST_AGENT_ID,
      sessionId: TEST_SESSION_ID,
      toolName: 'Bash',
      toolArgs: { command: 'rm -rf /' },
      status: 'approved',
      requestedAt: '2026-01-01T00:00:00Z' as Timestamp,
      resolvedAt: '2026-01-01T00:01:00Z' as Timestamp,
      resolvedBy: 'human',
    } satisfies ApprovalRequest),
    getEventEmitter: vi.fn().mockReturnValue(new EventEmitter()),
    ...overrides,
  };
}

function makeInput(toolName: string, toolInput: unknown = {}): Record<string, unknown> {
  return {
    session_id: TEST_SESSION_ID,
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'tool-use-123',
    transcript_path: '/tmp/transcript',
    cwd: '/tmp',
  };
}

function makeSignal(): AbortSignal {
  return new AbortController().signal;
}

describe('createPermissionHook', () => {
  describe('unrestricted mode', () => {
    it('returns undefined when permissionModel is unrestricted', () => {
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'unrestricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService: createMockApprovalService(),
      });
      expect(hook).toBeUndefined();
    });
  });

  describe('restricted mode - auto-allowed tools', () => {
    it('allows Read tool without creating approval request', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      expect(hook).toBeDefined();
      const result = await hook!(makeInput('Read'), undefined, { signal: makeSignal() });

      expect(result).toHaveProperty('hookSpecificOutput');
      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('allow');
      expect(approvalService.createRequest).not.toHaveBeenCalled();
    });

    it('allows Edit tool without approval', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      const result = await hook!(makeInput('Edit'), undefined, { signal: makeSignal() });
      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('allow');
      expect(approvalService.createRequest).not.toHaveBeenCalled();
    });

    it('allows allowed Bash commands without approval', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      const result = await hook!(
        makeInput('Bash', { command: 'git status --short' }),
        undefined,
        { signal: makeSignal() }
      );
      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('allow');
      expect(approvalService.createRequest).not.toHaveBeenCalled();
    });

    it('allows sf commands without approval', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      const result = await hook!(
        makeInput('Bash', { command: 'sf task complete el-1234' }),
        undefined,
        { signal: makeSignal() }
      );
      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('allow');
      expect(approvalService.createRequest).not.toHaveBeenCalled();
    });
  });

  describe('restricted mode - blocked tools (approval flow)', () => {
    it('creates approval request for restricted tools', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      await hook!(
        makeInput('Bash', { command: 'rm -rf /' }),
        undefined,
        { signal: makeSignal() }
      );

      expect(approvalService.createRequest).toHaveBeenCalledWith({
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
        toolName: 'Bash',
        toolArgs: { command: 'rm -rf /' },
      });
    });

    it('waits for approval resolution', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      await hook!(
        makeInput('Bash', { command: 'rm -rf /' }),
        undefined,
        { signal: makeSignal() }
      );

      expect(approvalService.waitForResolution).toHaveBeenCalledWith('apr-test-001');
    });

    it('allows tool execution when approved', async () => {
      const approvalService = createMockApprovalService({
        waitForResolution: vi.fn().mockResolvedValue({
          id: 'apr-test-001',
          status: 'approved',
          resolvedBy: 'admin',
        }),
      });
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      const result = await hook!(
        makeInput('Bash', { command: 'rm -rf /' }),
        undefined,
        { signal: makeSignal() }
      );

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('allow');
      expect(output.permissionDecisionReason).toContain('Approved by admin');
    });

    it('denies tool execution when denied', async () => {
      const approvalService = createMockApprovalService({
        waitForResolution: vi.fn().mockResolvedValue({
          id: 'apr-test-001',
          status: 'denied',
          resolvedBy: 'admin',
        }),
      });
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      const result = await hook!(
        makeInput('Bash', { command: 'rm -rf /' }),
        undefined,
        { signal: makeSignal() }
      );

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain('Denied by admin');
    });

    it('denies tool execution on timeout', async () => {
      const approvalService = createMockApprovalService({
        waitForResolution: vi.fn().mockRejectedValue(new Error('Timed out')),
      });
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      const result = await hook!(
        makeInput('Bash', { command: 'rm -rf /' }),
        undefined,
        { signal: makeSignal() }
      );

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain('Timed out');
    });

    it('denies tool execution when session is aborted', async () => {
      const controller = new AbortController();
      // Create a waitForResolution that never resolves
      const approvalService = createMockApprovalService({
        waitForResolution: vi.fn().mockReturnValue(new Promise(() => {})),
      });
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      // Abort the signal immediately after the hook starts
      setTimeout(() => controller.abort(), 10);

      const result = await hook!(
        makeInput('Bash', { command: 'rm -rf /' }),
        undefined,
        { signal: controller.signal }
      );

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain('Session aborted');
    });

    it('creates approval request for non-Bash restricted tools', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      await hook!(
        makeInput('Agent', { prompt: 'Do something' }),
        undefined,
        { signal: makeSignal() }
      );

      expect(approvalService.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'Agent',
          toolArgs: { prompt: 'Do something' },
        })
      );
    });
  });

  describe('restricted mode - continues execution after decision', () => {
    it('always sets continue to true', async () => {
      const approvalService = createMockApprovalService();
      const hook = createPermissionHook(TEST_AGENT_ID, {
        permissionModel: 'restricted',
        allowedBashCommands: DEFAULT_ALLOWED_BASH,
        approvalService,
      });

      // Auto-allowed
      const allowedResult = await hook!(makeInput('Read'), undefined, { signal: makeSignal() });
      expect(allowedResult.continue).toBe(true);

      // Restricted (approved)
      const restrictedResult = await hook!(
        makeInput('Bash', { command: 'rm -rf /' }),
        undefined,
        { signal: makeSignal() }
      );
      expect(restrictedResult.continue).toBe(true);
    });
  });
});
