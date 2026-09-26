import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestCloudflareEnv: vi.fn(async (): Promise<Record<string, string> | null> => null),
  getRequestTraceSession: vi.fn(async () => ({
    user: {
      id: 'user-1',
      name: 'Owner',
      email: 'owner@example.test',
      image: null,
      githubLogin: 'other',
    },
    session: { expiresAt: new Date(Date.now() + 60_000) },
  })),
}));

vi.mock('@trace/auth', () => ({
  cookieAttributes: () => 'Path=/; HttpOnly; SameSite=Lax',
  getTracePublicUrl: () => 'https://trace.example',
  isSecurePublicUrl: () => true,
  safeAuthNext: (value: string | null) => value ?? '/app/repositories',
}));

vi.mock('@trace/env', () => ({
  parseGitHubAppInstallEnv: () => ({
    GITHUB_APP_SLUG: 'trace-production',
    GITHUB_APP_INSTALL_URL: undefined,
  }),
}));

vi.mock('../../../../lib/request-database', () => ({
  getRequestCloudflareEnv: mocks.getRequestCloudflareEnv,
  getRequestTraceSession: mocks.getRequestTraceSession,
}));

import { GET } from './route';

describe('GitHub installation start route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestCloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
    });
  });

  it('does not redirect or set an installation state cookie for a non-allowlisted user', async () => {
    const response = await GET(new Request('https://trace.example/api/github/install'));

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('permits only the allowlisted user to begin the installation redirect', async () => {
    mocks.getRequestTraceSession.mockResolvedValue({
      user: {
        id: 'user-1',
        name: 'Owner',
        email: 'owner@example.test',
        image: null,
        githubLogin: 'MathOfDynamic',
      },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });

    const response = await GET(new Request('https://trace.example/api/github/install'));

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location') ?? '').hostname).toBe('github.com');
    expect(response.headers.get('set-cookie')).toContain('trace_github_app_state=');
  });

  it('fails closed when production mode is missing', async () => {
    mocks.getRequestCloudflareEnv.mockResolvedValue({ TRACE_DEPLOYMENT_ENV: 'production' });

    const response = await GET(new Request('https://trace.example/api/github/install'));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
