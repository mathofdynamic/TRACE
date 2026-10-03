import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../../deploy/pages-proxy/functions/_middleware.js';
import {
  isTrustedBrowserMutation,
  canonicalBrowserLocation,
  PRODUCTION_BROWSER_ORIGIN as pages,
  PRODUCTION_BACKEND_ORIGIN as backend,
  STAGING_ORIGIN,
} from './browser-origin';
import {
  assertDirectProductionWebhook,
  assertOwnerLoginState,
} from '../../../scripts/verify-production-owner-state';
import { cookieAttributes, getTracePublicUrl } from '@trace/auth';
import manifest from '../production-canary.json';
import { readFileSync } from 'node:fs';

const env = { TRACE_DEPLOYMENT_ENV: 'production', TRACE_PUBLIC_URL: pages };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('fixed Pages production proxy', () => {
  it.each(['/app/repositories?q=a%26b', '//evil.example/api?target=https://evil.example'])(
    'preserves path/query at fixed production upstream: %s',
    async (path) => {
      const spy = vi.fn(async (request: Request) => {
        const target = new URL(request.url);
        expect(target.origin).toBe(backend);
        expect(target.pathname + target.search).toBe(path);
        expect(request.method).toBe('GET');
        expect(request.headers.get('x-forwarded-host')).toBe('trace-code.pages.dev');
        expect(request.headers.get('x-forwarded-proto')).toBe('https');
        expect(request.headers.get('x-trace-test')).toBe('preserved');
        return new Response('ok');
      });
      vi.stubGlobal('fetch', spy);
      await onRequest({
        request: new Request(`${pages}${path}`, {
          headers: { 'x-trace-test': 'preserved', 'x-forwarded-host': 'evil.example' },
        }),
      });
      expect(spy).toHaveBeenCalledOnce();
    },
  );
  it('preserves POST body, method, cookies, origin and upstream Set-Cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        expect(request.url).toBe(`${backend}/api/github/repositories?x=1`);
        expect(request.method).toBe('POST');
        expect(await request.text()).toBe('{"repositoryIds":["selected"]}');
        expect(request.headers.get('origin')).toBe(pages);
        expect(request.headers.get('cookie')).toBe('test=fixture');
        return new Response('ok', {
          headers: { 'set-cookie': 'test=fixture; Secure; HttpOnly; SameSite=Lax; Path=/' },
        });
      }),
    );
    const response = await onRequest({
      request: new Request(`${pages}/api/github/repositories?x=1`, {
        method: 'POST',
        body: '{"repositoryIds":["selected"]}',
        headers: { origin: pages, cookie: 'test=fixture' },
      }),
    });
    expect(response.headers.get('set-cookie')).not.toContain('Domain=');
    expect(response.headers.get('x-trace-proxy-upstream')).toBe(backend);
  });
});
describe('canonical browser versus operational backend', () => {
  it.each([
    '/',
    '/sign-in',
    '/app/repositories?a=1',
    '/api/auth/github',
    '/api/auth/github/callback?state=test',
    '/api/github/setup',
    '/api/github/reconcile',
    '/cli/authorize',
    '/api/cli/device/confirm',
  ])('redirects direct backend browser route before state generation: %s', (path) => {
    expect(canonicalBrowserLocation(new Request(`${backend}${path}`), env)).toBe(`${pages}${path}`);
    expect(
      canonicalBrowserLocation(
        new Request(`${backend}${path}`, {
          headers: { 'x-forwarded-host': 'trace-code.pages.dev', 'x-forwarded-proto': 'https' },
        }),
        env,
      ),
    ).toBeNull();
    expect(canonicalBrowserLocation(new Request(`${pages}${path}`), env)).toBeNull();
  });
  it.each([
    '/api/health',
    '/api/github/webhooks',
    '/api/github/webhooks/recovery',
    '/api/cli/device/start',
    '/api/cli/device/token',
    '/api/cli/me',
    '/api/sync',
  ])('keeps direct backend API: %s', (path) =>
    expect(canonicalBrowserLocation(new Request(`${backend}${path}`), env)).toBeNull(),
  );
  it('accepts only the canonical production browser mutation origin, not forwarding metadata', () => {
    vi.stubEnv('TRACE_DEPLOYMENT_ENV', 'production');
    vi.stubEnv('TRACE_PUBLIC_URL', pages);
    for (const origin of [pages, backend, 'https://evil.example']) {
      expect(
        isTrustedBrowserMutation(
          new Request(`${backend}/api/github/repositories`, {
            method: 'POST',
            headers: { origin, 'x-forwarded-host': 'trace-code.pages.dev' },
          }),
        ),
      ).toBe(origin === pages);
    }
  });
  it('does not trust arbitrary forwarding hosts and leaves staging unchanged', () => {
    expect(
      canonicalBrowserLocation(
        new Request(`${backend}/sign-in`, {
          headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
        }),
        env,
      ),
    ).toBe(`${pages}/sign-in`);
    expect(
      canonicalBrowserLocation(new Request(`${STAGING_ORIGIN}/sign-in`), {
        ...env,
        TRACE_DEPLOYMENT_ENV: 'staging',
      }),
    ).toBeNull();
  });
  it('separates browser callbacks, direct webhook, CLI and staging acceptance', () => {
    expect(manifest.publicUrl).toBe(pages);
    expect(manifest.backendUrl).toBe(backend);
    vi.stubEnv('TRACE_PUBLIC_URL', pages);
    expect(getTracePublicUrl()).toBe(pages);
    const deviceConfirm = readFileSync(
      new URL('../app/api/cli/device/confirm/route.ts', import.meta.url),
      'utf8',
    );
    expect(deviceConfirm).not.toContain(', request.url)');
    expect(deviceConfirm).toContain("new URL('/cli/authorize?approved=1', getTracePublicUrl())");
    expect(cookieAttributes(600, true)).toContain('HttpOnly; SameSite=Lax;');
    expect(cookieAttributes(600, true)).toContain('; Secure');
    expect(cookieAttributes(600, true)).not.toContain('Domain=');
    expect(
      readFileSync(
        new URL('../../../scripts/production-github-webhook-control.ts', import.meta.url),
        'utf8',
      ),
    ).toContain(`${backend}/api/github/webhooks`);
    expect(
      readFileSync(new URL('../../../packages/trace-cli/src/cloud.ts', import.meta.url), 'utf8'),
    ).toContain(`const DEFAULT_SERVER = '${backend}'`);
    expect(
      readFileSync(
        new URL('../../../.github/workflows/deploy-staging.yml', import.meta.url),
        'utf8',
      ),
    ).toContain(`TRACE_STAGING_URL: ${STAGING_ORIGIN}`);
  });
  it('requires the configured webhook to stay direct Worker with TLS verification', () => {
    const config = {
      url: `${backend}/api/github/webhooks`,
      content_type: 'json',
      insecure_ssl: '0',
    };
    expect(() => assertDirectProductionWebhook(config)).not.toThrow();
    expect(() =>
      assertDirectProductionWebhook({ ...config, url: `${pages}/api/github/webhooks` }),
    ).toThrow();
    expect(() => assertDirectProductionWebhook({ ...config, insecure_ssl: '1' })).toThrow();
  });
  it('allows preserved and newly created active sessions without exact historic counts', () => {
    for (const count of [1, 2, 5])
      expect(() =>
        assertOwnerLoginState({
          users_count: 1,
          unexpected_accounts: 0,
          completed_onboarding: 1,
          active_sessions: count,
        }),
      ).not.toThrow();
    expect(() =>
      assertOwnerLoginState({
        users_count: 1,
        unexpected_accounts: 0,
        completed_onboarding: 1,
        active_sessions: 0,
      }),
    ).toThrow();
    expect(() =>
      assertOwnerLoginState({
        users_count: 2,
        unexpected_accounts: 1,
        completed_onboarding: 1,
        active_sessions: 2,
      }),
    ).toThrow();
  });
});
