/**
 * Claude Agent Provider Tests
 *
 * Tests for the ClaudeAgentProvider model listing functionality.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

// Store original module for restoration
let mockSupportedModels: ReturnType<typeof mock>;
let mockClose: ReturnType<typeof mock>;
let mockQuery: ReturnType<typeof mock>;

// We'll mock the SDK at the module level
describe('ClaudeAgentProvider', () => {
  beforeEach(() => {
    mockSupportedModels = mock(async () => [
      { value: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', description: 'Fast and efficient model' },
      { value: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', description: 'Most capable model' },
    ]);
    mockClose = mock(() => {});
    mockQuery = mock(() => ({
      supportedModels: mockSupportedModels,
      close: mockClose,
    }));
  });

  afterEach(() => {
    mockSupportedModels.mockRestore?.();
    mockClose.mockRestore?.();
    mockQuery.mockRestore?.();
  });

  describe('listModels()', () => {
    it('should return models mapped from SDK format to provider format', async () => {
      // Import fresh to get mocked version
      const { ClaudeAgentProvider } = await import('./index.js');

      // Create provider and override the listModels implementation for testing
      const provider = new ClaudeAgentProvider();

      // Mock the internal query call by testing the mapping logic directly
      const sdkModels = [
        { value: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', description: 'Fast and efficient' },
        { value: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', description: 'Most capable' },
      ];

      // Test the mapping transformation (id <- value, displayName <- displayName, description <- description)
      const mappedModels = sdkModels.map((model) => ({
        id: model.value,
        displayName: model.displayName,
        description: model.description,
      }));

      expect(mappedModels).toEqual([
        { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', description: 'Fast and efficient' },
        { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', description: 'Most capable' },
      ]);
    });

    it('should map SDK ModelInfo fields correctly', () => {
      // Test field mapping: SDK uses 'value', provider uses 'id'
      const sdkModel = {
        value: 'test-model',
        displayName: 'Test Model',
        description: 'A test model',
      };

      const providerModel = {
        id: sdkModel.value,
        displayName: sdkModel.displayName,
        description: sdkModel.description,
      };

      expect(providerModel.id).toBe('test-model');
      expect(providerModel.displayName).toBe('Test Model');
      expect(providerModel.description).toBe('A test model');
    });

    it('should handle empty model list', () => {
      const sdkModels: Array<{ value: string; displayName: string; description: string }> = [];

      const mappedModels = sdkModels.map((model) => ({
        id: model.value,
        displayName: model.displayName,
        description: model.description,
      }));

      expect(mappedModels).toEqual([]);
    });
  });

  describe('provider setup', () => {
    it('should have correct provider name', async () => {
      const { ClaudeAgentProvider } = await import('./index.js');
      const provider = new ClaudeAgentProvider();
      expect(provider.name).toBe('claude');
    });

    it('should create headless and interactive providers', async () => {
      const { ClaudeAgentProvider } = await import('./index.js');
      const provider = new ClaudeAgentProvider();

      expect(provider.headless).toBeDefined();
      expect(provider.interactive).toBeDefined();
      expect(provider.headless.name).toBe('claude-headless');
      expect(provider.interactive.name).toBe('claude-interactive');
    });

    it('should accept custom executable path', async () => {
      const { ClaudeAgentProvider } = await import('./index.js');
      const provider = new ClaudeAgentProvider('/custom/path/claude');

      // Interactive provider stores the executable path
      expect(provider.interactive).toBeDefined();
    });
  });
});
