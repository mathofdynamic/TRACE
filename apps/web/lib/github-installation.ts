import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TraceUser } from '@trace/auth';
import {
  d1Schema,
  isD1Database,
  schema,
  type TraceD1Database,
  type TracePostgresDatabase,
} from '@trace/db';
import type { GitHubInstallationSnapshot, GitHubRepositorySnapshot } from '@trace/github';
import type { AnyRequestDatabase } from './request-database';
import { ensureGitHubWorkspace, findGitHubWorkspace } from './workspace';
import { d1CatalogStatements } from './d1-github-catalog';

type InstallationPersistenceAction = 'github.connected' | 'github.reconciled';

type InstallationSnapshotResult = {
  installation: GitHubInstallationSnapshot;
  repositories: GitHubRepositorySnapshot[];
};

type ExistingInstallation = {
  id: string;
  organizationId: string;
  accountLogin: string;
  accountType: string;
};

function assertInstallationOwnership(
  existing: ExistingInstallation | undefined,
  workspaceId: string | undefined,
  snapshot: GitHubInstallationSnapshot,
) {
  if (!existing) return;
  if (
    existing.accountLogin !== snapshot.accountLogin ||
    existing.accountType !== snapshot.accountType
  ) {
    throw new Error('GitHub App installation ownership mismatch.');
  }
  if (!workspaceId || existing.organizationId !== workspaceId) {
    throw new Error('GitHub App installation workspace mapping mismatch.');
  }
}

async function getExistingD1Installation(db: TraceD1Database, providerId: string) {
  const [installation] = await db
    .select({
      id: d1Schema.githubInstallations.id,
      organizationId: d1Schema.githubInstallations.organizationId,
      accountLogin: d1Schema.githubInstallations.accountLogin,
      accountType: d1Schema.githubInstallations.accountType,
    })
    .from(d1Schema.githubInstallations)
    .where(eq(d1Schema.githubInstallations.githubInstallationId, providerId))
    .limit(1);
  return installation;
}

async function getExistingPostgresInstallation(db: TracePostgresDatabase, providerId: number) {
  const [installation] = await db
    .select({
      id: schema.githubInstallations.id,
      organizationId: schema.githubInstallations.organizationId,
      accountLogin: schema.githubInstallations.accountLogin,
      accountType: schema.githubInstallations.accountType,
    })
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.githubInstallationId, providerId))
    .limit(1);
  return installation;
}

type PersistedRepository = {
  providerId: string | number;
  fullName: string;
  organizationId: string;
  installationId: string | null;
  accessInstallationId: string | null;
};

export function assertPersistedInstallationCatalog(
  snapshot: InstallationSnapshotResult,
  rows: PersistedRepository[],
  installationId: string,
  workspaceId: string,
) {
  const expected = new Map(
    snapshot.repositories.map((repository) => [String(repository.id), repository]),
  );
  const current = rows.filter((row) => expected.has(String(row.providerId)));
  if (
    expected.size !== snapshot.repositories.length ||
    current.length !== expected.size ||
    new Set(current.map((row) => String(row.providerId))).size !== expected.size ||
    current.some(
      (row) =>
        row.fullName !== expected.get(String(row.providerId))?.fullName ||
        row.organizationId !== workspaceId ||
        row.installationId !== installationId ||
        row.accessInstallationId !== installationId,
    )
  )
    throw new Error('GitHub installation catalog persistence is incomplete.');
}

