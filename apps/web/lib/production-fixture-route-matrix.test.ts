import { describe, expect, it, vi } from 'vitest';
import { verifyProductionFixtureRoutes } from '../../../scripts/verify-production-fixture-routes.js';

const productionUrl = 'https://trace-production.mathofdynamic2.workers.dev';
const oauthClientId = 'production-oauth-client-id';

function response(status: number, headers: Record<string, string> = {}, body = '') {
  return new Response(body, { status, headers });
}

function validFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(init?.redirect).toBe('manual');
    if (url.pathname === '/api/health') return response(200);
    if (url.pathname === '/api/auth/github') {
      const location = new URL('https://github.com/login/oauth/authorize');
      location.searchParams.set('client_id', oauthClientId);
      return response(302, { location: location.toString() });
    }
    if (
      ['/api/github/install', '/api/github/setup', '/api/github/reconcile'].includes(url.pathname)
    ) {
      return response(302, { location: `${productionUrl}/sign-in?next=%2Fapp%2Frepositories` });
    }
    if (url.pathname === '/api/github/repositories' && init?.method === 'POST') {
      return response(401);
    }
    if (url.pathname === '/api/github/webhooks/recovery' && init?.method === 'POST') {
      return response(401);
    }
    if (url.pathname === '/api/github/webhooks/recovery') return response(401);
    if (url.pathname === '/api/github/webhooks' && init?.method === 'POST') {
      expect(new Headers(init.headers).has('x-hub-signature-256')).toBe(false);
      return response(401, {}, 'Invalid webhook signature.');
    }
    return response(404);
  }) as typeof fetch;
}

describe('production fixture route matrix', () => {
  it('checks anonymous fixture-mode boundaries without following redirects', async () => {
    const fetchImplementation = validFetch();
    const result = await verifyProductionFixtureRoutes(oauthClientId, fetchImplementation);
    expect(result.map((entry) => entry.status)).toEqual([
      200, 302, 302, 302, 302, 401, 401, 401, 401,
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(9);
  });

  it('rejects OAuth redirects that use a different client ID', async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/health') return response(200);
      return response(302, {
        location: 'https://github.com/login/oauth/authorize?client_id=staging-client-id',
      });
    }) as typeof fetch;
    await expect(verifyProductionFixtureRoutes(oauthClientId, fetchImplementation)).rejects.toThrow(
      'not the production OAuth authorization URL',
    );
  });

  it('rejects external or malformed unauthenticated redirects', async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/health') return response(200);
      if (url.pathname === '/api/auth/github') {
        return response(302, {
          location: `https://github.com/login/oauth/authorize?client_id=${oauthClientId}`,
        });
      }
      return response(302, {
        location: 'https://attacker.invalid/sign-in?next=%2Fapp%2Frepositories',
      });
    }) as typeof fetch;
    await expect(verifyProductionFixtureRoutes(oauthClientId, fetchImplementation)).rejects.toThrow(
      'expected unauthenticated sign-in redirect',
    );
  });

  it('requires the webhook to reject the unsigned body before accepting it', async () => {
    const fetchImplementation = validFetch();
    const wrappedFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/github/webhooks') return response(202, {}, 'accepted');
      return fetchImplementation(input, init);
    };
    await expect(verifyProductionFixtureRoutes(oauthClientId, wrappedFetch)).rejects.toThrow(
      'unsigned request was not rejected',
    );
  });
});
