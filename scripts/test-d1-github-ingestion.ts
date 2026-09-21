import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createD1Database, createD1GitHubIngestionStore, d1Schema } from '@trace/db';
import {
  enqueueTraceMessage,
  parseTraceQueueMessage,
  processGitHubWebhookEvent,
  type TraceQueueMessage,
} from '@trace/core';
import { normalizeGitHubEvent } from '@trace/github';
import { processTraceQueueBatch } from '../apps/worker/src/cloudflare.js';

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

function pullRequestPayload(action: string, mergedAt: string | null = null) {
  return {
    action,
    installation: { id: 7001 },
    repository: { id: 8001 },
    pull_request: {
      id: 9001,
      number: 17,
      title: 'D1 ingestion change',
      state: mergedAt ? 'closed' : action === 'closed' ? 'closed' : 'open',
      merged_at: mergedAt,
      head: { sha: 'a'.repeat(40) },
      base: { sha: 'b'.repeat(40), ref: 'main' },
      user: { login: 'd1-author' },
      html_url: 'https://github.com/example/trace/pull/17',
      created_at: '2026-09-17T10:00:00.000Z',
      updated_at: '2026-09-17T10:01:00.000Z',
    },
  };
}

function issuePayload(action: string) {
  return {
    action,
    installation: { id: 7001 },
    repository: { id: 8001 },
    issue: {
      id: 9101,
      number: 19,
      title: 'D1 ingestion issue',
      state: action === 'closed' ? 'closed' : 'open',
      user: { login: 'd1-author' },
      html_url: 'https://github.com/example/trace/issues/19',
      created_at: '2026-09-17T10:00:00.000Z',
      updated_at: '2026-09-17T10:01:00.000Z',
    },
  };
}

