import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { importPKCS8, SignJWT } from 'jose';
import type { TraceGitHubEvent } from '@trace/core';

export type GitHubDelivery = {
  deliveryId: string;
  eventName: string;
  action?: string;
  payload: unknown;
};

export type NormalizedGitHubEvent = TraceGitHubEvent;

export function isReplaySafeDelivery(
  delivery: GitHubDelivery,
  seenDeliveryIds: ReadonlySet<string>,
) {
  return delivery.deliveryId.length > 0 && !seenDeliveryIds.has(delivery.deliveryId);
}

export function hashWebhookPayload(payload: string) {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function verifyGitHubSignature(payload: string, secret: string, signature: string | null) {
  if (!signature?.startsWith('sha256=')) return false;
  const provided = Buffer.from(signature.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(payload, 'utf8').digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown, maximum = 4_000) {
  const result = asString(value);
  return result.length > 0 && result.length <= maximum ? result : undefined;
}

function optionalTimestamp(value: unknown) {
  const result = optionalString(value, 64);
  return result && !Number.isNaN(Date.parse(result)) ? result : undefined;
}

export function normalizeGitHubEvent(
  eventName: string,
  action: string | undefined,
  payload: unknown,
): NormalizedGitHubEvent | null {
  const root = asRecord(payload);
  const repository = asRecord(root.repository);
  const installation = asRecord(root.installation);
  const repositoryId = asNumber(repository.id);
  const installationId = asNumber(installation.id);
  const normalizedAction = action ?? '';

  if (
    (eventName === 'installation' || eventName === 'installation_repositories') &&
    !installationId
  )
    return null;
  if (['repository', 'pull_request', 'push', 'issues'].includes(eventName) && !repositoryId)
    return null;

  if (eventName === 'installation' && normalizedAction === 'created') {
    const account = asRecord(installation.account);
    return {
      type: 'InstallationCreated',
      installationId,
      accountLogin: asString(account.login),
      accountType: asString(account.type),
    };
  }
  if (
    eventName === 'installation_repositories' &&
    ['added', 'removed'].includes(normalizedAction)
  ) {
    const repositoryAction =
      normalizedAction === 'added' || normalizedAction === 'removed' ? normalizedAction : null;
    if (!repositoryAction) return null;
    const repositories = Array.isArray(root.repositories) ? root.repositories : [];
    return {
      type: 'InstallationRepositoriesChanged',
      installationId,
      action: repositoryAction,
      repositoryIds: repositories.map((item) => asNumber(asRecord(item).id)).filter(Boolean),
    };
  }
  if (
    eventName === 'repository' &&
    ['created', 'renamed', 'transferred', 'archived', 'unarchived'].includes(normalizedAction)
  ) {
    return {
      type: 'RepositoryConnected',
      ...(installationId ? { installationId } : {}),
      repositoryId,
      fullName: asString(repository.full_name),
      owner: asString(asRecord(repository.owner).login),
      name: asString(repository.name),
      ...(optionalString(repository.default_branch, 255)
        ? { defaultBranch: optionalString(repository.default_branch, 255) }
        : {}),
      ...(optionalString(repository.visibility, 64)
        ? { visibility: optionalString(repository.visibility, 64) }
        : {}),
    };
  }
  if (
    eventName === 'pull_request' &&
    ['opened', 'synchronize', 'edited', 'closed', 'reopened'].includes(normalizedAction)
  ) {
    const pullRequest = asRecord(root.pull_request);
    const pullRequestId = asNumber(pullRequest.id);
    const pullRequestNumber = asNumber(pullRequest.number);
    if (!pullRequestId || !pullRequestNumber) return null;
    const head = asRecord(pullRequest.head);
    const base = asRecord(pullRequest.base);
    const user = asRecord(pullRequest.user);
    const merged = Boolean(asString(pullRequest.merged_at));
    const state = merged ? 'merged' : asString(pullRequest.state);
    return {
      type:
        normalizedAction === 'opened'
          ? 'PullRequestOpened'
          : normalizedAction === 'closed'
            ? asString(pullRequest.merged_at)
              ? 'PullRequestMerged'
              : 'PullRequestClosed'
            : 'PullRequestUpdated',
      repositoryId,
      pullRequestId,
      number: pullRequestNumber,
      action: normalizedAction,
      ...(installationId ? { installationId } : {}),
      ...(optionalString(pullRequest.title) ? { title: optionalString(pullRequest.title) } : {}),
      ...(state === 'open' || state === 'closed' || state === 'merged' ? { state } : {}),
      ...(optionalString(head.sha, 64) ? { headSha: optionalString(head.sha, 64) } : {}),
      ...(optionalString(base.sha, 64) ? { baseSha: optionalString(base.sha, 64) } : {}),
      ...(optionalString(base.ref, 255) ? { baseBranch: optionalString(base.ref, 255) } : {}),
      ...(optionalString(user.login, 255) ? { authorLogin: optionalString(user.login, 255) } : {}),
      ...(optionalString(pullRequest.html_url, 2_000)
        ? { url: optionalString(pullRequest.html_url, 2_000) }
        : {}),
      ...(optionalTimestamp(pullRequest.created_at)
        ? { createdAt: optionalTimestamp(pullRequest.created_at) }
        : {}),
      ...(optionalTimestamp(pullRequest.updated_at)
        ? { updatedAt: optionalTimestamp(pullRequest.updated_at) }
        : {}),
    };
  }
  if (eventName === 'push')
    return {
      type: 'BranchPushed',
      ...(installationId ? { installationId } : {}),
      repositoryId,
      ref: asString(root.ref),
      before: asString(root.before),
      after: asString(root.after),
    };
  if (
    eventName === 'issues' &&
    ['opened', 'edited', 'closed', 'reopened', 'transferred'].includes(normalizedAction)
  ) {
    const issue = asRecord(root.issue);
    const issueId = asNumber(issue.id);
    const issueNumber = asNumber(issue.number);
    if (!issueId || !issueNumber) return null;
    const user = asRecord(issue.user);
    const state = asString(issue.state);
    return {
      type: 'IssueUpdated',
      ...(installationId ? { installationId } : {}),
      repositoryId,
      issueId,
      number: issueNumber,
      action: normalizedAction,
      ...(optionalString(issue.title) ? { title: optionalString(issue.title) } : {}),
      ...(state === 'open' || state === 'closed' ? { state } : {}),
      ...(optionalString(user.login, 255) ? { authorLogin: optionalString(user.login, 255) } : {}),
      ...(optionalString(issue.html_url, 2_000)
        ? { url: optionalString(issue.html_url, 2_000) }
        : {}),
      ...(optionalTimestamp(issue.created_at)
        ? { createdAt: optionalTimestamp(issue.created_at) }
        : {}),
      ...(optionalTimestamp(issue.updated_at)
        ? { updatedAt: optionalTimestamp(issue.updated_at) }
        : {}),
    };
  }
  return null;
}

export type GitHubApiClient = ReturnType<typeof createGitHubApiClient>;

export type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
};

export type GitHubInstallationSnapshot = {
  id: number;
  accountLogin: string;
  accountType: string;
  suspendedAt: string | null;
  permissions: Record<string, string>;
};

export type GitHubRepositorySnapshot = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  visibility: string | null;
  permissions: Record<string, string>;
};

