import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, createDatabaseClient, schema } from '@trace/db';
import { checksum, serializeArtifact } from '@trace/schema';
import {
  approveDeviceAuthorization,
  authenticateCliRequest,
  consumeDeviceAuthorization,
  createDeviceAuthorization,
} from './cli-auth';
import { getDashboardSummary } from './dashboard';
import { completeSync, negotiateSync, stageSyncArtifact } from './sync-service';

const databaseUrl = process.env.TRACE_BRIDGE_TEST_DATABASE_URL;
const canRun = Boolean(
  databaseUrl?.includes('127.0.0.1') && databaseUrl.includes('trace_bridge_test'),
);

describe.runIf(canRun)('local-to-dashboard bridge integration', () => {
  let client: Awaited<ReturnType<typeof createDatabaseClient>>['client'];
  let db: Awaited<ReturnType<typeof createDatabaseClient>>['db'];
  const seed = randomUUID().slice(0, 8);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const repositoryId = randomUUID();
  let connection: typeof schema.cliConnections.$inferSelect;
  let token = '';
  let completedOperationId = '';

  beforeAll(async () => {
    const database = await createDatabaseClient(databaseUrl!);
    client = database.client;
    db = database.db;
    await db.insert(schema.users).values({
      id: userId,
      email: `bridge-${seed}@example.test`,
      name: 'Bridge Test',
    });
    await db.insert(schema.organizations).values({
      id: organizationId,
      name: 'Bridge Test',
      slug: `bridge-${seed}`,
    });
    await db.insert(schema.memberships).values({ organizationId, userId, role: 'owner' });
    const [installation] = await db
      .insert(schema.githubInstallations)
      .values({
        organizationId,
        githubInstallationId: Date.now(),
        accountLogin: 'mathofdynamic',
        accountType: 'User',
      })
      .returning({ id: schema.githubInstallations.id });
    await db.insert(schema.githubRepositories).values({
      id: repositoryId,
      organizationId,
      installationId: installation!.id,
      githubRepositoryId: Date.now() + 1,
      owner: 'mathofdynamic',
      name: 'TRACE',
      fullName: 'mathofdynamic/TRACE',
      defaultBranch: 'main',
    });
  });

  afterAll(async () => {
    if (db)
      await db
        .delete(schema.organizations)
        .where((await import('drizzle-orm')).eq(schema.organizations.id, organizationId));
    if (client) await client.end();
  });

  it('issues a scoped one-time device credential', async () => {
    const device = await createDeviceAuthorization(db, 'Integration terminal', '127.0.0.1');
    await expect(
      approveDeviceAuthorization(db, {
        code: device.userCode,
        userId,
        organizationId,
      }),
    ).resolves.toBeTruthy();
    const result = await consumeDeviceAuthorization(db, device.deviceCode);
    expect(result.status).toBe('approved');
    if (result.status !== 'approved') throw new Error('Device authorization did not complete.');
    token = result.token;
    const authenticated = await authenticateCliRequest(
      db,
      new Request('https://trace.test/api/cli/me', {
        headers: { authorization: `Bearer ${token}` },
      }),
      'repository:read',
    );
    expect(authenticated?.scopes).toEqual(['repository:read', 'sync:write']);
    connection = authenticated!;
    await expect(consumeDeviceAuthorization(db, device.deviceCode)).resolves.toEqual({
      status: 'expired',
    });
  });

  it('promotes only a complete verified artifact snapshot', async () => {
    const now = new Date().toISOString();
    const content = serializeArtifact(
      {
        schema_version: '0.1',
        id: 'analysis-bridge-test',
        artifact_type: 'analysis',
        repository: { provider: 'github', owner: 'mathofdynamic', name: 'TRACE' },
        created_at: now,
        updated_at: now,
        generator: 'trace-cli/0.1',
        execution_origin: 'local',
        source_refs: [{ type: 'commit', locator: 'abcdef1234567' }],
        evidence: [{ type: 'commit', locator: 'abcdef1234567' }],
        review_status: 'draft',
        sensitivity: 'internal',
        sync_policy: 'allowlisted',
        dashboard: {
          title: 'Local bridge analysis',
          summary: 'One deterministic finding. Source code remained local.',
          branch: 'main',
          head_commit: 'abcdef1234567',
          status: 'completed',
          items: [
            {
              id: 'finding-bridge-test',
              title: 'Schema change requires review',
              detail: 'A migration changed in the local worktree.',
              severity: 'medium',
              classification: 'deterministic',
              evidence: ['commit:abcdef1234567'],
            },
          ],
        },
      },
      '# Local analysis\n\nOnly approved summary and evidence locators are synchronized.\n',
    );
    const artifact = {
      id: 'analysis-bridge-test',
      type: 'analysis' as const,
      path: 'analyses/bridge-test.md',
      sha256: checksum(content),
      size: new TextEncoder().encode(content).byteLength,
      schemaVersion: '0.1' as const,
      sensitivity: 'internal' as const,
      revision: now,
    };
    const manifest = {
      protocolVersion: '0.1' as const,
      schemaVersion: '0.1' as const,
      syncId: randomUUID(),
      repositoryId,
      repository: 'mathofdynamic/TRACE',
      executionOrigin: 'local' as const,
      traceVersion: '0.1.0',
      createdAt: now,
      baseOperationId: null,
      git: { branch: 'main', headCommit: 'abcdef1234567' },
      artifacts: [artifact],
      sourceCodeIncluded: false as const,
      codeSnippetsIncluded: false as const,
    };
    const negotiated = await negotiateSync(db, connection, manifest);
    expect(negotiated.status).toBe(200);
    const operationId = (negotiated.body as { operationId: string }).operationId;
    await expect(completeSync(db, connection, operationId)).resolves.toMatchObject({ status: 409 });
    await expect(
      stageSyncArtifact(db, connection, { operationId, artifact, content }),
    ).resolves.toMatchObject({ status: 200 });
    const concurrentDatabase = createDatabase(databaseUrl!);
    let completions: Array<Awaited<ReturnType<typeof completeSync>>>;
    try {
      completions = await Promise.all([
        completeSync(concurrentDatabase.db as unknown as typeof db, connection, operationId),
        completeSync(concurrentDatabase.db as unknown as typeof db, connection, operationId),
      ]);
    } finally {
      await concurrentDatabase.pool.end();
    }
    expect(completions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 200,
          body: expect.objectContaining({ completed: true, artifacts: 1 }),
        }),
        expect.objectContaining({
          status: 200,
          body: expect.objectContaining({ completed: true, idempotent: true }),
        }),
      ]),
    );
    completedOperationId = operationId;
    const unknownSummary = await getDashboardSummary(db, userId);
    expect(unknownSummary.repositories[0]?.latestSync?.stale).toBeNull();
    await db
      .update(schema.githubRepositories)
      .set({ remoteHeadSha: 'abcdef1234567' })
      .where((await import('drizzle-orm')).eq(schema.githubRepositories.id, repositoryId));
    const summary = await getDashboardSummary(db, userId);
    expect(summary.repositories[0]?.latestSync?.headCommit).toBe('abcdef1234567');
    expect(summary.repositories[0]?.latestSync?.stale).toBe(false);
    await db
      .update(schema.githubRepositories)
      .set({ remoteHeadSha: 'bcdefa234567890bcdefa234567890bcdefa2345' })
      .where((await import('drizzle-orm')).eq(schema.githubRepositories.id, repositoryId));
    const staleSummary = await getDashboardSummary(db, userId);
    expect(staleSummary.repositories[0]?.latestSync?.stale).toBe(true);
    expect(summary.attention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Schema change requires review',
          classification: 'deterministic',
        }),
      ]),
    );
    const retry = await negotiateSync(db, connection, {
      ...manifest,
      syncId: randomUUID(),
      createdAt: new Date(Date.now() + 1_000).toISOString(),
    });
    expect(retry.body).toMatchObject({ operationId, status: 'completed', missing: [] });
  });

  it('rejects repositories outside the credential workspace', async () => {
    const manifest = {
      protocolVersion: '0.1' as const,
      schemaVersion: '0.1' as const,
      syncId: randomUUID(),
      repositoryId: randomUUID(),
      repository: 'other/project',
      executionOrigin: 'local' as const,
      traceVersion: '0.1.0',
      createdAt: new Date().toISOString(),
      baseOperationId: null,
      git: { branch: 'main', headCommit: 'abcdef1234567' },
      artifacts: [],
      sourceCodeIncluded: false as const,
      codeSnippetsIncluded: false as const,
    };
    await expect(negotiateSync(db, connection, manifest)).resolves.toMatchObject({ status: 403 });
  });

  it('fails stale-device divergence before accepting new artifact bytes', async () => {
    const manifest = {
      protocolVersion: '0.1' as const,
      schemaVersion: '0.1' as const,
      syncId: randomUUID(),
      repositoryId,
      repository: 'mathofdynamic/TRACE',
      executionOrigin: 'local' as const,
      traceVersion: '0.1.0',
      createdAt: new Date().toISOString(),
      baseOperationId: null,
      git: { branch: 'main', headCommit: 'bcdefa2345678' },
      artifacts: [],
      sourceCodeIncluded: false as const,
      codeSnippetsIncluded: false as const,
    };
    await expect(negotiateSync(db, connection, manifest)).resolves.toMatchObject({
      status: 409,
      body: { currentOperationId: completedOperationId },
    });
  });

  it('rejects content that differs from the negotiated hash and keeps the last snapshot visible', async () => {
    const now = new Date(Date.now() + 5_000).toISOString();
    const approvedContent = serializeArtifact(
      {
        schema_version: '0.1',
        id: 'decision-bridge-test',
        artifact_type: 'decision',
        repository: { provider: 'github', owner: 'mathofdynamic', name: 'TRACE' },
        created_at: now,
        updated_at: now,
        generator: 'trace-cli/0.1',
        execution_origin: 'local',
        source_refs: [{ type: 'commit', locator: 'bcdefa2345678' }],
        evidence: [{ type: 'commit', locator: 'bcdefa2345678' }],
        review_status: 'draft',
        sensitivity: 'internal',
        sync_policy: 'allowlisted',
        dashboard: {
          title: 'Decision record',
          summary: 'Approved structured decision summary.',
          status: 'active',
          items: [],
        },
      },
      '# Decision\n\nApproved source-free record.\n',
    );
    const artifact = {
      id: 'decision-bridge-test',
      type: 'decision' as const,
      path: 'decisions/decision-bridge-test.md',
      sha256: checksum(approvedContent),
      size: new TextEncoder().encode(approvedContent).byteLength,
      schemaVersion: '0.1' as const,
      sensitivity: 'internal' as const,
      revision: now,
    };
    const manifest = {
      protocolVersion: '0.1' as const,
      schemaVersion: '0.1' as const,
      syncId: randomUUID(),
      repositoryId,
      repository: 'mathofdynamic/TRACE',
      executionOrigin: 'local' as const,
      traceVersion: '0.1.0',
      createdAt: now,
      baseOperationId: completedOperationId,
      git: { branch: 'main', headCommit: 'bcdefa2345678' },
      artifacts: [artifact],
      sourceCodeIncluded: false as const,
      codeSnippetsIncluded: false as const,
    };
    const negotiated = await negotiateSync(db, connection, manifest);
    expect(negotiated.status).toBe(200);
    const operationId = (negotiated.body as { operationId: string }).operationId;
    await expect(
      stageSyncArtifact(db, connection, {
        operationId,
        artifact,
        content: `${approvedContent}\nmutated after negotiation`,
      }),
    ).resolves.toMatchObject({ status: 422 });
    const summary = await getDashboardSummary(db, userId);
    expect(summary.repositories[0]?.latestSync?.operationId).toBe(completedOperationId);
    expect(summary.decisions).toHaveLength(0);
    expect(summary.attention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'sync-failed',
          repositoryId,
          classification: 'deterministic',
        }),
      ]),
    );
  });

  it('invalidates a revoked credential without removing synchronized intelligence', async () => {
    await db
      .update(schema.cliConnections)
      .set({ revokedAt: new Date() })
      .where((await import('drizzle-orm')).eq(schema.cliConnections.id, connection.id));
    await expect(
      authenticateCliRequest(
        db,
        new Request('https://trace.test/api/sync/status', {
          headers: { authorization: `Bearer ${token}` },
        }),
        'sync:write',
      ),
    ).resolves.toBeNull();
    const summary = await getDashboardSummary(db, userId);
    expect(summary.repositories[0]?.latestSync?.operationId).toBe(completedOperationId);
  });
});
