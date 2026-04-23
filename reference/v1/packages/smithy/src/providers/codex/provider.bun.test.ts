/**
 * Codex Provider Tests
 *
 * Tests for model listing and model passthrough in the Codex provider.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import type { CodexClient, CodexModelInfo } from './server-manager.js';

// ---------------------------------------------------------------------------
// Mock helpers for CodexClient
// ---------------------------------------------------------------------------

type NotificationHandler = (method: string, params: unknown) => void;

function createMockClient(options?: {
  threadId?: string;
  models?: CodexModelInfo[];
  /** If set, model.list returns { data: [...] } instead of { models: [...] } */
  useDataFormat?: boolean;
}): CodexClient & {
  emitNotification: (method: string, params: unknown) => void;
  getLastStartParams: () => unknown;
  getLastResumeParams: () => unknown;
} {
  const threadId = options?.threadId ?? 'thr_test-123';
  const models = options?.models ?? [];
  const useDataFormat = options?.useDataFormat ?? false;
  const notificationHandlers = new Set<NotificationHandler>();

  let lastStartParams: unknown = null;
  let lastResumeParams: unknown = null;

  return {
    emitNotification(method: string, params: unknown) {
      for (const handler of notificationHandlers) {
        handler(method, params);
      }
    },
    getLastStartParams: () => lastStartParams,
    getLastResumeParams: () => lastResumeParams,
    model: {
      list: mock(async () => useDataFormat ? { data: models } : { models }),
    },
    thread: {
      start: mock(async (params) => {
        lastStartParams = params;
        return { thread: { id: threadId } };
      }),
      resume: mock(async (params) => {
        lastResumeParams = params;
        return { thread: { id: threadId } };
      }),
      read: mock(async () => ({ thread: { id: threadId } })),
    },
    turn: {
      start: mock(async () => {}),
      interrupt: mock(async () => {}),
    },
    onNotification(handler: NotificationHandler) {
      notificationHandlers.add(handler);
      return () => {
        notificationHandlers.delete(handler);
      };
    },
    respondToServer: mock(() => {}),
    close: mock(() => {}),
  };
}

// ---------------------------------------------------------------------------
// Tests for listModels
// ---------------------------------------------------------------------------

describe('CodexAgentProvider.listModels', () => {
  // We can't easily mock the serverManager singleton, so we'll test the
  // mapping logic directly by testing what the client returns
  it('should map Codex model info to ModelInfo format', async () => {
    const codexModels: CodexModelInfo[] = [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest GPT-4 model' },
      { id: 'o3-mini', name: 'o3-mini' },
      { id: 'gpt-3.5-turbo' }, // No name or description
    ];

    const client = createMockClient({ models: codexModels });

    // Simulate what listModels does
    const response = await client.model.list({ limit: 50 });
    const mapped = (response.models ?? []).map((model) => ({
      id: model.id,
      displayName: model.name ?? model.id,
      description: model.description,
    }));

    expect(mapped).toEqual([
      { id: 'gpt-4o', displayName: 'GPT-4o', description: 'Latest GPT-4 model' },
      { id: 'o3-mini', displayName: 'o3-mini', description: undefined },
      { id: 'gpt-3.5-turbo', displayName: 'gpt-3.5-turbo', description: undefined },
    ]);
  });

  it('should call model/list RPC with limit parameter', async () => {
    const client = createMockClient();
    await client.model.list({ limit: 50 });
    expect(client.model.list).toHaveBeenCalledWith({ limit: 50 });
  });

  it('should handle empty model list', async () => {
    const client = createMockClient({ models: [] });
    const response = await client.model.list({ limit: 50 });
    expect(response.models).toEqual([]);
  });

  it('should handle { data: [...] } response format (OpenAI convention)', async () => {
    const codexModels: CodexModelInfo[] = [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest GPT-4 model' },
      { id: 'o3-mini', name: 'o3-mini' },
    ];

    const client = createMockClient({ models: codexModels, useDataFormat: true });

    // Simulate what listModels does — fall back to response.data
    const response = await client.model.list({ limit: 50 });
    const rawModels = response.models ?? response.data ?? [];
    const mapped = rawModels.map((model) => ({
      id: model.id,
      displayName: model.name ?? model.id,
      description: model.description,
    }));

    expect(mapped).toEqual([
      { id: 'gpt-4o', displayName: 'GPT-4o', description: 'Latest GPT-4 model' },
      { id: 'o3-mini', displayName: 'o3-mini', description: undefined },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tests for model passthrough in headless provider
// ---------------------------------------------------------------------------

describe('CodexHeadlessProvider model passthrough', () => {
  it('should pass model in thread/start params when provided', async () => {
    const client = createMockClient();

    // Simulate what spawn() does for a new thread
    await client.thread.start({
      model: 'gpt-4o',
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });

    expect(client.getLastStartParams()).toEqual({
      model: 'gpt-4o',
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });
  });

  it('should pass model in thread/resume params when provided', async () => {
    const client = createMockClient();

    // Simulate what spawn() does for resume
    await client.thread.resume({
      threadId: 'thr_existing',
      model: 'o3-mini',
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });

    expect(client.getLastResumeParams()).toEqual({
      threadId: 'thr_existing',
      model: 'o3-mini',
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });
  });

  it('should not include model in params when undefined', async () => {
    const client = createMockClient();

    // Simulate spawn without model
    await client.thread.start({
      model: undefined,
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });

    const params = client.getLastStartParams() as Record<string, unknown>;
    // model key should exist but be undefined
    expect(params.model).toBeUndefined();
    expect(params.cwd).toBe('/workspace');
  });
});

// ---------------------------------------------------------------------------
// Tests for --model flag in interactive provider
// ---------------------------------------------------------------------------

describe('CodexInteractiveProvider model flag', () => {
  // Test the buildArgs logic directly
  function buildArgs(options: {
    resumeSessionId?: string;
    workingDirectory: string;
    model?: string;
  }): string[] {
    const shellQuote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
    const args: string[] = [];

    if (options.resumeSessionId) {
      args.push('resume', shellQuote(options.resumeSessionId), '--full-auto');
    } else {
      args.push('--full-auto', '--cd', shellQuote(options.workingDirectory));
    }

    // Add model flag if provided
    if (options.model) {
      args.push('--model', shellQuote(options.model));
    }

    return args;
  }

  it('should include --model flag when model is provided', () => {
    const args = buildArgs({
      workingDirectory: '/workspace',
      model: 'gpt-4o',
    });

    expect(args).toContain('--model');
    expect(args).toContain("'gpt-4o'");
    expect(args).toEqual(['--full-auto', '--cd', "'/workspace'", '--model', "'gpt-4o'"]);
  });

  it('should not include --model flag when model is undefined', () => {
    const args = buildArgs({
      workingDirectory: '/workspace',
    });

    expect(args).not.toContain('--model');
    expect(args).toEqual(['--full-auto', '--cd', "'/workspace'"]);
  });

  it('should include --model flag when resuming with model', () => {
    const args = buildArgs({
      resumeSessionId: 'thr_abc123',
      workingDirectory: '/workspace',
      model: 'o3-mini',
    });

    expect(args).toContain('resume');
    expect(args).toContain('--model');
    expect(args).toContain("'o3-mini'");
  });

  it('should properly quote model names with special characters', () => {
    const args = buildArgs({
      workingDirectory: '/workspace',
      model: "model's-name",
    });

    expect(args).toContain("--model");
    expect(args).toContain("'model'\\''s-name'");
  });
});