function derLength(length: number) {
  if (length < 128) return Uint8Array.of(length);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function concatBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function pkcs1ToPkcs8(pem: string) {
  if (!pem.includes('BEGIN RSA PRIVATE KEY')) return pem;
  const base64 = pem
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const pkcs1 = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const algorithm = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  );
  const privateKey = concatBytes(Uint8Array.of(0x04), derLength(pkcs1.length), pkcs1);
  const body = concatBytes(version, algorithm, privateKey);
  const wrapped = concatBytes(Uint8Array.of(0x30), derLength(body.length), body);
  let encoded = '';
  for (const byte of wrapped) encoded += String.fromCharCode(byte);
  const base64Pkcs8 = btoa(encoded);
  const lines = base64Pkcs8.match(/.{1,64}/g)?.join('\n') ?? base64Pkcs8;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

export async function createGitHubAppJwt(
  appId: string,
  privateKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const key = await importPKCS8(pkcs1ToPkcs8(privateKey.replace(/\\n/g, '\n').trim()), 'RS256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(appId)
    .setIssuedAt(nowSeconds - 60)
    .setExpirationTime(nowSeconds + 540)
    .sign(key);
}

type GitHubRequestInit = RequestInit & { token?: string };

async function githubRequest<T>(url: string, init: GitHubRequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/vnd.github+json');
  headers.set('user-agent', 'TRACE GitHub App integration');
  headers.set('x-github-api-version', '2022-11-28');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const { token: _token, ...requestInit } = init;
  try {
    const response = await fetch(url, { ...requestInit, headers, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`GitHub API request failed with ${response.status}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeGitHubAppCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await githubRequest<{ access_token?: string; error?: string }>(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
    },
  );
  if (!response.access_token) {
    const providerError =
      typeof response.error === 'string' && /^[a-z0-9_-]{1,80}$/.test(response.error)
        ? response.error
        : 'missing_access_token';
    throw new Error(`GitHub App OAuth provider error: ${providerError}`);
  }
  return response.access_token;
}

export async function verifyUserInstallationAccess(accessToken: string, installationId: number) {
  await githubRequest(
    `https://api.github.com/user/installations/${installationId}/repositories?per_page=1`,
    { token: accessToken },
  );
  return true;
}

function permissionMap(value: unknown) {
  const record = asRecord(value);
  const permissions: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string') permissions[key] = item;
  }
  return permissions;
}

export function normalizeGitHubRepository(value: unknown): GitHubRepositorySnapshot | null {
  const repository = asRecord(value);
  const id = asNumber(repository.id);
  const owner = asString(asRecord(repository.owner).login);
  const name = asString(repository.name);
  const fullName = asString(repository.full_name) || (owner && name ? `${owner}/${name}` : '');
  if (!id || !owner || !name || !fullName) return null;
  return {
    id,
    owner,
    name,
    fullName,
    defaultBranch: asString(repository.default_branch) || null,
    visibility: asString(repository.visibility) || null,
    permissions: permissionMap(repository.permissions),
  };
}

function isCommitSha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) && !/^0{40}$/i.test(value);
}

export function normalizeGitHubRepositoryHead(value: unknown) {
  const root = asRecord(value);
  const object = asRecord(root.object);
  return isCommitSha(object.sha) ? object.sha : null;
}

async function createInstallationToken(config: GitHubAppConfig, installationId: number) {
  const appJwt = await createGitHubAppJwt(config.appId, config.privateKey);
  const tokenResponse = await githubRequest<{ token?: string }>(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    { method: 'POST', token: appJwt, body: JSON.stringify({}) },
  );
  if (!tokenResponse.token) throw new Error('GitHub App installation token missing');
  return tokenResponse.token;
}

/**
 * Reads only the trusted default-branch commit pointer from GitHub.
 * No repository contents are requested or retained.
 */
export async function getGitHubRepositoryHead(
  config: GitHubAppConfig,
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
) {
  if (
    branch.length < 1 ||
    branch.length > 255 ||
    [...branch].some((character) => character.charCodeAt(0) <= 0x1f || character === '\u007f')
  )
    throw new Error('GitHub default branch is invalid');
  const token = await createInstallationToken(config, installationId);
  const ref = await githubRequest<{ object?: { sha?: unknown } }>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
    { token },
  );
  const head = normalizeGitHubRepositoryHead(ref);
  if (!head) throw new Error('GitHub repository head response invalid');
  return head;
}

