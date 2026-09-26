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
  scope: null as unknown,
  queueSend: vi.fn(async () => undefined),
  requestD1WebhookReplay: vi.fn(),
  listD1WebhookRecoveriesForOwner: vi.fn(async () => []),
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn((...values: unknown[]) => values) }));

vi.mock('@trace/db', () => ({
  D1WebhookRecoveryError: class D1WebhookRecoveryError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  d1Schema: {
    githubWebhookDeliveries: {
      deliveryId: 'delivery.deliveryId',
      organizationId: 'delivery.organizationId',
      repositoryId: 'delivery.repositoryId',
      installationId: 'delivery.installationId',
    },
    githubRepositories: {
      id: 'repository.id',
      organizationId: 'repository.organizationId',
      installationId: 'repository.installationId',
      githubRepositoryId: 'repository.githubRepositoryId',
      owner: 'repository.owner',
      name: 'repository.name',
      fullName: 'repository.fullName',
    },
    githubInstallations: {
      id: 'installation.id',
      organizationId: 'installation.organizationId',
      githubInstallationId: 'installation.githubInstallationId',
      accountLogin: 'installation.accountLogin',
    },
  },
  isD1Database: vi.fn(() => true),
  listD1WebhookRecoveriesForOwner: mocks.listD1WebhookRecoveriesForOwner,
  requestD1WebhookReplay: mocks.requestD1WebhookReplay,
}));

vi.mock('../../../../../lib/request-database', () => ({
  createRequestDatabase: mocks.createRequestDatabase,
  getRequestCloudflareEnv: mocks.cloudflareEnv,
  getRequestTraceSession: mocks.session,
}));

import { D1WebhookRecoveryError } from '@trace/db';
import { GET, POST } from './route';

const fixtureEnvironment = {
  TRACE_DEPLOYMENT_ENV: 'production',
  TRACE_CANARY_MODE: 'fixture',
  TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
  TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
  TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
  TRACE_QUEUE: { send: mocks.queueSend },
};

function fixtureRecoveryScope(overrides: Record<string, unknown> = {}) {
  return {
    deliveryOrganizationId: 'workspace-1',
    deliveryRepositoryId: 'repository-record-1',
    deliveryInstallationId: 'installation-provider-1',
    repositoryRecordId: 'repository-record-1',
    repositoryOrganizationId: 'workspace-1',
    repositoryInstallationId: 'installation-record-1',
    githubRepositoryId: '1378441300',
    repositoryOwner: 'mathofdynamic',
    repositoryName: 'trace-staging-fixture',
    repositoryFullName: 'mathofdynamic/trace-staging-fixture',
    installationRecordId: 'installation-record-1',
    installationOrganizationId: 'workspace-1',
    installationProviderId: 'installation-provider-1',
    installationAccountLogin: 'mathofdynamic',
    ...overrides,
  };
}

function createDatabase() {
  const selectQuery = {
    from: vi.fn(() => selectQuery),
    leftJoin: vi.fn(() => selectQuery),
    where: vi.fn(() => selectQuery),
    limit: vi.fn(async () => (mocks.scope ? [mocks.scope] : [])),
  };
  const db = {
    select: vi.fn(() => selectQuery),
    update: vi.fn(),
    insert: vi.fn(),
  };
  mocks.database = db;
  mocks.client.end.mockClear();
  mocks.createRequestDatabase.mockResolvedValue({ db, client: mocks.client });
  return db;
}

function request(body: unknown = { deliveryId: 'delivery-1' }) {
  return new Request('https://trace.example/api/github/webhooks/recovery', {
    method: 'POST',
    headers: { origin: 'https://trace.example', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GitHub webhook recovery replay production canary boundary', () => {
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
    mocks.scope = fixtureRecoveryScope();
    mocks.requestD1WebhookReplay.mockResolvedValue({
      deliveryId: 'delivery-1',
      status: 'queued',
      replayCount: 1,
    });
  });

  it.each([
    ['closed', { TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'closed' }],
    ['unknown', { TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'opne' }],
    [
      'malformed fixture configuration',
      {
        TRACE_DEPLOYMENT_ENV: 'production',
        TRACE_CANARY_MODE: 'fixture',
        TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
        TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
        TRACE_CANARY_GITHUB_REPOSITORY_ID: 'bad-id',
      },
    ],
  ])('returns cache-disabled 503 for %s before session or database access', async (_label, env) => {
    mocks.cloudflareEnv.mockResolvedValue(env);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
    expect(mocks.requestD1WebhookReplay).not.toHaveBeenCalled();
    expect(mocks.queueSend).not.toHaveBeenCalled();
  });

  it('denies a non-allowlisted fixture user before opening the replay database or queue', async () => {
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

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
    expect(mocks.requestD1WebhookReplay).not.toHaveBeenCalled();
    expect(mocks.queueSend).not.toHaveBeenCalled();
  });

  it('rejects a non-fixture recovery association before mutation or queue replay', async () => {
    mocks.cloudflareEnv.mockResolvedValue(fixtureEnvironment);
    mocks.scope = fixtureRecoveryScope({
      githubRepositoryId: '7',
      repositoryOwner: 'mathofdynamic',
      repositoryName: 'another-repository',
      repositoryFullName: 'mathofdynamic/another-repository',
    });
    const db = createDatabase();

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(db.select).toHaveBeenCalledOnce();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.requestD1WebhookReplay).not.toHaveBeenCalled();
    expect(mocks.queueSend).not.toHaveBeenCalled();
    expect(mocks.client.end).toHaveBeenCalledOnce();
  });

  it('retains the existing owner-only replay authorization for the allowed fixture user', async () => {
    mocks.cloudflareEnv.mockResolvedValue(fixtureEnvironment);
    createDatabase();
    mocks.requestD1WebhookReplay.mockRejectedValue(
      new D1WebhookRecoveryError('Workspace owner access required.', 'not-owner'),
    );

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Workspace owner access required.',
      code: 'not-owner',
    });
    expect(mocks.requestD1WebhookReplay).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'delivery-1', actorUserId: 'user-1' }),
    );
    expect(mocks.queueSend).not.toHaveBeenCalled();
  });

  it('preserves the non-production replay path without fixture identity filtering', async () => {
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'staging',
      TRACE_QUEUE: { send: mocks.queueSend },
    });
    const db = createDatabase();

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      deliveryId: 'delivery-1',
      status: 'queued',
      replayCount: 1,
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(mocks.requestD1WebhookReplay).toHaveBeenCalledOnce();
  });

  it('keeps the authenticated read-only recovery listing available in closed mode', async () => {
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_CANARY_MODE: 'closed',
    });
    const db = createDatabase();

    const response = await GET(new Request('https://trace.example/api/github/webhooks/recovery'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deliveries: [] });
    expect(mocks.listD1WebhookRecoveriesForOwner).toHaveBeenCalledOnce();
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.requestD1WebhookReplay).not.toHaveBeenCalled();
  });
});
