import { describe, expect, it, vi } from 'vitest';
import { processGitHubWebhookEvent, type GitHubIngestionStore } from './github-events.js';

function store() {
  return {
    processInstallationCreated: vi.fn(async (event) => ({
      status: 'processed' as const,
      type: event.type,
    })),
    processInstallationRepositoriesChanged: vi.fn(async (event) => ({
      status: 'processed' as const,
      type: event.type,
    })),
    processRepositoryConnected: vi.fn(async (event) => ({
      status: 'processed' as const,
      type: event.type,
    })),
    processPullRequest: vi.fn(async (event) => ({
      status: 'processed' as const,
      type: event.type,
    })),
    processBranchPushed: vi.fn(async (event) => ({
      status: 'processed' as const,
      type: event.type,
    })),
    processIssue: vi.fn(async (event) => ({ status: 'processed' as const, type: event.type })),
  } satisfies GitHubIngestionStore;
}

describe('transport-neutral GitHub ingestion dispatch', () => {
  it('dispatches pull requests and issues to the shared store', async () => {
    const ingestion = store();
    await processGitHubWebhookEvent(ingestion, {
      type: 'PullRequestUpdated',
      repositoryId: 42,
      pullRequestId: 7,
      number: 3,
      action: 'synchronize',
      title: 'Update',
    });
    await processGitHubWebhookEvent(ingestion, {
      type: 'IssueUpdated',
      repositoryId: 42,
      issueId: 8,
      number: 4,
      action: 'opened',
      title: 'Issue',
    });
    expect(ingestion.processPullRequest).toHaveBeenCalledOnce();
    expect(ingestion.processIssue).toHaveBeenCalledOnce();
  });

  it('treats unsupported normalized events as safely ignored', async () => {
    const result = await processGitHubWebhookEvent(store(), null);
    expect(result).toEqual({ status: 'ignored', type: 'unknown', reason: 'unsupported-event' });
  });
});