async function main() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: `trace-cf25-github-${randomUUID()}` },
    }),
  );
  try {
    const binding = await miniflare.getD1Database('DB');
    await applyMigration(binding);
    const db = createD1Database(binding);
    const organizationId = randomUUID();
    const installationId = randomUUID();
    const repositoryId = randomUUID();
    await db.insert(d1Schema.organizations).values({
      id: organizationId,
      name: 'CF2.5 workspace',
      slug: `cf25-${organizationId.slice(0, 8)}`,
    });
    await db.insert(d1Schema.githubInstallations).values({
      id: installationId,
      organizationId,
      githubInstallationId: '7001',
      accountLogin: 'd1-installation',
      accountType: 'Organization',
    });
    await db.insert(d1Schema.githubRepositories).values({
      id: repositoryId,
      organizationId,
      installationId,
      githubRepositoryId: '8001',
      owner: 'example',
      name: 'trace',
      fullName: 'example/trace',
      defaultBranch: 'main',
      state: 'active',
    });
    await db.insert(d1Schema.githubInstallationRepositories).values({
      installationId,
      githubRepositoryId: '8001',
      selected: true,
    });

    const store = createD1GitHubIngestionStore(db);
    const opened = normalizeGitHubEvent('pull_request', 'opened', pullRequestPayload('opened'));
    assert(opened?.type === 'PullRequestOpened', 'PR fixture did not normalize');
    const firstPullRequest = await processGitHubWebhookEvent(store, opened);
    assert(firstPullRequest.status === 'processed', 'D1 PR create failed');
    const duplicatePullRequest = await processGitHubWebhookEvent(store, opened);
    assert(duplicatePullRequest.status === 'processed', 'D1 PR redelivery was not safe');
    const [pullRequests] = await db
      .select({ count: d1Schema.githubPullRequests.id })
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.repositoryId, repositoryId));
    assert(pullRequests?.count, 'D1 PR was not persisted');
    const pullRequestRows = await db
      .select()
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.repositoryId, repositoryId));
    assert(pullRequestRows.length === 1, 'Duplicate PR delivery created a second record');

    const synchronized = normalizeGitHubEvent(
      'pull_request',
      'synchronize',
      pullRequestPayload('synchronize'),
    );
    assert(synchronized?.type === 'PullRequestUpdated', 'PR synchronize did not normalize');
    await processGitHubWebhookEvent(store, synchronized);
    const [updatedPullRequest] = await db
      .select({
        state: d1Schema.githubPullRequests.state,
        headSha: d1Schema.githubPullRequests.headSha,
      })
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.id, firstPullRequest.entityId ?? ''));
    assert(updatedPullRequest?.state === 'open', 'PR update state was not preserved');
    assert(updatedPullRequest.headSha === 'a'.repeat(40), 'PR head SHA was not synchronized');

    const reopened = normalizeGitHubEvent(
      'pull_request',
      'reopened',
      pullRequestPayload('reopened'),
    );
    assert(reopened?.type === 'PullRequestUpdated', 'PR reopen did not normalize');
    await processGitHubWebhookEvent(store, reopened);
    const [reopenedPullRequest] = await db
      .select({ state: d1Schema.githubPullRequests.state })
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.id, firstPullRequest.entityId ?? ''));
    assert(reopenedPullRequest?.state === 'open', 'PR reopen state was not persisted');

    const closed = normalizeGitHubEvent(
      'pull_request',
      'closed',
      pullRequestPayload('closed', '2026-09-17T10:02:00.000Z'),
    );
    assert(closed?.type === 'PullRequestMerged', 'PR close/merge did not normalize');
    await processGitHubWebhookEvent(store, closed);
    const [mergedPullRequest] = await db
      .select({ state: d1Schema.githubPullRequests.state })
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.id, firstPullRequest.entityId ?? ''));
    assert(mergedPullRequest?.state === 'merged', 'Merged PR state was not persisted');

    const openedIssue = normalizeGitHubEvent('issues', 'opened', issuePayload('opened'));
    assert(openedIssue?.type === 'IssueUpdated', 'Issue fixture did not normalize');
    const issueResult = await processGitHubWebhookEvent(store, openedIssue);
    assert(issueResult.status === 'processed', 'D1 issue create failed');
    await processGitHubWebhookEvent(store, openedIssue);
    const issueRows = await db
      .select()
      .from(d1Schema.githubIssues)
      .where(eq(d1Schema.githubIssues.repositoryId, repositoryId));
    assert(issueRows.length === 1, 'Duplicate issue delivery created a second record');
    const closedIssue = normalizeGitHubEvent('issues', 'closed', issuePayload('closed'));
    assert(closedIssue?.type === 'IssueUpdated', 'Issue close did not normalize');
    await processGitHubWebhookEvent(store, closedIssue);
    const [updatedIssue] = await db
      .select({ state: d1Schema.githubIssues.state })
      .from(d1Schema.githubIssues)
      .where(eq(d1Schema.githubIssues.id, issueResult.entityId ?? ''));
    assert(updatedIssue?.state === 'closed', 'Issue close state was not persisted');
    const reopenedIssue = normalizeGitHubEvent('issues', 'reopened', issuePayload('reopened'));
    assert(reopenedIssue?.type === 'IssueUpdated', 'Issue reopen did not normalize');
    await processGitHubWebhookEvent(store, reopenedIssue);
    const [reopenedIssueRow] = await db
      .select({ state: d1Schema.githubIssues.state })
      .from(d1Schema.githubIssues)
      .where(eq(d1Schema.githubIssues.id, issueResult.entityId ?? ''));
    assert(reopenedIssueRow?.state === 'open', 'Issue reopen state was not persisted');

    const pushed = normalizeGitHubEvent('push', undefined, {
      installation: { id: 7001 },
      repository: { id: 8001 },
      ref: 'refs/heads/main',
      before: 'c'.repeat(40),
      after: 'd'.repeat(40),
    });
    assert(pushed?.type === 'BranchPushed', 'Default-branch push did not normalize');
    const pushedResult = await processGitHubWebhookEvent(store, pushed);
    assert(pushedResult.status === 'processed', 'Default-branch push was not processed');
    const [updatedRepository] = await db
      .select({ remoteHeadSha: d1Schema.githubRepositories.remoteHeadSha })
      .from(d1Schema.githubRepositories)
      .where(eq(d1Schema.githubRepositories.id, repositoryId));
    assert(
      updatedRepository?.remoteHeadSha === 'd'.repeat(40),
      'Default-branch head was not synchronized',
    );

    const added = await processGitHubWebhookEvent(store, {
      type: 'InstallationRepositoriesChanged',
      installationId: 7001,
      action: 'added',
      repositoryIds: [8001],
    });
    assert(added.status === 'processed', 'Installation addition was not processed');
    const [stillSelected] = await db
      .select({ selected: d1Schema.githubInstallationRepositories.selected })
      .from(d1Schema.githubInstallationRepositories)
      .where(
        and(
          eq(d1Schema.githubInstallationRepositories.installationId, installationId),
          eq(d1Schema.githubInstallationRepositories.githubRepositoryId, '8001'),
        ),
      );
    assert(
      stillSelected?.selected === true,
      'Installation addition changed user repository selection',
    );

    const mismatched = await processGitHubWebhookEvent(store, {
      ...opened,
      installationId: 7002,
    });
    assert(mismatched.status === 'rejected', 'Mismatched installation was accepted');
    const unknownRepository = await processGitHubWebhookEvent(store, {
      ...opened,
      repositoryId: 8999,
    });
    assert(unknownRepository.status === 'rejected', 'Unknown repository was accepted');

    const removed = await processGitHubWebhookEvent(store, {
      type: 'InstallationRepositoriesChanged',
      installationId: 7001,
      action: 'removed',
      repositoryIds: [8001],
    });
    assert(removed.status === 'processed', 'Installation removal was not processed');
    const [unselected] = await db
      .select({ selected: d1Schema.githubInstallationRepositories.selected })
      .from(d1Schema.githubInstallationRepositories)
      .where(
        and(
          eq(d1Schema.githubInstallationRepositories.installationId, installationId),
          eq(d1Schema.githubInstallationRepositories.githubRepositoryId, '8001'),
        ),
      );
    assert(unselected?.selected === false, 'Removed repository remained selected');

    const message: TraceQueueMessage = {
      version: '1',
      type: 'github.webhook.process',
      idempotencyKey: 'cf25-delivery-1',
      enqueuedAt: '2026-09-17T10:00:00.000Z',
      deliveryId: 'cf25-delivery-1',
      eventName: 'pull_request',
      event: opened,
    };
    const sent: TraceQueueMessage[] = [];
    await enqueueTraceMessage({ send: async (value) => void sent.push(value) }, message);
    const queued = sent[0];
    assert(queued, 'Queue producer did not emit a message');
    assert(
      parseTraceQueueMessage(queued).event?.type === 'PullRequestOpened',
      'Queue event contract rejected a valid PR',
    );
    await db.insert(d1Schema.githubWebhookDeliveries).values({
      deliveryId: message.deliveryId,
      eventName: message.eventName,
      payloadSha256: 'c'.repeat(64),
      status: 'queued',
    });
    let acknowledged = false;
    let retried = false;
    await processTraceQueueBatch(
      [
        {
          id: 'cf25-queue-message-1',
          body: message,
          ack: () => {
            acknowledged = true;
          },
          retry: () => {
            retried = true;
          },
        },
      ],
      { DB: binding } as unknown as Env,
    );
    assert(
      acknowledged && !retried,
      'Cloudflare queue adapter did not acknowledge a successful job',
    );
    const [processedDelivery] = await db
      .select({ status: d1Schema.githubWebhookDeliveries.status })
      .from(d1Schema.githubWebhookDeliveries)
      .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, message.deliveryId));
    assert(
      processedDelivery?.status === 'processed',
      'Queue adapter did not mark delivery processed',
    );

    let duplicateAcknowledged = false;
    await processTraceQueueBatch(
      [
        {
          id: 'cf25-queue-message-duplicate',
          body: message,
          ack: () => {
            duplicateAcknowledged = true;
          },
          retry: () => {
            throw new Error('Duplicate queue delivery should not retry');
          },
        },
      ],
      { DB: binding } as unknown as Env,
    );
    assert(duplicateAcknowledged, 'Duplicate queue delivery was not acknowledged');
    const duplicatePullRequests = await db
      .select()
      .from(d1Schema.githubPullRequests)
      .where(eq(d1Schema.githubPullRequests.repositoryId, repositoryId));
    assert(
      duplicatePullRequests.length === 1,
      'Duplicate queue delivery created a second pull-request record',
    );

    const rejectedMessage: TraceQueueMessage = {
      ...message,
      idempotencyKey: 'cf25-delivery-rejected',
      deliveryId: 'cf25-delivery-rejected',
      event: { ...opened, installationId: 7002 },
    };
    await db.insert(d1Schema.githubWebhookDeliveries).values({
      deliveryId: rejectedMessage.deliveryId,
      eventName: rejectedMessage.eventName,
      payloadSha256: 'd'.repeat(64),
      status: 'queued',
    });
    let rejectedAcknowledged = false;
    let rejectedRetried = false;
    await processTraceQueueBatch(
      [
        {
          id: 'cf25-queue-message-rejected',
          body: rejectedMessage,
          ack: () => {
            rejectedAcknowledged = true;
          },
          retry: () => {
            rejectedRetried = true;
          },
        },
      ],
      { DB: binding } as unknown as Env,
    );
    assert(rejectedAcknowledged && !rejectedRetried, 'Permanent tenant rejection was retried');
    const [rejectedDelivery] = await db
      .select({ status: d1Schema.githubWebhookDeliveries.status })
      .from(d1Schema.githubWebhookDeliveries)
      .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, rejectedMessage.deliveryId));
    assert(
      rejectedDelivery?.status === 'ignored',
      'Rejected queue delivery was not marked ignored',
    );

    process.stdout.write(
      'D1 GitHub ingestion passed: PR/issue create-update-close, tenant checks, repository removal, idempotency, and queue contract.\n',
    );
  } finally {
    await miniflare.dispose();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
