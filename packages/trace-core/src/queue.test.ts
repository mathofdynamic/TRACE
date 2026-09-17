import { describe, expect, it, vi } from 'vitest';
import { enqueueTraceMessage, parseTraceQueueMessage } from './queue.js';

const message = {
  version: '1',
  type: 'github.webhook.process',
  idempotencyKey: 'github-delivery-123',
  enqueuedAt: '2026-09-16T10:00:00.000Z',
  deliveryId: 'delivery-123',
  eventName: 'pull_request',
  event: null,
} as const;

describe('TRACE Queue contract', () => {
  it('accepts bounded reference-only messages', () => {
    expect(parseTraceQueueMessage(message)).toEqual(message);
  });

  it('rejects arbitrary and source-bearing payloads', () => {
    expect(() =>
      parseTraceQueueMessage({ ...message, sourceCode: 'const secret = true;' }),
    ).toThrow();
    expect(() => parseTraceQueueMessage({ type: 'unknown.job' })).toThrow();
  });

  it('validates before sending through a Cloudflare Queue binding', async () => {
    const send = vi.fn<(value: typeof message) => Promise<void>>().mockResolvedValue();
    await enqueueTraceMessage({ send }, message);
    expect(send).toHaveBeenCalledWith(message);
  });
});
