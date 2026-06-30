import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'REDIS_ENABLED=false pnpm --filter cursor-server dev',
      url: 'http://localhost:3001/healthz',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter cursor-client dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
