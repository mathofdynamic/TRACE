import { afterAll, describe, expect, it } from 'vitest';
import {
  createSessionCookie,
  getTraceSession,
  safeAuthNext,
  sessionCookieName,
  verifyOAuthState,
} from './index.js';

const originalSecret = process.env.TRACE_AUTH_SECRET;

process.env.TRACE_AUTH_SECRET = 'trace-auth-test-secret-change-this-32-chars';

afterAll(() => {
  if (originalSecret === undefined) delete process.env.TRACE_AUTH_SECRET;
  else process.env.TRACE_AUTH_SECRET = originalSecret;
});

describe('direct GitHub OAuth session boundary', () => {
  it('only accepts safe same-origin redirect paths', () => {
    expect(safeAuthNext('/app')).toBe('/app');
    expect(safeAuthNext('/app/repositories?setup=connected')).toBe(
      '/app/repositories?setup=connected',
    );
    expect(safeAuthNext('https://evil.example')).toBe('/onboarding');
    expect(safeAuthNext('//evil.example')).toBe('/onboarding');
    expect(safeAuthNext('/\\evil.example')).toBe('/onboarding');
  });

  it('validates OAuth state without accepting a different value', async () => {
    expect(await verifyOAuthState('state-value', 'state-value')).toBe(true);
    expect(await verifyOAuthState('state-value', 'other-value')).toBe(false);
  });

  it('round-trips a signed session without storing a provider token', async () => {
    const cookie = await createSessionCookie({
      id: '4a9c5f65-4af2-5f5c-a5a0-8bb08ff0f401',
      name: 'TRACE Tester',
      email: 'tester@example.com',
      image: null,
      githubLogin: 'trace-tester',
    });
    const session = await getTraceSession(
      new Headers({ cookie: `${sessionCookieName()}=${cookie}` }),
    );
    expect(session?.user.githubLogin).toBe('trace-tester');
    expect(cookie).not.toContain('access_token');
  });
});
