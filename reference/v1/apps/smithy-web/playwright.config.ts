import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const testDbPath = resolve(projectRoot, '.stoneforge-test/stoneforge.db');
const setupTestDbScript = resolve(__dirname, 'tests/setup-test-db.ts');

// Use dedicated test ports to avoid conflicts with development servers
const testApiPort = 3458;
const testWebPort = 5175;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${testWebPort}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Run setup-test-db.ts first to ensure .stoneforge-test directory and DB exist
      // before the server starts. This fixes a race condition with globalSetup.
      command: `tsx ${setupTestDbScript} && STONEFORGE_DB_PATH=${testDbPath} DAEMON_AUTO_START=false PORT=${testApiPort} tsx ${resolve(projectRoot, 'apps/smithy-server/src/index.ts')}`,
      port: testApiPort,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `VITE_API_PORT=${testApiPort} npm run dev -- --port ${testWebPort}`,
      port: testWebPort,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
