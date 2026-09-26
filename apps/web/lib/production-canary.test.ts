import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_FIXTURE_REPOSITORY,
  canaryInstallationSnapshotEligibility,
  canaryRepositorySelectionEligibility,
  canaryUserEligibility,
  canaryWebhookRecoveryEligibility,
  canaryWebhookPayloadEligibility,
  productionCanaryClosedResponse,
  productionCanaryGateResponse,
  resolveProductionCanaryMode,
  type ProductionCanaryRuntime,
} from './production-canary';

const production = (overrides: Partial<ProductionCanaryRuntime> = {}): ProductionCanaryRuntime => ({
  TRACE_DEPLOYMENT_ENV: 'production',
  TRACE_CANARY_MODE: 'fixture',
  TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
  TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
  TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
  ...overrides,
});

const fixtureRepository = () => ({
  id: 1378441300,
  owner: { login: 'mathofdynamic' },
  name: 'trace-staging-fixture',
  full_name: 'mathofdynamic/trace-staging-fixture',
});

const snapshot = () => ({
  installation: {
    id: 42,
    accountLogin: 'mathofdynamic',
    accountType: 'User',
    suspendedAt: null,
    permissions: { metadata: 'read' },
  },
  repositories: [
    {
      id: 1378441300,
      owner: 'mathofdynamic',
      name: 'trace-staging-fixture',
      fullName: 'mathofdynamic/trace-staging-fixture',
      defaultBranch: 'main',
      visibility: 'private',
      permissions: { metadata: 'read' },
    },
  ],
});

const repositoryRecord = (overrides: Record<string, unknown> = {}) => ({
  githubRepositoryId: '1378441300',
  owner: 'mathofdynamic',
  name: 'trace-staging-fixture',
  fullName: 'mathofdynamic/trace-staging-fixture',
  installationAccountLogin: 'mathofdynamic',
  ...overrides,
});

const recoveryScope = (overrides: Record<string, unknown> = {}) => ({
  deliveryOrganizationId: 'workspace-1',
  deliveryRepositoryId: 'repository-record-1',
  deliveryInstallationId: 'installation-provider-1',
  repository: {
    recordId: 'repository-record-1',
    organizationId: 'workspace-1',
    installationId: 'installation-record-1',
    ...repositoryRecord(),
  },
  installation: {
    recordId: 'installation-record-1',
    organizationId: 'workspace-1',
    providerId: 'installation-provider-1',
    accountLogin: 'mathofdynamic',
  },
  ...overrides,
});

describe('production canary mode boundary', () => {
  it('keeps production closed when explicitly closed', () => {
    expect(resolveProductionCanaryMode(production({ TRACE_CANARY_MODE: 'closed' })).kind).toBe(
      'closed',
    );
  });

  it('accepts fixture mode only with the complete authorized allowlist', () => {
    const result = resolveProductionCanaryMode(production());

    expect(result.kind).toBe('fixture');
    if (result.kind === 'fixture') {
      expect(result.fixture).toEqual(AUTHORIZED_FIXTURE_REPOSITORY);
    }
  });

  it.each([
    ['missing mode', { TRACE_CANARY_MODE: undefined }],
    ['unknown mode', { TRACE_CANARY_MODE: 'opne' }],
    ['missing owner', { TRACE_CANARY_GITHUB_OWNER: undefined }],
    ['missing repository', { TRACE_CANARY_GITHUB_REPOSITORY: undefined }],
    ['invalid repository ID', { TRACE_CANARY_GITHUB_REPOSITORY_ID: '9007199254740992' }],
    ['wrong fixture owner', { TRACE_CANARY_GITHUB_OWNER: 'other-owner' }],
    ['wrong fixture repository', { TRACE_CANARY_GITHUB_REPOSITORY: 'other-repo' }],
    ['wrong fixture repository ID', { TRACE_CANARY_GITHUB_REPOSITORY_ID: '7' }],
  ])('fails closed for %s', (_label, overrides) => {
    expect(resolveProductionCanaryMode(production(overrides)).kind).toBe('closed');
  });

  it('preserves non-production behavior regardless of canary mode', () => {
    expect(
      resolveProductionCanaryMode({ TRACE_DEPLOYMENT_ENV: 'staging', TRACE_CANARY_MODE: 'unknown' })
        .kind,
    ).toBe('non-production');
  });

  it('returns cache-disabled closed and fixture-denial responses', async () => {
    const closed = productionCanaryClosedResponse();
    const denied = productionCanaryGateResponse({ allowed: false, reason: 'fixture-user' });

    expect(closed.status).toBe(503);
    expect(closed.headers.get('cache-control')).toBe('no-store');
    expect(denied.status).toBe(403);
    expect(denied.headers.get('cache-control')).toBe('no-store');
    const body = await denied.json();
    expect(body).toEqual({
      error: 'This activity is not allowed during the production fixture canary.',
    });
    expect(JSON.stringify(body)).not.toContain('trace-staging');
  });
});

