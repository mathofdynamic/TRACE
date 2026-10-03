import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import {
  createD1Database,
  d1Schema,
  markD1WebhookDeliveryFailure,
  requestD1WebhookReplay,
  type TraceD1Database,
} from '@trace/db';
import type { TraceGitHubEvent, TraceQueueMessage } from '@trace/core';
import { enqueueD1Webhook } from '../apps/web/lib/d1-webhook-queue';
import { processTraceQueueBatch } from '../apps/worker/src/cloudflare.js';

const migrationPaths = [
  new URL('../packages/db/drizzle-d1/0000_cheerful_legion.sql', import.meta.url),
  new URL('../packages/db/drizzle-d1/0001_goofy_lester.sql', import.meta.url),
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function applyMigrations(binding: D1Database) {
  for (const migrationPath of migrationPaths) {
    const migration = await readFile(migrationPath, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await binding.prepare(statement.trim()).run();
    }
  }
}

function issueEvent(repositoryId: number, issueId: number, number: number): TraceGitHubEvent {
  return {
    type: 'IssueUpdated',
    installationId: 4401,
    repositoryId,
    issueId,
    number,
    action: 'opened',
    title: `CF4.4 recovery issue ${number}`,
    state: 'open',
    authorLogin: 'cf44-author',
    url: `https://github.com/example/trace/issues/${number}`,
    createdAt: '2026-09-21T08:00:00.000Z',
    updatedAt: '2026-09-21T08:01:00.000Z',
  };
}

function envFor(binding: D1Database) {
  return { DB: binding } as unknown as Env;
}

function queueMessage(deliveryId: string, event: TraceGitHubEvent): TraceQueueMessage {
  return {
    version: '1',
    type: 'github.webhook.process',
    idempotencyKey: deliveryId,
    enqueuedAt: '2026-09-21T08:00:00.000Z',
    deliveryId,
    eventName: 'issues',
    event,
  };
}

function failingFirstPrepare(binding: D1Database) {
  let first = true;
  return {
    prepare(query: string) {
      if (first) {
        first = false;
        throw new Error(`simulated transient handler failure for ${query.slice(0, 32)}`);
      }
      return binding.prepare(query);
    },
  } as unknown as D1Database;
}

async function readDelivery(db: TraceD1Database, deliveryId: string) {
  const [row] = await db
    .select({
      status: d1Schema.githubWebhookDeliveries.status,
      attempts: d1Schema.githubWebhookDeliveries.attempts,
      lastError: d1Schema.githubWebhookDeliveries.lastError,
      processedAt: d1Schema.githubWebhookDeliveries.processedAt,
      replayCount: d1Schema.githubWebhookDeliveries.replayCount,
    })
    .from(d1Schema.githubWebhookDeliveries)
    .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, deliveryId));
  return row;
}

async function countIssues(db: TraceD1Database, repositoryId: string, number: number) {
  return (
    await db
      .select({ id: d1Schema.githubIssues.id })
      .from(d1Schema.githubIssues)
      .where(
        and(
          eq(d1Schema.githubIssues.repositoryId, repositoryId),
          eq(d1Schema.githubIssues.number, number),
        ),
      )
  ).length;
}

async function createUnresolvedDelivery(
  db: TraceD1Database,
  input: {
    deliveryId: string;
    organizationId: string;
    repositoryId: string;
    event: TraceGitHubEvent;
  },
) {
  await db.insert(d1Schema.githubWebhookDeliveries).values({
    deliveryId: input.deliveryId,
    eventName: 'issues',
    action: 'opened',
    installationId: '4401',
    organizationId: input.organizationId,
    repositoryId: input.repositoryId,
    normalizedEvent: input.event,
    payloadSha256: `cf44-${input.deliveryId}`,
    status: 'potentially_unresolved',
    lastError: 'simulated retry exhaustion; operator review required',
    attempts: 4,
    lastAttemptAt: new Date(),
  });
}

async function expectRecoveryError(operation: Promise<unknown>, expected: string, message: string) {
  try {
    await operation;
  } catch (error) {
    assert((error as { code?: string }).code === expected, message);
    return;
  }
  throw new Error(message);
}

