import {
  cookieAttributes,
  getTracePublicUrl,
  isSecurePublicUrl,
  readCookie,
  safeAuthNext,
  verifyOAuthState,
} from '@trace/auth';
import { parseGitHubAppEnv } from '@trace/env';
import {
  exchangeGitHubAppCode,
  getGitHubAuthenticatedUser,
  getGitHubInstallationSnapshot,
  listGitHubUserInstallations,
  verifyUserInstallationAccess,
} from '@trace/github';
import { createRequestDatabase, getRequestTraceSession } from '../../../../lib/request-database';
import {
  chooseGitHubInstallation,
  persistGitHubInstallationSnapshot,
} from '../../../../lib/github-installation';

const APP_STATE_COOKIE = 'trace_github_app_state';
const APP_NEXT_COOKIE = 'trace_github_app_next';
const RECONCILE_STATE_COOKIE = 'trace_github_reconcile_state';
const RECONCILE_NEXT_COOKIE = 'trace_github_reconcile_next';
const RECONCILE_INSTALLATION_COOKIE = 'trace_github_reconcile_installation';

function clearCookie(name: string) {
  return `${name}=; ${cookieAttributes(0, isSecurePublicUrl())}`;
}

function installationId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function appId(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeSetupDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (
    /^Missing (GITHUB_APP_ID|GITHUB_APP_CLIENT_ID|GITHUB_APP_CLIENT_SECRET|GITHUB_APP_PRIVATE_KEY|GITHUB_WEBHOOK_SECRET|GITHUB_APP_SLUG)$/.test(
      message,
    ) ||
    /^GitHub (App OAuth provider error|API request failed with) /.test(message)
  ) {
    return message;
  }
  if (
    message === 'GitHub App installation response invalid' ||
    message === 'GitHub App installation token missing' ||
    message === 'GitHub authenticated user response invalid'
  ) {
    return message;
  }
  if (message === 'GitHub account does not match the signed-in TRACE user.') {
    return 'GitHub account mismatch during installation reconciliation.';
  }
  return 'GitHub App setup failed.';
}

function redirectWithCleanup(destination: string, reason?: string) {
  const url = new URL(destination, getTracePublicUrl());
  if (reason) url.searchParams.set('setup', reason);
  const response = new Response(null, {
    status: 302,
    headers: { location: url.toString(), 'cache-control': 'no-store' },
  });
  for (const cookie of [
    APP_STATE_COOKIE,
    APP_NEXT_COOKIE,
    RECONCILE_STATE_COOKIE,
    RECONCILE_NEXT_COOKIE,
    RECONCILE_INSTALLATION_COOKIE,
  ]) {
    response.headers.append('set-cookie', clearCookie(cookie));
  }
  return response;
}

function readNextCookie(name: string, headers: Headers) {
  try {
    return safeAuthNext(decodeURIComponent(readCookie(headers, name) ?? ''));
  } catch {
    return '/onboarding';
  }
}

function appConfig(appEnv: ReturnType<typeof parseGitHubAppEnv>) {
  return {
    appId: appEnv.GITHUB_APP_ID,
    privateKey: appEnv.GITHUB_APP_PRIVATE_KEY,
    clientId: appEnv.GITHUB_APP_CLIENT_ID,
    clientSecret: appEnv.GITHUB_APP_CLIENT_SECRET,
  };
}

