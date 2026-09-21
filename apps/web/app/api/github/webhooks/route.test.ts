import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudflareEnv: vi.fn(),
  createRequestDatabase: vi.fn(),
  enqueueD1Webhook: vi.fn(),
  requiresD1Runtime: vi.fn(),
  pgBoss: vi.fn(),
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
  verifyGitHubSignature: vi.fn(() => true),
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

function webhookRequest() {
  return new Request('https://trace.example/api/github/webhooks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '16',
      'x-github-delivery': 'delivery-1',
      'x-github-event': 'issues',
      'x-hub-signature-256': 'sha256=valid',
    },
    body: JSON.stringify({ action: 'opened' }),
  });
}

describe('GitHub webhook D1 runtime boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requiresD1Runtime.mockReturnValue(true);
  });

  it('returns 503 without entering PostgreSQL or pg-boss when production D1 is absent', async () => {
    mocks.cloudflareEnv.mockResolvedValue({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Webhook D1 database binding is not configured.',
    });
    expect(mocks.createRequestDatabase).not.toHaveBeenCalled();
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
});
