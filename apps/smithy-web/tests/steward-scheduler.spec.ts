import { test, expect } from '@playwright/test';

/**
 * TB-O23: Steward Scheduler Service Tests
 *
 * Tests for the steward scheduler API endpoints.
 * These tests verify the scheduler can be started, stopped, and stewards
 * can be registered for cron and event-based execution.
 *
 * Note: These tests use the orchestrator server on localhost:3457 via the Vite proxy
 * at localhost:5174/api
 */

test.describe('TB-O23: Steward Scheduler API', () => {
  test.describe('Scheduler Status', () => {
    test('GET /api/scheduler/status returns scheduler status', async ({ page }) => {
      // Use page.request for API calls through the proxy
      const response = await page.request.get('/api/scheduler/status');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('isRunning');
      expect(data).toHaveProperty('stats');
      expect(data.stats).toHaveProperty('registeredStewards');
      expect(data.stats).toHaveProperty('activeCronJobs');
      expect(data.stats).toHaveProperty('activeEventSubscriptions');
      expect(data.stats).toHaveProperty('totalExecutions');
    });
  });

  test.describe('Scheduler Lifecycle', () => {
    test('POST /api/scheduler/start starts the scheduler', async ({ page }) => {
      const response = await page.request.post('/api/scheduler/start');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.isRunning).toBe(true);
    });

    test('POST /api/scheduler/stop stops the scheduler', async ({ page }) => {
      // First start
      await page.request.post('/api/scheduler/start');

      // Then stop
      const response = await page.request.post('/api/scheduler/stop');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.isRunning).toBe(false);
    });

    test('can start scheduler with registerAllStewards option', async ({ page }) => {
      const response = await page.request.post('/api/scheduler/start', {
        data: { registerAllStewards: true },
      });
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('registeredStewards');
    });
  });

  test.describe('Steward Registration', () => {
    test('POST /api/scheduler/register-all registers all stewards', async ({ page }) => {
      const response = await page.request.post('/api/scheduler/register-all');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('registeredCount');
      expect(data).toHaveProperty('stats');
    });

    test('POST /api/scheduler/stewards/:id/register returns 404 for non-existent steward', async ({ page }) => {
      const response = await page.request.post('/api/scheduler/stewards/non-existent-id/register');
      expect(response.status()).toBe(404);

      const data = await response.json();
      expect(data.error.code).toBe('NOT_FOUND');
    });

    test('POST /api/scheduler/stewards/:id/unregister succeeds even for unregistered steward', async ({ page }) => {
      const response = await page.request.post('/api/scheduler/stewards/non-existent-id/unregister');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      // Returns false when steward wasn't registered
      expect(data.success).toBe(false);
    });
  });

  test.describe('Steward Execution', () => {
    test('POST /api/scheduler/stewards/:id/execute returns error for non-existent steward', async ({ page }) => {
      const response = await page.request.post('/api/scheduler/stewards/non-existent-id/execute');
      // The executor returns success:false with error for non-existent steward
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.result.error).toContain('not found');
    });
  });

  test.describe('Event Publishing', () => {
    test('POST /api/scheduler/events publishes an event', async ({ page }) => {
      // First start the scheduler
      await page.request.post('/api/scheduler/start');

      const response = await page.request.post('/api/scheduler/events', {
        data: {
          eventName: 'test_event',
          eventData: { key: 'value' },
        },
      });
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.eventName).toBe('test_event');
      expect(data).toHaveProperty('stewardsTriggered');
    });

    test('POST /api/scheduler/events requires eventName', async ({ page }) => {
      const response = await page.request.post('/api/scheduler/events', {
        data: { eventData: {} },
      });
      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe('INVALID_INPUT');
    });
  });

  test.describe('Scheduled Jobs', () => {
    test('GET /api/scheduler/jobs returns scheduled jobs', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/jobs');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('jobs');
      expect(Array.isArray(data.jobs)).toBe(true);
    });

    test('GET /api/scheduler/jobs can filter by stewardId', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/jobs?stewardId=test-id');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data.jobs)).toBe(true);
    });
  });

  test.describe('Event Subscriptions', () => {
    test('GET /api/scheduler/subscriptions returns event subscriptions', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/subscriptions');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('subscriptions');
      expect(Array.isArray(data.subscriptions)).toBe(true);
    });

    test('GET /api/scheduler/subscriptions can filter by stewardId', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/subscriptions?stewardId=test-id');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data.subscriptions)).toBe(true);
    });
  });

  test.describe('Execution History', () => {
    test('GET /api/scheduler/history returns execution history', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/history');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('history');
      expect(data).toHaveProperty('count');
      expect(Array.isArray(data.history)).toBe(true);
    });

    test('GET /api/scheduler/history can filter by stewardId', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/history?stewardId=test-id');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data.history)).toBe(true);
    });

    test('GET /api/scheduler/history can filter by triggerType', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/history?triggerType=cron');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data.history)).toBe(true);
    });

    test('GET /api/scheduler/history can filter by success', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/history?success=true');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data.history)).toBe(true);
    });

    test('GET /api/scheduler/history can limit results', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/history?limit=5');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data.history)).toBe(true);
      // Count should be <= 5 (if limit is respected)
      expect(data.history.length).toBeLessThanOrEqual(5);
    });
  });

  test.describe('Last Execution', () => {
    test('GET /api/scheduler/stewards/:id/last-execution returns null for never-executed steward', async ({ page }) => {
      const response = await page.request.get('/api/scheduler/stewards/non-existent-id/last-execution');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.lastExecution).toBeNull();
    });
  });
});

