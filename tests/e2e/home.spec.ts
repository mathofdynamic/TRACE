import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

test('foundation home page identifies the current phase', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Git is the history/i })).toBeVisible();
  await expect(
    page.getByText('Early implementation. Public claims are deliberately limited to what exists.'),
  ).toBeVisible();
});

test('health route exposes only safe service status', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toEqual({ service: 'web', status: 'ok' });
});

test('public navigation exposes the documented routes', async ({ page }) => {
  await page.goto('/');
  for (const label of ['Product', 'Security', 'Specification', 'Pricing', 'Docs']) {
    await expect(
      page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: label }),
    ).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Start with TRACE' }).first()).toHaveAttribute(
    'href',
    '/sign-up',
  );
});

test('protected application routes redirect unauthenticated visitors', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp|\/sign-in\?next=\/app/);
  await expect(page.getByRole('heading', { name: 'Sign in to continue.' })).toBeVisible();
});

test('direct GitHub OAuth and onboarding APIs keep unauthenticated state explicit', async ({
  request,
}) => {
  const authStart = await request.get('/api/auth/github?next=%2Fapp', { maxRedirects: 0 });
  expect(authStart.status()).toBe(302);
  expect(authStart.headers().location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  expect(authStart.headers().location).toContain(
    encodeURIComponent('http://127.0.0.1:3001/api/auth/github/callback'),
  );
  expect(authStart.headers()['set-cookie']).toContain('trace_github_state=');
  const onboarding = await request.get('/api/onboarding');
  expect(onboarding.status()).toBe(401);
});

test('GitHub App installation and repository selection keep the auth boundary explicit', async ({
  request,
}) => {
  const install = await request.get('/api/github/install', { maxRedirects: 0 });
  expect(install.status()).toBe(302);
  expect(install.headers().location).toContain('/sign-in?next=/app/repositories');
  const repositories = await request.post('/api/github/repositories', {
    data: { repositoryIds: [] },
  });
  expect(repositories.status()).toBe(401);
});

test('signed GitHub webhook deliveries are acknowledged and deduplicated', async ({ request }) => {
  const payload = JSON.stringify({
    action: 'opened',
    repository: { id: 42 },
    pull_request: { id: 9, number: 3 },
  });
  const signature = createHmac('sha256', 'playwright-webhook-secret').update(payload).digest('hex');
  const headers = {
    'content-type': 'application/json',
    'x-github-delivery': `playwright-delivery-${Date.now()}`,
    'x-github-event': 'pull_request',
    'x-hub-signature-256': `sha256=${signature}`,
  };
  const first = await request.post('/api/github/webhooks', { data: payload, headers });
  expect(first.status()).toBe(202);
  const duplicate = await request.post('/api/github/webhooks', { data: payload, headers });
  expect(duplicate.status()).toBe(200);
  await expect(duplicate.json()).resolves.toMatchObject({ accepted: true, duplicate: true });
});

test('invalid GitHub webhook signatures are rejected before parsing', async ({ request }) => {
  const response = await request.post('/api/github/webhooks', {
    data: '{"action":"opened"}',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': 'playwright-invalid-1',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': 'sha256=invalid',
    },
  });
  expect(response.status()).toBe(401);
});
