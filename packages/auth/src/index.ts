const SESSION_COOKIE = 'trace_session';
const OAUTH_STATE_COOKIE = 'trace_github_state';
const OAUTH_NEXT_COOKIE = 'trace_github_next';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

export type TraceUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  githubLogin: string;
};

export type TraceSession = {
  user: TraceUser;
  session: { expiresAt: Date };
};

export type AuthRuntimeStatus = 'configured' | 'missing-credentials';

type SessionPayload = {
  user: TraceUser;
  issuedAt: number;
  expiresAt: number;
};

type GitHubProfile = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string) {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeText(value: string) {
  return base64UrlEncode(encoder.encode(value));
}

function decodeText(value: string) {
  return new TextDecoder().decode(base64UrlDecode(value));
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function verifySignature(value: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, base64UrlDecode(signature), encoder.encode(value));
}

function getRequiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getTracePublicUrl() {
  const value = process.env.TRACE_PUBLIC_URL ?? 'http://localhost:3000';
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('TRACE_PUBLIC_URL must use HTTP or HTTPS');
  }
  return url.toString().replace(/\/$/, '');
}

function getAuthSecret() {
  const secret = getRequiredEnvironment('TRACE_AUTH_SECRET');
  if (secret.length < 32) throw new Error('TRACE_AUTH_SECRET must contain at least 32 characters');
  return secret;
}

function getGitHubClientCredentials() {
  return {
    clientId: getRequiredEnvironment('GITHUB_OAUTH_CLIENT_ID'),
    clientSecret: getRequiredEnvironment('GITHUB_OAUTH_CLIENT_SECRET'),
  };
}

export function getAuthRuntimeStatus(): AuthRuntimeStatus {
  try {
    getAuthSecret();
    getGitHubClientCredentials();
    getTracePublicUrl();
    return 'configured';
  } catch {
    return 'missing-credentials';
  }
}

export function safeAuthNext(value: string | null | undefined) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/onboarding';
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function startGitHubOAuth(next: string | null | undefined) {
  const { clientId } = getGitHubClientCredentials();
  const publicUrl = getTracePublicUrl();
  const state = randomToken();
  const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', `${publicUrl}/api/auth/github/callback`);
  authorizationUrl.searchParams.set('scope', 'read:user user:email');
  authorizationUrl.searchParams.set('state', state);
  return { authorizationUrl: authorizationUrl.toString(), state, next: safeAuthNext(next) };
}

export async function verifyOAuthState(expected: string | null, received: string | null) {
  if (!expected || !received) return false;
  const expectedDigest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  );
  const receivedDigest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(received)),
  );
  let difference = expectedDigest.length ^ receivedDigest.length;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= expectedDigest[index]! ^ receivedDigest[index]!;
  }
  return difference === 0;
}

async function fetchGitHubJson<T>(url: string, accessToken: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': 'TRACE test authentication',
        'x-github-api-version': '2022-11-28',
      },
    });
  } catch (error) {
    throw new Error(
      `GitHub API network error: ${error instanceof Error ? error.name : 'UnknownError'}`,
    );
  }
  if (!response.ok) throw new Error(`GitHub API request failed with ${response.status}`);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(
      `GitHub API response parse error: ${error instanceof Error ? error.name : 'UnknownError'}`,
    );
  }
}

export async function completeGitHubOAuth(code: string) {
  const { clientId, clientSecret } = getGitHubClientCredentials();
  const publicUrl = getTracePublicUrl();
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${publicUrl}/api/auth/github/callback`,
      }),
    });
  } catch (error) {
    throw new Error(
      `GitHub token exchange network error: ${error instanceof Error ? error.name : 'UnknownError'}`,
    );
  }
  if (!tokenResponse.ok)
    throw new Error(`GitHub token exchange failed with ${tokenResponse.status}`);
  let token: { access_token?: string; error?: string };
  try {
    token = (await tokenResponse.json()) as { access_token?: string; error?: string };
  } catch (error) {
    throw new Error(
      `GitHub token response parse error: ${error instanceof Error ? error.name : 'UnknownError'}`,
    );
  }
  if (!token.access_token) {
    const providerError =
      typeof token.error === 'string' && /^[a-z0-9_-]{1,80}$/.test(token.error)
        ? token.error
        : 'missing_access_token';
    throw new Error(`GitHub OAuth provider error: ${providerError}`);
  }

  const profile = await fetchGitHubJson<GitHubProfile>(
    'https://api.github.com/user',
    token.access_token,
  );
  if (
    !profile ||
    !Number.isInteger(profile.id) ||
    typeof profile.login !== 'string' ||
    (profile.name !== null && typeof profile.name !== 'string')
  ) {
    throw new Error('GitHub profile response invalid');
  }
  let email = profile.email;
  if (!email) {
    const emails = await fetchGitHubJson<GitHubEmail[]>(
      'https://api.github.com/user/emails',
      token.access_token,
    );
    if (!Array.isArray(emails)) throw new Error('GitHub email response invalid');
    const validEmails = emails.filter(
      (entry): entry is GitHubEmail =>
        Boolean(entry) && typeof entry.email === 'string' && entry.email.length > 0,
    );
    email =
      validEmails.find((entry) => entry.primary && entry.verified)?.email ??
      validEmails.find((entry) => entry.verified)?.email ??
      null;
  }

  let id: string;
  try {
    id = await githubIdToUuid(profile.id);
  } catch (error) {
    throw new Error(
      `GitHub identity hashing error: ${error instanceof Error ? error.name : 'UnknownError'}`,
    );
  }

  return {
    id,
    name: profile.name?.trim() || profile.login,
    email: email ?? `${profile.login}@users.noreply.github.com`,
    image: profile.avatar_url,
    githubLogin: profile.login,
  } satisfies TraceUser;
}

async function githubIdToUuid(githubId: number) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(`github:${githubId}`)),
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function createSessionCookie(user: TraceUser) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    user,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = encodeText(JSON.stringify(payload));
  return `${encodedPayload}.${await sign(encodedPayload, getAuthSecret())}`;
}

export function readCookie(headers: Headers, name: string) {
  return (
    headers
      .get('cookie')
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

export async function getTraceSession(headers: Headers): Promise<TraceSession | null> {
  const value = readCookie(headers, SESSION_COOKIE);
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const encodedPayload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  try {
    if (!(await verifySignature(encodedPayload, signature, getAuthSecret()))) return null;
    const payload = JSON.parse(decodeText(encodedPayload)) as SessionPayload;
    if (!payload.user || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return {
      user: payload.user,
      session: { expiresAt: new Date(payload.expiresAt * 1000) },
    };
  } catch {
    return null;
  }
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function oauthStateCookieName() {
  return OAUTH_STATE_COOKIE;
}

export function oauthNextCookieName() {
  return OAUTH_NEXT_COOKIE;
}

export function cookieAttributes(maxAge: number, secure: boolean) {
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function isSecurePublicUrl() {
  return getTracePublicUrl().startsWith('https://');
}

export const authBoundary = {
  provider: 'github-oauth',
  storage: 'signed-cookie-test-only',
  installationCredentialsAreSeparate: true,
} as const;