test.describe('TB-O23: End-to-End Steward Workflow', () => {
  let createdStewardId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Cleanup: stop scheduler
    await page.request.post('/api/scheduler/stop');
  });

  test('can create steward, register with scheduler, and execute', async ({ page }) => {
    // 1. Create a steward via the API (use valid name format)
    const uniqueName = `test-scheduler-steward-${Date.now()}`;
    const createResponse = await page.request.post('/api/agents', {
      data: {
        role: 'steward',
        name: uniqueName,
        stewardFocus: 'merge',
        triggers: [
          { type: 'cron', schedule: '*/5 * * * *' },
          { type: 'event', event: 'task_completed' },
        ],
        createdBy: 'el-system',
      },
    });

    if (!createResponse.ok()) {
      console.log('Create steward failed:', await createResponse.text());
    }
    expect(createResponse.ok()).toBe(true);

    const createData = await createResponse.json();
    createdStewardId = createData.agent.id;
    expect(createdStewardId).toBeTruthy();

    // 2. Start the scheduler
    const startResponse = await page.request.post('/api/scheduler/start');
    expect(startResponse.ok()).toBe(true);

    // 3. Register the steward
    const registerResponse = await page.request.post(`/api/scheduler/stewards/${createdStewardId}/register`);
    expect(registerResponse.ok()).toBe(true);

    const registerData = await registerResponse.json();
    expect(registerData.success).toBe(true);
    expect(registerData.jobs.length).toBe(1); // 1 cron job
    expect(registerData.subscriptions.length).toBe(1); // 1 event subscription

    // 4. Manually execute the steward
    const executeResponse = await page.request.post(`/api/scheduler/stewards/${createdStewardId}/execute`, {
      data: { context: 'test' },
    });
    expect(executeResponse.ok()).toBe(true);

    const executeData = await executeResponse.json();
    expect(executeData.success).toBe(true);
    expect(executeData.result.success).toBe(true);

    // 5. Check execution history
    const historyResponse = await page.request.get(`/api/scheduler/history?stewardId=${createdStewardId}`);
    expect(historyResponse.ok()).toBe(true);

    const historyData = await historyResponse.json();
    expect(historyData.count).toBeGreaterThan(0);
    expect(historyData.history[0].stewardId).toBe(createdStewardId);
    expect(historyData.history[0].manual).toBe(true); // Manual execution

    // 6. Check last execution
    const lastExecResponse = await page.request.get(`/api/scheduler/stewards/${createdStewardId}/last-execution`);
    expect(lastExecResponse.ok()).toBe(true);

    const lastExecData = await lastExecResponse.json();
    expect(lastExecData.lastExecution).not.toBeNull();
    expect(lastExecData.lastExecution.stewardId).toBe(createdStewardId);

    // 7. Test event publishing
    const eventResponse = await page.request.post('/api/scheduler/events', {
      data: {
        eventName: 'task_completed',
        eventData: { taskId: 'test-task' },
      },
    });
    expect(eventResponse.ok()).toBe(true);

    const eventData = await eventResponse.json();
    expect(eventData.stewardsTriggered).toBeGreaterThanOrEqual(1);

    // 8. Unregister the steward
    const unregisterResponse = await page.request.post(`/api/scheduler/stewards/${createdStewardId}/unregister`);
    expect(unregisterResponse.ok()).toBe(true);
    expect((await unregisterResponse.json()).success).toBe(true);

    // 9. Verify jobs and subscriptions are removed
    const jobsResponse = await page.request.get(`/api/scheduler/jobs?stewardId=${createdStewardId}`);
    expect((await jobsResponse.json()).jobs.length).toBe(0);

    const subsResponse = await page.request.get(`/api/scheduler/subscriptions?stewardId=${createdStewardId}`);
    expect((await subsResponse.json()).subscriptions.length).toBe(0);
  });
});
