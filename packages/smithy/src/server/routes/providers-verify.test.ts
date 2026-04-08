/**
 * Provider Verify Route Tests
 *
 * Tests for POST /api/providers/:name/verify endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the provider registry before importing the route module
const mockProvider = {
  isAvailable: vi.fn(),
  getInstallInstructions: vi.fn(),
  listModels: vi.fn(),
};

const mockRegistry = {
  get: vi.fn(),
  list: vi.fn().mockReturnValue([]),
};

vi.mock('@stoneforge/smithy/providers', () => ({
  getProviderRegistry: () => mockRegistry,
  ProviderError: class ProviderError extends Error {},
}));

import { createAgentRoutes } from './agents.js';
import type { Services } from '../services.js';

// Minimal mock services — only what createAgentRoutes destructures
function createMockServices(): Services {
  return {
    agentRegistry: {} as never,
    sessionManager: {} as never,
    taskAssignmentService: {} as never,
    stewardScheduler: {} as never,
  } as unknown as Services;
}

describe('POST /api/providers/:name/verify', () => {
  let services: Services;

  beforeEach(() => {
    vi.clearAllMocks();
    services = createMockServices();
  });

  it('returns available=true for an installed provider', async () => {
    mockRegistry.get.mockReturnValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(true);
    mockProvider.getInstallInstructions.mockReturnValue('Already installed');

    const app = createAgentRoutes(services);
    const res = await app.request('/api/providers/claude-code/verify', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      name: 'claude-code',
      available: true,
      installInstructions: 'Already installed',
    });
    expect(mockRegistry.get).toHaveBeenCalledWith('claude-code');
    expect(mockProvider.isAvailable).toHaveBeenCalled();
  });

  it('returns available=false for an uninstalled provider', async () => {
    mockRegistry.get.mockReturnValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(false);
    mockProvider.getInstallInstructions.mockReturnValue('npm install -g provider');

    const app = createAgentRoutes(services);
    const res = await app.request('/api/providers/some-provider/verify', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      name: 'some-provider',
      available: false,
      installInstructions: 'npm install -g provider',
    });
  });

  it('returns 404 for an unknown provider name', async () => {
    mockRegistry.get.mockReturnValue(undefined);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/providers/nonexistent/verify', { method: 'POST' });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('nonexistent');
  });

  it('performs a fresh check on each call (no caching)', async () => {
    mockRegistry.get.mockReturnValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockProvider.getInstallInstructions.mockReturnValue('Install instructions');

    const app = createAgentRoutes(services);

    const res1 = await app.request('/api/providers/claude-code/verify', { method: 'POST' });
    expect((await res1.json()).available).toBe(false);

    const res2 = await app.request('/api/providers/claude-code/verify', { method: 'POST' });
    expect((await res2.json()).available).toBe(true);

    expect(mockProvider.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when isAvailable throws', async () => {
    mockRegistry.get.mockReturnValue(mockProvider);
    mockProvider.isAvailable.mockRejectedValue(new Error('check failed'));

    const app = createAgentRoutes(services);
    const res = await app.request('/api/providers/claude-code/verify', { method: 'POST' });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
