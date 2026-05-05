/**
 * Daemon Routes Tests — GET /api/daemon/status health field
 *
 * Tests that the status endpoint includes dispatch health when available,
 * omits it when the daemon is not configured, and degrades gracefully when
 * getDispatchHealth() throws.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Services } from '../services.js';
import { createDaemonRoutes } from './daemon.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockServices(opts: { withDaemon?: boolean; healthThrows?: boolean } = {}) {
  const dispatchDaemon =
    opts.withDaemon === false
      ? undefined
      : {
          isRunning: vi.fn().mockReturnValue(true),
          getConfig: vi.fn().mockReturnValue({ pollIntervalMs: 500 }),
          getRateLimitStatus: vi.fn().mockReturnValue({ active: false }),
          getDispatchHealth: opts.healthThrows
            ? vi.fn().mockRejectedValue(new Error('db unreachable'))
            : vi.fn().mockResolvedValue({
                readyUnassignedTasks: 3,
                availableWorkers: 0,
                stuck: true,
                hasStuckQueue: true,
                computedAt: '2026-05-03T00:00:00.000Z',
              }),
        };

  const services = { dispatchDaemon } as unknown as Services;
  return { services, dispatchDaemon };
}

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/daemon/status — health', () => {
  it('includes the health snapshot when the daemon is available', async () => {
    const { services } = createMockServices();
    const app = createDaemonRoutes(services);
    const res = await app.request('/api/daemon/status');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.health.hasStuckQueue).toBe(true);
    expect(body.health.readyUnassignedTasks).toBe(3);
    expect(body.health.availableWorkers).toBe(0);
  });

  it('omits the health field when the daemon is unavailable', async () => {
    const { services } = createMockServices({ withDaemon: false });
    const app = createDaemonRoutes(services);
    const res = await app.request('/api/daemon/status');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.health).toBeUndefined();
  });

  it('still returns 200 with isRunning when getDispatchHealth throws', async () => {
    const { services } = createMockServices({ healthThrows: true });
    const app = createDaemonRoutes(services);
    const res = await app.request('/api/daemon/status');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isRunning).toBe(true);
    expect(body.health).toBeUndefined();
  });
});
