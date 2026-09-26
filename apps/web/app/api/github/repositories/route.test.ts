import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudflareEnv: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  session: vi.fn(async () => ({
    user: {
      id: 'user-1',
      name: 'Fixture owner',
      email: 'owner@example.test',
      image: null,
      githubLogin: 'mathofdynamic',
    },
    session: { expiresAt: new Date(Date.now() + 60_000) },
  })),
  createRequestDatabase: vi.fn(),
  database: null as unknown,
  client: { end: vi.fn(async () => undefined) },
  repositories: [] as Array<Record<string, unknown>>,
  getUserOrganizationIds: vi.fn(async () => ['workspace-1']),
  getGitHubRepositoryHead: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...values: unknown[]) => values),
  eq: vi.fn((...values: unknown[]) => values),
  inArray: vi.fn((...values: unknown[]) => values),
}));

vi.mock('@trace/db', () => ({
  d1Schema: {
    githubRepositories: {
      id: 'repo.id',
      installationId: 'repo.installationId',
      githubRepositoryId: 'repo.githubRepositoryId',
      organizationId: 'repo.organizationId',
      owner: 'repo.owner',
      name: 'repo.name',
      fullName: 'repo.fullName',
      defaultBranch: 'repo.defaultBranch',
      state: 'repo.state',
      updatedAt: 'repo.updatedAt',
      disconnectedAt: 'repo.disconnectedAt',
    },
    githubInstallations: {
      githubInstallationId: 'installation.githubInstallationId',
      accountLogin: 'installation.accountLogin',
    },
    githubInstallationRepositories: {
      installationId: 'installationRepositories.installationId',
      githubRepositoryId: 'installationRepositories.githubRepositoryId',
      selected: 'installationRepositories.selected',
      updatedAt: 'installationRepositories.updatedAt',
    },
    auditEvents: {},
  },
  schema: {},
  isD1Database: vi.fn(() => true),
}));

vi.mock('@trace/env', () => ({
  parseGitHubAppEnv: vi.fn(() => {
    throw new Error('Optional GitHub refresh is not configured.');
  }),
}));

vi.mock('@trace/github', () => ({ getGitHubRepositoryHead: mocks.getGitHubRepositoryHead }));

vi.mock('../../../../lib/request-database', () => ({
  createRequestDatabase: mocks.createRequestDatabase,
  getRequestCloudflareEnv: mocks.cloudflareEnv,
  getRequestTraceSession: mocks.session,
}));

vi.mock('../../../../lib/workspace', () => ({
  getUserOrganizationIds: mocks.getUserOrganizationIds,
}));

import { POST } from './route';

const fixtureEnvironment = {
  TRACE_DEPLOYMENT_ENV: 'production',
  TRACE_CANARY_MODE: 'fixture',
  TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
  TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
  TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
};

const fixtureRepository = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1f60000-0000-4000-8000-000000000001',
  installationId: 'install-record-1',
  githubRepositoryId: '1378441300',
  githubInstallationId: 'install-provider-1',
  installationAccountLogin: 'mathofdynamic',
  organizationId: 'workspace-1',
  owner: 'mathofdynamic',
  name: 'trace-staging-fixture',
  fullName: 'mathofdynamic/trace-staging-fixture',
  defaultBranch: 'main',
  state: 'available',
  ...overrides,
});

const otherRepository = (overrides: Record<string, unknown> = {}) =>
  fixtureRepository({
    id: 'a1f60000-0000-4000-8000-000000000002',
    githubRepositoryId: '7',
    owner: 'mathofdynamic',
    name: 'another-repository',
    fullName: 'mathofdynamic/another-repository',
    ...overrides,
  });

function createDatabase() {
  const selectQuery = {
    from: vi.fn(() => selectQuery),
    innerJoin: vi.fn(() => selectQuery),
    where: vi.fn(async () => mocks.repositories),
  };
  const db = {
    select: vi.fn(() => selectQuery),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  mocks.database = db;
  mocks.client.end.mockClear();
  mocks.createRequestDatabase.mockResolvedValue({ db, client: mocks.client });
  return db;
}

function request(repositoryIds: unknown[] = [fixtureRepository().id]) {
  return new Request('https://trace.example/api/github/repositories', {
    method: 'POST',
    headers: { origin: 'https://trace.example', 'content-type': 'application/json' },
    body: JSON.stringify({ repositoryIds }),
  });
}

describe('GitHub repository selection production canary boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cloudflareEnv.mockResolvedValue(null);
    mocks.session.mockResolvedValue({
      user: {
        id: 'user-1',
        name: 'Fixture owner',
        email: 'owner@example.test',
        image: null,
        githubLogin: 'mathofdynamic',
      },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    mocks.repositories = [fixtureRepository()];
  });

  it.each([
    ['closed', { TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'closed' }],
    ['unknown', { TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'opne' }],
    [
      'malformed fixture configuration',
      { ...fixtureEnvironment, TRACE_CANARY_GITHUB_REPOSITORY_ID: 'not-an-id' },
    ],
  ])('returns cache-disabled 503 for %s before session or database access', async (_label, env) => {
    mocks.cloudflareEnv.mockResolvedValue(env);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
  });

  it('denies a non-allowlisted fixture user before reading the request body or opening the route database', async () => {
    mocks.cloudflareEnv.mockResolvedValue(fixtureEnvironment);
    mocks.session.mockResolvedValue({
      user: {
        id: 'user-2',
        name: 'Other user',
        email: 'other@example.test',
        image: null,
        githubLogin: 'other',
      },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    const invalidBody = new Request('https://trace.example/api/github/repositories', {
      method: 'POST',
      headers: { origin: 'https://trace.example', 'content-type': 'application/json' },
      body: 'not-json',
    });

    const response = await POST(invalidBody);

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
    expect(mocks.getGitHubRepositoryHead).not.toHaveBeenCalled();
  });

  it('allows the fixture owner to select the single exact fixture repository', async () => {
    mocks.cloudflareEnv.mockResolvedValue(fixtureEnvironment);
    const db = createDatabase();

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'saved', selected: 1 });
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(mocks.getGitHubRepositoryHead).not.toHaveBeenCalled();
    expect(mocks.client.end).toHaveBeenCalledOnce();
  });

  it('rejects a workspace with another repository before writes or GitHub refresh', async () => {
    mocks.cloudflareEnv.mockResolvedValue(fixtureEnvironment);
    mocks.repositories = [fixtureRepository(), otherRepository()];
    const db = createDatabase();

    const response = await POST(request([fixtureRepository().id, otherRepository().id]));

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.getGitHubRepositoryHead).not.toHaveBeenCalled();
    expect(mocks.client.end).toHaveBeenCalledOnce();
  });

  it('rejects a wrong fixture identity before writes or GitHub refresh', async () => {
    mocks.cloudflareEnv.mockResolvedValue(fixtureEnvironment);
    mocks.repositories = [fixtureRepository({ githubRepositoryId: '1378441301' })];
    const db = createDatabase();

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.getGitHubRepositoryHead).not.toHaveBeenCalled();
  });

  it('preserves staging selection behavior for repositories outside the production fixture', async () => {
    mocks.cloudflareEnv.mockResolvedValue({ TRACE_DEPLOYMENT_ENV: 'staging' });
    mocks.repositories = [fixtureRepository(), otherRepository()];
    const db = createDatabase();

    const response = await POST(request([otherRepository().id]));

    expect(response.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(4);
    expect(db.insert).toHaveBeenCalledOnce();
  });
});
