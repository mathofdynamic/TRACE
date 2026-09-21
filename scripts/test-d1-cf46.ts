import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import {
  createD1Database,
  d1Schema,
  listD1WebhookRecoveriesForOwner,
  requestD1WebhookReplay,
  resolveD1WebhookScope,
  type TraceD1Database,
} from '@trace/db';
import type { TraceGitHubEvent, TraceQueueMessage } from '@trace/core';
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
    installationId: repositoryId + 1000,
    repositoryId,
    issueId,
    number,
    action: 'opened',
    title: `CF4.6 isolated recovery issue ${number}`,
    state: 'open',
    authorLogin: 'cf46-fixture',
    url: `https://github.com/example/trace-${repositoryId}/issues/${number}`,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:01:00.000Z',
  };
}

type WorkspaceFixture = {
  organizationId: string;
  ownerId: string;
  memberId: string;
  installationId: string;
  installationProviderId: string;
  repositoryId: string;
  repositoryProviderId: string;
  deliveryId: string;
  event: TraceGitHubEvent;
};

async function createWorkspace(db: TraceD1Database, label: string, providerOffset: number) {
  const organizationId = randomUUID();
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const installationId = randomUUID();
  const repositoryId = randomUUID();
  const repositoryProviderId = String(900000 + providerOffset);
  const installationProviderId = String(Number(repositoryProviderId) + 1000);
  const deliveryId = `cf46-${label}-delivery`;
  const event = issueEvent(
    Number(repositoryProviderId),
    910000 + providerOffset,
    10 + providerOffset,
  );

  await db.insert(d1Schema.users).values([
    { id: ownerId, email: `cf46-${label}-owner@example.test`, name: `${label} Owner` },
    { id: memberId, email: `cf46-${label}-member@example.test`, name: `${label} Member` },
  ]);
  await db.insert(d1Schema.organizations).values({
    id: organizationId,
    name: `CF4.6 ${label} Workspace`,
    slug: `cf46-${label}-${organizationId.slice(0, 8)}`,
  });
  await db.insert(d1Schema.memberships).values([
    { organizationId, userId: ownerId, role: 'owner' },
    { organizationId, userId: memberId, role: 'member' },
  ]);
  await db.insert(d1Schema.githubInstallations).values({
    id: installationId,
    organizationId,
    githubInstallationId: installationProviderId,
    accountLogin: `cf46-${label}`,
    accountType: 'Organization',
    state: 'active',
  });
  await db.insert(d1Schema.githubRepositories).values({
    id: repositoryId,
    organizationId,
    installationId,
    githubRepositoryId: repositoryProviderId,
    owner: 'example',
    name: `trace-${label}`,
    fullName: `example/trace-${label}`,
    defaultBranch: 'main',
    visibility: 'private',
    state: 'active',
  });
  await db.insert(d1Schema.githubInstallationRepositories).values({
    installationId,
    githubRepositoryId: repositoryProviderId,
    selected: true,
  });
  await db.insert(d1Schema.githubWebhookDeliveries).values({
    deliveryId,
    eventName: 'issues',
    action: 'opened',
    installationId: installationProviderId,
    organizationId,
    repositoryId,
    normalizedEvent: event,
    payloadSha256: `cf46-${label}-hash`,
    status: 'potentially_unresolved',
    attempts: 4,
    lastError: 'isolated retry exhaustion fixture',
    lastAttemptAt: new Date(),
  });

  return {
    organizationId,
    ownerId,
    memberId,
    installationId,
    installationProviderId,
    repositoryId,
    repositoryProviderId,
    deliveryId,
    event,
  } satisfies WorkspaceFixture;
}

function expectCode(operation: Promise<unknown>, code: string, message: string) {
  return operation.then(
    () => {
      throw new Error(message);
    },
    (error: unknown) => {
      assert((error as { code?: string }).code === code, message);
    },
  );
}

