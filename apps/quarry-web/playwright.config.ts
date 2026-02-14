import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const testDbPath = resolve(projectRoot, '.stoneforge-test/stoneforge.db');

// Use dedicated test ports to avoid conflicts with development servers
const testApiPort = 3459;
const testWebPort = 5176;

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
      command: `STONEFORGE_DB_PATH=${testDbPath} PORT=${testApiPort} bun run src/index.ts`,
      cwd: resolve(__dirname, '../quarry-server'),
      port: testApiPort,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `VITE_API_PORT=${testApiPort} bun run dev -- --port ${testWebPort}`,
      port: testWebPort,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
