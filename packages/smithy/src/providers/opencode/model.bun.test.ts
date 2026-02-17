/**
 * OpenCode Model Tests
 *
 * Tests for model listing and passthrough functionality.
 */

import { describe, it, expect } from 'bun:test';

// Test the parseModelId utility logic (inline since it's not exported)
function parseModelId(model: string): { providerID: string; modelID: string } | undefined {
  const slashIndex = model.indexOf('/');
  if (slashIndex === -1) {
    return undefined;
  }
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
}

describe('OpenCode Model ID Parsing', () => {
  it('should parse valid composite model ID', () => {
    const result = parseModelId('anthropic/claude-sonnet-4-5-20250929');
    expect(result).toEqual({
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5-20250929',
    });
  });

  it('should parse model ID with multiple slashes (keeps only first split)', () => {
    const result = parseModelId('opencode/gpt-5/nano');
    expect(result).toEqual({
      providerID: 'opencode',
      modelID: 'gpt-5/nano',
    });
  });

  it('should return undefined for model ID without slash', () => {
    const result = parseModelId('claude-sonnet-4');
    expect(result).toBeUndefined();
  });

  it('should handle empty provider ID', () => {
    const result = parseModelId('/model-name');
    expect(result).toEqual({
      providerID: '',
      modelID: 'model-name',
    });
  });

  it('should handle empty model ID', () => {
    const result = parseModelId('provider/');
    expect(result).toEqual({
      providerID: 'provider',
      modelID: '',
    });
  });

  it('should handle empty string', () => {
    const result = parseModelId('');
    expect(result).toBeUndefined();
  });
});

describe('OpenCode Model Listing', () => {
  // Note: These tests verify the flattening logic works correctly.
  // They don't test actual SDK integration (that would require mocking the SDK).

  it('should flatten provider models into ModelInfo array format', () => {
    // Simulate the response structure from config.providers()
    const mockResponse = {
      providers: [
        {
          id: 'anthropic',
          name: 'Anthropic',
          models: {
            'claude-sonnet-4-5-20250929': {
              id: 'claude-sonnet-4-5-20250929',
              providerID: 'anthropic',
              name: 'Claude Sonnet 4.5',
            },
            'claude-opus-4-5-20251101': {
              id: 'claude-opus-4-5-20251101',
              providerID: 'anthropic',
              name: 'Claude Opus 4.5',
            },
          },
        },
        {
          id: 'opencode',
          name: 'OpenCode',
          models: {
            'big-pickle': {
              id: 'big-pickle',
              providerID: 'opencode',
              name: 'Big Pickle',
            },
          },
        },
      ],
      default: { agent: 'anthropic/claude-sonnet-4-5-20250929' },
    };

    // This is the flattening logic from serverManager.listModels()
    const models: Array<{ id: string; displayName: string; description?: string }> = [];
    for (const provider of mockResponse.providers) {
      if (!provider.models) continue;
      for (const [modelKey, model] of Object.entries(provider.models)) {
        const id = `${provider.id}/${modelKey}`;
        models.push({
          id,
          displayName: model.name || modelKey,
          description: undefined,
        });
      }
    }

    expect(models).toHaveLength(3);
    expect(models[0]).toEqual({
      id: 'anthropic/claude-sonnet-4-5-20250929',
      displayName: 'Claude Sonnet 4.5',
      description: undefined,
    });
    expect(models[1]).toEqual({
      id: 'anthropic/claude-opus-4-5-20251101',
      displayName: 'Claude Opus 4.5',
      description: undefined,
    });
    expect(models[2]).toEqual({
      id: 'opencode/big-pickle',
      displayName: 'Big Pickle',
      description: undefined,
    });
  });

  it('should handle providers with no models', () => {
    const mockResponse = {
      providers: [
        {
          id: 'empty-provider',
          name: 'Empty',
          models: {},
        },
      ],
      default: {},
    };

    const models: Array<{ id: string; displayName: string }> = [];
    for (const provider of mockResponse.providers) {
      if (!provider.models) continue;
      for (const [modelKey, model] of Object.entries(provider.models)) {
        models.push({
          id: `${provider.id}/${modelKey}`,
          displayName: model.name || modelKey,
        });
      }
    }

    expect(models).toHaveLength(0);
  });

  it('should use model key as displayName when name is missing', () => {
    const mockResponse = {
      providers: [
        {
          id: 'test',
          name: 'Test Provider',
          models: {
            'model-without-name': {
              id: 'model-without-name',
              providerID: 'test',
              name: '',
            },
          },
        },
      ],
      default: {},
    };

    const models: Array<{ id: string; displayName: string }> = [];
    for (const provider of mockResponse.providers) {
      if (!provider.models) continue;
      for (const [modelKey, model] of Object.entries(provider.models)) {
        models.push({
          id: `${provider.id}/${modelKey}`,
          displayName: model.name || modelKey,
        });
      }
    }

    expect(models[0].displayName).toBe('model-without-name');
  });
});

describe('OpenCode Interactive CLI Args', () => {
  // Test the buildArgs logic for model flag
  function buildArgsWithModel(
    resumeSessionId?: string,
    model?: string
  ): string[] {
    const args: string[] = [];

    if (resumeSessionId) {
      args.push('--continue', `'${resumeSessionId}'`);
    }

    if (model) {
      args.push('--model', `'${model}'`);
    }

    return args;
  }

  it('should include --model flag when model is provided', () => {
    const args = buildArgsWithModel(undefined, 'anthropic/claude-sonnet-4-5-20250929');
    expect(args).toEqual(['--model', "'anthropic/claude-sonnet-4-5-20250929'"]);
  });

  it('should not include --model flag when model is undefined', () => {
    const args = buildArgsWithModel(undefined, undefined);
    expect(args).toEqual([]);
  });

  it('should include both --continue and --model when both are provided', () => {
    const args = buildArgsWithModel('session-123', 'opencode/big-pickle');
    expect(args).toEqual([
      '--continue',
      "'session-123'",
      '--model',
      "'opencode/big-pickle'",
    ]);
  });
});
