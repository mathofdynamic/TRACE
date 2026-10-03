import { createHash } from 'node:crypto';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { d1Schema, type TraceD1Database } from '@trace/db';
import {
  checksum,
  parseArtifact,
  syncArtifactUploadSchema,
  syncManifestSchema,
  type SyncManifest,
} from '@trace/schema';

type D1Connection = typeof d1Schema.cliConnections.$inferSelect;

async function runD1Batch(db: TraceD1Database, queries: unknown[]) {
  if (!queries.length) return;
  // D1 batches are atomic, but have a bounded statement count. Keeping each
  // batch below the platform limit also bounds retry cost for large manifests.
  for (let offset = 0; offset < queries.length; offset += 50) {
    await db.batch(queries.slice(offset, offset + 50) as never);
  }
}

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

export async function negotiateD1Sync(
  db: TraceD1Database,
  connection: D1Connection,
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
    .from(d1Schema.githubRepositories)
    .where(
      and(
        eq(d1Schema.githubRepositories.id, manifest.repositoryId),
        eq(d1Schema.githubRepositories.organizationId, connection.organizationId),
        eq(d1Schema.githubRepositories.state, 'active'),
      ),
    )
    .limit(1);
  if (!repository || repository.fullName.toLowerCase() !== manifest.repository.toLowerCase()) {
    return {
      status: 403 as const,
      body: { error: 'Repository is not connected to this workspace.' },
    };
  }
  const [recent] = await db
    .select({ value: count() })
    .from(d1Schema.syncOperations)
    .where(
      and(
        eq(d1Schema.syncOperations.connectionId, connection.id),
        gte(d1Schema.syncOperations.createdAt, new Date(Date.now() - RATE_WINDOW_MS)),
      ),
    );
  if ((recent?.value ?? 0) >= MAX_OPERATIONS_PER_WINDOW) {
    return {
      status: 429 as const,
      body: { error: 'Sync rate limit exceeded. Try again shortly.' },
    };
  }

  const idempotencyKey = canonicalManifestHash(manifest);
  const [existing] = await db
    .select()
    .from(d1Schema.syncOperations)
    .where(
      and(
        eq(d1Schema.syncOperations.organizationId, connection.organizationId),
        eq(d1Schema.syncOperations.repositoryId, repository.id),
        eq(d1Schema.syncOperations.idempotencyKey, idempotencyKey),
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
      .select({ artifactId: d1Schema.syncUploads.artifactId })
      .from(d1Schema.syncUploads)
      .where(eq(d1Schema.syncUploads.operationId, existing.id));
    const uploaded = new Set(uploads.map((upload) => upload.artifactId));
    const [previousOperation] = await db
      .select({ id: d1Schema.syncOperations.id })
      .from(d1Schema.syncOperations)
      .where(
        and(
          eq(d1Schema.syncOperations.repositoryId, existing.repositoryId),
          eq(d1Schema.syncOperations.status, 'completed'),
        ),
      )
      .orderBy(desc(d1Schema.syncOperations.completedAt))
      .limit(1);
    const reusable = previousOperation
      ? await db
          .select({
            artifactId: d1Schema.syncedArtifacts.artifactId,
            path: d1Schema.syncedArtifacts.path,
            checksum: d1Schema.syncedArtifacts.checksum,
          })
          .from(d1Schema.syncedArtifacts)
          .where(eq(d1Schema.syncedArtifacts.operationId, previousOperation.id))
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
    .select({ id: d1Schema.syncOperations.id })
    .from(d1Schema.syncOperations)
    .where(
      and(
        eq(d1Schema.syncOperations.repositoryId, repository.id),
        eq(d1Schema.syncOperations.status, 'completed'),
      ),
    )
    .orderBy(desc(d1Schema.syncOperations.completedAt))
    .limit(1);
  if (
    (latestOperation && manifest.baseOperationId !== latestOperation.id) ||
    (!latestOperation && manifest.baseOperationId)
  ) {
    await db.insert(d1Schema.auditEvents).values({
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
        .from(d1Schema.syncedArtifacts)
        .where(eq(d1Schema.syncedArtifacts.operationId, latestOperation.id))
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
    await db.insert(d1Schema.auditEvents).values({
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
  const [active] = await db
    .select({ value: count() })
    .from(d1Schema.syncOperations)
    .where(
      and(
        eq(d1Schema.syncOperations.repositoryId, repository.id),
        inArray(d1Schema.syncOperations.status, ['negotiating', 'uploading', 'validating']),
      ),
    );
  if ((active?.value ?? 0) >= MAX_ACTIVE_OPERATIONS_PER_REPOSITORY) {
    return {
      status: 409 as const,
      body: { error: 'Too many sync operations are active for this repository.' },
    };
  }
  const [operation] = await db
    .insert(d1Schema.syncOperations)
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
    .returning({ id: d1Schema.syncOperations.id });
  if (!operation) throw new Error('Sync operation could not be created.');
  await db.insert(d1Schema.auditEvents).values({
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

export async function stageD1SyncArtifact(
  db: TraceD1Database,
  connection: D1Connection,
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
    .from(d1Schema.syncOperations)
    .where(
      and(
        eq(d1Schema.syncOperations.id, upload.operationId),
        eq(d1Schema.syncOperations.connectionId, connection.id),
        eq(d1Schema.syncOperations.organizationId, connection.organizationId),
        eq(d1Schema.syncOperations.status, 'uploading'),
      ),
    )
    .limit(1);
  if (!operation)
    return { status: 404 as const, body: { error: 'Active sync operation was not found.' } };
  const reject = async (errorCode: string, message: string) => {
    await runD1Batch(db, [
      db
        .update(d1Schema.syncOperations)
        .set({ status: 'failed', errorCode, updatedAt: new Date() })
        .where(eq(d1Schema.syncOperations.id, operation.id)),
      db.insert(d1Schema.auditEvents).values({
        organizationId: connection.organizationId,
        actorUserId: connection.userId,
        action: 'local.sync.artifact_rejected',
        subjectType: 'sync_operation',
        subjectId: operation.id,
        metadata: {
          errorCode,
          artifactId: upload.artifact.id,
          repositoryId: operation.repositoryId,
        },
      }),
    ]);
    return { status: 422 as const, body: { error: message } };
  };
  const manifest = syncManifestSchema.parse(operation.manifest);
  const expected = manifest.artifacts.find((artifact) => artifact.id === upload.artifact.id);
  const bytes = new TextEncoder().encode(upload.content).byteLength;
  if (
    !expected ||
    expected.path !== upload.artifact.path ||
    expected.sha256 !== upload.artifact.sha256 ||
    expected.size !== bytes ||
    checksum(upload.content) !== expected.sha256
  )
    return reject('manifest_mismatch', 'Artifact does not match the negotiated manifest.');
  if (hasForbiddenContent(upload.content))
    return reject(
      'forbidden_content',
      'Artifact contains code snippets, executable HTML, or a credential-like value.',
    );
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
    `${metadata.repository.owner.toLowerCase()}/${metadata.repository.name.toLowerCase()}` !==
      manifest.repository.toLowerCase() ||
    metadata.sync_policy === 'local_only' ||
    metadata.sensitivity === 'confidential' ||
    metadata.sensitivity === 'restricted' ||
    !metadata.dashboard
  )
    return reject('policy_rejected', 'Artifact metadata is not approved for dashboard sync.');
  await db
    .insert(d1Schema.syncUploads)
    .values({
      operationId: operation.id,
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
      target: [d1Schema.syncUploads.operationId, d1Schema.syncUploads.artifactId],
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

export async function completeD1Sync(
  db: TraceD1Database,
  connection: D1Connection,
  operationId: string,
) {
  const [operation] = await db
    .select()
    .from(d1Schema.syncOperations)
    .where(
      and(
        eq(d1Schema.syncOperations.id, operationId),
        eq(d1Schema.syncOperations.connectionId, connection.id),
        eq(d1Schema.syncOperations.organizationId, connection.organizationId),
      ),
    )
    .limit(1);
  if (!operation) return { status: 404 as const, body: { error: 'Sync operation was not found.' } };
  if (operation.status === 'completed')
    return { status: 200 as const, body: { completed: true, operationId, idempotent: true } };
  if (operation.status !== 'uploading' && operation.status !== 'completing')
    return {
      status: 409 as const,
      body: { error: 'Sync operation cannot be completed from its current state.' },
    };

  // D1 does not support BEGIN/COMMIT through its SQL API. Claim the operation
  // with a conditional write, then use atomic D1 batches for each write phase.
  // A retry can safely resume an operation left in `completing` after a worker
  // interruption because every write is idempotent or uniquely constrained.
  const staleCompleting =
    operation.status === 'completing' && operation.updatedAt.getTime() < Date.now() - 30_000;
  const [claimed] = await db
    .update(d1Schema.syncOperations)
    .set({ status: 'completing', updatedAt: new Date() })
    .where(
      and(
        eq(d1Schema.syncOperations.id, operation.id),
        eq(d1Schema.syncOperations.status, staleCompleting ? 'completing' : 'uploading'),
      ),
    )
    .returning({ id: d1Schema.syncOperations.id });
  if (!claimed) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const [current] = await db
        .select({ status: d1Schema.syncOperations.status })
        .from(d1Schema.syncOperations)
        .where(eq(d1Schema.syncOperations.id, operation.id))
        .limit(1);
      if (current?.status === 'completed')
        return { status: 200 as const, body: { completed: true, operationId, idempotent: true } };
      if (current?.status !== 'completing') break;
    }
    return {
      status: 409 as const,
      body: { error: 'Sync operation is being completed by another request.' },
    };
  }

  try {
    const manifest = syncManifestSchema.parse(operation.manifest);
    const uploads = await db
      .select()
      .from(d1Schema.syncUploads)
      .where(eq(d1Schema.syncUploads.operationId, operation.id));
    const uploadById = new Map(uploads.map((upload) => [upload.artifactId, upload]));
    const [previousOperation] = await db
      .select({ id: d1Schema.syncOperations.id })
      .from(d1Schema.syncOperations)
      .where(
        and(
          eq(d1Schema.syncOperations.repositoryId, operation.repositoryId),
          eq(d1Schema.syncOperations.status, 'completed'),
        ),
      )
      .orderBy(desc(d1Schema.syncOperations.completedAt))
      .limit(1);
    const previous = previousOperation
      ? await db
          .select()
          .from(d1Schema.syncedArtifacts)
          .where(eq(d1Schema.syncedArtifacts.operationId, previousOperation.id))
      : [];
    const previousById = new Map(previous.map((artifact) => [artifact.artifactId, artifact]));
    const snapshot = manifest.artifacts.map((expected) => {
      const candidate = uploadById.get(expected.id) ?? previousById.get(expected.id);
      return candidate && candidate.path === expected.path && candidate.checksum === expected.sha256
        ? candidate
        : null;
    });
    if (snapshot.some((artifact) => !artifact)) {
      await db
        .update(d1Schema.syncOperations)
        .set({ status: 'uploading', updatedAt: new Date() })
        .where(eq(d1Schema.syncOperations.id, operation.id));
      return {
        status: 409 as const,
        body: { error: 'Not all negotiated artifacts have been uploaded.' },
      };
    }

    const completeSnapshot = snapshot.filter((artifact): artifact is NonNullable<typeof artifact> =>
      Boolean(artifact),
    );
    const artifactWrites = completeSnapshot.map((artifact) =>
      db
        .insert(d1Schema.syncedArtifacts)
        .values({
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
        })
        .onConflictDoNothing({
          target: [d1Schema.syncedArtifacts.operationId, d1Schema.syncedArtifacts.artifactId],
        }),
    );
    await runD1Batch(db, artifactWrites);

    const analysisArtifacts = completeSnapshot.filter(
      (artifact) => artifact.artifactType === 'analysis',
    );
    const analysisRunsByKey = new Map<
      string,
      { artifact: (typeof analysisArtifacts)[number]; idempotencyKey: string }
    >();
    const analysisWrites = analysisArtifacts.map((artifact) => {
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
      analysisRunsByKey.set(idempotencyKey, { artifact, idempotencyKey });
      return db
        .insert(d1Schema.analysisRuns)
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
          target: d1Schema.analysisRuns.idempotencyKey,
          set: {
            result: {
              title: projection.title,
              summary: projection.summary,
              origin: 'local',
              artifactId: artifact.artifactId,
            },
            updatedAt: new Date(),
          },
        });
    });
    await runD1Batch(db, analysisWrites);

    const findingWrites: unknown[] = [];
    for (const { artifact, idempotencyKey } of analysisRunsByKey.values()) {
      const [run] = await db
        .select({ id: d1Schema.analysisRuns.id })
        .from(d1Schema.analysisRuns)
        .where(eq(d1Schema.analysisRuns.idempotencyKey, idempotencyKey))
        .limit(1);
      if (!run) continue;
      const projection = artifact.projection as {
        items?: Array<{
          id: string;
          title: string;
          detail: string;
          severity?: string;
          classification?: string;
          evidence?: string[];
        }>;
      };
      for (const item of projection.items ?? []) {
        findingWrites.push(
          db
            .insert(d1Schema.analysisFindings)
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
              target: [
                d1Schema.analysisFindings.analysisRunId,
                d1Schema.analysisFindings.externalId,
              ],
              set: {
                title: item.title,
                detail: item.detail,
                severity: item.severity ?? 'info',
                classification: item.classification ?? 'deterministic',
                evidence: item.evidence ?? [],
                updatedAt: new Date(),
              },
            }),
        );
      }
    }
    const currentIdentity = new Set(
      snapshot
        .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
        .map((artifact) => `${artifact.artifactId}:${artifact.path}:${artifact.checksum}`),
    );
    const supersedeWrites: unknown[] = [];
    for (const artifact of previous) {
      if (!currentIdentity.has(`${artifact.artifactId}:${artifact.path}:${artifact.checksum}`)) {
        supersedeWrites.push(
          db
            .update(d1Schema.syncedArtifacts)
            .set({ supersededAt: new Date(), updatedAt: new Date() })
            .where(eq(d1Schema.syncedArtifacts.id, artifact.id)),
        );
      }
    }
    await runD1Batch(db, [
      ...findingWrites,
      ...supersedeWrites,
      db
        .update(d1Schema.syncOperations)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(d1Schema.syncOperations.id, operation.id),
            eq(d1Schema.syncOperations.status, 'completing'),
          ),
        ),
      db
        .update(d1Schema.githubRepositories)
        .set({ lastSynchronizedAt: new Date(), updatedAt: new Date() })
        .where(eq(d1Schema.githubRepositories.id, operation.repositoryId)),
      db.insert(d1Schema.auditEvents).values({
        organizationId: operation.organizationId,
        actorUserId: connection.userId,
        action: 'local.sync.completed',
        subjectType: 'repository',
        subjectId: operation.repositoryId,
      }),
    ]);
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
  } catch (error) {
    await db
      .update(d1Schema.syncOperations)
      .set({ status: 'uploading', updatedAt: new Date() })
      .where(
        and(
          eq(d1Schema.syncOperations.id, operation.id),
          eq(d1Schema.syncOperations.status, 'completing'),
        ),
      );
    throw error;
  }
}

export async function getD1SyncStatus(
  db: TraceD1Database,
  connection: D1Connection,
  repositoryId: string,
) {
  const [repository] = await db
    .select({ id: d1Schema.githubRepositories.id, fullName: d1Schema.githubRepositories.fullName })
    .from(d1Schema.githubRepositories)
    .where(
      and(
        eq(d1Schema.githubRepositories.id, repositoryId),
        eq(d1Schema.githubRepositories.organizationId, connection.organizationId),
      ),
    )
    .limit(1);
  if (!repository) return null;
  const [operation] = await db
    .select()
    .from(d1Schema.syncOperations)
    .where(
      and(
        eq(d1Schema.syncOperations.repositoryId, repositoryId),
        eq(d1Schema.syncOperations.organizationId, connection.organizationId),
        eq(d1Schema.syncOperations.status, 'completed'),
      ),
    )
    .orderBy(desc(d1Schema.syncOperations.completedAt))
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
