import { createHmac, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exchangeGitHubAppCode,
  getGitHubAuthenticatedUser,
  getGitHubInstallationSnapshot,
  listGitHubUserInstallations,
  normalizeGitHubEvent,
  normalizeGitHubRepositoryHead,
  normalizeGitHubRepository,
  verifyGitHubSignature,
  verifyUserInstallationAccess,
} from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub webhook security and normalization', () => {
  it('validates the GitHub HMAC-SHA256 test vector', () => {
    const secret = "It's a Secret to Everybody";
    const payload = 'Hello, World!';
    const digest = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyGitHubSignature(payload, secret, `sha256=${digest}`)).toBe(true);
    expect(verifyGitHubSignature(payload, secret, 'sha256=invalid')).toBe(false);
  });

  it('normalizes supported pull request actions without retaining raw payloads', () => {
    expect(
      normalizeGitHubEvent('pull_request', 'closed', {
        repository: { id: 42 },
        pull_request: { id: 9, number: 3, merged_at: null },
      }),
    ).toEqual({
      type: 'PullRequestClosed',
      repositoryId: 42,
      pullRequestId: 9,
      number: 3,
      action: 'closed',
    });
    expect(normalizeGitHubEvent('unsupported', 'created', {})).toBeNull();
  });

  it('projects bounded pull request and issue metadata for asynchronous ingestion', () => {
    const pullRequest = normalizeGitHubEvent('pull_request', 'synchronize', {
      installation: { id: 7001 },
      repository: { id: 8001 },
      pull_request: {
        id: 9001,
        number: 17,
        title: 'Bounded metadata',
        state: 'open',
        head: { sha: 'a'.repeat(40) },
        base: { sha: 'b'.repeat(40), ref: 'main' },
        user: { login: 'author' },
        html_url: 'https://github.com/example/trace/pull/17',
        created_at: '2026-09-17T10:00:00.000Z',
        updated_at: '2026-09-17T10:01:00.000Z',
        body: 'source content must not be retained',
      },
    });
    expect(pullRequest).toMatchObject({
      type: 'PullRequestUpdated',
      installationId: 7001,
      repositoryId: 8001,
      pullRequestId: 9001,
      number: 17,
      title: 'Bounded metadata',
      headSha: 'a'.repeat(40),
      baseBranch: 'main',
      authorLogin: 'author',
    });
    expect(pullRequest).not.toHaveProperty('body');
  });

  it('normalizes repository metadata without retaining source content', () => {
    expect(
      normalizeGitHubRepository({
        id: 42,
        name: 'trace',
        full_name: 'mathofdynamic/trace',
        owner: { login: 'mathofdynamic' },
        default_branch: 'main',
        visibility: 'private',
        permissions: { metadata: 'read', contents: 'read' },
        private: true,
        source: 'must not be copied',
      }),
    ).toEqual({
      id: 42,
      owner: 'mathofdynamic',
      name: 'trace',
      fullName: 'mathofdynamic/trace',
      defaultBranch: 'main',
      visibility: 'private',
      permissions: { metadata: 'read', contents: 'read' },
    });
  });

  it('rejects provider identifiers that would lose JavaScript integer precision', () => {
    expect(
      normalizeGitHubRepository({
        id: Number.MAX_SAFE_INTEGER + 1,
        name: 'trace',
        full_name: 'mathofdynamic/trace',
        owner: { login: 'mathofdynamic' },
      }),
    ).toBeNull();
    expect(
      normalizeGitHubEvent('push', undefined, {
        repository: { id: Number.MAX_SAFE_INTEGER + 1 },
        ref: 'refs/heads/main',
        before: 'a'.repeat(40),
        after: 'b'.repeat(40),
      }),
    ).toBeNull();
  });

  it('accepts only a real GitHub commit pointer for freshness', () => {
    expect(normalizeGitHubRepositoryHead({ object: { sha: 'a'.repeat(40) } })).toBe('a'.repeat(40));
    expect(normalizeGitHubRepositoryHead({ object: { sha: '0'.repeat(40) } })).toBeNull();
    expect(normalizeGitHubRepositoryHead({ object: { sha: 'not-a-sha' } })).toBeNull();
  });

  it('exchanges an App authorization code server-side', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'app-user-token' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      exchangeGitHubAppCode({
        clientId: 'app-client',
        clientSecret: 'app-secret',
        code: 'one-time-code',
        redirectUri: 'https://trace-code.pages.dev/api/github/setup',
      }),
    ).resolves.toBe('app-user-token');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          client_id: 'app-client',
          client_secret: 'app-secret',
          code: 'one-time-code',
          redirect_uri: 'https://trace-code.pages.dev/api/github/setup',
        }),
      }),
    );
  });

  it('checks that the signed-in user can access the installation', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ repositories: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyUserInstallationAccess('user-token', 12345)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/installations/12345/repositories?per_page=1',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it('lists only installations belonging to the current App', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        installations: [
          {
            id: 123,
            app_id: 456,
            account: { login: 'trace-org', type: 'Organization' },
            suspended_at: null,
          },
          {
            id: 789,
            app_id: 999,
            account: { login: 'other-app', type: 'User' },
            suspended_at: null,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listGitHubUserInstallations('user-token', 456)).resolves.toEqual([
      {
        id: 123,
        appId: 456,
        accountLogin: 'trace-org',
        accountType: 'Organization',
        suspendedAt: null,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/installations?per_page=100&page=1',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it('continues pagination when the first page is full of other Apps', async () => {
    const otherAppPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      app_id: 999,
      account: { login: `other-${index}`, type: 'User' },
      suspended_at: null,
    }));
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('page=1')
        ? Response.json({ installations: otherAppPage })
        : Response.json({
            installations: [
              {
                id: 9001,
                app_id: 456,
                account: { login: 'trace-org', type: 'Organization' },
                suspended_at: null,
              },
            ],
          }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listGitHubUserInstallations('user-token', 456)).resolves.toEqual([
      {
        id: 9001,
        appId: 456,
        accountLogin: 'trace-org',
        accountType: 'Organization',
        suspendedAt: null,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('validates the OAuth viewer before installation reconciliation', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: 123, login: 'trace-owner' }, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getGitHubAuthenticatedUser('user-token')).resolves.toEqual({
      id: 123,
      login: 'trace-owner',
    });
  });
});