describe('production fixture user gate', () => {
  it('allows the configured GitHub login case-insensitively', () => {
    expect(canaryUserEligibility(production(), { githubLogin: 'MathOfDynamic' }).allowed).toBe(
      true,
    );
  });

  it.each([
    undefined,
    null,
    {},
    { githubLogin: 'someone-else' },
    { githubLogin: ' mathofdynamic' },
  ])('denies missing or non-allowlisted users: %j', (user) => {
    expect(canaryUserEligibility(production(), user).allowed).toBe(false);
  });
});

describe('production fixture repository mutation gate', () => {
  it('allows only the single repository and installation account in the fixture', () => {
    expect(canaryRepositorySelectionEligibility(production(), [repositoryRecord()]).allowed).toBe(
      true,
    );
  });

  it.each([
    ['missing repository rows', []],
    ['multiple repository rows', [repositoryRecord(), repositoryRecord()]],
    ['wrong repository ID', [repositoryRecord({ githubRepositoryId: '7' })]],
    ['wrong owner', [repositoryRecord({ owner: 'other' })]],
    ['wrong repository name', [repositoryRecord({ name: 'other' })]],
    ['wrong full name', [repositoryRecord({ fullName: 'mathofdynamic/other' })]],
    ['wrong installation account', [repositoryRecord({ installationAccountLogin: 'other' })]],
  ])('denies %s', (_label, repositories) => {
    expect(canaryRepositorySelectionEligibility(production(), repositories).allowed).toBe(false);
  });
});

describe('production fixture recovery replay gate', () => {
  it('allows a recovery record linked to the exact fixture repository and installation', () => {
    expect(canaryWebhookRecoveryEligibility(production(), recoveryScope()).allowed).toBe(true);
  });

  it.each([
    ['missing repository association', { deliveryRepositoryId: null }],
    [
      'cross-workspace repository',
      { repository: { ...recoveryScope().repository, organizationId: 'workspace-2' } },
    ],
    [
      'different repository installation',
      { repository: { ...recoveryScope().repository, installationId: 'installation-record-2' } },
    ],
    ['different delivery installation', { deliveryInstallationId: 'installation-provider-2' }],
    [
      'non-fixture repository identity',
      {
        repository: {
          ...recoveryScope().repository,
          githubRepositoryId: '7',
          owner: 'other',
          name: 'private-repo',
          fullName: 'other/private-repo',
        },
      },
    ],
    [
      'non-fixture installation account',
      { installation: { ...recoveryScope().installation, accountLogin: 'other' } },
    ],
  ])('denies %s', (_label, overrides) => {
    expect(canaryWebhookRecoveryEligibility(production(), recoveryScope(overrides)).allowed).toBe(
      false,
    );
  });
});

