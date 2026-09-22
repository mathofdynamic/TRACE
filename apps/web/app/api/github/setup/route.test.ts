import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestCloudflareEnv: vi.fn(async (): Promise<Record<string, string> | null> => null),
}));

vi.mock('../../../../lib/request-database', () => ({
  createRequestDatabase: vi.fn(async () => ({ db: {}, client: { end: vi.fn() } })),
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
  getRequestCloudflareEnv: mocks.getRequestCloudflareEnv,
}));

vi.mock('../../../../lib/github-installation', () => ({
  chooseGitHubInstallation: vi.fn((candidates: unknown[]) => candidates[0] ?? null),
  persistGitHubInstallationSnapshot: vi.fn(async () => undefined),
}));

vi.mock('@trace/env', () => ({
  parseGitHubAppEnv: vi.fn(() => ({
    GITHUB_APP_ID: '123',
    GITHUB_APP_CLIENT_ID: 'app-client',
    GITHUB_APP_CLIENT_SECRET: 'app-secret',
    GITHUB_APP_PRIVATE_KEY: 'private-key',
    GITHUB_WEBHOOK_SECRET: 'webhook-secret',
    GITHUB_APP_SLUG: 'trace',
  })),
}));

vi.mock('@trace/github', () => ({
  exchangeGitHubAppCode: vi.fn(async () => 'user-access-token'),
  getGitHubAuthenticatedUser: vi.fn(async () => ({ id: 1, login: 'trace-owner' })),
  getGitHubInstallationSnapshot: vi.fn(async () => ({
    installation: {
      id: 123,
      accountLogin: 'trace-org',
      accountType: 'Organization',
      suspendedAt: null,
      permissions: { metadata: 'read' },
    },
    repositories: [],
  })),
  listGitHubUserInstallations: vi.fn(async () => [
    {
      id: 123,
      accountLogin: 'trace-org',
      accountType: 'Organization',
      appId: 123,
      suspendedAt: null,
    },
  ]),
  verifyUserInstallationAccess: vi.fn(async () => true),
}));

import { GET } from './route';
import { persistGitHubInstallationSnapshot } from '../../../../lib/github-installation';

describe('GitHub App setup callback', () => {
  const previous = {
    TRACE_PUBLIC_URL: process.env.TRACE_PUBLIC_URL,
    TRACE_AUTH_SECRET: process.env.TRACE_AUTH_SECRET,
  };

  beforeEach(() => {
    mocks.getRequestCloudflareEnv.mockResolvedValue(null);
    process.env.TRACE_PUBLIC_URL = 'https://trace-code.pages.dev';
    process.env.TRACE_AUTH_SECRET = 'trace-auth-test-secret-change-this-32-chars';
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previous.TRACE_PUBLIC_URL === undefined) delete process.env.TRACE_PUBLIC_URL;
    else process.env.TRACE_PUBLIC_URL = previous.TRACE_PUBLIC_URL;
    if (previous.TRACE_AUTH_SECRET === undefined) delete process.env.TRACE_AUTH_SECRET;
    else process.env.TRACE_AUTH_SECRET = previous.TRACE_AUTH_SECRET;
  });

  it('preserves the existing setup callback persistence path', async () => {
    const response = await GET(
      new Request(
        'https://trace-code.pages.dev/api/github/setup?state=setup-state&code=setup-code&installation_id=123',
        {
          headers: {
            cookie:
              'trace_github_app_state=setup-state; trace_github_app_next=%2Fapp%2Frepositories',
          },
        },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://trace-code.pages.dev/app/repositories?setup=connected',
    );
    expect(persistGitHubInstallationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'github.connected' }),
    );
  });

  it('reconciles an existing installation through the same callback without reinstalling', async () => {
    const response = await GET(
      new Request(
        'https://trace-code.pages.dev/api/github/setup?state=reconcile-state&code=reauth-code',
        {
          headers: {
            cookie:
              'trace_github_reconcile_state=reconcile-state; trace_github_reconcile_next=%2Fapp%2Frepositories',
          },
        },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://trace-code.pages.dev/app/repositories?setup=github-reconciled',
    );
    expect(persistGitHubInstallationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'github.reconciled' }),
    );
  });

  it('rejects an expired or mismatched reconciliation state before GitHub access', async () => {
    const response = await GET(
      new Request(
        'https://trace-code.pages.dev/api/github/setup?state=wrong-state&code=reauth-code',
        {
          headers: {
            cookie:
              'trace_github_reconcile_state=expected-state; trace_github_reconcile_next=%2Fapp',
          },
        },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://trace-code.pages.dev/auth/error?setup=github-app-state',
    );
    expect(persistGitHubInstallationSnapshot).not.toHaveBeenCalled();
  });

  it('rejects setup callbacks while production canary intake is closed', async () => {
    mocks.getRequestCloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_CANARY_MODE: 'closed',
    });

    const response = await GET(
      new Request('https://trace-code.pages.dev/api/github/setup?state=state&code=code'),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'GitHub integration is disabled during the closed production canary.',
    });
    expect(persistGitHubInstallationSnapshot).not.toHaveBeenCalled();
  });
});