describe('complete installation repository snapshots', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = {
    appId: '123',
    clientId: 'synthetic',
    clientSecret: 'synthetic',
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
  const repositories = Array.from({ length: 102 }, (_, index) => ({
    id: 100000 + index,
    owner: { login: 'synthetic' },
    name: `repo-${index}`,
    full_name: `synthetic/repo-${index}`,
    private: true,
    archived: index === 90,
    fork: index === 91,
  }));
  function mockPages(pages: { total_count: number; repositories: unknown[] }[]) {
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(init).toMatchObject({ cache: 'no-store' });
      if (url.pathname.endsWith('/access_tokens'))
        return Response.json({ token: 'synthetic-token' });
      if (url.pathname === '/app/installations/7001')
        return Response.json({
          id: 7001,
          account: { login: 'synthetic', type: 'User' },
          suspended_at: null,
          repository_selection: 'all',
        });
      expect(url.pathname).toBe('/installation/repositories');
      expect(url.searchParams.get('per_page')).toBe('100');
      return Response.json(pages[Number(url.searchParams.get('page')) - 1]);
    });
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  }
  it('retains all 92 private, archived and fork repositories', async () => {
    mockPages([{ total_count: 92, repositories: repositories.slice(0, 92) }]);
    expect(
      (await getGitHubInstallationSnapshot(config, 7001)).repositories.map((repo) => repo.id),
    ).toEqual(repositories.slice(0, 92).map((repo) => repo.id));
  });
  it('enumerates a catalog larger than a full page without off-by-one loss', async () => {
    const fetcher = mockPages([
      { total_count: 102, repositories: repositories.slice(0, 100) },
      { total_count: 102, repositories: repositories.slice(100) },
    ]);
    expect((await getGitHubInstallationSnapshot(config, 7001)).repositories).toHaveLength(102);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each([
    [{ total_count: 92, repositories: repositories.slice(0, 91) }],
    [{ total_count: 92, repositories: [...repositories.slice(0, 91), { id: 100091 }] }],
    [{ total_count: 92, repositories: [...repositories.slice(0, 91), repositories[0]] }],
    [
      { total_count: 102, repositories: repositories.slice(0, 100) },
      { total_count: 101, repositories: repositories.slice(100) },
    ],
    [{ total_count: 501, repositories: repositories.slice(0, 100) }],
  ])(
    'rejects incomplete, invalid, duplicated, unstable or oversized catalogs before persistence (%#)',
    async (...pages) => {
      mockPages(pages);
      await expect(getGitHubInstallationSnapshot(config, 7001)).rejects.toThrow(/repository/);
    },
  );
});
