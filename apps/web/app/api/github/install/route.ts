import {
  cookieAttributes,
  getTracePublicUrl,
  getTraceSession,
  isSecurePublicUrl,
  safeAuthNext,
} from '@trace/auth';
import { parseGitHubAppInstallEnv } from '@trace/env';

const APP_STATE_COOKIE = 'trace_github_app_state';
const APP_NEXT_COOKIE = 'trace_github_app_next';

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function appInstallUrl(slug: string, configuredUrl?: string) {
  return configuredUrl ?? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
}

export async function GET(request: Request) {
  const publicUrl = getTracePublicUrl();
  const session = await getTraceSession(request.headers);
  if (!session?.user)
    return Response.redirect(new URL('/sign-in?next=/app/repositories', publicUrl));

  let env;
  try {
    env = parseGitHubAppInstallEnv();
  } catch {
    return Response.redirect(new URL('/app/repositories?setup=not-configured', publicUrl));
  }

  const state = randomState();
  const next = safeAuthNext(new URL(request.url).searchParams.get('next'));
  const installUrl = new URL(appInstallUrl(env.GITHUB_APP_SLUG, env.GITHUB_APP_INSTALL_URL));
  installUrl.searchParams.set('state', state);
  const attributes = cookieAttributes(600, isSecurePublicUrl());
  const response = new Response(null, {
    status: 302,
    headers: { location: installUrl.toString() },
  });
  response.headers.append('set-cookie', `${APP_STATE_COOKIE}=${state}; ${attributes}`);
  response.headers.append(
    'set-cookie',
    `${APP_NEXT_COOKIE}=${encodeURIComponent(next)}; ${attributes}`,
  );
  response.headers.set('cache-control', 'no-store');
  return response;
}
