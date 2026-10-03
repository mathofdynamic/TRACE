import { z } from 'zod';

const providerNumber = z.number().int().positive().safe();
const boundedText = z.string().max(4_000);
const optionalText = boundedText.nullable().optional();
const optionalSha = z
  .string()
  .regex(/^[a-f0-9]{40}$/i)
  .nullable()
  .optional();
const optionalTimestamp = z.string().datetime({ offset: true }).nullable().optional();

const installationCreated = z
  .object({
    type: z.literal('InstallationCreated'),
    installationId: providerNumber,
    accountLogin: z.string().min(1).max(255),
    accountType: z.string().min(1).max(64),
  })
  .strict();

const installationRepositoriesChanged = z
  .object({
    type: z.literal('InstallationRepositoriesChanged'),
    installationId: providerNumber,
    action: z.enum(['added', 'removed']),
    repositoryIds: z.array(providerNumber).max(500),
  })
  .strict();

const repositoryConnected = z
  .object({
    type: z.literal('RepositoryConnected'),
    installationId: providerNumber.optional(),
    repositoryId: providerNumber,
    fullName: z.string().min(1).max(512),
    owner: z.string().min(1).max(255),
    name: z.string().min(1).max(255),
    defaultBranch: optionalText,
    visibility: optionalText,
  })
  .strict();

const pullRequest = z
  .object({
    type: z.enum([
      'PullRequestOpened',
      'PullRequestUpdated',
      'PullRequestClosed',
      'PullRequestMerged',
    ]),
    installationId: providerNumber.optional(),
    repositoryId: providerNumber,
    pullRequestId: providerNumber,
    number: providerNumber,
    action: z.string().min(1).max(64),
    title: optionalText,
    state: z.enum(['open', 'closed', 'merged']).optional(),
    headSha: optionalSha,
    baseSha: optionalSha,
    baseBranch: optionalText,
    authorLogin: optionalText,
    url: optionalText,
    createdAt: optionalTimestamp,
    updatedAt: optionalTimestamp,
  })
  .strict();

const branchPushed = z
  .object({
    type: z.literal('BranchPushed'),
    installationId: providerNumber.optional(),
    repositoryId: providerNumber,
    ref: z.string().min(1).max(512),
    before: z.string().max(128),
    after: z.string().max(128),
  })
  .strict();

const issueUpdated = z
  .object({
    type: z.literal('IssueUpdated'),
    installationId: providerNumber.optional(),
    repositoryId: providerNumber,
    issueId: providerNumber,
    number: providerNumber,
    action: z.string().min(1).max(64),
    title: optionalText,
    state: z.enum(['open', 'closed']).optional(),
    authorLogin: optionalText,
    url: optionalText,
    createdAt: optionalTimestamp,
    updatedAt: optionalTimestamp,
  })
  .strict();

export const traceGitHubEventSchema = z.union([
  installationCreated,
  installationRepositoriesChanged,
  repositoryConnected,
  pullRequest,
  branchPushed,
  issueUpdated,
]);

export type TraceGitHubEvent = z.infer<typeof traceGitHubEventSchema>;

export type GitHubIngestionResult = {
  status: 'processed' | 'ignored' | 'rejected';
  type: TraceGitHubEvent['type'] | 'unknown';
  entityId?: string;
  reason?: string;
};

export type GitHubIngestionStore = {
  processInstallationCreated(
    event: Extract<TraceGitHubEvent, { type: 'InstallationCreated' }>,
  ): Promise<GitHubIngestionResult>;
  processInstallationRepositoriesChanged(
    event: Extract<TraceGitHubEvent, { type: 'InstallationRepositoriesChanged' }>,
  ): Promise<GitHubIngestionResult>;
  processRepositoryConnected(
    event: Extract<TraceGitHubEvent, { type: 'RepositoryConnected' }>,
  ): Promise<GitHubIngestionResult>;
  processPullRequest(
    event: Extract<
      TraceGitHubEvent,
      {
        type:
          | 'PullRequestOpened'
          | 'PullRequestUpdated'
          | 'PullRequestClosed'
          | 'PullRequestMerged';
      }
    >,
  ): Promise<GitHubIngestionResult>;
  processBranchPushed(
    event: Extract<TraceGitHubEvent, { type: 'BranchPushed' }>,
  ): Promise<GitHubIngestionResult>;
  processIssue(
    event: Extract<TraceGitHubEvent, { type: 'IssueUpdated' }>,
  ): Promise<GitHubIngestionResult>;
};

export async function processGitHubWebhookEvent(
  store: GitHubIngestionStore,
  event: TraceGitHubEvent | null,
): Promise<GitHubIngestionResult> {
  if (!event) return { status: 'ignored', type: 'unknown', reason: 'unsupported-event' };
  switch (event.type) {
    case 'InstallationCreated':
      return store.processInstallationCreated(event);
    case 'InstallationRepositoriesChanged':
      return store.processInstallationRepositoriesChanged(event);
    case 'RepositoryConnected':
      return store.processRepositoryConnected(event);
    case 'PullRequestOpened':
    case 'PullRequestUpdated':
    case 'PullRequestClosed':
    case 'PullRequestMerged':
      return store.processPullRequest(event);
    case 'BranchPushed':
      return store.processBranchPushed(event);
    case 'IssueUpdated':
      return store.processIssue(event);
  }
}
