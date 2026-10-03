import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { createD1Database, d1Schema, type TraceD1Database } from '@trace/db';
import { enqueueD1Webhook } from '../apps/web/lib/d1-webhook-queue';
import { processTraceQueueBatch } from '../apps/worker/src/cloudflare.js';
import type { TraceGitHubEvent, TraceQueueMessage } from '@trace/core';

const migrationPaths = [
  new URL('../packages/db/drizzle-d1/0000_cheerful_legion.sql', import.meta.url),
  new URL('../packages/db/drizzle-d1/0001_goofy_lester.sql', import.meta.url),
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function applyMigration(binding: D1Database) {
  for (const migrationPath of migrationPaths) {
    const migration = await readFile(migrationPath, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await binding.prepare(statement.trim()).run();
    }
  }
}

function pullRequestEvent(
  repositoryId: number,
  pullRequestId: number,
  number: number,
  title: string,
): TraceGitHubEvent {
  return {
    type: 'PullRequestOpened',
    installationId: 7601,
    repositoryId,
    pullRequestId,
    number,
    action: 'opened',
    title,
    state: 'open',
    headSha: 'a'.repeat(40),
    baseSha: 'b'.repeat(40),
    baseBranch: 'main',
    authorLogin: 'cf43-author',
    url: `https://github.com/example/trace/pull/${number}`,
    createdAt: '2026-09-21T05:00:00.000Z',
    updatedAt: '2026-09-21T05:01:00.000Z',
  };
}

function queueMessage(deliveryId: string, event: TraceGitHubEvent): TraceQueueMessage {
  return {
    version: '1',
    type: 'github.webhook.process',
    idempotencyKey: deliveryId,
    enqueuedAt: '2026-09-21T05:00:00.000Z',
    deliveryId,
    eventName: 'pull_request',
    event,
  };
}

async function seedDatabase(db: TraceD1Database) {
  const organizationId = randomUUID();
  const installationId = randomUUID();
  const repositoryId = randomUUID();
  await db.insert(d1Schema.organizations).values({
    id: organizationId,
    name: 'CF4.3 retry workspace',
    slug: `cf43-${organizationId.slice(0, 8)}`,
  });
  await db.insert(d1Schema.githubInstallations).values({
    id: installationId,
    organizationId,
    githubInstallationId: '7601',
    accountLogin: 'cf43-installation',
    accountType: 'Organization',
    state: 'active',
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
  return { organizationId, repositoryId };
}

async function enqueue(
  db: TraceD1Database,
  deliveryId: string,
  event: TraceGitHubEvent,
): Promise<TraceQueueMessage> {
  let sent: TraceQueueMessage | undefined;
  const result = await enqueueD1Webhook({
    db,
    queue: {
      send: async (message) => {
        sent = message;
      },
    },
    deliveryId,
    eventName: 'pull_request',
    action: 'opened',
    normalized: event,
    payloadSha256: `cf43-${deliveryId}`,
  });
  assert(result.accepted && result.queued && !result.duplicate, `${deliveryId} was not queued`);
  assert(sent, `${deliveryId} did not produce a Queue message`);
  return sent;
}

function envFor(binding: D1Database) {
  return { DB: binding } as unknown as Env;
}

async function readDelivery(db: TraceD1Database, deliveryId: string) {
  const [delivery] = await db
    .select({
      status: d1Schema.githubWebhookDeliveries.status,
      processedAt: d1Schema.githubWebhookDeliveries.processedAt,
    })
    .from(d1Schema.githubWebhookDeliveries)
    .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, deliveryId));
  return delivery;
}

async function countPullRequests(db: TraceD1Database, repositoryId: string, number: number) {
  const rows = await db
    .select({
      id: d1Schema.githubPullRequests.id,
      organizationId: d1Schema.githubPullRequests.organizationId,
      repositoryId: d1Schema.githubPullRequests.repositoryId,
    })
    .from(d1Schema.githubPullRequests)
    .where(
      and(
        eq(d1Schema.githubPullRequests.repositoryId, repositoryId),
        eq(d1Schema.githubPullRequests.number, number),
      ),
    );
  return rows;
}

async function main() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: `trace-cf43-${randomUUID()}` },
    }),
  );

  try {
    const binding = await miniflare.getD1Database('DB');
    await applyMigration(binding);
    const db = createD1Database(binding);
    const { organizationId, repositoryId } = await seedDatabase(db);

    const transientDeliveryId = 'cf43-transient-before-write';
    const transientEvent = pullRequestEvent(8601, 9601, 31, 'CF4.3 transient retry');
    const transientMessage = await enqueue(db, transientDeliveryId, transientEvent);
    let transientRetry = 0;
    let transientAck = 0;
    let failOnce = true;
    const failOnceBinding = {
      prepare(query: string) {
        if (failOnce) {
          failOnce = false;
          throw new Error('simulated transient D1 outage');
        }
        return binding.prepare(query);
      },
    } as unknown as D1Database;
    await processTraceQueueBatch(
      [
        {
          id: 'cf43-transient-attempt-1',
          body: transientMessage,
          ack: () => {
            transientAck += 1;
          },
          retry: () => {
            transientRetry += 1;
          },
        },
      ],
      envFor(failOnceBinding),
    );
    const transientAfterFailure = await readDelivery(db, transientDeliveryId);
    assert(transientRetry === 1 && transientAck === 0, 'Transient failure was acknowledged');
    assert(
      (transientAfterFailure?.status === 'queued' ||
        transientAfterFailure?.status === 'potentially_unresolved') &&
        !transientAfterFailure.processedAt,
      'Transient failure changed delivery state before a successful retry',
    );

    await processTraceQueueBatch(
      [
        {
          id: 'cf43-transient-attempt-2',
          body: transientMessage,
          ack: () => {
            transientAck += 1;
          },
          retry: () => {
            transientRetry += 1;
          },
        },
      ],
      envFor(binding),
    );
    const transientDelivery = await readDelivery(db, transientDeliveryId);
    const transientRows = await countPullRequests(db, repositoryId, 31);
    assert(transientRetry === 1 && transientAck === 1, 'Transient retry did not complete once');
    assert(
      transientDelivery?.status === 'processed' && transientDelivery.processedAt,
      'Transient retry did not persist terminal delivery state',
    );
    assert(
      transientRows.length === 1 &&
        transientRows[0]?.organizationId === organizationId &&
        transientRows[0]?.repositoryId === repositoryId,
      'Transient retry produced incorrect tenant or repository state',
    );

    const replayDeliveryId = 'cf43-post-write-ack-failure';
    const replayEvent = pullRequestEvent(8601, 9602, 32, 'CF4.3 post-write replay');
    const replayMessage = await enqueue(db, replayDeliveryId, replayEvent);
    let replayRetry = 0;
    let replayAck = 0;
    let firstAck = true;
    await processTraceQueueBatch(
      [
        {
          id: 'cf43-replay-attempt-1',
          body: replayMessage,
          ack: () => {
            if (firstAck) {
              firstAck = false;
              throw new Error('simulated failure after business write before acknowledgement');
            }
            replayAck += 1;
          },
          retry: () => {
            replayRetry += 1;
          },
        },
      ],
      envFor(binding),
    );
    const replayAfterFirstAttempt = await readDelivery(db, replayDeliveryId);
    const replayRowsAfterFirstAttempt = await countPullRequests(db, repositoryId, 32);
    assert(replayRetry === 1 && replayAck === 0, 'Post-write failure was not retried');
    assert(
      replayAfterFirstAttempt?.status === 'processed' && replayAfterFirstAttempt.processedAt,
      'Business write did not complete before simulated acknowledgement failure',
    );
    assert(
      replayRowsAfterFirstAttempt.length === 1,
      'First post-write attempt did not persist once',
    );

    await processTraceQueueBatch(
      [
        {
          id: 'cf43-replay-attempt-2',
          body: replayMessage,
          ack: () => {
            replayAck += 1;
          },
          retry: () => {
            replayRetry += 1;
          },
        },
      ],
      envFor(binding),
    );
    const replayDelivery = await readDelivery(db, replayDeliveryId);
    const replayRows = await countPullRequests(db, repositoryId, 32);
    assert(replayRetry === 1 && replayAck === 1, 'Post-write replay did not acknowledge once');
    assert(replayDelivery?.status === 'processed', 'Post-write replay lost terminal status');
    assert(replayRows.length === 1, 'Post-write replay duplicated the PR projection');

    const exhaustedDeliveryId = 'cf43-retry-exhaustion';
    const exhaustedEvent = pullRequestEvent(8601, 9603, 33, 'CF4.3 exhausted retry');
    const exhaustedMessage = await enqueue(db, exhaustedDeliveryId, exhaustedEvent);
    const permanentlyFailingBinding = {
      prepare() {
        throw new Error('simulated persistent D1 outage');
      },
    } as unknown as D1Database;
    let exhaustedRetries = 0;
    let exhaustedAcks = 0;
    const configuredMaxRetries = 3;
    for (let attempt = 0; attempt <= configuredMaxRetries; attempt += 1) {
      await processTraceQueueBatch(
        [
          {
            id: `cf43-exhausted-attempt-${attempt + 1}`,
            body: exhaustedMessage,
            ack: () => {
              exhaustedAcks += 1;
            },
            retry: () => {
              exhaustedRetries += 1;
            },
          },
        ],
        envFor(permanentlyFailingBinding),
      );
    }
    const exhaustedDelivery = await readDelivery(db, exhaustedDeliveryId);
    const exhaustedRows = await countPullRequests(db, repositoryId, 33);
    assert(
      exhaustedAcks === 0 && exhaustedRetries === configuredMaxRetries + 1,
      'Retry exhaustion did not fail closed',
    );
    assert(
      exhaustedDelivery?.status === 'queued' && !exhaustedDelivery.processedAt,
      'Exhausted delivery was falsely marked processed',
    );
    assert(exhaustedRows.length === 0, 'Exhausted delivery produced business state');

    process.stdout.write(
      JSON.stringify(
        {
          transientRetry: 'passed',
          postWriteReplay: 'passed',
          retryExhaustion: {
            passed: true,
            attempts: configuredMaxRetries + 1,
            deliveryId: exhaustedDeliveryId,
            terminalD1Status: exhaustedDelivery?.status,
            projectionCount: exhaustedRows.length,
          },
          tenant: { organizationId, repositoryId },
          dlq: 'not configured in staging; consumer retries and leaves delivery queued',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await miniflare.dispose();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
