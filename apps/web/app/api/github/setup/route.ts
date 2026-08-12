import {
  cookieAttributes,
  getTracePublicUrl,
  getTraceSession,
  isSecurePublicUrl,
  readCookie,
  safeAuthNext,
  verifyOAuthState,
} from '@trace/auth';
import { parseGitHubAppEnv } from '@trace/env';
import {
  exchangeGitHubAppCode,
  getGitHubInstallationSnapshot,
  verifyUserInstallationAccess,
} from '@trace/github';
import { schema } from '@trace/db';
import { createRequestDatabase } from '../../../../lib/request-database';
import { ensureGitHubWorkspace } from '../../../../lib/workspace';

const APP_STATE_COOKIE = 'trace_github_app_state';
const APP_NEXT_COOKIE = 'trace_github_app_next';

function clearCookie(name: string) {
  return `${name}=; ${cookieAttributes(0, isSecurePublicUrl())}`;
}

function installationId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeSetupDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (
    /^Missing (GITHUB_APP_ID|GITHUB_APP_CLIENT_ID|GITHUB_APP_CLIENT_SECRET|GITHUB_APP_PRIVATE_KEY|GITHUB_WEBHOOK_SECRET|GITHUB_APP_SLUG)$/.test(
      message,
    ) ||
    /^GitHub (App OAuth provider error|API request failed with) /.test(message) ||
    message === 'GitHub App installation response invalid' ||
    message === 'GitHub App installation token missing'
  ) {
    return message;
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
  response.headers.append('set-cookie', clearCookie(APP_STATE_COOKIE));
  response.headers.append('set-cookie', clearCookie(APP_NEXT_COOKIE));
  return response;
}

export async function GET(request: Request) {
  const publicUrl = getTracePublicUrl();
  const session = await getTraceSession(request.headers);
  if (!session?.user)
    return Response.redirect(new URL('/sign-in?next=/app/repositories', publicUrl));

  const expectedState = readCookie(request.headers, APP_STATE_COOKIE);
  const receivedState = new URL(request.url).searchParams.get('state');
  let nextCookie = '';
  try {
    nextCookie = decodeURIComponent(readCookie(request.headers, APP_NEXT_COOKIE) ?? '');
  } catch {
    nextCookie = '';
  }
  const next = safeAuthNext(nextCookie);
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
    const snapshot = await getGitHubInstallationSnapshot(
      {
        appId: appEnv.GITHUB_APP_ID,
        privateKey: appEnv.GITHUB_APP_PRIVATE_KEY,
        clientId: appEnv.GITHUB_APP_CLIENT_ID,
        clientSecret: appEnv.GITHUB_APP_CLIENT_SECRET,
      },
      id,
    );

    const { db, client } = await createRequestDatabase();
    try {
      const workspace = await ensureGitHubWorkspace(db, session.user, {
        login: snapshot.installation.accountLogin,
        type: snapshot.installation.accountType,
      });
      const now = new Date();
      const [installation] = await db
        .insert(schema.githubInstallations)
        .values({
          organizationId: workspace.id,
          githubInstallationId: snapshot.installation.id,
          accountLogin: snapshot.installation.accountLogin,
          accountType: snapshot.installation.accountType,
          state: snapshot.installation.suspendedAt ? 'suspended' : 'active',
          suspendedAt: snapshot.installation.suspendedAt
            ? new Date(snapshot.installation.suspendedAt)
            : null,
        })
        .onConflictDoUpdate({
          target: schema.githubInstallations.githubInstallationId,
          set: {
            organizationId: workspace.id,
            accountLogin: snapshot.installation.accountLogin,
            accountType: snapshot.installation.accountType,
            state: snapshot.installation.suspendedAt ? 'suspended' : 'active',
            suspendedAt: snapshot.installation.suspendedAt
              ? new Date(snapshot.installation.suspendedAt)
              : null,
            updatedAt: now,
          },
        })
        .returning({ id: schema.githubInstallations.id });
      if (!installation) throw new Error('GitHub App installation could not be persisted.');

      for (const repository of snapshot.repositories) {
        await db
          .insert(schema.githubRepositories)
          .values({
            organizationId: workspace.id,
            installationId: installation.id,
            githubRepositoryId: repository.id,
            owner: repository.owner,
            name: repository.name,
            fullName: repository.fullName,
            defaultBranch: repository.defaultBranch,
            visibility: repository.visibility,
            state: 'available',
            lastSynchronizedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.githubRepositories.githubRepositoryId,
            set: {
              organizationId: workspace.id,
              installationId: installation.id,
              owner: repository.owner,
              name: repository.name,
              fullName: repository.fullName,
              defaultBranch: repository.defaultBranch,
              visibility: repository.visibility,
              lastSynchronizedAt: now,
              updatedAt: now,
            },
          });
        await db
          .insert(schema.githubInstallationRepositories)
          .values({
            installationId: installation.id,
            githubRepositoryId: repository.id,
            permissions: repository.permissions,
          })
          .onConflictDoUpdate({
            target: [
              schema.githubInstallationRepositories.installationId,
              schema.githubInstallationRepositories.githubRepositoryId,
            ],
            set: { permissions: repository.permissions, updatedAt: now },
          });
      }
      await db.insert(schema.auditEvents).values({
        organizationId: workspace.id,
        actorUserId: session.user.id,
        action: 'github.connected',
        subjectType: 'github_installation',
        subjectId: installation.id,
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
