import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertProductionFixtureVerificationRequest,
  formatProductionFixtureInstallationEvidence,
  formatProductionGitHubFixtureInstallation,
  readProductionGitHubFixtureInstallation,
} from '../../../scripts/verify-production-github-fixture-installation.js';

const app = {
  id: 5082884,
  name: 'TRACE Production Integration',
  client_id: 'production-client-id',
  installations_count: 1,
};
const installation = {
  id: 166179374,
  account: { login: 'mathofdynamic' },
  suspended_at: null,
  repository_selection: 'selected',
};
const repository = {
  id: 1378441300,
  owner: { login: 'mathofdynamic' },
  name: 'trace-staging-fixture',
  full_name: 'mathofdynamic/trace-staging-fixture',
};
const tokenValues = {
  privateKey: 'synthetic-private-key-value',
  installationToken: 'synthetic-installation-token-value',
  hookSecret: 'synthetic-webhook-secret-value',
};
let privateKeyPem: string;

beforeAll(() => {
  ({ privateKey: privateKeyPem } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }));
});

function validResponses(
  overrides: {
    app?: unknown;
    installations?: unknown;
    repositories?: unknown;
    hook?: unknown;
    hookStatus?: number;
    token?: string;
  } = {},
) {
  return [
    { body: overrides.app ?? app },
    { body: overrides.installations ?? [installation] },
    { body: { token: overrides.token ?? tokenValues.installationToken }, status: 201 },
    { body: overrides.repositories ?? { total_count: 1, repositories: [repository] } },
    ...(overrides.hookStatus === 404
      ? [{ status: 404 }]
      : [
          {
            body: overrides.hook ?? {
              url: '',
              content_type: 'json',
              insecure_ssl: '0',
              secret: '********',
            },
          },
        ]),
  ];
}

function makeFetch(responses: Array<{ body?: unknown; status?: number; link?: string }>) {
  const requests: Array<{
    url: string;
    method?: string;
    authorization?: string;
    redirect?: string;
  }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    const next = responses.shift();
    if (!next) throw new Error('Unexpected test request.');
    requests.push({
      url,
      method: init?.method,
      authorization: headers.get('authorization') ?? undefined,
      redirect: init?.redirect,
    });
    const responseHeaders = next.link ? { link: next.link } : undefined;
    if (next.status === 404) return new Response(null, { status: 404, headers: responseHeaders });
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: responseHeaders,
    });
  };
  return { fetchImplementation, requests };
}

function read(fetchImplementation: typeof fetch) {
  return readProductionGitHubFixtureInstallation(
    '5082884',
    'production-client-id',
    privateKeyPem,
    fetchImplementation,
  );
}

