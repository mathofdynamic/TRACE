import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestCloudflareEnv: vi.fn(async (): Promise<Record<string, string> | null> => null),
  startGitHubOAuth: vi.fn(async () => ({
    authorizationUrl: 'https://github.com/login/oauth/authorize?state=oauth-state',
    state: 'oauth-state',
    next: '/app',
  })),
}));

vi.mock('@trace/auth', () => ({
  cookieAttributes: () => 'Path=/; HttpOnly; SameSite=Lax',
  getTracePublicUrl: () => 'https://trace.example',
  oauthNextCookieName: () => 'trace_github_next',
  oauthStateCookieName: () => 'trace_github_state',
  startGitHubOAuth: mocks.startGitHubOAuth,
  isSecurePublicUrl: () => true,
}));

vi.mock('../../../../lib/request-database', () => ({
  getRequestCloudflareEnv: mocks.getRequestCloudflareEnv,
}));

import { GET } from './route';

describe('GitHub OAuth start route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestCloudflareEnv.mockResolvedValue(null);
  });

  it('keeps production OAuth disabled while canary mode is closed', async () => {
    mocks.getRequestCloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_CANARY_MODE: 'closed',
    });

    const response = await GET(new Request('https://trace.example/api/auth/github'));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.startGitHubOAuth).not.toHaveBeenCalled();
  });

  it('allows the OAuth flow to begin only in valid fixture mode', async () => {
    mocks.getRequestCloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
    });

    const response = await GET(new Request('https://trace.example/api/auth/github'));

    expect(response.status).toBe(302);
    expect(mocks.startGitHubOAuth).toHaveBeenCalledOnce();
    expect(response.headers.get('set-cookie')).toContain('trace_github_state=oauth-state');
  });
});
