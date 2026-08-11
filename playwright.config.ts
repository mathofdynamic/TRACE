import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @trace/web start --hostname 127.0.0.1 --port 3001',
    url: 'http://127.0.0.1:3001/api/health',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://trace:change-me@127.0.0.1:3002/trace_dev',
      TRACE_AUTH_SECRET: 'trace-playwright-secret-change-this-32-chars',
      TRACE_PUBLIC_URL: 'http://127.0.0.1:3001',
      GITHUB_OAUTH_CLIENT_ID: 'playwright-client',
      GITHUB_OAUTH_CLIENT_SECRET: 'playwright-secret',
      GITHUB_APP_ID: '12345',
      GITHUB_APP_CLIENT_ID: 'playwright-app-client',
      GITHUB_APP_CLIENT_SECRET: 'playwright-app-secret',
      GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      GITHUB_WEBHOOK_SECRET: 'playwright-webhook-secret',
      GITHUB_APP_SLUG: 'trace-playwright',
      GITHUB_APP_CALLBACK_URL: 'http://127.0.0.1:3001/api/github/setup',
      GITHUB_APP_INSTALL_URL: 'https://github.com/apps/trace-playwright/installations/new',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
