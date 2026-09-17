import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createD1Database, d1Schema, type TraceD1Database } from '@trace/db';
import { checksum, serializeArtifact } from '@trace/schema';
import { createSessionCookie } from '@trace/auth';
import {
  approveDeviceAuthorization,
  authenticateCliRequest,
  consumeDeviceAuthorization,
  createDeviceAuthorization,
} from '../apps/web/lib/cli-auth';
import { getDashboardSummary } from '../apps/web/lib/dashboard';
import { completeSync, negotiateSync, stageSyncArtifact } from '../apps/web/lib/sync-service';
import {
  isPersistedAuthSession,
  persistAuthSession,
  type RequestDatabase,
} from '../apps/web/lib/request-database';

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

function requestDatabase(db: TraceD1Database) {
  return db as unknown as RequestDatabase;
}

function testArtifact(repository: string, headCommit: string, id = 'analysis-d1-parity') {
  const now = new Date().toISOString();
  const content = serializeArtifact(
    {
      schema_version: '0.1',
      id,
      artifact_type: 'analysis',
      repository: {
        provider: 'github',
        owner: repository.split('/')[0]!,
        name: repository.split('/')[1]!,
      },
      created_at: now,
      updated_at: now,
      generator: 'trace-cli/0.1',
      execution_origin: 'local',
      source_refs: [{ type: 'commit', locator: headCommit }],
      evidence: [{ type: 'commit', locator: headCommit }],
      review_status: 'draft',
      sensitivity: 'internal',
      sync_policy: 'allowlisted',
      dashboard: {
        title: 'D1 parity analysis',
        summary: 'Deterministic source-free test projection.',
        branch: 'main',
        head_commit: headCommit,
        status: 'completed',
        items: [
          {
            id: 'finding-d1-parity',
            title: 'D1 parity finding',
            detail: 'A deterministic test finding backed by a commit reference.',
            severity: 'medium',
            classification: 'deterministic',
            evidence: [`commit:${headCommit}`],
          },
        ],
      },
    },
    '# D1 parity\n\nOnly approved summary and evidence locators are synchronized.\n',
  );
  const artifact = {
    id,
    type: 'analysis' as const,
    path: `analyses/${id}.md`,
    sha256: checksum(content),
    size: new TextEncoder().encode(content).byteLength,
    schemaVersion: '0.1' as const,
    sensitivity: 'internal' as const,
    revision: now,
  };
  return { content, artifact, now };
}

