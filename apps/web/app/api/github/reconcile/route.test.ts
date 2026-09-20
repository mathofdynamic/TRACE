import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/request-database', () => ({
  getRequestTraceSession: vi.fn(async () => ({
    user: {
      id: 'user-1',
      name: 'TRACE Owner',
      email: 'owner@example.test',
      image: null,
      githubLogin: 'trace-owner',
    },
    session: { expiresAt: new Date(Date.now() + 60_000) },
  })),
}));

import { GET } from './route';

const environment = {
  TRACE_PUBLIC_URL: process.env.TRACE_PUBLIC_URL,
  GITHUB_APP_ID: process.env.GITHUB_APP_ID,
  GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
  GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
  GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
  GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
};

function restoreEnvironment() {
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe('GitHub installation reconciliation start', () => {
  beforeEach(() => {
    process.env.TRACE_PUBLIC_URL = 'https://trace-code.pages.dev';
    process.env.GITHUB_APP_ID = '123';
    process.env.GITHUB_APP_CLIENT_ID = 'app-client';
    process.env.GITHUB_APP_CLIENT_SECRET = 'app-secret';
    process.env.GITHUB_APP_PRIVATE_KEY = 'private-key';
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret';
    process.env.GITHUB_APP_SLUG = 'trace';
  });

  afterEach(() => {
    restoreEnvironment();
  });

  it('starts explicit reauthorization without persisting a token', async () => {
    const response = await GET(
      new Request('https://trace-code.pages.dev/api/github/reconcile?next=/app/repositories'),
    );
    const location = new URL(response.headers.get('location') ?? '');
    expect(response.status).toBe(302);
    expect(location.origin).toBe('https://github.com');
    expect(location.pathname).toBe('/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('app-client');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://trace-code.pages.dev/api/github/setup',
    );
    expect(location.searchParams.get('prompt')).toBe('select_account');
    expect(location.searchParams.get('allow_signup')).toBe('false');
    expect(location.searchParams.get('state')).toHaveLength(64);
    expect(response.headers.get('set-cookie')).toContain('trace_github_reconcile_state=');
  });
});
