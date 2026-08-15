import { defineConfig, devices } from '@playwright/test';

const e2eBaseUrl = process.env.TRACE_E2E_BASE_URL ?? 'http://127.0.0.1:3001';
const e2ePort = new URL(e2eBaseUrl).port || '3001';

export default defineConfig({
  testDir: './tests/e2e',
  preserveOutput: 'always',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm --filter @trace/web start --hostname 127.0.0.1 --port ${e2ePort}`,
    url: `${e2eBaseUrl}/api/health`,
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://trace:change-me@127.0.0.1:3002/trace_dev',
      TRACE_AUTH_SECRET: 'trace-playwright-secret-change-this-32-chars',
      TRACE_PUBLIC_URL: e2eBaseUrl,
      GITHUB_OAUTH_CLIENT_ID: 'playwright-client',
      GITHUB_OAUTH_CLIENT_SECRET: 'playwright-secret',
      GITHUB_APP_ID: '12345',
      GITHUB_APP_CLIENT_ID: 'playwright-app-client',
      GITHUB_APP_CLIENT_SECRET: 'playwright-app-secret',
      GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      GITHUB_WEBHOOK_SECRET: 'playwright-webhook-secret',
      GITHUB_APP_SLUG: 'trace-playwright',
      GITHUB_APP_CALLBACK_URL: `${e2eBaseUrl}/api/github/setup`,
      GITHUB_APP_INSTALL_URL: 'https://github.com/apps/trace-playwright/installations/new',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
