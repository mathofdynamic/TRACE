const backendUrl = 'https://trace-production.mathofdynamic2.workers.dev';
const productionUrl = 'https://trace-code.pages.dev';

export type FixtureRouteCheck = {
  name: string;
  status: number;
  result: string;
};

function fail(route: string, detail: string): never {
  throw new Error(`Production fixture route ${route} failed: ${detail}.`);
}

function isSameOriginSignIn(location: string | null, expectedOrigin: string) {
  if (!location) return false;
  try {
    const url = new URL(location, expectedOrigin);
    return (
      url.origin === expectedOrigin &&
      url.pathname === '/sign-in' &&
      url.searchParams.get('next') === '/app/repositories'
    );
  } catch {
    return false;
  }
}

export async function verifyProductionFixtureRoutes(
  expectedOAuthClientId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<FixtureRouteCheck[]> {
  if (!expectedOAuthClientId) fail('/api/auth/github', 'production OAuth client ID is unavailable');
  const checks: FixtureRouteCheck[] = [];

  async function request(route: string, init: RequestInit = {}) {
    try {
      return await fetchImplementation(
        `${route.startsWith('/api/auth/') || ['/api/github/install', '/api/github/setup', '/api/github/reconcile'].includes(route) ? productionUrl : backendUrl}${route}`,
        {
          ...init,
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      return fail(route, 'request failed before receiving a response');
    }
  }

  const health = await request('/api/health');
  if (health.status !== 200) fail('/api/health', `expected HTTP 200, received ${health.status}`);
  checks.push({ name: 'HEALTH', status: health.status, result: 'PASS' });

  const oauth = await request('/api/auth/github');
  const oauthLocation = oauth.headers.get('location');
  if (oauth.status !== 302 || !oauthLocation) {
    fail('/api/auth/github', `expected HTTP 302, received ${oauth.status}`);
  }
  let oauthUrl: URL;
  try {
    oauthUrl = new URL(oauthLocation);
  } catch {
    return fail('/api/auth/github', 'redirect Location is invalid');
  }
  if (
    oauthUrl.origin !== 'https://github.com' ||
    oauthUrl.pathname !== '/login/oauth/authorize' ||
    oauthUrl.searchParams.get('client_id') !== expectedOAuthClientId
  ) {
    fail('/api/auth/github', 'redirect is not the production OAuth authorization URL');
  }
  checks.push({
    name: 'OAUTH_START',
    status: oauth.status,
    result: '302 production OAuth redirect not followed',
  });

  for (const route of ['/api/github/install', '/api/github/setup', '/api/github/reconcile']) {
    const response = await request(route);
    if (
      response.status !== 302 ||
      !isSameOriginSignIn(response.headers.get('location'), productionUrl)
    ) {
      fail(route, `expected unauthenticated sign-in redirect, received HTTP ${response.status}`);
    }
    checks.push({
      name: route.toUpperCase().replaceAll('/', '_'),
      status: response.status,
      result: '302 sign-in redirect not followed',
    });
  }

  const repositoryMutation = await request('/api/github/repositories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (repositoryMutation.status !== 401) {
    fail('/api/github/repositories', `expected HTTP 401, received ${repositoryMutation.status}`);
  }
  checks.push({
    name: 'REPOSITORY_POST_UNAUTH',
    status: repositoryMutation.status,
    result: 'PASS',
  });

  const recoveryPost = await request('/api/github/webhooks/recovery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deliveryId: 'fixture-canary-unauthenticated-check' }),
  });
  if (recoveryPost.status !== 401) {
    fail(
      '/api/github/webhooks/recovery POST',
      `expected HTTP 401, received ${recoveryPost.status}`,
    );
  }
  checks.push({ name: 'RECOVERY_POST_UNAUTH', status: recoveryPost.status, result: 'PASS' });

  const recoveryGet = await request('/api/github/webhooks/recovery');
  if (recoveryGet.status !== 401) {
    fail('/api/github/webhooks/recovery GET', `expected HTTP 401, received ${recoveryGet.status}`);
  }
  checks.push({ name: 'RECOVERY_GET_UNAUTH', status: recoveryGet.status, result: 'PASS' });

  const unsignedWebhook = await request('/api/github/webhooks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ canary: 'unsigned-fixture-route-check' }),
  });
  const webhookBody = await unsignedWebhook.text();
  if (unsignedWebhook.status !== 401 || !/invalid webhook signature/i.test(webhookBody)) {
    fail(
      '/api/github/webhooks',
      'unsigned request was not rejected with HTTP 401 Invalid webhook signature',
    );
  }
  checks.push({
    name: 'UNSIGNED_WEBHOOK',
    status: unsignedWebhook.status,
    result: '401 Invalid webhook signature',
  });

  return checks;
}

async function main() {
  try {
    const checks = await verifyProductionFixtureRoutes(
      process.env.TRACE_GITHUB_OAUTH_CLIENT_ID ?? '',
    );
    for (const check of checks) console.log(`${check.name}=${check.status} ${check.result}`);
    console.log('REDIRECTS_FOLLOWED=NO');
    console.log('VALID_WEBHOOK_SENT=NO');
    console.log('QUEUE_OR_D1_MUTATION_REQUESTED=NO');
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Production fixture route checks failed.',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/verify-production-fixture-routes.ts')) {
  main();
}
