import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exchangeGitHubAppCode,
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
});