describe('production GitHub fixture installation verifier', () => {
  it('owner policy accepts a trusted catalog without the fixture and does not require count one', async () => {
    const fake = makeFetch(
      validResponses({
        installations: [{ ...installation, repository_selection: 'all' }],
        repositories: {
          total_count: 2,
          repositories: [
            {
              id: 9,
              owner: { login: 'mathofdynamic' },
              name: 'TRACE',
              full_name: 'mathofdynamic/TRACE',
            },
            {
              id: 10,
              owner: { login: 'mathofdynamic' },
              name: 'other',
              full_name: 'mathofdynamic/other',
            },
          ],
        },
      }),
    );
    const state = await readProductionGitHubFixtureInstallation(
      '5082884',
      'production-client-id',
      privateKeyPem,
      fake.fetchImplementation,
      true,
      undefined,
      'owner',
    );
    expect(state.catalog).toEqual([
      { id: 9, fullName: 'mathofdynamic/TRACE' },
      { id: 10, fullName: 'mathofdynamic/other' },
    ]);
  });

  it('accepts all repositories with the fixture among many without disclosing other identities', async () => {
    const fake = makeFetch(
      validResponses({
        installations: [{ ...installation, repository_selection: 'all' }],
        repositories: {
          total_count: 2,
          repositories: [
            {
              ...repository,
              id: 9,
              name: 'private-other',
              full_name: 'mathofdynamic/private-other',
            },
            repository,
          ],
        },
      }),
    );
    const state = await read(fake.fetchImplementation);
    expect(state.repositorySelection).toBe('all');
    expect(state.repositoryCount).toBe(2);
    expect(formatProductionGitHubFixtureInstallation(state)).not.toContain('private-other');
  });
  it('rejects all repositories when the fixture is absent', async () => {
    const fake = makeFetch(
      validResponses({
        installations: [{ ...installation, repository_selection: 'all' }],
        repositories: { total_count: 1, repositories: [{ ...repository, id: 9 }] },
      }),
    );
    await expect(read(fake.fetchImplementation)).rejects.toThrow(/authorized fixture/);
  });

  it('accepts exactly one active selected-only fixture installation and an absent webhook config', async () => {
    const fake = makeFetch(validResponses({ hookStatus: 404 }));
    const state = await read(fake.fetchImplementation);

    expect(state).toEqual({
      appId: '5082884',
      appName: 'TRACE Production Integration',
      installationId: 166179374,
      installationAccount: 'mathofdynamic',
      installationSuspended: false,
      repositorySelection: 'selected',
      repositoryCount: 1,
      repositoryId: 1378441300,
      repositoryOwner: 'mathofdynamic',
      repositoryName: 'trace-staging-fixture',
      repositoryFullName: 'mathofdynamic/trace-staging-fixture',
      webhookConfigState: 'ABSENT_NOT_FOUND',
      webhookUrlConfigured: false,
    });
    expect(fake.requests.map(({ method, url }) => [method, new URL(url).pathname])).toEqual([
      ['GET', '/app'],
      ['GET', '/app/installations'],
      ['POST', '/app/installations/166179374/access_tokens'],
      ['GET', '/installation/repositories'],
      ['GET', '/app/hook/config'],
    ]);
    expect(fake.requests[0]?.authorization).toMatch(/^Bearer /);
    expect(fake.requests[3]?.authorization).toBe(`Bearer ${tokenValues.installationToken}`);
    expect(fake.requests.every((request) => request.redirect === 'error')).toBe(true);
    expect(formatProductionGitHubFixtureInstallation(state)).toContain(
      'EXTERNAL_REPOSITORY=mathofdynamic/trace-staging-fixture',
    );
  });

  it('accepts an empty webhook URL without exposing a redacted secret field', async () => {
    const fake = makeFetch(validResponses({ hook: { url: '', secret: '********' } }));
    const state = await read(fake.fetchImplementation);
    const report = formatProductionGitHubFixtureInstallation(state);

    expect(state.webhookConfigState).toBe('PRESENT_EMPTY');
    expect(report).toContain('WEBHOOK_URL_CONFIGURED=NO');
    expect(report).not.toContain('********');
    expect(report).not.toContain('secret');
  });

  it('rejects a nonzero or mismatched App installation count', async () => {
    const mismatch = makeFetch(validResponses({ app: { ...app, installations_count: 2 } }));
    await expect(read(mismatch.fetchImplementation)).rejects.toThrow(
      'App installations_count does not match the paginated installation list.',
    );
    const nonzero = makeFetch(
      validResponses({
        app: { ...app, installations_count: 2 },
        installations: [installation, { ...installation, id: 123456790 }],
      }),
    );
    await expect(read(nonzero.fetchImplementation)).rejects.toThrow(
      'Expected exactly one production App installation.',
    );
  });

  it.each([
    ['zero installations', 0, []],
    ['multiple installations', 2, [installation, { ...installation, id: 123456790 }]],
  ])('rejects %s', async (_label, count, installations) => {
    const fake = makeFetch(
      validResponses({ app: { ...app, installations_count: count }, installations }),
    );
    await expect(read(fake.fetchImplementation)).rejects.toThrow(
      'Expected exactly one production App installation.',
    );
    expect(fake.requests).toHaveLength(2);
  });

  it.each([
    ['wrong account', { ...installation, account: { login: 'another-user' } }],
    ['suspended', { ...installation, suspended_at: '2026-09-29T00:00:00Z' }],
    ['missing suspension state', { ...installation, suspended_at: undefined }],
    ['unknown selection', { ...installation, repository_selection: 'unknown' }],
    ['wrong installation', { ...installation, id: 7 }],
  ])('rejects installation with %s', async (_label, value) => {
    const fake = makeFetch(validResponses({ installations: [value] }));
    await expect(read(fake.fetchImplementation)).rejects.toThrow();
    expect(fake.requests).toHaveLength(2);
  });

  it.each([
    ['wrong ID', { ...repository, id: 7 }],
    ['wrong owner', { ...repository, owner: { login: 'other-owner' } }],
    ['wrong name', { ...repository, name: 'other-repository' }],
    ['wrong full name', { ...repository, full_name: 'mathofdynamic/other-repository' }],
  ])('rejects repository with %s', async (_label, value) => {
    const fake = makeFetch(
      validResponses({ repositories: { total_count: 1, repositories: [value] } }),
    );
    await expect(read(fake.fetchImplementation)).rejects.toThrow();
  });

  it('rejects two accessible repositories and count/list disagreement', async () => {
    const twoRepositories = makeFetch(
      validResponses({ repositories: { total_count: 2, repositories: [repository, repository] } }),
    );
    await expect(read(twoRepositories.fetchImplementation)).rejects.toThrow(
      'The App installation must have access to exactly one repository.',
    );

    const disagreement = makeFetch(
      validResponses({ repositories: { total_count: 2, repositories: [repository] } }),
    );
    await expect(read(disagreement.fetchImplementation)).rejects.toThrow(
      'GitHub installation repository count does not match the paginated list.',
    );
  });

  it('rejects a configured webhook URL after successful installation verification', async () => {
    const fake = makeFetch(
      validResponses({ hook: { url: 'https://example.invalid/hook', secret: 'never-print' } }),
    );
    await expect(read(fake.fetchImplementation)).rejects.toThrow(
      'The GitHub App webhook URL is configured.',
    );
  });

  it('keeps pagination within the installation and repository listing endpoints', async () => {
    const fake = makeFetch([
      { body: app },
      {
        body: [installation],
        link: '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"',
      },
      { body: [{ ...installation, id: 123456790 }] },
    ]);
    await expect(read(fake.fetchImplementation)).rejects.toThrow(
      'App installations_count does not match the paginated installation list.',
    );
    expect(fake.requests.map((request) => request.url)).toEqual([
      'https://api.github.com/app',
      'https://api.github.com/app/installations?per_page=100',
      'https://api.github.com/app/installations?per_page=100&page=2',
    ]);
  });

  it('rejects endpoints outside the GET plus installation-token-mint allowlist', () => {
    expect(() =>
      assertProductionFixtureVerificationRequest('POST', 'https://api.github.com/repos/a/b/issues'),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProductionFixtureVerificationRequest(
        'DELETE',
        'https://api.github.com/app/installations/1',
      ),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProductionFixtureVerificationRequest(
        'POST',
        'https://api.github.com/app/installations/1/access_tokens',
      ),
    ).not.toThrow();
  });

  it('never prints the App JWT, installation token, PEM, webhook secret, or headers', async () => {
    const fake = makeFetch(validResponses({ hook: { url: '', secret: tokenValues.hookSecret } }));
    const state = await read(fake.fetchImplementation);
    const report = formatProductionGitHubFixtureInstallation(state);
    const appJwt = fake.requests[0]?.authorization?.replace(/^Bearer /, '') ?? '';

    for (const secret of [
      privateKeyPem,
      tokenValues.installationToken,
      tokenValues.hookSecret,
      appJwt,
    ]) {
      expect(secret.length).toBeGreaterThan(0);
      expect(report.includes(secret)).toBe(false);
    }
    expect(report).not.toContain('Bearer ');

    const failed = makeFetch([{ status: 403, body: { message: privateKeyPem } }]);
    let errorText = '';
    try {
      await read(failed.fetchImplementation);
    } catch (error) {
      errorText = error instanceof Error ? error.message : '';
    }
    expect(errorText).toBe('GET /app failed (HTTP 403).');
    expect(errorText).not.toContain(privateKeyPem);
  });

  it('rejects a configured App identity that does not match production', async () => {
    const fake = makeFetch(validResponses({ app: { ...app, id: 1 } }));
    await expect(read(fake.fetchImplementation)).rejects.toThrow(/App ID/i);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('safe evidence before installation rejection', () => {
  it('distinguishes All repositories from unavailable metadata without exposing unrelated identities', () => {
    const evidence = formatProductionFixtureInstallationEvidence(2, [
      { ...installation, repository_selection: 'all' },
      {
        ...installation,
        id: 987,
        account: { login: 'unrelated-private-username' },
        repository_selection: 'sensitive-invalid-value',
        suspended_at: 'private-date-value',
      },
    ]);
    expect(evidence).toContain('INSTALLATIONS_COUNT=2');
    expect(evidence).toContain('INSTALLATION_LIST_COUNT=2');
    expect(evidence).toContain('INSTALLATION_1_ACCOUNT_MATCH=YES');
    expect(evidence).toContain('INSTALLATION_1_REPOSITORY_SELECTION=all');
    expect(evidence).toContain('INSTALLATION_1_SUSPENDED=NO');
    expect(evidence).toContain('INSTALLATION_2_ACCOUNT_MATCH=NO');
    expect(evidence).toContain('INSTALLATION_2_REPOSITORY_SELECTION=UNAVAILABLE');
    expect(evidence).toContain('INSTALLATION_2_SUSPENDED=YES');
    for (const value of [
      'unrelated-private-username',
      'sensitive-invalid-value',
      'private-date-value',
    ])
      expect(evidence).not.toContain(value);
  });
  it('emits safe proof before accepting authorized all-repositories access', async () => {
    const fake = makeFetch(
      validResponses({ installations: [{ ...installation, repository_selection: 'all' }] }),
    );
    const evidence: string[] = [];
    await readProductionGitHubFixtureInstallation(
      '5082884',
      'production-client-id',
      privateKeyPem,
      fake.fetchImplementation,
      false,
      (line) => evidence.push(line),
    );
    expect(evidence.join('\n')).toContain('INSTALLATION_1_REPOSITORY_SELECTION=all');
    expect(fake.requests).toHaveLength(5);
    expect(evidence.join('\n')).not.toContain(privateKeyPem);
    expect(evidence.join('\n')).not.toContain(tokenValues.installationToken);
  });
});
