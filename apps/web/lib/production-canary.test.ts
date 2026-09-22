import { describe, expect, it } from 'vitest';
import { isClosedProductionCanary, productionCanaryClosedResponse } from './production-canary';

describe('production canary boundary', () => {
  it('is closed only for an explicit production runtime', () => {
    expect(
      isClosedProductionCanary({ TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'closed' }),
    ).toBe(true);
    expect(
      isClosedProductionCanary({ TRACE_DEPLOYMENT_ENV: 'staging', TRACE_CANARY_MODE: 'closed' }),
    ).toBe(false);
    expect(
      isClosedProductionCanary({ TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'open' }),
    ).toBe(false);
  });

  it('returns a cache-disabled 503 without exposing configuration', async () => {
    const response = productionCanaryClosedResponse();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'GitHub integration is disabled during the closed production canary.',
    });
  });
});
