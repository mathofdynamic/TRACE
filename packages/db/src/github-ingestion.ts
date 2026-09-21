import { and, eq } from 'drizzle-orm';
import type { TraceGitHubEvent, GitHubIngestionResult, GitHubIngestionStore } from '@trace/core';
import { createTraceId } from './domain-types.js';
import * as d1Schema from './d1/schema.js';
import * as schema from './schema.js';
import type { TraceD1Database } from './d1.js';
import type { TracePostgresDatabase } from './index.js';

type PullRequestEvent = Extract<
  TraceGitHubEvent,
  {
    type: 'PullRequestOpened' | 'PullRequestUpdated' | 'PullRequestClosed' | 'PullRequestMerged';
  }
>;
type IssueEvent = Extract<TraceGitHubEvent, { type: 'IssueUpdated' }>;

function processed(event: TraceGitHubEvent, entityId?: string): GitHubIngestionResult {
  return { status: 'processed', type: event.type, ...(entityId ? { entityId } : {}) };
}

function ignored(event: TraceGitHubEvent, reason: string): GitHubIngestionResult {
  return { status: 'ignored', type: event.type, reason };
}

function rejected(event: TraceGitHubEvent, reason: string): GitHubIngestionResult {
  return { status: 'rejected', type: event.type, reason };
}

function pullRequestState(event: PullRequestEvent) {
  return (
    event.state ??
    (event.type === 'PullRequestMerged'
      ? 'merged'
      : event.type === 'PullRequestClosed'
        ? 'closed'
        : 'open')
  );
}

function issueState(event: IssueEvent) {
  return event.state ?? (event.action === 'closed' ? 'closed' : 'open');
}

function matchesInstallation(installationProviderId: string, event: { installationId?: number }) {
  return !event.installationId || installationProviderId === String(event.installationId);
}

async function findD1Repository(db: TraceD1Database, providerId: number) {
  const [row] = await db
    .select({
      repositoryId: d1Schema.githubRepositories.id,
      organizationId: d1Schema.githubRepositories.organizationId,
      installationId: d1Schema.githubRepositories.installationId,
      installationProviderId: d1Schema.githubInstallations.githubInstallationId,
      repositoryState: d1Schema.githubRepositories.state,
      installationState: d1Schema.githubInstallations.state,
      defaultBranch: d1Schema.githubRepositories.defaultBranch,
    })
    .from(d1Schema.githubRepositories)
    .innerJoin(
      d1Schema.githubInstallations,
      eq(d1Schema.githubRepositories.installationId, d1Schema.githubInstallations.id),
    )
    .where(eq(d1Schema.githubRepositories.githubRepositoryId, String(providerId)))
    .limit(1);
  return row ?? null;
}

function validateD1Repository(
  event: TraceGitHubEvent,
  repository: Awaited<ReturnType<typeof findD1Repository>>,
) {
  if (!repository) return rejected(event, 'repository-not-found');
  if (!matchesInstallation(repository.installationProviderId, event))
    return rejected(event, 'installation-repository-mismatch');
  if (repository.installationState !== 'active') return rejected(event, 'installation-not-active');
  return null;
}