async function reconcileExistingInstallation(
  request: Request,
  session: NonNullable<Awaited<ReturnType<typeof getRequestTraceSession>>>,
  publicUrl: string,
) {
  const expectedState = readCookie(request.headers, RECONCILE_STATE_COOKIE);
  const receivedState = new URL(request.url).searchParams.get('state');
  const next = readNextCookie(RECONCILE_NEXT_COOKIE, request.headers);
  const code = new URL(request.url).searchParams.get('code');
  if (!(await verifyOAuthState(expectedState, receivedState)) || !code) {
    return redirectWithCleanup('/auth/error', 'github-app-state');
  }

  try {
    const appEnv = parseGitHubAppEnv();
    const redirectUri = appEnv.GITHUB_APP_CALLBACK_URL ?? `${publicUrl}/api/github/setup`;
    const userAccessToken = await exchangeGitHubAppCode({
      clientId: appEnv.GITHUB_APP_CLIENT_ID,
      clientSecret: appEnv.GITHUB_APP_CLIENT_SECRET,
      code,
      redirectUri,
    });
    const viewer = await getGitHubAuthenticatedUser(userAccessToken);
    if (viewer.login.toLowerCase() !== session.user.githubLogin.toLowerCase()) {
      throw new Error('GitHub account does not match the signed-in TRACE user.');
    }

    const configuredAppId = appId(appEnv.GITHUB_APP_ID);
    if (!configuredAppId) throw new Error('GitHub App ID is invalid.');
    const candidates = await listGitHubUserInstallations(userAccessToken, configuredAppId);
    const requestedInstallation = installationId(
      readCookie(request.headers, RECONCILE_INSTALLATION_COOKIE),
    );
    const candidate = chooseGitHubInstallation(candidates, requestedInstallation ?? undefined);
    if (!candidate) {
      return redirectWithCleanup(
        '/app/repositories',
        candidates.length > 1 ? 'github-installation-ambiguous' : 'github-installation-not-found',
      );
    }

    await verifyUserInstallationAccess(userAccessToken, candidate.id);
    const snapshot = await getGitHubInstallationSnapshot(appConfig(appEnv), candidate.id);
    if (
      snapshot.installation.id !== candidate.id ||
      snapshot.installation.accountLogin !== candidate.accountLogin ||
      snapshot.installation.accountType !== candidate.accountType
    ) {
      throw new Error('GitHub App installation identity mismatch.');
    }

    const { db, client } = await createRequestDatabase();
    try {
      await persistGitHubInstallationSnapshot({
        db,
        user: session.user,
        snapshot,
        action: 'github.reconciled',
      });
    } finally {
      await client.end();
    }
    return redirectWithCleanup(
      next,
      snapshot.installation.suspendedAt ? 'github-installation-suspended' : 'github-reconciled',
    );
  } catch (error) {
    console.error('TRACE GitHub App reconciliation failed', {
      message: safeSetupDiagnostic(error),
    });
    return redirectWithCleanup('/app/repositories', 'github-reconcile');
  }
}

export async function GET(request: Request) {
  const publicUrl = getTracePublicUrl();
  const session = await getRequestTraceSession(request.headers);
  if (!session?.user)
    return Response.redirect(new URL('/sign-in?next=/app/repositories', publicUrl));

  if (readCookie(request.headers, RECONCILE_STATE_COOKIE)) {
    return reconcileExistingInstallation(request, session, publicUrl);
  }

  const expectedState = readCookie(request.headers, APP_STATE_COOKIE);
  const receivedState = new URL(request.url).searchParams.get('state');
  const next = readNextCookie(APP_NEXT_COOKIE, request.headers);
  const url = new URL(request.url);
  if (!(await verifyOAuthState(expectedState, receivedState)))
    return redirectWithCleanup('/auth/error', 'github-app-state');
  if (url.searchParams.get('setup_action') === 'cancel')
    return redirectWithCleanup(next, 'cancelled');

  const id = installationId(url.searchParams.get('installation_id'));
  const code = url.searchParams.get('code');
  if (!id || !code) return redirectWithCleanup('/auth/error', 'github-app-authorization');

  try {
    const appEnv = parseGitHubAppEnv();
    const redirectUri = appEnv.GITHUB_APP_CALLBACK_URL ?? `${publicUrl}/api/github/setup`;
    const userAccessToken = await exchangeGitHubAppCode({
      clientId: appEnv.GITHUB_APP_CLIENT_ID,
      clientSecret: appEnv.GITHUB_APP_CLIENT_SECRET,
      code,
      redirectUri,
    });
    await verifyUserInstallationAccess(userAccessToken, id);
    const snapshot = await getGitHubInstallationSnapshot(appConfig(appEnv), id);
    const { db, client } = await createRequestDatabase();
    try {
      await persistGitHubInstallationSnapshot({
        db,
        user: session.user,
        snapshot,
        action: 'github.connected',
      });
    } finally {
      await client.end();
    }
    return redirectWithCleanup(next, 'connected');
  } catch (error) {
    console.error('TRACE GitHub App setup failed', { message: safeSetupDiagnostic(error) });
    return redirectWithCleanup('/auth/error', 'github-app');
  }
}
