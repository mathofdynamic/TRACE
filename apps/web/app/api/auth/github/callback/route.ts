import {
  completeGitHubOAuth,
  cookieAttributes,
  createSessionCookie,
  getTracePublicUrl,
  isSecurePublicUrl,
  oauthNextCookieName,
  oauthStateCookieName,
  readCookie,
  safeAuthNext,
  sessionCookieName,
  verifyOAuthState,
} from '@trace/auth';
import { upsertRequestUser } from '../../../../../lib/request-database';

function clearCookie(name: string) {
  return `${name}=; ${cookieAttributes(0, isSecurePublicUrl())}`;
}

function getSafeOAuthDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const name = error instanceof Error ? error.name : 'UnknownError';

  if (
    /^Missing (GITHUB_OAUTH_CLIENT_ID|GITHUB_OAUTH_CLIENT_SECRET|TRACE_AUTH_SECRET)$/.test(message)
  ) {
    return message;
  }
  if (/^TRACE_AUTH_SECRET must contain at least 32 characters$/.test(message)) {
    return message;
  }
  if (
    /^GitHub (token exchange failed with|API request failed with) \d+$/.test(message) ||
    /^GitHub (token exchange network error|token response parse error|API network error|API response parse error): [A-Za-z]+$/.test(
      message,
    ) ||
    /^GitHub OAuth provider error: [a-z0-9_-]{1,80}$/.test(message) ||
    /^GitHub identity hashing error: [A-Za-z]+$/.test(message) ||
    /^Session signing error: [A-Za-z]+$/.test(message) ||
    message === 'GitHub profile response invalid' ||
    message === 'GitHub email response invalid'
  ) {
    return message;
  }
  if (/^[a-z0-9_ -]{1,80}$/.test(message)) {
    return `OAuth provider response: ${message}`;
  }

  return `Session signing or runtime error: ${name}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const publicUrl = getTracePublicUrl();
  const expectedState = readCookie(request.headers, oauthStateCookieName());
  const receivedState = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  let nextCookie = '';
  try {
    nextCookie = decodeURIComponent(readCookie(request.headers, oauthNextCookieName()) ?? '');
  } catch {
    nextCookie = '';
  }
  const next = safeAuthNext(nextCookie);
  const clearState = clearCookie(oauthStateCookieName());
  const clearNext = clearCookie(oauthNextCookieName());

  if (!(await verifyOAuthState(expectedState, receivedState)) || !code) {
    return Response.redirect(new URL('/auth/error?reason=github-state', publicUrl), 302);
  }

  try {
    const user = await completeGitHubOAuth(code);
    const persistedUser = await upsertRequestUser(user);
    let session: string;
    try {
      session = await createSessionCookie(persistedUser);
    } catch (error) {
      throw new Error(
        `Session signing error: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
    const response = new Response(null, {
      status: 302,
      headers: {
        location: new URL(next, publicUrl).toString(),
        'cache-control': 'no-store',
      },
    });
    response.headers.append(
      'set-cookie',
      `${sessionCookieName()}=${session}; ${cookieAttributes(60 * 60 * 24 * 7, isSecurePublicUrl())}`,
    );
    response.headers.append('set-cookie', clearState);
    response.headers.append('set-cookie', clearNext);
    return response;
  } catch (error) {
    console.error('TRACE GitHub OAuth callback failed', { message: getSafeOAuthDiagnostic(error) });
    return Response.redirect(new URL('/auth/error?reason=github-oauth', publicUrl), 302);
  }
}
