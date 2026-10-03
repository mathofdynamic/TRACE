import { describe, expect, it, vi } from 'vitest';
import { assertD1Schema, handleTraceQueueMessage, processTraceQueueBatch } from './cloudflare.js';

describe('Cloudflare Queue consumer boundary', () => {
  it('does not pretend placeholder jobs were processed', async () => {
    const result = await handleTraceQueueMessage(
      {
        version: '1',
        type: 'github.pull-request.sync',
        idempotencyKey: 'pull-request-1',
        enqueuedAt: '2026-09-16T10:00:00.000Z',
        organizationId: 'organization-1',
        repositoryId: 'repository-1',
        pullRequestNumber: 3,
      },
      { DB: {} } as Env,
    );

    expect(result).toEqual({ status: 'not-implemented', type: 'github.pull-request.sync' });
  });

  it('uses D1 for the implemented healthcheck', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const first = vi.fn().mockResolvedValue({ name: 'users' });
    const statement = { bind: vi.fn(), run, first };
    statement.bind.mockReturnValue(statement);
    const prepare = vi.fn().mockReturnValue(statement);

    await expect(
      handleTraceQueueMessage(
        {
          version: '1',
          type: 'system.healthcheck',
          idempotencyKey: 'health-1',
          enqueuedAt: '2026-09-16T10:00:00.000Z',
          probeId: 'probe-1',
        },
        { DB: { prepare } } as unknown as Env,
      ),
    ).resolves.toEqual({ status: 'completed', type: 'system.healthcheck' });
    expect(prepare).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it('fails health checks when the expected schema is absent', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn().mockReturnValue({ first });
    await expect(assertD1Schema({ prepare } as unknown as D1Database)).rejects.toThrow(
      'schema is not initialized',
    );
  });

  it('retries invalid and placeholder work instead of acknowledging it', async () => {
    const invalid = {
      id: 'invalid-message',
      body: { type: 'github.webhook.process', source: 'not-allowed' },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const placeholder = {
      id: 'placeholder-message',
      body: {
        version: '1',
        type: 'github.pull-request.sync',
        idempotencyKey: 'pull-request-2',
        enqueuedAt: '2026-09-16T10:00:00.000Z',
        organizationId: 'organization-1',
        repositoryId: 'repository-1',
        pullRequestNumber: 3,
      },
      ack: vi.fn(),
      retry: vi.fn(),
    };

    await processTraceQueueBatch([invalid, placeholder], { DB: {} } as Env);

    expect(invalid.ack).not.toHaveBeenCalled();
    expect(invalid.retry).toHaveBeenCalledWith();
    expect(placeholder.ack).not.toHaveBeenCalled();
    expect(placeholder.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });
});
