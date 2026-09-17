import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import {
  createD1Database,
  createD1GitHubIngestionStore,
  d1Schema,
  type TraceD1Database,
} from '@trace/db';
import { enqueueD1Webhook, type D1WebhookQueueResult } from '../apps/web/lib/d1-webhook-queue';
import {
  isCloudflareQueueMessageType,
  parseTraceQueueMessage,
  processGitHubWebhookEvent,
  type TraceQueueMessage,
} from '@trace/core';
import { hashWebhookPayload, normalizeGitHubEvent, verifyGitHubSignature } from '@trace/github';
import { processTraceQueueBatch } from '../apps/worker/src/cloudflare.js';

const migrationPath = new URL(
  '../packages/db/drizzle-d1/0000_cheerful_legion.sql',
  import.meta.url,
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function applyMigration(binding: D1Database) {
  const migration = await readFile(migrationPath, 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await binding.prepare(statement.trim()).run();
  }
}

function pullRequestPayload() {
  return {
    action: 'opened',
    installation: { id: 7601 },
    repository: { id: 8601 },
    pull_request: {
      id: 9601,
      number: 21,
      title: 'CF2.6 queue parity change',
      state: 'open',
      merged_at: null,
      head: { sha: 'a'.repeat(40) },
      base: { sha: 'b'.repeat(40), ref: 'main' },
      user: { login: 'cf26-author' },
      html_url: 'https://github.com/example/trace/pull/21',
      created_at: '2026-09-17T10:00:00.000Z',
      updated_at: '2026-09-17T10:01:00.000Z',
    },
  };
}

function signedPayload(secret: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function explain(
  binding: D1Database,
  label: string,
  statement: string,
  ...parameters: Array<string | number>
) {
  const result = await binding
    .prepare(`EXPLAIN QUERY PLAN ${statement}`)
    .bind(...parameters)
    .all<{ detail?: string }>();
  const details = (result.results ?? []).map((row) => row.detail ?? '').join(' | ');
  assert(details, `${label} returned no query plan`);
  process.stdout.write(`D1 query plan ${label}: ${details}\n`);
  return details;
}

async function main() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: `trace-cf26-${randomUUID()}` },
    }),
  );
  try {
    const binding = await miniflare.getD1Database('DB');
    await applyMigration(binding);
    const db = createD1Database(binding);
    const organizationId = randomUUID();
    const installationId = randomUUID();
    const repositoryId = randomUUID();
    await db.insert(d1Schema.organizations).values({
      id: organizationId,
      name: 'CF2.6 queue workspace',
      slug: `cf26-${organizationId.slice(0, 8)}`,
    });
    await db.insert(d1Schema.githubInstallations).values({
      id: installationId,
      organizationId,
      githubInstallationId: '7601',
      accountLogin: 'cf26-installation',
      accountType: 'Organization',
    });
    await db.insert(d1Schema.githubRepositories).values({
      id: repositoryId,
      organizationId,
      installationId,
      githubRepositoryId: '8601',
      owner: 'example',
      name: 'trace',
      fullName: 'example/trace',
      defaultBranch: 'main',
      visibility: 'private',
      state: 'active',
    });
    await db.insert(d1Schema.githubInstallationRepositories).values({
      installationId,
      githubRepositoryId: '8601',
      selected: true,
    });

    const secret = 'cf26-webhook-secret';
    const rawBody = JSON.stringify(pullRequestPayload());
    const signature = signedPayload(secret, rawBody);
    assert(
      verifyGitHubSignature(rawBody, secret, signature),
      'Signed webhook fixture was rejected',
    );
    assert(
      !verifyGitHubSignature(rawBody, secret, 'sha256=invalid'),
      'Invalid webhook signature was accepted',
    );
    const normalized = normalizeGitHubEvent('pull_request', 'opened', pullRequestPayload());
    assert(normalized?.type === 'PullRequestOpened', 'Webhook fixture did not normalize');

    const sent: TraceQueueMessage[] = [];
    const queue = { send: async (message: TraceQueueMessage) => void sent.push(message) };
    const accepted: D1WebhookQueueResult = await enqueueD1Webhook({
      db,
      queue,
      deliveryId: 'cf26-delivery-1',
      eventName: 'pull_request',
      action: 'opened',
      normalized,
      payloadSha256: hashWebhookPayload(rawBody),
    });
    assert(accepted.accepted && !accepted.duplicate && accepted.queued, 'Webhook was not queued');
    assert(sent.length === 1, 'Webhook emitted an unexpected number of queue messages');
    assert(
      isCloudflareQueueMessageType(parseTraceQueueMessage(sent[0]!).type),
      'Queue message was not in the Cloudflare-supported registry',
    );

    let acknowledged = 0;
    let retried = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf26-queue-1',
          body: sent[0]!,
          ack: () => {
            acknowledged += 1;
          },
          retry: () => {
            retried += 1;
          },
        },
      ],
      { DB: binding } as unknown as Env,
    );
    assert(acknowledged === 1 && retried === 0, 'Queue consumer did not complete the webhook');
    const [delivery] = await db
      .select({ status: d1Schema.githubWebhookDeliveries.status })
      .from(d1Schema.githubWebhookDeliveries)
      .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, 'cf26-delivery-1'));
    assert(delivery?.status === 'processed', 'Queue completion did not persist delivery status');
    const [pullRequest] = await db
      .select({ title: d1Schema.githubPullRequests.title })
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.repositoryId, repositoryId));
    assert(pullRequest?.title === 'CF2.6 queue parity change', 'Queue handler did not persist PR');

    const duplicate = await enqueueD1Webhook({
      db,
      queue,
      deliveryId: 'cf26-delivery-1',
      eventName: 'pull_request',
      action: 'opened',
      normalized,
      payloadSha256: hashWebhookPayload(rawBody),
    });
    assert(duplicate.duplicate && sent.length === 1, 'Webhook redelivery emitted duplicate work');

    let duplicateAcknowledged = 0;
    let duplicateRetried = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf26-queue-duplicate',
          body: sent[0]!,
          ack: () => {
            duplicateAcknowledged += 1;
          },
          retry: () => {
            duplicateRetried += 1;
          },
        },
      ],
      { DB: binding } as unknown as Env,
    );
    assert(
      duplicateAcknowledged === 1 && duplicateRetried === 0,
      'Duplicate queue delivery was not safely acknowledged',
    );
    const pullRequests = await db
      .select({ id: d1Schema.githubPullRequests.id })
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.repositoryId, repositoryId));
    assert(pullRequests.length === 1, 'Duplicate queue delivery created duplicate PR state');

    const tenantRejected = await processGitHubWebhookEvent(createD1GitHubIngestionStore(db), {
      ...normalized,
      installationId: 7602,
    });
    assert(tenantRejected.status === 'rejected', 'Cross-installation event was accepted');

    const unsupported: TraceQueueMessage = {
      version: '1',
      type: 'reports.daily',
      idempotencyKey: 'cf26-placeholder-1',
      enqueuedAt: '2026-09-17T10:00:00.000Z',
      organizationId,
      windowStart: '2026-09-16T00:00:00.000Z',
      windowEnd: '2026-09-17T00:00:00.000Z',
    };
    let unsupportedAck = 0;
    let unsupportedRetry = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf26-placeholder-message',
          body: unsupported,
          ack: () => {
            unsupportedAck += 1;
          },
          retry: () => {
            unsupportedRetry += 1;
          },
        },
      ],
      { DB: binding } as unknown as Env,
    );
    assert(
      unsupportedAck === 0 && unsupportedRetry === 1,
      'Unsupported queue type was acknowledged',
    );

    let transientRetry = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf26-transient-message',
          body: {
            version: '1',
            type: 'system.healthcheck',
            idempotencyKey: 'cf26-transient-health',
            enqueuedAt: '2026-09-17T10:00:00.000Z',
            probeId: 'cf26-probe',
          },
          ack: () => {
            throw new Error('Transient D1 failure must not acknowledge');
          },
          retry: () => {
            transientRetry += 1;
          },
        },
      ],
      {
        DB: {
          prepare() {
            throw new Error('simulated D1 outage');
          },
        },
      } as unknown as Env,
    );
    assert(transientRetry === 1, 'Transient queue failure was not retried');

    const queryPlans = [
      await explain(
        binding,
        'repository catalog',
        'SELECT id FROM github_repositories WHERE organization_id = ? AND full_name = ?',
        organizationId,
        'example/trace',
      ),
      await explain(
        binding,
        'pull request lookup',
        'SELECT id FROM github_pull_requests WHERE repository_id = ? AND number = ?',
        repositoryId,
        21,
      ),
      await explain(
        binding,
        'webhook dedupe',
        'SELECT id FROM github_webhook_deliveries WHERE delivery_id = ?',
        'cf26-delivery-1',
      ),
      await explain(
        binding,
        'activity ordering',
        'SELECT id FROM audit_events WHERE organization_id = ? ORDER BY created_at DESC',
        organizationId,
      ),
      await explain(
        binding,
        'artifact lookup',
        'SELECT id FROM synced_artifacts WHERE repository_id = ? AND artifact_type = ?',
        repositoryId,
        'daily_report',
      ),
    ];
    assert(
      queryPlans.every((detail) =>
        /USING (?:COVERING )?INDEX|USING INTEGER PRIMARY KEY|SEARCH/i.test(detail),
      ),
      'A representative D1 query plan fell back to an unbounded scan',
    );

    process.stdout.write(
      'D1 CF2.6 parity passed: signed webhook → D1 → Queue → shared handler, duplicate/retry safeguards, tenant rejection, and query plans.\n',
    );
  } finally {
    await miniflare.dispose();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