export async function getGitHubInstallationSnapshot(
  config: GitHubAppConfig,
  installationId: number,
) {
  const appJwt = await createGitHubAppJwt(config.appId, config.privateKey);
  const installation = await githubRequest<{
    id?: number;
    account?: { login?: string; type?: string };
    suspended_at?: string | null;
    permissions?: Record<string, string>;
  }>(`https://api.github.com/app/installations/${installationId}`, { token: appJwt });
  if (
    installation.id !== installationId ||
    typeof installation.account?.login !== 'string' ||
    typeof installation.account.type !== 'string'
  ) {
    throw new Error('GitHub App installation response invalid');
  }
  const token = await createInstallationToken(config, installationId);

  const repositories: GitHubRepositorySnapshot[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const pageResponse = await githubRequest<{ repositories?: unknown[] }>(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      { token },
    );
    const pageRepositories = (pageResponse.repositories ?? [])
      .map(normalizeGitHubRepository)
      .filter((repository): repository is GitHubRepositorySnapshot => repository !== null);
    repositories.push(...pageRepositories);
    if (pageRepositories.length < 100) break;
  }

  return {
    installation: {
      id: installationId,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      suspendedAt: installation.suspended_at ?? null,
      permissions: permissionMap(installation.permissions),
    } satisfies GitHubInstallationSnapshot,
    repositories,
  };
}

export function createGitHubApiClient(token: string, timeoutMs = 10_000) {
  const octokit = new Octokit({ auth: token, request: { timeout: timeoutMs } });
  return {
    async getInstallationRepositories(installationId: number): Promise<unknown[]> {
      return octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
        installation_id: installationId,
        per_page: 100,
      });
    },
    async getRepository(owner: string, repo: string): Promise<unknown> {
      return octokit.rest.repos.get({ owner, repo });
    },
    async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<unknown> {
      return octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    },
    async listPullRequestFiles(
      owner: string,
      repo: string,
      pullNumber: number,
    ): Promise<unknown[]> {
      return octokit.paginate(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });
    },
  };
}

export function mapGitHubApiError(error: unknown) {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : undefined;
  if (status === 401 || status === 403)
    return { code: 'permission_denied' as const, retryable: false };
  if (status === 404) return { code: 'not_found' as const, retryable: false };
  if (status === 429 || status === 502 || status === 503)
    return { code: 'upstream_unavailable' as const, retryable: true };
  return { code: 'upstream_error' as const, retryable: true };
}