async function processD1PullRequest(db: TraceD1Database, event: PullRequestEvent) {
  const repository = await findD1Repository(db, event.repositoryId);
  const invalid = validateD1Repository(event, repository);
  if (invalid) return invalid;
  if (!repository) return rejected(event, 'repository-not-found');
  const [byProvider] = await db
    .select()
    .from(d1Schema.githubPullRequests)
    .where(eq(d1Schema.githubPullRequests.githubPullRequestId, String(event.pullRequestId)))
    .limit(1);
  const [byRepositoryNumber] = await db
    .select()
    .from(d1Schema.githubPullRequests)
    .where(
      and(
        eq(d1Schema.githubPullRequests.repositoryId, repository.repositoryId),
        eq(d1Schema.githubPullRequests.number, event.number),
      ),
    )
    .limit(1);
  if (byProvider && byProvider.repositoryId !== repository.repositoryId)
    return rejected(event, 'pull-request-tenant-mismatch');
  if (byRepositoryNumber && byRepositoryNumber.githubPullRequestId !== String(event.pullRequestId))
    return rejected(event, 'pull-request-number-conflict');
  const existing = byProvider ?? byRepositoryNumber;
  const title = event.title ?? existing?.title;
  if (!title) return ignored(event, 'pull-request-title-unavailable');
  const values = {
    organizationId: repository.organizationId,
    repositoryId: repository.repositoryId,
    githubPullRequestId: String(event.pullRequestId),
    number: event.number,
    title,
    state: pullRequestState(event),
    headSha: event.headSha ?? existing?.headSha ?? null,
    baseBranch: event.baseBranch ?? existing?.baseBranch ?? null,
    authorLogin: event.authorLogin ?? existing?.authorLogin ?? null,
    url: event.url ?? existing?.url ?? null,
    lastSynchronizedAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(d1Schema.githubPullRequests)
      .set(values)
      .where(eq(d1Schema.githubPullRequests.id, existing.id));
    return processed(event, existing.id);
  }
  const id = createTraceId();
  await db.insert(d1Schema.githubPullRequests).values({ id, ...values });
  return processed(event, id);
}

async function processD1Issue(db: TraceD1Database, event: IssueEvent) {
  const repository = await findD1Repository(db, event.repositoryId);
  const invalid = validateD1Repository(event, repository);
  if (invalid) return invalid;
  if (!repository) return rejected(event, 'repository-not-found');
  const [byProvider] = await db
    .select()
    .from(d1Schema.githubIssues)
    .where(eq(d1Schema.githubIssues.githubIssueId, String(event.issueId)))
    .limit(1);
  const [byRepositoryNumber] = await db
    .select()
    .from(d1Schema.githubIssues)
    .where(
      and(
        eq(d1Schema.githubIssues.repositoryId, repository.repositoryId),
        eq(d1Schema.githubIssues.number, event.number),
      ),
    )
    .limit(1);
  if (byRepositoryNumber && byRepositoryNumber.githubIssueId !== String(event.issueId))
    return rejected(event, 'issue-number-conflict');
  const existing = byProvider ?? byRepositoryNumber;
  if (existing && existing.repositoryId !== repository.repositoryId)
    return rejected(event, 'issue-tenant-mismatch');
  const title = event.title ?? existing?.title;
  if (!title) return ignored(event, 'issue-title-unavailable');
  const values = {
    organizationId: repository.organizationId,
    repositoryId: repository.repositoryId,
    githubIssueId: String(event.issueId),
    number: event.number,
    title,
    state: issueState(event),
    url: event.url ?? existing?.url ?? null,
    lastSynchronizedAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(d1Schema.githubIssues)
      .set(values)
      .where(eq(d1Schema.githubIssues.id, existing.id));
    return processed(event, existing.id);
  }
  const id = createTraceId();
  await db.insert(d1Schema.githubIssues).values({ id, ...values });
  return processed(event, id);
}

