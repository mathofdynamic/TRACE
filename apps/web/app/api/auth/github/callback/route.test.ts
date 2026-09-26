import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TraceUser } from '@trace/auth';

const mocks = vi.hoisted(() => ({
  getRequestCloudflareEnv: vi.fn(async (): Promise<Record<string, string> | null> => null),
}));

vi.mock('../../../../../lib/request-database', () => ({
  getRequestCloudflareEnv: mocks.getRequestCloudflareEnv,
  upsertRequestUser: vi.fn(async (user: TraceUser) => user),
  persistRequestAuthSession: vi.fn(async () => undefined),
}));

import { GET } from './route';
import { persistRequestAuthSession, upsertRequestUser } from '../../../../../lib/request-database';

const environment = {
  TRACE_PUBLIC_URL: process.env.TRACE_PUBLIC_URL,
  TRACE_AUTH_SECRET: process.env.TRACE_AUTH_SECRET,
  GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
  GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,
};

function restoreEnvironment(name: keyof typeof environment) {
  const value = environment[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('GitHub OAuth callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestCloudflareEnv.mockResolvedValue(null);
    process.env.TRACE_PUBLIC_URL = 'https://trace-code.pages.dev';
    process.env.TRACE_AUTH_SECRET = 'trace-auth-test-secret-change-this-32-chars';
    process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    restoreEnvironment('TRACE_PUBLIC_URL');
    restoreEnvironment('TRACE_AUTH_SECRET');
    restoreEnvironment('GITHUB_OAUTH_CLIENT_ID');
    restoreEnvironment('GITHUB_OAUTH_CLIENT_SECRET');
    vi.unstubAllGlobals();
  });

  it('sets the session cookies on a mutable redirect response', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === 'https://github.com/login/oauth/access_token') {
        return Response.json({ access_token: 'test-access-token' });
      }
      if (url === 'https://api.github.com/user') {
        return Response.json({
          id: 123,
          login: 'trace-tester',
          name: 'TRACE Tester',
          email: 'tester@example.com',
          avatar_url: null,
        });
      }
      throw new Error(`Unexpected test request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request(
        'https://trace-code.pages.dev/api/auth/github/callback?code=test-code&state=test-state',
        {
          headers: {
            cookie: 'trace_github_state=test-state; trace_github_next=%2Fapp',
          },
        },
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://trace-code.pages.dev/app');
    expect(response.headers.get('set-cookie')).toContain('trace_session=');
    expect(response.headers.get('set-cookie')).toContain('trace_github_state=;');
    expect(response.headers.get('set-cookie')).toContain('trace_github_next=;');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a non-allowlisted GitHub login before user/session persistence or session cookie issuance', async () => {
    mocks.getRequestCloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === 'https://github.com/login/oauth/access_token') {
        return Response.json({ access_token: 'test-access-token' });
      }
      if (url === 'https://api.github.com/user') {
        return Response.json({
          id: 123,
          login: 'someone-else',
          name: 'Other User',
          email: 'other@example.com',
          avatar_url: null,
        });
      }
      throw new Error(`Unexpected test request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request(
        'https://trace-code.pages.dev/api/auth/github/callback?code=test-code&state=test-state',
        {
          headers: {
            cookie: 'trace_github_state=test-state; trace_github_next=%2Fapp',
          },
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(upsertRequestUser).not.toHaveBeenCalled();
    expect(persistRequestAuthSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
