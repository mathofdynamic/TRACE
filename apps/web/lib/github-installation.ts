import { eq } from 'drizzle-orm';
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

export async function persistGitHubInstallationSnapshot(input: {
  db: AnyRequestDatabase;
  user: TraceUser;
  snapshot: InstallationSnapshotResult;
  action: InstallationPersistenceAction;
}) {
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
    const [installation] = await db
      .insert(d1Schema.githubInstallations)
      .values({
        organizationId: workspace.id,
        githubInstallationId: providerId,
        accountLogin: installationSnapshot.accountLogin,
        accountType: installationSnapshot.accountType,
        state,
        suspendedAt: installationSnapshot.suspendedAt
          ? new Date(installationSnapshot.suspendedAt)
          : null,
      })
      .onConflictDoUpdate({
        target: d1Schema.githubInstallations.githubInstallationId,
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
      .returning({ id: d1Schema.githubInstallations.id });
    if (!installation) throw new Error('GitHub App installation could not be persisted.');

    for (const repository of input.snapshot.repositories) {
      await db
        .insert(d1Schema.githubRepositories)
        .values({
          organizationId: workspace.id,
          installationId: installation.id,
          githubRepositoryId: String(repository.id),
          owner: repository.owner,
          name: repository.name,
          fullName: repository.fullName,
          defaultBranch: repository.defaultBranch,
          visibility: repository.visibility,
          state: 'available',
          lastSynchronizedAt: now,
        })
        .onConflictDoUpdate({
          target: d1Schema.githubRepositories.githubRepositoryId,
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
        .insert(d1Schema.githubInstallationRepositories)
        .values({
          installationId: installation.id,
          githubRepositoryId: String(repository.id),
          permissions: repository.permissions,
        })
        .onConflictDoUpdate({
          target: [
            d1Schema.githubInstallationRepositories.installationId,
            d1Schema.githubInstallationRepositories.githubRepositoryId,
          ],
          set: { permissions: repository.permissions, updatedAt: now },
        });
    }
    await db.insert(d1Schema.auditEvents).values({
      organizationId: workspace.id,
      actorUserId: input.user.id,
      action: input.action,
      subjectType: 'github_installation',
      subjectId: installation.id,
    });
    return { installationId: installation.id, workspaceId: workspace.id };
  }

  const [installation] = await input.db
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
    await input.db
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
    await input.db
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
  await input.db.insert(schema.auditEvents).values({
    organizationId: workspace.id,
    actorUserId: input.user.id,
    action: input.action,
    subjectType: 'github_installation',
    subjectId: installation.id,
  });
  return { installationId: installation.id, workspaceId: workspace.id };
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
