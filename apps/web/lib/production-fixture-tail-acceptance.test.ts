import { describe, expect, it, vi } from 'vitest';
import { runProductionFixtureTailAcceptance } from '../../../scripts/production-fixture-tail-acceptance.js';

const validOptions = {
  accountId: 'c5d6cf110905c91fc3eed1abaf8236a2',
  token: 'fake-cloudflare-token-never-print',
  workerVersionId: 'b64aec75-81c4-4146-964d-8ff456bbe726',
  oauthClientId: 'production-oauth-client-id',
};

describe('production fixture tail route acceptance', () => {
  it('pins the exact deployed version and starts routes only after the tail ready callback', async () => {
    const order: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await runProductionFixtureTailAcceptance({
      ...validOptions,
      runTailSession: async (options) => {
        order.push('tail-start');
        expect(options).toMatchObject({
          kind: 'simple',
          workerName: 'trace-production',
          versionId: validOptions.workerVersionId,
          accountId: validOptions.accountId,
          sessionDurationMs: 30_000,
        });
        expect(options.configPath).toBeUndefined();
        order.push('tail-ready');
        await options.onReady();
        order.push('tail-closed');
        return { ready: true };
      },
      verifyRoutes: async (oauthClientId) => {
        order.push('routes');
        expect(oauthClientId).toBe(validOptions.oauthClientId);
        return [{ name: 'HEALTH', status: 200, result: 'PASS' }];
      },
    });

    expect(result).toEqual({ ready: true });
    expect(order).toEqual(['tail-start', 'tail-ready', 'routes', 'tail-closed']);
    expect(log.mock.calls.flat().join(' ')).not.toContain(validOptions.token);
    log.mockRestore();
  });

  it('rejects an unexpected account or unpinned version before tail or routes', async () => {
    const runTailSession = vi.fn(async () => ({ ready: true }));
    const verifyRoutes = vi.fn(async () => []);

    await expect(
      runProductionFixtureTailAcceptance({
        ...validOptions,
        accountId: 'another-account',
        runTailSession,
        verifyRoutes,
      }),
    ).rejects.toThrow('dedicated production account');
    await expect(
      runProductionFixtureTailAcceptance({
        ...validOptions,
        workerVersionId: 'not-a-version',
        runTailSession,
        verifyRoutes,
      }),
    ).rejects.toThrow('version ID');

    expect(runTailSession).not.toHaveBeenCalled();
    expect(verifyRoutes).not.toHaveBeenCalled();
  });
});
