import { cookieAttributes, getTracePublicUrl, isSecurePublicUrl, safeAuthNext } from '@trace/auth';
import { parseGitHubAppEnv } from '@trace/env';
import { getRequestCloudflareEnv, getRequestTraceSession } from '../../../../lib/request-database';
import {
  isClosedProductionCanary,
  productionCanaryClosedResponse,
} from '../../../../lib/production-canary';

const APP_STATE_COOKIE = 'trace_github_app_state';
const APP_NEXT_COOKIE = 'trace_github_app_next';
const RECONCILE_STATE_COOKIE = 'trace_github_reconcile_state';
const RECONCILE_NEXT_COOKIE = 'trace_github_reconcile_next';
const RECONCILE_INSTALLATION_COOKIE = 'trace_github_reconcile_installation';

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function installationId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

function clearCookie(name: string) {
  return `${name}=; ${cookieAttributes(0, isSecurePublicUrl())}`;
}

export async function GET(request: Request) {
  if (isClosedProductionCanary(await getRequestCloudflareEnv())) {
    return productionCanaryClosedResponse();
  }

  const publicUrl = getTracePublicUrl();
  const session = await getRequestTraceSession(request.headers);
  if (!session?.user)
    return Response.redirect(new URL('/sign-in?next=/app/repositories', publicUrl));

  let appEnv: ReturnType<typeof parseGitHubAppEnv>;
  try {
    appEnv = parseGitHubAppEnv();
  } catch {
    return Response.redirect(new URL('/app/repositories?setup=not-configured', publicUrl));
  }

  const url = new URL(request.url);
  const next = safeAuthNext(url.searchParams.get('next'));
  const state = randomState();
  const redirectUri = appEnv.GITHUB_APP_CALLBACK_URL ?? `${publicUrl}/api/github/setup`;
  const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
  authorizationUrl.searchParams.set('client_id', appEnv.GITHUB_APP_CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('allow_signup', 'false');
  authorizationUrl.searchParams.set('prompt', 'select_account');

  const attributes = cookieAttributes(600, isSecurePublicUrl());
  const response = new Response(null, {
    status: 302,
    headers: { location: authorizationUrl.toString(), 'cache-control': 'no-store' },
  });
  for (const cookie of [APP_STATE_COOKIE, APP_NEXT_COOKIE]) {
    response.headers.append('set-cookie', clearCookie(cookie));
  }
  response.headers.append('set-cookie', `${RECONCILE_STATE_COOKIE}=${state}; ${attributes}`);
  response.headers.append(
    'set-cookie',
    `${RECONCILE_NEXT_COOKIE}=${encodeURIComponent(next)}; ${attributes}`,
  );
  const requestedInstallation = installationId(url.searchParams.get('installation_id'));
  if (requestedInstallation) {
    response.headers.append(
      'set-cookie',
      `${RECONCILE_INSTALLATION_COOKIE}=${requestedInstallation}; ${attributes}`,
    );
  } else {
    response.headers.append(
      'set-cookie',
      `${RECONCILE_INSTALLATION_COOKIE}=; ${cookieAttributes(0, isSecurePublicUrl())}`,
    );
  }
  return response;
}
