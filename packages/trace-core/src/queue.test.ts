import { describe, expect, it, vi } from 'vitest';
import {
  enqueueCloudflareTraceMessage,
  enqueueTraceMessage,
  parseCloudflareQueueMessage,
  parseTraceQueueMessage,
  traceQueueJobRegistry,
} from './queue.js';

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

  it('keeps the Cloudflare producer boundary limited to implemented jobs', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await enqueueCloudflareTraceMessage({ send }, message);
    expect(send).toHaveBeenCalledWith(message);

    const placeholder = {
      version: '1' as const,
      type: 'reports.daily' as const,
      idempotencyKey: 'report-1',
      enqueuedAt: message.enqueuedAt,
      organizationId: 'organization-1',
      windowStart: '2026-09-16T00:00:00.000Z',
      windowEnd: '2026-09-17T00:00:00.000Z',
    };
    expect(() => parseCloudflareQueueMessage(placeholder)).toThrowError();
    await expect(enqueueCloudflareTraceMessage({ send }, placeholder)).rejects.toThrow(
      'handler is not implemented',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('documents an explicit production reachability registry', () => {
    expect(traceQueueJobRegistry).toHaveLength(12);
    expect(
      traceQueueJobRegistry.filter((job) => job.productionReachable).map((job) => job.type),
    ).toEqual(['system.healthcheck', 'github.webhook.process']);
    expect(
      traceQueueJobRegistry.filter((job) => job.classification === 'PLACEHOLDER'),
    ).toHaveLength(5);
  });
});