export async function persistGitHubInstallationSnapshot(input: {
  db: AnyRequestDatabase;
  user: TraceUser;
  snapshot: InstallationSnapshotResult;
  action: InstallationPersistenceAction;
  ownerMode?: boolean;
}) {
  const ids = input.snapshot.repositories.map((repository) => repository.id);
  if (
    ids.length > 500 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new Error('GitHub installation repository identities are invalid or duplicated.');
  const installationSnapshot = input.snapshot.installation;
  const providerId = String(installationSnapshot.id);
  const existing = isD1Database(input.db)
    ? await getExistingD1Installation(input.db, providerId)
    : await getExistingPostgresInstallation(input.db, installationSnapshot.id);
  const existingWorkspace = await findGitHubWorkspace(input.db, {
    login: installationSnapshot.accountLogin,
    type: installationSnapshot.accountType,
  });
  assertInstallationOwnership(existing, existingWorkspace?.id, installationSnapshot);
  if (existing && !existingWorkspace) {
    throw new Error('GitHub App installation workspace mapping is missing.');
  }

  const workspace = await ensureGitHubWorkspace(input.db, input.user, {
    login: installationSnapshot.accountLogin,
    type: installationSnapshot.accountType,
  });
  const now = new Date();
  const state = installationSnapshot.suspendedAt ? 'suspended' : 'active';

  if (isD1Database(input.db)) {
    const db = input.db;
    const installation = { id: existing?.id ?? crypto.randomUUID() };
    const timestamp = now.getTime();
    const queries = [
      db.$client
        .prepare(
          `INSERT INTO github_installations
        (id, organization_id, github_installation_id, account_login, account_type, state, suspended_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(github_installation_id) DO UPDATE SET
          organization_id=excluded.organization_id, account_login=excluded.account_login,
          account_type=excluded.account_type, state=excluded.state,
          suspended_at=excluded.suspended_at, updated_at=excluded.updated_at`,
        )
        .bind(
          installation.id,
          workspace.id,
          providerId,
          installationSnapshot.accountLogin,
          installationSnapshot.accountType,
          state,
          installationSnapshot.suspendedAt
            ? new Date(installationSnapshot.suspendedAt).getTime()
            : null,
          timestamp,
          timestamp,
        ),
      ...d1CatalogStatements(
        db,
        input.snapshot.repositories,
        workspace.id,
        installation.id,
        now,
        Boolean(input.ownerMode),
      ),
    ];
    // One native batch atomically commits installation and complete catalog with
    // three statements (five with removal reconciliation), independent of size.
    const results = (await db.$client.batch(queries)) as { success?: boolean }[];
    if (results.length !== queries.length || results.some((result) => result.success !== true))
      throw new Error('GitHub installation catalog persistence failed.');
    const [storedInstallation] = await db
      .select({ id: d1Schema.githubInstallations.id })
      .from(d1Schema.githubInstallations)
      .where(eq(d1Schema.githubInstallations.githubInstallationId, providerId))
      .limit(1);
    if (storedInstallation?.id !== installation.id)
      throw new Error('GitHub installation identity changed during reconciliation.');
    const persisted = await db
      .select({
        providerId: d1Schema.githubRepositories.githubRepositoryId,
        fullName: d1Schema.githubRepositories.fullName,
        organizationId: d1Schema.githubRepositories.organizationId,
        installationId: d1Schema.githubRepositories.installationId,
        accessInstallationId: sql<
          string | null
        >`${d1Schema.githubInstallationRepositories.installationId}`.as('access_installation_id'),
      })
      .from(d1Schema.githubRepositories)
      .leftJoin(
        d1Schema.githubInstallationRepositories,
        and(
          eq(
            d1Schema.githubInstallationRepositories.githubRepositoryId,
            d1Schema.githubRepositories.githubRepositoryId,
          ),
          eq(
            d1Schema.githubInstallationRepositories.installationId,
            d1Schema.githubRepositories.installationId,
          ),
        ),
      )
      .where(eq(d1Schema.githubRepositories.installationId, installation.id));
    assertPersistedInstallationCatalog(input.snapshot, persisted, installation.id, workspace.id);
    await db.insert(d1Schema.auditEvents).values({
      organizationId: workspace.id,
      actorUserId: input.user.id,
      action: input.action,
      subjectType: 'github_installation',
      subjectId: installation.id,
    });
    return { installationId: installation.id, workspaceId: workspace.id };
  }

  return input.db.transaction(async (db) => {
    const [installation] = await db
      .insert(schema.githubInstallations)
      .values({
        organizationId: workspace.id,
        githubInstallationId: installationSnapshot.id,
        accountLogin: installationSnapshot.accountLogin,
        accountType: installationSnapshot.accountType,
        state,
        suspendedAt: installationSnapshot.suspendedAt
          ? new Date(installationSnapshot.suspendedAt)
          : null,
      })
      .onConflictDoUpdate({
        target: schema.githubInstallations.githubInstallationId,
        set: {
          organizationId: workspace.id,
          accountLogin: installationSnapshot.accountLogin,
          accountType: installationSnapshot.accountType,
          state,
          suspendedAt: installationSnapshot.suspendedAt
            ? new Date(installationSnapshot.suspendedAt)
            : null,
          updatedAt: now,
        },
      })
      .returning({ id: schema.githubInstallations.id });
    if (!installation) throw new Error('GitHub App installation could not be persisted.');

    for (const repository of input.snapshot.repositories) {
      await db
        .insert(schema.githubRepositories)
        .values({
          organizationId: workspace.id,
          installationId: installation.id,
          githubRepositoryId: repository.id,
          owner: repository.owner,
          name: repository.name,
          fullName: repository.fullName,
          defaultBranch: repository.defaultBranch,
          visibility: repository.visibility,
          state: 'available',
          lastSynchronizedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.githubRepositories.githubRepositoryId,
          set: {
            organizationId: workspace.id,
            installationId: installation.id,
            owner: repository.owner,
            name: repository.name,
            fullName: repository.fullName,
            defaultBranch: repository.defaultBranch,
            visibility: repository.visibility,
            lastSynchronizedAt: now,
            updatedAt: now,
          },
        });
      await db
        .insert(schema.githubInstallationRepositories)
        .values({
          installationId: installation.id,
          githubRepositoryId: repository.id,
          permissions: repository.permissions,
        })
        .onConflictDoUpdate({
          target: [
            schema.githubInstallationRepositories.installationId,
            schema.githubInstallationRepositories.githubRepositoryId,
          ],
          set: { permissions: repository.permissions, updatedAt: now },
        });
    }
    const persisted = await db
      .select({
        providerId: schema.githubRepositories.githubRepositoryId,
        fullName: schema.githubRepositories.fullName,
        organizationId: schema.githubRepositories.organizationId,
        installationId: schema.githubRepositories.installationId,
        accessInstallationId: schema.githubInstallationRepositories.installationId,
      })
      .from(schema.githubRepositories)
      .leftJoin(
        schema.githubInstallationRepositories,
        and(
          eq(
            schema.githubInstallationRepositories.githubRepositoryId,
            schema.githubRepositories.githubRepositoryId,
          ),
          eq(
            schema.githubInstallationRepositories.installationId,
            schema.githubRepositories.installationId,
          ),
        ),
      )
      .where(eq(schema.githubRepositories.installationId, installation.id));
    assertPersistedInstallationCatalog(input.snapshot, persisted, installation.id, workspace.id);
    await db.insert(schema.auditEvents).values({
      organizationId: workspace.id,
      actorUserId: input.user.id,
      action: input.action,
      subjectType: 'github_installation',
      subjectId: installation.id,
    });
    return { installationId: installation.id, workspaceId: workspace.id };
  });
}

export type GitHubInstallationCandidate = {
  id: number;
  accountLogin: string;
  accountType: string;
  appId: number;
  suspendedAt: string | null;
};

export function chooseGitHubInstallation(
  candidates: readonly GitHubInstallationCandidate[],
  requestedId?: number,
) {
  if (requestedId !== undefined) {
    return candidates.find((candidate) => candidate.id === requestedId) ?? null;
  }
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}