describe('production fixture installation snapshot gate', () => {
  it('allows exactly the authorized account and repository', () => {
    expect(canaryInstallationSnapshotEligibility(production(), snapshot()).allowed).toBe(true);
  });

  it.each([
    [
      'wrong account',
      { ...snapshot(), installation: { ...snapshot().installation, accountLogin: 'other' } },
    ],
    [
      'missing installation ID',
      { ...snapshot(), installation: { ...snapshot().installation, id: undefined } },
    ],
    [
      'invalid installation account type',
      { ...snapshot(), installation: { ...snapshot().installation, accountType: 'Enterprise' } },
    ],
    [
      'wrong repository ID',
      {
        ...snapshot(),
        repositories: [{ ...snapshot().repositories[0], id: 7 }],
      },
    ],
    [
      'wrong full name',
      {
        ...snapshot(),
        repositories: [{ ...snapshot().repositories[0], fullName: 'mathofdynamic/other' }],
      },
    ],
    [
      'additional repository',
      {
        ...snapshot(),
        repositories: [
          ...snapshot().repositories,
          { ...snapshot().repositories[0], id: 8, name: 'another' },
        ],
      },
    ],
    ['empty repository list', { ...snapshot(), repositories: [] }],
    ['missing repository owner', { ...snapshot(), repositories: [{ id: 1378441300 }] }],
  ])('denies a snapshot with %s', (_label, candidate) => {
    expect(canaryInstallationSnapshotEligibility(production(), candidate).allowed).toBe(false);
  });
});

describe('production fixture raw webhook gate', () => {
  const repositoryPayload = {
    repository: fixtureRepository(),
    installation: { id: 42, account: { login: 'mathofdynamic' } },
  };

  it.each([
    ['issues', { ...repositoryPayload, action: 'opened', issue: { id: 1, number: 1 } }],
    [
      'pull_request',
      {
        ...repositoryPayload,
        action: 'opened',
        pull_request: {
          id: 2,
          number: 2,
          head: { repo: fixtureRepository() },
          base: { repo: fixtureRepository() },
        },
      },
    ],
    ['push', { ...repositoryPayload, ref: 'refs/heads/main' }],
    ['repository', { ...repositoryPayload, action: 'created' }],
    [
      'installation',
      {
        action: 'created',
        installation: { id: 42, account: { login: 'mathofdynamic' } },
        repositories: [fixtureRepository()],
      },
    ],
    [
      'installation_repositories',
      {
        action: 'added',
        installation: { id: 42, account: { login: 'mathofdynamic' } },
        repository_selection: 'selected',
        repositories_added: [fixtureRepository()],
        repositories_removed: [],
      },
    ],
  ])('allows a fixture %s payload', (eventName, payload) => {
    expect(canaryWebhookPayloadEligibility(production(), eventName, payload).allowed).toBe(true);
  });

  it.each([
    [
      'wrong repository ID',
      'issues',
      { ...repositoryPayload, repository: { ...fixtureRepository(), id: 7 } },
    ],
    [
      'wrong owner',
      'push',
      { ...repositoryPayload, repository: { ...fixtureRepository(), owner: { login: 'other' } } },
    ],
    [
      'missing pull request repository identities',
      'pull_request',
      { ...repositoryPayload, pull_request: { head: {}, base: {} } },
    ],
    [
      'mixed repository array',
      'installation_repositories',
      {
        installation: { id: 42, account: { login: 'mathofdynamic' } },
        repository_selection: 'selected',
        repositories_added: [fixtureRepository(), { ...fixtureRepository(), id: 7 }],
        repositories_removed: [],
      },
    ],
    [
      'another installation account',
      'installation',
      {
        installation: { id: 42, account: { login: 'someone-else' } },
      },
    ],
    [
      'missing installation ID',
      'installation',
      {
        installation: { account: { login: 'mathofdynamic' } },
        repositories: [fixtureRepository()],
      },
    ],
    [
      'ambiguous repository identity',
      'issues',
      { ...repositoryPayload, repository: { full_name: 'mathofdynamic/trace-staging-fixture' } },
    ],
    ['unsupported event', 'ping', { ...repositoryPayload }],
    [
      'all-repository installation selection',
      'installation_repositories',
      {
        installation: { id: 42, account: { login: 'mathofdynamic' } },
        repository_selection: 'all',
        repositories_added: [fixtureRepository()],
        repositories_removed: [],
      },
    ],
  ])('denies signed payload with %s', (_label, eventName, payload) => {
    expect(canaryWebhookPayloadEligibility(production(), eventName, payload).allowed).toBe(false);
  });
});