async function main() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: `trace-cf2-parity-${randomUUID()}` },
    }),
  );
  try {
    const binding = await miniflare.getD1Database('DB');
    await applyMigration(binding);
    const db = createD1Database(binding);
    const requestDb = requestDatabase(db);

    const userA = randomUUID();
    const organizationA = randomUUID();
    const repositoryA = randomUUID();
    const userB = randomUUID();
    const organizationB = randomUUID();
    const repositoryB = randomUUID();
    const installationA = randomUUID();
    const installationB = randomUUID();

    await db.insert(d1Schema.users).values([
      { id: userA, email: 'cf2-a@example.test', name: 'D1 User A' },
      { id: userB, email: 'cf2-b@example.test', name: 'D1 User B' },
    ]);
    await db.insert(d1Schema.organizations).values([
      { id: organizationA, name: 'D1 Workspace A', slug: `cf2-a-${userA.slice(0, 8)}` },
      { id: organizationB, name: 'D1 Workspace B', slug: `cf2-b-${userB.slice(0, 8)}` },
    ]);
    await db.insert(d1Schema.memberships).values([
      { id: randomUUID(), organizationId: organizationA, userId: userA, role: 'owner' },
      { id: randomUUID(), organizationId: organizationB, userId: userB, role: 'owner' },
    ]);
    await db.insert(d1Schema.githubInstallations).values([
      {
        id: installationA,
        organizationId: organizationA,
        githubInstallationId: '9007199254740993',
        accountLogin: 'd1-a',
        accountType: 'User',
      },
      {
        id: installationB,
        organizationId: organizationB,
        githubInstallationId: '9007199254740995',
        accountLogin: 'd1-b',
        accountType: 'Organization',
      },
    ]);
    await db.insert(d1Schema.githubRepositories).values([
      {
        id: repositoryA,
        organizationId: organizationA,
        installationId: installationA,
        githubRepositoryId: '9007199254740997',
        owner: 'd1-a',
        name: 'trace-a',
        fullName: 'd1-a/trace-a',
        defaultBranch: 'main',
        state: 'active',
      },
      {
        id: repositoryB,
        organizationId: organizationB,
        installationId: installationB,
        githubRepositoryId: '9007199254740999',
        owner: 'd1-b',
        name: 'trace-b',
        fullName: 'd1-b/trace-b',
        defaultBranch: 'main',
        state: 'active',
      },
    ]);
    await db.insert(d1Schema.githubInstallationRepositories).values([
      {
        id: randomUUID(),
        installationId: installationA,
        githubRepositoryId: '9007199254740997',
        selected: true,
      },
      {
        id: randomUUID(),
        installationId: installationB,
        githubRepositoryId: '9007199254740999',
        selected: true,
      },
    ]);
    await db.insert(d1Schema.githubPullRequests).values({
      id: randomUUID(),
      organizationId: organizationA,
      repositoryId: repositoryA,
      githubPullRequestId: '9007199254741001',
      number: 7,
      title: 'D1 parity change',
      state: 'open',
      headSha: 'abcdef1234567',
      baseBranch: 'main',
      authorLogin: 'd1-a',
      url: 'https://github.com/example/trace-a/pull/7',
    });

    const device = await createDeviceAuthorization(requestDb, 'D1 parity terminal', 'cf2-parity-a');
    assert(
      await approveDeviceAuthorization(requestDb, {
        code: device.userCode,
        userId: userA,
        organizationId: organizationA,
      }),
      'D1 device authorization was not approved',
    );
    const consumed = await consumeDeviceAuthorization(requestDb, device.deviceCode);
    assert(consumed.status === 'approved', 'D1 device authorization was not consumed');
    const connectionId = consumed.connectionId;
    const [connection] = await db
      .select()
      .from(d1Schema.cliConnections)
      .where(eq(d1Schema.cliConnections.id, connectionId))
      .limit(1);
    assert(connection, 'D1 CLI connection was not persisted');
    const secondConsume = await consumeDeviceAuthorization(requestDb, device.deviceCode);
    assert(secondConsume.status === 'expired', 'D1 authorization code was replayable');
    const authenticated = await authenticateCliRequest(
      requestDb,
      new Request('https://trace.test/api/cli/me', {
        headers: { authorization: `Bearer ${consumed.token}` },
      }),
      'sync:write',
    );
    assert(authenticated?.id === connectionId, 'D1 CLI credential did not authenticate');

    process.env.TRACE_AUTH_SECRET = 'trace-cf2-parity-secret-change-this-32-chars';
    const sessionCookie = await createSessionCookie({
      id: userA,
      name: 'D1 User A',
      email: 'cf2-a@example.test',
      image: null,
      githubLogin: 'd1-a',
    });
    await persistAuthSession(
      requestDb,
      {
        id: userA,
        name: 'D1 User A',
        email: 'cf2-a@example.test',
        image: null,
        githubLogin: 'd1-a',
      },
      sessionCookie,
    );
    assert(
      await isPersistedAuthSession(requestDb, sessionCookie, userA),
      'D1 auth session was not persisted',
    );
    await db
      .update(d1Schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(d1Schema.sessions.token, sessionCookie));
    assert(
      !(await isPersistedAuthSession(requestDb, sessionCookie, userA)),
      'D1 expired auth session was accepted',
    );

    const concurrentDevice = await createDeviceAuthorization(
      requestDb,
      'D1 concurrent terminal',
      'cf2-parity-concurrent',
    );
    assert(
      await approveDeviceAuthorization(requestDb, {
        code: concurrentDevice.userCode,
        userId: userA,
        organizationId: organizationA,
      }),
      'D1 concurrent authorization was not approved',
    );
    const concurrentResults = await Promise.all([
      consumeDeviceAuthorization(requestDb, concurrentDevice.deviceCode),
      consumeDeviceAuthorization(requestDb, concurrentDevice.deviceCode),
    ]);
    assert(
      concurrentResults.filter((result) => result.status === 'approved').length === 1,
      'D1 concurrent consume issued more than one credential',
    );

    const headCommit = 'abcdef1234567';
    const { artifact, content, now } = testArtifact('d1-a/trace-a', headCommit);
    const manifest = {
      protocolVersion: '0.1' as const,
      schemaVersion: '0.1' as const,
      syncId: randomUUID(),
      repositoryId: repositoryA,
      repository: 'd1-a/trace-a',
      executionOrigin: 'local' as const,
      traceVersion: '0.1.0',
      createdAt: now,
      baseOperationId: null,
      git: { branch: 'main', headCommit },
      artifacts: [artifact],
      sourceCodeIncluded: false as const,
      codeSnippetsIncluded: false as const,
    };
    const negotiated = await negotiateSync(requestDb, connection, manifest);
    assert(negotiated.status === 200, 'D1 sync negotiation failed');
    const operationId = (negotiated.body as { operationId: string }).operationId;
    const beforeUpload = await completeSync(requestDb, connection, operationId);
    assert(beforeUpload.status === 409, 'D1 allowed completion before all artifacts were uploaded');
    const staged = await stageSyncArtifact(requestDb, connection, {
      operationId,
      artifact,
      content,
    });
    assert(staged.status === 200, 'D1 artifact staging failed');
    const completed = await completeSync(requestDb, connection, operationId);
    assert(completed.status === 200, 'D1 sync completion failed');
    const idempotent = await completeSync(requestDb, connection, operationId);
    assert(
      idempotent.status === 200 &&
        'idempotent' in idempotent.body &&
        idempotent.body.idempotent === true,
      'D1 sync completion was not idempotent',
    );

    const unknownSummary = await getDashboardSummary(requestDb, userA);
    const unknownRepository = unknownSummary.repositories.find((item) => item.id === repositoryA);
    assert(
      unknownSummary.latestChanges.some((item) => item.title === 'D1 parity change'),
      'D1 dashboard did not project persisted pull requests',
    );
    assert(unknownRepository?.syncState === 'unknown', 'D1 unknown freshness was not fail-closed');
    await db
      .update(d1Schema.githubRepositories)
      .set({ remoteHeadSha: headCommit })
      .where(eq(d1Schema.githubRepositories.id, repositoryA));
    const currentSummary = await getDashboardSummary(requestDb, userA);
    assert(
      currentSummary.repositories.find((item) => item.id === repositoryA)?.syncState === 'synced',
      'D1 current freshness was not derived from matching SHAs',
    );
    await db
      .update(d1Schema.githubRepositories)
      .set({ remoteHeadSha: 'fedcba7654321' })
      .where(eq(d1Schema.githubRepositories.id, repositoryA));
    const staleSummary = await getDashboardSummary(requestDb, userA);
    assert(
      staleSummary.repositories.find((item) => item.id === repositoryA)?.syncState ===
        'needs_refresh',
      'D1 stale freshness was not derived from divergent SHAs',
    );
    assert(
      staleSummary.repositories.every((item) => item.id !== repositoryB),
      'D1 dashboard leaked a repository across organizations',
    );

    const foreignManifest = {
      ...manifest,
      syncId: randomUUID(),
      repositoryId: repositoryB,
      repository: 'd1-b/trace-b',
      createdAt: new Date(Date.now() + 1_000).toISOString(),
    };
    const foreignResult = await negotiateSync(requestDb, connection, foreignManifest);
    assert(foreignResult.status === 403, 'D1 sync accepted a cross-tenant repository');

    const duplicateDelivery = 'cf2-delivery-dedup';
    const deliveryValues = {
      id: randomUUID(),
      deliveryId: duplicateDelivery,
      eventName: 'push',
      payloadSha256: 'a'.repeat(64),
    };
    const [firstDelivery] = await db
      .insert(d1Schema.githubWebhookDeliveries)
      .values(deliveryValues)
      .onConflictDoNothing({ target: d1Schema.githubWebhookDeliveries.deliveryId })
      .returning({ id: d1Schema.githubWebhookDeliveries.id });
    const [secondDelivery] = await db
      .insert(d1Schema.githubWebhookDeliveries)
      .values({ ...deliveryValues, id: randomUUID() })
      .onConflictDoNothing({ target: d1Schema.githubWebhookDeliveries.deliveryId })
      .returning({ id: d1Schema.githubWebhookDeliveries.id });
    assert(firstDelivery && !secondDelivery, 'D1 webhook deduplication did not hold');

    const indexes = await binding
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
      .all<{ name: string }>();
    const indexNames = new Set((indexes.results ?? []).map((row) => row.name));
    for (const expected of [
      'memberships_user_idx',
      'github_repositories_org_full_name_unique',
      'sessions_token_unique',
      'cli_connections_token_unique',
      'sync_operations_idempotency_unique',
      'github_webhook_deliveries_delivery_unique',
      'audit_events_org_created_idx',
    ]) {
      assert(indexNames.has(expected), `D1 query index is missing: ${expected}`);
    }

    process.stdout.write(
      'D1 parity passed: auth, consume-once, tenant isolation, webhook dedupe, sync idempotency, freshness, and indexes.\n',
    );
  } finally {
    await miniflare.dispose();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