async function processMessage(binding: D1Database, message: TraceQueueMessage) {
  let acknowledged = 0;
  let retried = 0;
  await processTraceQueueBatch(
    [
      {
        id: `cf46-message-${message.deliveryId}`,
        body: message,
        attempts: 1,
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
  assert(acknowledged === 1 && retried === 0, `Queue processing failed for ${message.deliveryId}`);
}

async function main() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: `trace-cf46-${randomUUID()}` },
    }),
  );

  try {
    const binding = await miniflare.getD1Database('DB');
    await applyMigrations(binding);
    const db = createD1Database(binding);
    const workspaceA = await createWorkspace(db, 'a', 1);
    const workspaceB = await createWorkspace(db, 'b', 2);

    const ownerA = await listD1WebhookRecoveriesForOwner(db, workspaceA.ownerId);
    const ownerB = await listD1WebhookRecoveriesForOwner(db, workspaceB.ownerId);
    const memberA = await listD1WebhookRecoveriesForOwner(db, workspaceA.memberId);
    assert(
      ownerA.length === 1 && ownerA[0]?.deliveryId === workspaceA.deliveryId,
      'Owner A scope leaked',
    );
    assert(
      ownerB.length === 1 && ownerB[0]?.deliveryId === workspaceB.deliveryId,
      'Owner B scope leaked',
    );
    assert(memberA.length === 0, 'Non-owner recovery listing was not empty');
    assert(
      !JSON.stringify(ownerA[0]).includes('normalizedEvent'),
      'Recovery response leaked event data',
    );
    assert(
      !JSON.stringify(ownerA[0]).includes('payloadSha256'),
      'Recovery response leaked payload hash',
    );

    const queueA: TraceQueueMessage[] = [];
    await requestD1WebhookReplay({
      db,
      queue: { send: async (message) => queueA.push(message) },
      deliveryId: workspaceA.deliveryId,
      actorUserId: workspaceA.ownerId,
    });
    assert(queueA.length === 1, 'Owner A replay was not queued');
    await processMessage(binding, queueA[0]!);

    await expectCode(
      requestD1WebhookReplay({
        db,
        queue: { send: async () => undefined },
        deliveryId: workspaceA.deliveryId,
        actorUserId: workspaceA.memberId,
      }),
      'not-owner',
      'Member A replay was accepted',
    );
    await expectCode(
      requestD1WebhookReplay({
        db,
        queue: { send: async () => undefined },
        deliveryId: workspaceA.deliveryId,
        actorUserId: workspaceB.ownerId,
      }),
      'not-owner',
      'Owner B replayed workspace A delivery',
    );
    await expectCode(
      requestD1WebhookReplay({
        db,
        queue: { send: async () => undefined },
        deliveryId: workspaceB.deliveryId,
        actorUserId: workspaceA.ownerId,
      }),
      'not-owner',
      'Owner A replayed workspace B delivery',
    );

    const concurrentDeliveryId = 'cf46-concurrent-delivery';
    await db.insert(d1Schema.githubWebhookDeliveries).values({
      deliveryId: concurrentDeliveryId,
      eventName: 'issues',
      action: 'opened',
      installationId: workspaceA.installationProviderId,
      organizationId: workspaceA.organizationId,
      repositoryId: workspaceA.repositoryId,
      normalizedEvent: workspaceA.event,
      payloadSha256: 'cf46-concurrent-hash',
      status: 'potentially_unresolved',
      attempts: 4,
    });
    const concurrentMessages: TraceQueueMessage[] = [];
    const concurrent = await Promise.allSettled([
      requestD1WebhookReplay({
        db,
        queue: { send: async (message) => concurrentMessages.push(message) },
        deliveryId: concurrentDeliveryId,
        actorUserId: workspaceA.ownerId,
      }),
      requestD1WebhookReplay({
        db,
        queue: { send: async (message) => concurrentMessages.push(message) },
        deliveryId: concurrentDeliveryId,
        actorUserId: workspaceA.ownerId,
      }),
    ]);
    assert(
      concurrent.filter((result) => result.status === 'fulfilled').length === 1,
      'Concurrent replay was not single-winner',
    );
    assert(concurrentMessages.length === 1, 'Concurrent replay queued duplicate work');

    const mismatchedEvent = issueEvent(Number(workspaceB.repositoryProviderId), 999999, 99);
    const mismatchedScope = await resolveD1WebhookScope(
      db,
      mismatchedEvent,
      workspaceA.installationProviderId,
    );
    assert(
      mismatchedScope.organizationId === null && mismatchedScope.repositoryId === null,
      'Mismatched installation/repository scope was accepted',
    );
    await expectCode(
      requestD1WebhookReplay({
        db,
        queue: { send: async () => undefined },
        deliveryId: workspaceB.deliveryId,
        actorUserId: workspaceA.ownerId,
      }),
      'not-owner',
      'Cross-workspace replay remained possible after scope mismatch',
    );

    let duplicateInstallationRejected = false;
    try {
      await db.insert(d1Schema.githubInstallations).values({
        id: randomUUID(),
        organizationId: workspaceB.organizationId,
        githubInstallationId: workspaceA.installationProviderId,
        accountLogin: 'ambiguous',
        accountType: 'Organization',
        state: 'active',
      });
    } catch {
      duplicateInstallationRejected = true;
    }
    assert(duplicateInstallationRejected, 'Duplicate provider installation was not rejected');

    const deliveryRows = await db
      .select({
        deliveryId: d1Schema.githubWebhookDeliveries.deliveryId,
        organizationId: d1Schema.githubWebhookDeliveries.organizationId,
      })
      .from(d1Schema.githubWebhookDeliveries)
      .where(
        and(
          eq(d1Schema.githubWebhookDeliveries.deliveryId, workspaceA.deliveryId),
          eq(d1Schema.githubWebhookDeliveries.organizationId, workspaceA.organizationId),
        ),
      );
    assert(deliveryRows.length === 1, 'Delivery organization was reassigned');

    console.log(
      JSON.stringify(
        {
          workspaceOwnersScoped: true,
          nonOwnerListingEmpty: true,
          responseExcludesPayload: true,
          crossTenantReplayDenied: true,
          mismatchedInstallationRepositoryDenied: true,
          duplicateInstallationRejected: true,
          concurrentReplaySingleWinner: true,
          queueBusinessProcessing: true,
          organizationAssignmentStable: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await miniflare.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