function createD1Store(db: TraceD1Database): GitHubIngestionStore {
  return {
    async processInstallationCreated(event) {
      return ignored(event, 'installation-requires-user-workspace-mapping');
    },

    async processInstallationRepositoriesChanged(event) {
      const [installation] = await db
        .select({ id: d1Schema.githubInstallations.id })
        .from(d1Schema.githubInstallations)
        .where(eq(d1Schema.githubInstallations.githubInstallationId, String(event.installationId)))
        .limit(1);
      if (!installation) return rejected(event, 'installation-not-found');
      const now = new Date();
      for (const providerId of event.repositoryIds) {
        const [repository] = await db
          .select({ id: d1Schema.githubRepositories.id })
          .from(d1Schema.githubRepositories)
          .where(
            and(
              eq(d1Schema.githubRepositories.installationId, installation.id),
              eq(d1Schema.githubRepositories.githubRepositoryId, String(providerId)),
            ),
          )
          .limit(1);
        if (!repository) continue;
        const relation = await db
          .select({ id: d1Schema.githubInstallationRepositories.id })
          .from(d1Schema.githubInstallationRepositories)
          .where(
            and(
              eq(d1Schema.githubInstallationRepositories.installationId, installation.id),
              eq(d1Schema.githubInstallationRepositories.githubRepositoryId, String(providerId)),
            ),
          )
          .limit(1);
        if (event.action === 'removed') {
          await db
            .update(d1Schema.githubInstallationRepositories)
            .set({ selected: false, updatedAt: now })
            .where(
              and(
                eq(d1Schema.githubInstallationRepositories.installationId, installation.id),
                eq(d1Schema.githubInstallationRepositories.githubRepositoryId, String(providerId)),
              ),
            );
        } else if (!relation[0]) {
          await db.insert(d1Schema.githubInstallationRepositories).values({
            installationId: installation.id,
            githubRepositoryId: String(providerId),
            selected: false,
          });
        }
        if (event.action === 'removed') {
          await db
            .update(d1Schema.githubRepositories)
            .set({ state: 'available', disconnectedAt: now, updatedAt: now })
            .where(eq(d1Schema.githubRepositories.id, repository.id));
        }
      }
      return processed(event);
    },

    async processRepositoryConnected(event) {
      if (!event.installationId) return ignored(event, 'installation-reference-unavailable');
      const [installation] = await db
        .select({
          id: d1Schema.githubInstallations.id,
          organizationId: d1Schema.githubInstallations.organizationId,
          state: d1Schema.githubInstallations.state,
          githubInstallationId: d1Schema.githubInstallations.githubInstallationId,
        })
        .from(d1Schema.githubInstallations)
        .where(eq(d1Schema.githubInstallations.githubInstallationId, String(event.installationId)))
        .limit(1);
      if (!installation) return rejected(event, 'installation-not-found');
      if (installation.state !== 'active') return rejected(event, 'installation-not-active');
      const [existing] = await db
        .select({
          id: d1Schema.githubRepositories.id,
          organizationId: d1Schema.githubRepositories.organizationId,
          installationId: d1Schema.githubRepositories.installationId,
        })
        .from(d1Schema.githubRepositories)
        .where(eq(d1Schema.githubRepositories.githubRepositoryId, String(event.repositoryId)))
        .limit(1);
      const now = new Date();
      if (existing) {
        if (
          existing.organizationId !== installation.organizationId ||
          existing.installationId !== installation.id
        )
          return rejected(event, 'repository-tenant-mismatch');
        await db
          .update(d1Schema.githubRepositories)
          .set({
            organizationId: installation.organizationId,
            installationId: installation.id,
            owner: event.owner,
            name: event.name,
            fullName: event.fullName,
            ...(event.defaultBranch !== undefined ? { defaultBranch: event.defaultBranch } : {}),
            ...(event.visibility !== undefined ? { visibility: event.visibility } : {}),
            state: 'available',
            disconnectedAt: null,
            updatedAt: now,
          })
          .where(eq(d1Schema.githubRepositories.id, existing.id));
        return processed(event, existing.id);
      }
      const repositoryId = createTraceId();
      await db.insert(d1Schema.githubRepositories).values({
        id: repositoryId,
        organizationId: installation.organizationId,
        installationId: installation.id,
        githubRepositoryId: String(event.repositoryId),
        owner: event.owner,
        name: event.name,
        fullName: event.fullName,
        defaultBranch: event.defaultBranch ?? null,
        visibility: event.visibility ?? null,
        state: 'available',
      });
      await db
        .insert(d1Schema.githubInstallationRepositories)
        .values({
          installationId: installation.id,
          githubRepositoryId: String(event.repositoryId),
          selected: false,
        })
        .onConflictDoNothing({
          target: [
            d1Schema.githubInstallationRepositories.installationId,
            d1Schema.githubInstallationRepositories.githubRepositoryId,
          ],
        });
      return processed(event, repositoryId);
    },

    processPullRequest: (event) => processD1PullRequest(db, event),
    processIssue: (event) => processD1Issue(db, event),

    async processBranchPushed(event) {
      const repository = await findD1Repository(db, event.repositoryId);
      const invalid = validateD1Repository(event, repository);
      if (invalid) return invalid;
      if (!repository) return rejected(event, 'repository-not-found');
      if (
        repository.repositoryState !== 'active' ||
        repository.defaultBranch !== event.ref.replace(/^refs\/heads\//, '') ||
        !/^[a-f0-9]{40}$/i.test(event.after)
      ) {
        return ignored(event, 'non-default-branch-or-invalid-head');
      }
      await db
        .update(d1Schema.githubRepositories)
        .set({ remoteHeadSha: event.after, updatedAt: new Date() })
        .where(eq(d1Schema.githubRepositories.id, repository.repositoryId));
      return processed(event, repository.repositoryId);
    },
  };
}

async function findPostgresRepository(db: TracePostgresDatabase, providerId: number) {
  const [row] = await db
    .select({
      repositoryId: schema.githubRepositories.id,
      organizationId: schema.githubRepositories.organizationId,
      installationId: schema.githubRepositories.installationId,
      installationProviderId: schema.githubInstallations.githubInstallationId,
      repositoryState: schema.githubRepositories.state,
      installationState: schema.githubInstallations.state,
      defaultBranch: schema.githubRepositories.defaultBranch,
    })
    .from(schema.githubRepositories)
    .innerJoin(
      schema.githubInstallations,
      eq(schema.githubRepositories.installationId, schema.githubInstallations.id),
    )
    .where(eq(schema.githubRepositories.githubRepositoryId, providerId))
    .limit(1);
  return row ?? null;
}

function validatePostgresRepository(
  event: TraceGitHubEvent,
  repository: Awaited<ReturnType<typeof findPostgresRepository>>,
) {
  if (!repository) return rejected(event, 'repository-not-found');
  if (event.installationId && repository.installationProviderId !== event.installationId)
    return rejected(event, 'installation-repository-mismatch');
  if (repository.installationState !== 'active') return rejected(event, 'installation-not-active');
  return null;
}

function createPostgresStore(db: TracePostgresDatabase): GitHubIngestionStore {
  return {
    async processInstallationCreated(event) {
      return ignored(event, 'installation-requires-user-workspace-mapping');
    },
    async processInstallationRepositoriesChanged(event) {
      return ignored(event, 'legacy-installation-repository-handler-not-migrated');
    },
    async processRepositoryConnected(event) {
      return ignored(event, 'legacy-repository-handler-not-migrated');
    },
    async processPullRequest(event) {
      const repository = await findPostgresRepository(db, event.repositoryId);
      const invalid = validatePostgresRepository(event, repository);
      if (invalid) return invalid;
      if (!repository) return rejected(event, 'repository-not-found');
      const [existing] = await db
        .select()
        .from(schema.githubPullRequests)
        .where(eq(schema.githubPullRequests.githubPullRequestId, event.pullRequestId))
        .limit(1);
      if (existing && existing.repositoryId !== repository.repositoryId)
        return rejected(event, 'pull-request-tenant-mismatch');
      const title = event.title ?? existing?.title;
      if (!title) return ignored(event, 'pull-request-title-unavailable');
      const values = {
        organizationId: repository.organizationId,
        repositoryId: repository.repositoryId,
        githubPullRequestId: event.pullRequestId,
        number: event.number,
        title,
        state: pullRequestState(event),
        headSha: event.headSha ?? existing?.headSha ?? null,
        baseBranch: event.baseBranch ?? existing?.baseBranch ?? null,
        authorLogin: event.authorLogin ?? existing?.authorLogin ?? null,
        url: event.url ?? existing?.url ?? null,
        lastSynchronizedAt: new Date(),
        updatedAt: new Date(),
      };
      if (existing) {
        await db
          .update(schema.githubPullRequests)
          .set(values)
          .where(eq(schema.githubPullRequests.id, existing.id));
        return processed(event, existing.id);
      }
      const id = createTraceId();
      await db.insert(schema.githubPullRequests).values({ id, ...values });
      return processed(event, id);
    },
    async processBranchPushed(event) {
      const repository = await findPostgresRepository(db, event.repositoryId);
      const invalid = validatePostgresRepository(event, repository);
      if (invalid) return invalid;
      if (!repository) return rejected(event, 'repository-not-found');
      if (
        repository.repositoryState !== 'active' ||
        repository.defaultBranch !== event.ref.replace(/^refs\/heads\//, '') ||
        !/^[a-f0-9]{40}$/i.test(event.after)
      )
        return ignored(event, 'non-default-branch-or-invalid-head');
      await db
        .update(schema.githubRepositories)
        .set({ remoteHeadSha: event.after, updatedAt: new Date() })
        .where(eq(schema.githubRepositories.id, repository.repositoryId));
      return processed(event, repository.repositoryId);
    },
    async processIssue(event) {
      const repository = await findPostgresRepository(db, event.repositoryId);
      const invalid = validatePostgresRepository(event, repository);
      if (invalid) return invalid;
      if (!repository) return rejected(event, 'repository-not-found');
      const [existing] = await db
        .select()
        .from(schema.githubIssues)
        .where(eq(schema.githubIssues.githubIssueId, event.issueId))
        .limit(1);
      if (existing && existing.repositoryId !== repository.repositoryId)
        return rejected(event, 'issue-tenant-mismatch');
      const [byRepositoryNumber] = await db
        .select()
        .from(schema.githubIssues)
        .where(
          and(
            eq(schema.githubIssues.repositoryId, repository.repositoryId),
            eq(schema.githubIssues.number, event.number),
          ),
        )
        .limit(1);
      if (byRepositoryNumber && byRepositoryNumber.githubIssueId !== event.issueId)
        return rejected(event, 'issue-number-conflict');
      const title = event.title ?? existing?.title;
      if (!title) return ignored(event, 'issue-title-unavailable');
      const values = {
        organizationId: repository.organizationId,
        repositoryId: repository.repositoryId,
        githubIssueId: event.issueId,
        number: event.number,
        title,
        state: issueState(event),
        url: event.url ?? existing?.url ?? null,
        lastSynchronizedAt: new Date(),
        updatedAt: new Date(),
      };
      if (existing) {
        await db
          .update(schema.githubIssues)
          .set(values)
          .where(eq(schema.githubIssues.id, existing.id));
        return processed(event, existing.id);
      }
      const id = createTraceId();
      await db.insert(schema.githubIssues).values({ id, ...values });
      return processed(event, id);
    },
  };
}

export function createD1GitHubIngestionStore(db: TraceD1Database) {
  return createD1Store(db);
}

export function createPostgresGitHubIngestionStore(db: TracePostgresDatabase) {
  return createPostgresStore(db);
}

export async function markD1WebhookDeliveryProcessed(
  db: TraceD1Database,
  deliveryId: string,
  status: 'processed' | 'ignored' = 'processed',
  attempt = 1,
) {
  await db
    .update(d1Schema.githubWebhookDeliveries)
    .set({
      status,
      attempts: Math.max(1, Math.floor(attempt)),
      lastAttemptAt: new Date(),
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, deliveryId));
}

export async function markPostgresWebhookDeliveryProcessed(
  db: TracePostgresDatabase,
  deliveryId: string,
  status: 'processed' | 'ignored' = 'processed',
) {
  await db
    .update(schema.githubWebhookDeliveries)
    .set({ status, processedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.githubWebhookDeliveries.deliveryId, deliveryId));
}
