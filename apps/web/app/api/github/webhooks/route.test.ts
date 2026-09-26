import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  cloudflareEnv: vi.fn(),
  createRequestDatabase: vi.fn(),
  enqueueD1Webhook: vi.fn(),
  requiresD1Runtime: vi.fn(),
  pgBoss: vi.fn(),
  verifyGitHubSignature: vi.fn(
    (_payload: string, _secret: string, _signature: string | null) => false,
  ),
}));

vi.mock('pg-boss', () => ({ PgBoss: mocks.pgBoss }));

vi.mock('@trace/env', () => ({
  parseGitHubWebhookEnv: vi.fn(() => ({ GITHUB_WEBHOOK_SECRET: 'webhook-secret' })),
}));

vi.mock('@trace/github', () => ({
  hashWebhookPayload: vi.fn(() => 'payload-hash'),
  normalizeGitHubEvent: vi.fn(() => ({
    type: 'github.issue',
    installationId: 'installation-1',
    repositoryId: 'repository-1',
  })),
  verifyGitHubSignature: mocks.verifyGitHubSignature,
}));

vi.mock('../../../../lib/request-database', () => ({
  createRequestDatabase: mocks.createRequestDatabase,
  getRequestCloudflareEnv: mocks.cloudflareEnv,
  getRequestDatabaseUrl: vi.fn(),
  requiresD1Runtime: mocks.requiresD1Runtime,
}));

vi.mock('../../../../lib/d1-webhook-queue', () => ({
  enqueueD1Webhook: mocks.enqueueD1Webhook,
}));

import { POST } from './route';

function webhookRequest(
  eventName = 'issues',
  payload: unknown = { action: 'opened' },
  signed = true,
) {
  const rawBody = JSON.stringify(payload);
  const signature = signed
    ? `sha256=${createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex')}`
    : 'sha256=invalid';
  return new Request('https://trace.example/api/github/webhooks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(rawBody).byteLength),
      'x-github-delivery': 'delivery-1',
      'x-github-event': eventName,
      'x-hub-signature-256': signature,
    },
    body: rawBody,
  });
}

describe('GitHub webhook D1 runtime boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requiresD1Runtime.mockReturnValue(true);
    mocks.verifyGitHubSignature.mockImplementation((payload, secret, signature) => {
      const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
      return signature === expected;
    });
  });

  it('returns 503 without entering PostgreSQL or pg-boss when production D1 is absent', async () => {
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
    });

    const response = await POST(
      webhookRequest('issues', {
        action: 'opened',
        repository: {
          id: 1378441300,
          owner: { login: 'mathofdynamic' },
          name: 'trace-staging-fixture',
          full_name: 'mathofdynamic/trace-staging-fixture',
        },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Webhook D1 database binding is not configured.',
    });
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
    expect(mocks.enqueueD1Webhook).not.toHaveBeenCalled();
    expect(mocks.pgBoss).not.toHaveBeenCalled();
  });

  it('rejects production webhook intake while the canary is closed', async () => {
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'closed',
      DB: {},
      TRACE_QUEUE: { send: vi.fn(async () => undefined) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'GitHub integration is disabled during the closed production canary.',
    });
    expect(mocks.enqueueD1Webhook).not.toHaveBeenCalled();
    expect(mocks.pgBoss).not.toHaveBeenCalled();
  });

  it('keeps the normal D1 staging path on the Queue producer', async () => {
    const client = { end: vi.fn(async () => undefined) };
    const db = {};
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'staging',
      TRACE_DATABASE_DRIVER: 'd1',
      DB: {},
      TRACE_QUEUE: { send: vi.fn(async () => undefined) },
    });
    mocks.createRequestDatabase.mockResolvedValue({ db, client });
    mocks.enqueueD1Webhook.mockResolvedValue({
      accepted: true,
      duplicate: false,
      queued: true,
      normalized: true,
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      duplicate: false,
      queued: true,
      normalized: true,
    });
    expect(mocks.enqueueD1Webhook).toHaveBeenCalledWith(
      expect.objectContaining({ db, deliveryId: 'delivery-1', eventName: 'issues' }),
    );
    expect(client.end).toHaveBeenCalledOnce();
    expect(mocks.pgBoss).not.toHaveBeenCalled();
  });

  it('rejects a validly signed non-fixture repository before any D1 insert or Queue send', async () => {
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
      DB: {},
      TRACE_QUEUE: { send: vi.fn(async () => undefined) },
    });
    const request = webhookRequest('issues', {
      action: 'opened',
      repository: { id: 7, owner: { login: 'other' }, name: 'private-repo' },
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
    expect(mocks.enqueueD1Webhook).not.toHaveBeenCalled();
    expect(mocks.pgBoss).not.toHaveBeenCalled();
  });

  it('queues a correctly signed fixture repository event in fixture mode', async () => {
    const client = { end: vi.fn(async () => undefined) };
    const db = {};
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
      DB: {},
      TRACE_QUEUE: { send: vi.fn(async () => undefined) },
    });
    mocks.createRequestDatabase.mockResolvedValue({ db, client });
    mocks.enqueueD1Webhook.mockResolvedValue({
      accepted: true,
      duplicate: false,
      queued: true,
      normalized: true,
    });
    const request = webhookRequest('issues', {
      action: 'opened',
      repository: {
        id: 1378441300,
        owner: { login: 'mathofdynamic' },
        name: 'trace-staging-fixture',
        full_name: 'mathofdynamic/trace-staging-fixture',
      },
      installation: { id: 42, account: { login: 'mathofdynamic' } },
    });

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(mocks.enqueueD1Webhook).toHaveBeenCalledWith(
      expect.objectContaining({ db, deliveryId: 'delivery-1', eventName: 'issues' }),
    );
    expect(client.end).toHaveBeenCalledOnce();
    expect(mocks.pgBoss).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures before the fixture payload gate or persistence', async () => {
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
      DB: {},
      TRACE_QUEUE: { send: vi.fn(async () => undefined) },
    });

    const response = await POST(webhookRequest('issues', { repository: { id: 7 } }, false));

    expect(response.status).toBe(401);
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
    expect(mocks.enqueueD1Webhook).not.toHaveBeenCalled();
  });
});
