import type * as TraceDb from '@trace/db';
import type * as TraceCore from '@trace/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  selected: vi.fn(),
  process: vi.fn(),
  mark: vi.fn(),
  store: vi.fn(),
}));
vi.mock('@trace/db', async (importOriginal) => ({
  ...(await importOriginal<typeof TraceDb>()),
  createD1Database: vi.fn(() => ({})),
  isD1SelectedOwnerWebhookEvent: mocks.selected,
  createD1GitHubIngestionStore: mocks.store,
  markD1WebhookDeliveryProcessed: mocks.mark,
}));
vi.mock('@trace/core', async (importOriginal) => ({
  ...(await importOriginal<typeof TraceCore>()),
  processGitHubWebhookEvent: mocks.process,
}));
import { handleTraceQueueMessage } from './cloudflare.js';
const message = {
  version: '1' as const,
  type: 'github.webhook.process' as const,
  idempotencyKey: 'owner',
  enqueuedAt: '2026-10-03T00:00:00Z',
  deliveryId: 'owner',
  eventName: 'issues',
  event: {
    type: 'IssueUpdated' as const,
    installationId: 166179374,
    repositoryId: 9,
    issueId: 99,
    number: 1,
    action: 'opened',
  },
};
const env = (mode: string) =>
  ({
    DB: {},
    TRACE_DEPLOYMENT_ENV: 'production',
    TRACE_CANARY_MODE: mode,
  }) as unknown as Parameters<typeof handleTraceQueueMessage>[1];
describe('production queue authorization at consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.process.mockResolvedValue({ status: 'processed', type: 'IssueUpdated' });
    mocks.mark.mockResolvedValue(undefined);
  });
  it('ignores deselected owner work without entering business projection', async () => {
    mocks.selected.mockResolvedValue(false);
    await expect(handleTraceQueueMessage(message, env('owner'))).resolves.toMatchObject({
      status: 'completed',
      result: { status: 'ignored' },
    });
    expect(mocks.selected).toHaveBeenCalledWith({}, message.event);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.mark).toHaveBeenCalledWith({}, 'owner', 'ignored', 1);
  });
  it('processes selected owner work normally', async () => {
    mocks.selected.mockResolvedValue(true);
    await handleTraceQueueMessage(message, env('owner'));
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(mocks.mark).toHaveBeenCalledWith({}, 'owner', 'processed', 1);
  });
  it.each(['closed', 'unknown', 'owner '])('fails closed for %s', async (mode) => {
    await expect(handleTraceQueueMessage(message, env(mode))).rejects.toThrow(/closed/);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('keeps fixture consumption exact while retaining valid fixture processing', async () => {
    await expect(handleTraceQueueMessage(message, env('fixture'))).rejects.toThrow(/fixture scope/);
    await handleTraceQueueMessage(
      { ...message, event: { ...message.event, repositoryId: 1378441300 } },
      env('fixture'),
    );
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });
});
