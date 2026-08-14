import { createHash } from 'node:crypto';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { schema } from '@trace/db';
import {
  checksum,
  parseArtifact,
  syncArtifactUploadSchema,
  syncManifestSchema,
  type SyncManifest,
} from '@trace/schema';
import type { RequestDatabase } from './workspace';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_OPERATIONS_PER_WINDOW = 30;
const MAX_ACTIVE_OPERATIONS_PER_REPOSITORY = 3;

function canonicalManifestHash(manifest: SyncManifest) {
  const canonical = {
    protocolVersion: manifest.protocolVersion,
    schemaVersion: manifest.schemaVersion,
    repositoryId: manifest.repositoryId,
    repository: manifest.repository.toLowerCase(),
    executionOrigin: manifest.executionOrigin,
    traceVersion: manifest.traceVersion,
    git: manifest.git,
    artifacts: [...manifest.artifacts].sort((left, right) => left.id.localeCompare(right.id)),
    sourceCodeIncluded: manifest.sourceCodeIncluded,
    codeSnippetsIncluded: manifest.codeSnippetsIncluded,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function hasForbiddenContent(content: string) {
  const patterns = [
    /```/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[opsu]_[A-Za-z0-9]{30,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /<script\b/i,
  ];
  const sourceLikeLines = content
    .split('\n')
    .filter((line) =>
      /^\s*(?:import|export|const|let|var|function|class|interface|enum)\b/.test(line),
    ).length;
  return patterns.some((pattern) => pattern.test(content)) || sourceLikeLines >= 2;
}

export async function negotiateSync(
  db: RequestDatabase,
  connection: typeof schema.cliConnections.$inferSelect,
  input: unknown,
) {
  const parsed = syncManifestSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: 400 as const,
      body: { error: 'Manifest is invalid.', issues: parsed.error.issues },
    };
  const manifest = parsed.data;
  const [repository] = await db
    .select()
    .from(schema.githubRepositories)
    .where(
      and(
        eq(schema.githubRepositories.id, manifest.repositoryId),
        eq(schema.githubRepositories.organizationId, connection.organizationId),
        eq(schema.githubRepositories.state, 'active'),
      ),
    )
    .limit(1);
  if (!repository || repository.fullName.toLowerCase() !== manifest.repository.toLowerCase()) {
    return {
      status: 403 as const,
      body: { error: 'Repository is not connected to this workspace.' },
    };
  }

  const [recentOperationCount] = await db
    .select({ value: count() })
    .from(schema.syncOperations)
    .where(
      and(
        eq(schema.syncOperations.connectionId, connection.id),
        gte(schema.syncOperations.createdAt, new Date(Date.now() - RATE_WINDOW_MS)),
      ),
    );
  if ((recentOperationCount?.value ?? 0) >= MAX_OPERATIONS_PER_WINDOW) {
    return {
      status: 429 as const,
      body: { error: 'Sync rate limit exceeded. Try again shortly.' },
    };
  }

  const idempotencyKey = canonicalManifestHash(manifest);
  const [existing] = await db
    .select()
    .from(schema.syncOperations)
    .where(
      and(
        eq(schema.syncOperations.organizationId, connection.organizationId),
        eq(schema.syncOperations.repositoryId, repository.id),
        eq(schema.syncOperations.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.status === 'completed') {
      return {
        status: 200 as const,
        body: {
          operationId: existing.id,
          status: existing.status,
          missing: [],
          conflicts: [],
          idempotent: true,
        },
      };
    }
    if (existing.status === 'failed') {
      return {
        status: 409 as const,
        body: {
          error:
            'This exact sync was rejected previously. Correct the local artifact or policy, then generate a new manifest.',
          operationId: existing.id,
          errorCode: existing.errorCode,
        },
      };
    }
    const uploads = await db
      .select({ artifactId: schema.syncUploads.artifactId })
      .from(schema.syncUploads)
      .where(eq(schema.syncUploads.operationId, existing.id));
    const uploaded = new Set(uploads.map((upload) => upload.artifactId));
    const [previousOperation] = await db
      .select({ id: schema.syncOperations.id })
      .from(schema.syncOperations)
      .where(
        and(
          eq(schema.syncOperations.repositoryId, existing.repositoryId),
          eq(schema.syncOperations.status, 'completed'),
        ),
      )
      .orderBy(desc(schema.syncOperations.completedAt))
      .limit(1);
    const reusable = previousOperation
      ? await db
          .select({
            artifactId: schema.syncedArtifacts.artifactId,
            path: schema.syncedArtifacts.path,
            checksum: schema.syncedArtifacts.checksum,
          })
          .from(schema.syncedArtifacts)
          .where(eq(schema.syncedArtifacts.operationId, previousOperation.id))
      : [];
    const reusableById = new Map(reusable.map((artifact) => [artifact.artifactId, artifact]));
    return {
      status: 200 as const,
      body: {
        operationId: existing.id,
        status: existing.status,
        missing: manifest.artifacts
          .filter((artifact) => {
            if (uploaded.has(artifact.id)) return false;
            const current = reusableById.get(artifact.id);
            return (
              !current || current.path !== artifact.path || current.checksum !== artifact.sha256
            );
          })
          .map((artifact) => artifact.id),
        conflicts: [],
        idempotent: true,
      },
    };
  }

  const [latestOperation] = await db
    .select({ id: schema.syncOperations.id })
    .from(schema.syncOperations)
    .where(
      and(
        eq(schema.syncOperations.repositoryId, repository.id),
        eq(schema.syncOperations.status, 'completed'),
      ),
    )
    .orderBy(desc(schema.syncOperations.completedAt))
    .limit(1);
  if (
    (latestOperation && manifest.baseOperationId !== latestOperation.id) ||
    (!latestOperation && manifest.baseOperationId)
  ) {
    await db.insert(schema.auditEvents).values({
      organizationId: connection.organizationId,
      actorUserId: connection.userId,
      action: 'local.sync.divergence_detected',
      subjectType: 'repository',
      subjectId: repository.id,
      metadata: {
        expectedBaseOperationId: latestOperation?.id ?? null,
        receivedBaseOperationId: manifest.baseOperationId,
      },
    });
    return {
      status: 409 as const,
      body: {
        error:
          'The dashboard has a newer sync base. Run trace sync status, inspect it, then acknowledge it with trace sync status --accept-dashboard-base.',
        currentOperationId: latestOperation?.id ?? null,
      },
    };
  }
  const currentArtifacts = latestOperation
    ? await db
        .select()
        .from(schema.syncedArtifacts)
        .where(eq(schema.syncedArtifacts.operationId, latestOperation.id))
    : [];
  const currentById = new Map(currentArtifacts.map((artifact) => [artifact.artifactId, artifact]));
  const currentByPath = new Map(currentArtifacts.map((artifact) => [artifact.path, artifact]));
  const conflicts = manifest.artifacts.flatMap((artifact) => {
    const current = currentById.get(artifact.id) ?? currentByPath.get(artifact.path);
    if (!current || current.checksum === artifact.sha256) return [];
    if (
      current.artifactId !== artifact.id ||
      current.path !== artifact.path ||
      new Date(artifact.revision) <= current.generatedAt
    ) {
      return [
        {
          artifactId: artifact.id,
          path: artifact.path,
          reason: 'The dashboard has a different artifact identity or an equal/newer revision.',
        },
      ];
    }
    return [];
  });
  if (conflicts.length) {
    await db.insert(schema.auditEvents).values({
      organizationId: connection.organizationId,
      actorUserId: connection.userId,
      action: 'local.sync.divergence_detected',
      subjectType: 'repository',
      subjectId: repository.id,
      metadata: { conflictCount: conflicts.length },
    });
    return { status: 409 as const, body: { error: 'Sync divergence requires review.', conflicts } };
  }
  const missing = manifest.artifacts
    .filter((artifact) => {
      const current = currentById.get(artifact.id);
      return !current || current.path !== artifact.path || current.checksum !== artifact.sha256;
    })
    .map((artifact) => artifact.id);
  const [activeOperationCount] = await db
    .select({ value: count() })
    .from(schema.syncOperations)
    .where(
      and(
        eq(schema.syncOperations.repositoryId, repository.id),
        inArray(schema.syncOperations.status, ['negotiating', 'uploading', 'validating']),
      ),
    );
  if ((activeOperationCount?.value ?? 0) >= MAX_ACTIVE_OPERATIONS_PER_REPOSITORY) {
    return {
      status: 409 as const,
      body: { error: 'Too many sync operations are active for this repository.' },
    };
  }
  const [operation] = await db
    .insert(schema.syncOperations)
    .values({
      organizationId: connection.organizationId,
      repositoryId: repository.id,
      connectionId: connection.id,
      syncId: manifest.syncId,
      idempotencyKey,
      status: 'uploading',
      branch: manifest.git.branch,
      headCommit: manifest.git.headCommit,
      traceVersion: manifest.traceVersion,
      schemaVersion: manifest.schemaVersion,
      manifest,
      totalBytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.size, 0),
      artifactCount: manifest.artifacts.length,
    })
    .returning({ id: schema.syncOperations.id });
  if (!operation) throw new Error('Sync operation could not be created.');
  await db.insert(schema.auditEvents).values({
    organizationId: connection.organizationId,
    actorUserId: connection.userId,
    action: 'local.sync.started',
    subjectType: 'sync_operation',
    subjectId: operation.id,
    metadata: { repositoryId: repository.id, artifactCount: manifest.artifacts.length },
  });
  return {
    status: 200 as const,
    body: {
      operationId: operation.id,
      status: 'uploading',
      missing,
      conflicts: [],
      idempotent: false,
    },
  };
}

export async function stageSyncArtifact(
  db: RequestDatabase,
  connection: typeof schema.cliConnections.$inferSelect,
  input: unknown,
) {
  const parsed = syncArtifactUploadSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: 400 as const,
      body: { error: 'Artifact upload is invalid.', issues: parsed.error.issues },
    };
  const upload = parsed.data;
  const [operation] = await db
    .select()
    .from(schema.syncOperations)
    .where(
      and(
        eq(schema.syncOperations.id, upload.operationId),
        eq(schema.syncOperations.connectionId, connection.id),
        eq(schema.syncOperations.organizationId, connection.organizationId),
        eq(schema.syncOperations.status, 'uploading'),
      ),
    )
    .limit(1);
  if (!operation)
    return { status: 404 as const, body: { error: 'Active sync operation was not found.' } };
  const activeOperation = operation;
  async function reject(errorCode: string, message: string) {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.syncOperations)
        .set({ status: 'failed', errorCode, updatedAt: new Date() })
        .where(eq(schema.syncOperations.id, activeOperation.id));
      await tx.insert(schema.auditEvents).values({
        organizationId: connection.organizationId,
        actorUserId: connection.userId,
        action: 'local.sync.artifact_rejected',
        subjectType: 'sync_operation',
        subjectId: activeOperation.id,
        metadata: {
          errorCode,
          artifactId: upload.artifact.id,
          repositoryId: activeOperation.repositoryId,
        },
      });
    });
    return { status: 422 as const, body: { error: message } };
  }
  const manifest = syncManifestSchema.parse(activeOperation.manifest);
  const expected = manifest.artifacts.find((artifact) => artifact.id === upload.artifact.id);
  const bytes = new TextEncoder().encode(upload.content).byteLength;
  if (
    !expected ||
    expected.path !== upload.artifact.path ||
    expected.sha256 !== upload.artifact.sha256 ||
    expected.size !== bytes ||
    checksum(upload.content) !== expected.sha256
  ) {
    return reject('manifest_mismatch', 'Artifact does not match the negotiated manifest.');
  }
  if (hasForbiddenContent(upload.content)) {
    return reject(
      'forbidden_content',
      'Artifact contains code snippets, executable HTML, or a credential-like value.',
    );
  }
  let artifact;
  try {
    artifact = parseArtifact(upload.content);
  } catch {
    return reject('invalid_artifact', 'Artifact content is not valid TRACE Markdown.');
  }
  const metadata = artifact.metadata;
  if (
    metadata.id !== expected.id ||
    metadata.artifact_type !== expected.type ||
    metadata.schema_version !== expected.schemaVersion ||
    metadata.sensitivity !== expected.sensitivity ||
    metadata.execution_origin !== 'local' ||
    metadata.repository.owner.toLowerCase() + '/' + metadata.repository.name.toLowerCase() !==
      manifest.repository.toLowerCase() ||
    metadata.sync_policy === 'local_only' ||
    metadata.sensitivity === 'confidential' ||
    metadata.sensitivity === 'restricted' ||
    !metadata.dashboard
  ) {
    return reject('policy_rejected', 'Artifact metadata is not approved for dashboard sync.');
  }
  await db
    .insert(schema.syncUploads)
    .values({
      operationId: activeOperation.id,
      artifactId: metadata.id,
      artifactType: metadata.artifact_type,
      path: expected.path,
      checksum: expected.sha256,
      sizeBytes: bytes,
      sensitivity: metadata.sensitivity,
      schemaVersion: metadata.schema_version,
      content: upload.content,
      metadata,
      projection: metadata.dashboard,
    })
    .onConflictDoUpdate({
      target: [schema.syncUploads.operationId, schema.syncUploads.artifactId],
      set: {
        content: upload.content,
        checksum: expected.sha256,
        sizeBytes: bytes,
        metadata,
        projection: metadata.dashboard,
        updatedAt: new Date(),
      },
    });
  return { status: 200 as const, body: { accepted: true, artifactId: metadata.id } };
}

export async function completeSync(
  db: RequestDatabase,
  connection: typeof schema.cliConnections.$inferSelect,
  operationId: string,
) {
  return db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(schema.syncOperations)
      .where(
        and(
          eq(schema.syncOperations.id, operationId),
          eq(schema.syncOperations.connectionId, connection.id),
          eq(schema.syncOperations.organizationId, connection.organizationId),
        ),
      )
      .for('update')
      .limit(1);
    if (!operation)
      return { status: 404 as const, body: { error: 'Sync operation was not found.' } };
    if (operation.status === 'completed')
      return { status: 200 as const, body: { completed: true, operationId, idempotent: true } };
    if (operation.status !== 'uploading')
      return {
        status: 409 as const,
        body: { error: 'Sync operation cannot be completed from its current state.' },
      };
    const manifest = syncManifestSchema.parse(operation.manifest);
    const uploads = await tx
      .select()
      .from(schema.syncUploads)
      .where(eq(schema.syncUploads.operationId, operation.id));
    const uploadById = new Map(uploads.map((upload) => [upload.artifactId, upload]));
    const [previousOperation] = await tx
      .select({ id: schema.syncOperations.id })
      .from(schema.syncOperations)
      .where(
        and(
          eq(schema.syncOperations.repositoryId, operation.repositoryId),
          eq(schema.syncOperations.status, 'completed'),
        ),
      )
      .orderBy(desc(schema.syncOperations.completedAt))
      .limit(1);
    const previous = previousOperation
      ? await tx
          .select()
          .from(schema.syncedArtifacts)
          .where(eq(schema.syncedArtifacts.operationId, previousOperation.id))
      : [];
    const previousById = new Map(previous.map((artifact) => [artifact.artifactId, artifact]));
    const snapshot = manifest.artifacts.map((expected) => {
      const candidate = uploadById.get(expected.id) ?? previousById.get(expected.id);
      return candidate && candidate.path === expected.path && candidate.checksum === expected.sha256
        ? candidate
        : null;
    });
    if (snapshot.some((artifact) => !artifact)) {
      return {
        status: 409 as const,
        body: { error: 'Not all negotiated artifacts have been uploaded.' },
      };
    }

    for (const artifact of snapshot) {
      if (!artifact) continue;
      await tx.insert(schema.syncedArtifacts).values({
        organizationId: operation.organizationId,
        repositoryId: operation.repositoryId,
        operationId: operation.id,
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        path: artifact.path,
        checksum: artifact.checksum,
        sizeBytes: artifact.sizeBytes,
        sensitivity: artifact.sensitivity,
        schemaVersion: artifact.schemaVersion,
        executionOrigin: 'local',
        content: artifact.content,
        metadata: artifact.metadata,
        projection: artifact.projection,
        generatedAt: new Date(String((artifact.metadata as { updated_at?: unknown }).updated_at)),
      });
      if (artifact.artifactType === 'analysis') {
        const projection = artifact.projection as {
          title?: string;
          summary?: string;
          status?: string;
          items?: Array<{
            id: string;
            title: string;
            detail: string;
            severity?: string;
            classification?: string;
            evidence?: string[];
          }>;
        };
        const idempotencyKey = `local-sync:${operation.repositoryId}:${artifact.artifactId}:${artifact.checksum}`;
        const [run] = await tx
          .insert(schema.analysisRuns)
          .values({
            organizationId: operation.organizationId,
            repositoryId: operation.repositoryId,
            idempotencyKey,
            profile: 'local-sync',
            schemaVersion: artifact.schemaVersion,
            headSha: operation.headCommit,
            status: projection.status === 'failed' ? 'failed' : 'completed',
            result: {
              title: projection.title,
              summary: projection.summary,
              origin: 'local',
              artifactId: artifact.artifactId,
            },
          })
          .onConflictDoUpdate({
            target: schema.analysisRuns.idempotencyKey,
            set: {
              result: {
                title: projection.title,
                summary: projection.summary,
                origin: 'local',
                artifactId: artifact.artifactId,
              },
              updatedAt: new Date(),
            },
          })
          .returning({ id: schema.analysisRuns.id });
        if (run) {
          for (const item of projection.items ?? []) {
            await tx
              .insert(schema.analysisFindings)
              .values({
                analysisRunId: run.id,
                externalId: item.id,
                title: item.title,
                detail: item.detail,
                severity: item.severity ?? 'info',
                classification: item.classification ?? 'deterministic',
                evidence: item.evidence ?? [],
              })
              .onConflictDoUpdate({
                target: [schema.analysisFindings.analysisRunId, schema.analysisFindings.externalId],
                set: {
                  title: item.title,
                  detail: item.detail,
                  severity: item.severity ?? 'info',
                  classification: item.classification ?? 'deterministic',
                  evidence: item.evidence ?? [],
                  updatedAt: new Date(),
                },
              });
          }
        }
      }
    }
    const currentIdentity = new Set(
      snapshot
        .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
        .map((artifact) => `${artifact.artifactId}:${artifact.path}:${artifact.checksum}`),
    );
    for (const artifact of previous) {
      if (!currentIdentity.has(`${artifact.artifactId}:${artifact.path}:${artifact.checksum}`)) {
        await tx
          .update(schema.syncedArtifacts)
          .set({ supersededAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.syncedArtifacts.id, artifact.id));
      }
    }
    await tx
      .update(schema.syncOperations)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.syncOperations.id, operation.id));
    await tx
      .update(schema.githubRepositories)
      .set({ lastSynchronizedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.githubRepositories.id, operation.repositoryId));
    await tx.insert(schema.auditEvents).values({
      organizationId: operation.organizationId,
      actorUserId: connection.userId,
      action: 'local.sync.completed',
      subjectType: 'repository',
      subjectId: operation.repositoryId,
    });
    return {
      status: 200 as const,
      body: {
        completed: true,
        operationId,
        artifacts: snapshot.length,
        headCommit: operation.headCommit,
        syncedAt: new Date().toISOString(),
      },
    };
  });
}

export async function getSyncStatus(
  db: RequestDatabase,
  connection: typeof schema.cliConnections.$inferSelect,
  repositoryId: string,
) {
  const [repository] = await db
    .select({ id: schema.githubRepositories.id, fullName: schema.githubRepositories.fullName })
    .from(schema.githubRepositories)
    .where(
      and(
        eq(schema.githubRepositories.id, repositoryId),
        eq(schema.githubRepositories.organizationId, connection.organizationId),
      ),
    )
    .limit(1);
  if (!repository) return null;
  const [operation] = await db
    .select()
    .from(schema.syncOperations)
    .where(
      and(
        eq(schema.syncOperations.repositoryId, repositoryId),
        eq(schema.syncOperations.status, 'completed'),
      ),
    )
    .orderBy(desc(schema.syncOperations.completedAt))
    .limit(1);
  return {
    repository,
    lastSync: operation
      ? {
          operationId: operation.id,
          branch: operation.branch,
          headCommit: operation.headCommit,
          artifactCount: operation.artifactCount,
          completedAt: operation.completedAt?.toISOString() ?? null,
          traceVersion: operation.traceVersion,
          schemaVersion: operation.schemaVersion,
        }
      : null,
  };
}