async function main() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: `trace-cf44-${randomUUID()}` },
    }),
  );

  try {
    const binding = await miniflare.getD1Database('DB');
    await applyMigrations(binding);
    const db = createD1Database(binding);
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const ownerId = randomUUID();
    const memberId = randomUUID();
    const otherOwnerId = randomUUID();
    const installationId = randomUUID();
    const repositoryId = randomUUID();
    await db.insert(d1Schema.users).values([
      { id: ownerId, email: `cf44-owner-${ownerId}@example.test`, name: 'CF44 Owner' },
      { id: memberId, email: `cf44-member-${memberId}@example.test`, name: 'CF44 Member' },
      { id: otherOwnerId, email: `cf44-other-${otherOwnerId}@example.test`, name: 'Other Owner' },
    ]);
    await db.insert(d1Schema.organizations).values([
      { id: organizationId, name: 'CF4.4 Recovery Workspace', slug: `cf44-${organizationId}` },
      {
        id: otherOrganizationId,
        name: 'CF4.4 Other Workspace',
        slug: `cf44-other-${otherOrganizationId}`,
      },
    ]);
    await db.insert(d1Schema.memberships).values([
      { organizationId, userId: ownerId, role: 'owner' },
      { organizationId, userId: memberId, role: 'member' },
      { organizationId: otherOrganizationId, userId: otherOwnerId, role: 'owner' },
    ]);
    await db.insert(d1Schema.githubInstallations).values({
      id: installationId,
      organizationId,
      githubInstallationId: '4401',
      accountLogin: 'cf44-installation',
      accountType: 'Organization',
      state: 'active',
    });
    await db.insert(d1Schema.githubRepositories).values({
      id: repositoryId,
      organizationId,
      installationId,
      githubRepositoryId: '5501',
      owner: 'example',
      name: 'trace',
      fullName: 'example/trace',
      defaultBranch: 'main',
      visibility: 'private',
      state: 'active',
    });
    await db.insert(d1Schema.githubInstallationRepositories).values({
      installationId,
      githubRepositoryId: '5501',
      selected: true,
    });

    const normalEvent = issueEvent(5501, 6501, 41);
    const normalDeliveryId = 'cf44-normal';
    let normalMessage: TraceQueueMessage | undefined;
    await enqueueD1Webhook({
      db,
      queue: {
        send: async (message) => {
          normalMessage = message;
        },
      },
      deliveryId: normalDeliveryId,
      eventName: 'issues',
      action: 'opened',
      normalized: normalEvent,
      payloadSha256: 'cf44-normal-hash',
    });
    assert(normalMessage, 'Normal delivery was not queued');
    let normalAck = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf44-normal-message',
          body: normalMessage,
          attempts: 1,
          ack: () => {
            normalAck += 1;
          },
          retry: () => {
            throw new Error('normal delivery retried');
          },
        },
      ],
      envFor(binding),
    );
    assert(normalAck === 1, 'Normal delivery did not acknowledge');
    assert(
      (await readDelivery(db, normalDeliveryId))?.status === 'processed',
      'Normal delivery did not complete',
    );
    assert(
      (await countIssues(db, repositoryId, 41)) === 1,
      'Normal issue projection is not unique',
    );

    const transientEvent = issueEvent(5501, 6502, 42);
    const transientDeliveryId = 'cf44-transient';
    let transientMessage: TraceQueueMessage | undefined;
    await enqueueD1Webhook({
      db,
      queue: {
        send: async (message) => {
          transientMessage = message;
        },
      },
      deliveryId: transientDeliveryId,
      eventName: 'issues',
      action: 'opened',
      normalized: transientEvent,
      payloadSha256: 'cf44-transient-hash',
    });
    assert(transientMessage, 'Transient delivery was not queued');
    let transientRetry = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf44-transient-1',
          body: transientMessage,
          attempts: 1,
          ack: () => {
            throw new Error('unexpected ack');
          },
          retry: () => {
            transientRetry += 1;
          },
        },
      ],
      envFor(failingFirstPrepare(binding)),
    );
    assert(transientRetry === 1, 'Transient failure was not retried');
    assert(
      (await readDelivery(db, transientDeliveryId))?.status === 'potentially_unresolved',
      'Transient failure was not recorded',
    );
    let transientAck = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf44-transient-2',
          body: transientMessage,
          attempts: 2,
          ack: () => {
            transientAck += 1;
          },
          retry: () => {
            throw new Error('successful retry failed');
          },
        },
      ],
      envFor(binding),
    );
    assert(transientAck === 1, 'Transient retry did not acknowledge');
    assert(
      (await countIssues(db, repositoryId, 42)) === 1,
      'Transient retry duplicated issue projection',
    );

    const postWriteEvent = issueEvent(5501, 6503, 43);
    const postWriteDeliveryId = 'cf44-post-write';
    let postWriteMessage: TraceQueueMessage | undefined;
    await enqueueD1Webhook({
      db,
      queue: {
        send: async (message) => {
          postWriteMessage = message;
        },
      },
      deliveryId: postWriteDeliveryId,
      eventName: 'issues',
      action: 'opened',
      normalized: postWriteEvent,
      payloadSha256: 'cf44-post-write-hash',
    });
    assert(postWriteMessage, 'Post-write delivery was not queued');
    let firstPostWriteAck = true;
    let postWriteRetry = 0;
    await processTraceQueueBatch(
      [
        {
          id: 'cf44-post-write-1',
          body: postWriteMessage,
          attempts: 1,
          ack: () => {
            if (firstPostWriteAck) {
              firstPostWriteAck = false;
              throw new Error('simulated ack failure');
            }
          },
          retry: () => {
            postWriteRetry += 1;
          },
        },
      ],
      envFor(binding),
    );
    assert(postWriteRetry === 1, 'Post-write failure was not retried');
    assert(
      (await readDelivery(db, postWriteDeliveryId))?.status === 'processed',
      'Post-write failure regressed terminal state',
    );
    await processTraceQueueBatch(
      [
        {
          id: 'cf44-post-write-2',
          body: postWriteMessage,
          attempts: 2,
          ack: () => undefined,
          retry: () => {
            throw new Error('post-write replay failed');
          },
        },
      ],
      envFor(binding),
    );
    assert(
      (await countIssues(db, repositoryId, 43)) === 1,
      'Post-write replay duplicated issue projection',
    );

    const exhaustedEvent = issueEvent(5501, 6504, 44);
    const exhaustedDeliveryId = 'cf44-exhausted';
    let exhaustedMessage: TraceQueueMessage | undefined;
    await enqueueD1Webhook({
      db,
      queue: {
        send: async (message) => {
          exhaustedMessage = message;
        },
      },
      deliveryId: exhaustedDeliveryId,
      eventName: 'issues',
      action: 'opened',
      normalized: exhaustedEvent,
      payloadSha256: 'cf44-exhausted-hash',
    });
    assert(exhaustedMessage, 'Exhausted delivery was not queued');
    let exhaustedRetries = 0;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await processTraceQueueBatch(
        [
          {
            id: `cf44-exhausted-${attempt}`,
            body: exhaustedMessage,
            attempts: attempt,
            ack: () => {
              throw new Error('unexpected exhausted ack');
            },
            retry: () => {
              exhaustedRetries += 1;
            },
          },
        ],
        envFor(failingFirstPrepare(binding)),
      );
    }
    const exhausted = await readDelivery(db, exhaustedDeliveryId);
    assert(exhaustedRetries === 4, 'Four modeled failed attempts were not retried');
    assert(
      exhausted?.status === 'potentially_unresolved' && exhausted.attempts === 4,
      'Retry exhaustion was not visible as potentially unresolved',
    );

    const recoveryEvent = issueEvent(5501, 6505, 45);
    const recoveryDeliveryId = 'cf44-owner-replay';
    await createUnresolvedDelivery(db, {
      deliveryId: recoveryDeliveryId,
      organizationId,
      repositoryId,
      event: recoveryEvent,
    });
    const replayMessages: TraceQueueMessage[] = [];
    const replay = await requestD1WebhookReplay({
      db,
      queue: {
        send: async (message) => {
          replayMessages.push(message);
        },
      },
      deliveryId: recoveryDeliveryId,
      actorUserId: ownerId,
    });
    assert(
      replay.status === 'queued' && replayMessages.length === 1,
      'Owner replay was not queued',
    );
    await processTraceQueueBatch(
      [
        {
          id: 'cf44-owner-replay-message',
          body: replayMessages[0]!,
          attempts: 1,
          ack: () => undefined,
          retry: () => {
            throw new Error('owner replay failed');
          },
        },
      ],
      envFor(binding),
    );
    assert(
      (await readDelivery(db, recoveryDeliveryId))?.status === 'processed',
      'Owner replay did not complete',
    );
    assert(
      (await countIssues(db, repositoryId, 45)) === 1,
      'Owner replay produced duplicate business state',
    );

    const existingEffectDeliveryId = 'cf44-existing-effect';
    const existingEffectEvent = issueEvent(5501, 6501, 41);
    await createUnresolvedDelivery(db, {
      deliveryId: existingEffectDeliveryId,
      organizationId,
      repositoryId,
      event: existingEffectEvent,
    });
    const existingMessages: TraceQueueMessage[] = [];
    await requestD1WebhookReplay({
      db,
      queue: {
        send: async (message) => {
          existingMessages.push(message);
        },
      },
      deliveryId: existingEffectDeliveryId,
      actorUserId: ownerId,
    });
    await processTraceQueueBatch(
      [
        {
          id: 'cf44-existing-effect-message',
          body: existingMessages[0]!,
          attempts: 1,
          ack: () => undefined,
          retry: () => {
            throw new Error('existing effect replay failed');
          },
        },
      ],
      envFor(binding),
    );
    assert(
      (await countIssues(db, repositoryId, 41)) === 1,
      'Replay after an existing effect duplicated the issue',
    );

    const concurrentDeliveryId = 'cf44-concurrent';
    await createUnresolvedDelivery(db, {
      deliveryId: concurrentDeliveryId,
      organizationId,
      repositoryId,
      event: issueEvent(5501, 6506, 46),
    });
    const concurrentMessages: TraceQueueMessage[] = [];
    const concurrent = await Promise.allSettled([
      requestD1WebhookReplay({
        db,
        queue: {
          send: async (message) => {
            concurrentMessages.push(message);
          },
        },
        deliveryId: concurrentDeliveryId,
        actorUserId: ownerId,
      }),
      requestD1WebhookReplay({
        db,
        queue: {
          send: async (message) => {
            concurrentMessages.push(message);
          },
        },
        deliveryId: concurrentDeliveryId,
        actorUserId: ownerId,
      }),
    ]);
    assert(
      concurrent.filter((result) => result.status === 'fulfilled').length === 1,
      'Concurrent replay was not single-winner',
    );
    assert(concurrentMessages.length === 1, 'Concurrent replay queued duplicate work');

    await expectRecoveryError(
      requestD1WebhookReplay({
        db,
        queue: { send: async () => undefined },
        deliveryId: concurrentDeliveryId,
        actorUserId: memberId,
      }),
      'not-owner',
      'Non-owner replay was accepted',
    );
    await expectRecoveryError(
      requestD1WebhookReplay({
        db,
        queue: { send: async () => undefined },
        deliveryId: concurrentDeliveryId,
        actorUserId: otherOwnerId,
      }),
      'not-owner',
      'Cross-tenant owner replay was accepted',
    );

    const revokedDeliveryId = 'cf44-revoked';
    await createUnresolvedDelivery(db, {
      deliveryId: revokedDeliveryId,
      organizationId,
      repositoryId,
      event: issueEvent(5501, 6507, 47),
    });
    await db
      .update(d1Schema.githubInstallations)
      .set({ state: 'suspended', updatedAt: new Date() })
      .where(eq(d1Schema.githubInstallations.id, installationId));
    await expectRecoveryError(
      requestD1WebhookReplay({
        db,
        queue: { send: async () => undefined },
        deliveryId: revokedDeliveryId,
        actorUserId: ownerId,
      }),
      'installation-unavailable',
      'Suspended installation replay was accepted',
    );
    await db
      .update(d1Schema.githubInstallations)
      .set({ state: 'active', updatedAt: new Date() })
      .where(eq(d1Schema.githubInstallations.id, installationId));

    const enqueueFailureDeliveryId = 'cf44-enqueue-failure';
    await createUnresolvedDelivery(db, {
      deliveryId: enqueueFailureDeliveryId,
      organizationId,
      repositoryId,
      event: issueEvent(5501, 6508, 48),
    });
    await expectRecoveryError(
      requestD1WebhookReplay({
        db,
        queue: {
          send: async () => {
            throw new Error('simulated Queue outage');
          },
        },
        deliveryId: enqueueFailureDeliveryId,
        actorUserId: ownerId,
      }),
      'queue-unavailable',
      'Queue enqueue failure was reported as success',
    );
    const enqueueFailureState = await readDelivery(db, enqueueFailureDeliveryId);
    assert(
      enqueueFailureState?.status === 'potentially_unresolved' && enqueueFailureState.lastError,
      'Queue enqueue failure was not recoverable',
    );
    const recoveredMessages: TraceQueueMessage[] = [];
    await requestD1WebhookReplay({
      db,
      queue: {
        send: async (message) => {
          recoveredMessages.push(message);
        },
      },
      deliveryId: enqueueFailureDeliveryId,
      actorUserId: ownerId,
    });
    assert(recoveredMessages.length === 1, 'Recoverable Queue enqueue did not succeed on retry');

    const auditRows = await db
      .select({ action: d1Schema.auditEvents.action })
      .from(d1Schema.auditEvents)
      .where(eq(d1Schema.auditEvents.action, 'github.webhook.recovery.requested'));
    assert(auditRows.length >= 3, 'Owner recovery actions were not audited');

    process.stdout.write(
      JSON.stringify(
        {
          normalCompletion: 'passed',
          transientThenSuccess: 'passed',
          postWriteReplay: 'passed',
          modeledFailedAttempts: { passed: true, attempts: 4, status: exhausted?.status },
          ownerReplay: 'passed',
          replayAfterExistingEffect: 'passed',
          concurrentReplay: 'passed',
          ownerAndTenantBoundaries: 'passed',
          revokedAccess: 'passed',
          enqueueFailureRecovery: 'passed',
          issueProjectionUniqueness: 'passed',
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
