import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  createRequestDatabase,
  getRequestDatabaseUrl,
  requiresD1Runtime,
} from './request-database';

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getCloudflareContext).mockReset();
});

describe('requiresD1Runtime', () => {
  it('requires D1 when the driver is explicitly selected', () => {
    expect(requiresD1Runtime({ TRACE_DATABASE_DRIVER: 'd1' })).toBe(true);
  });

  it('requires D1 for production even when the driver is missing', () => {
    expect(requiresD1Runtime({ TRACE_DEPLOYMENT_ENV: 'production' })).toBe(true);
  });

  it('does not require D1 for an explicit legacy staging reference', () => {
    expect(
      requiresD1Runtime({ TRACE_DATABASE_DRIVER: 'postgres', TRACE_DEPLOYMENT_ENV: 'staging' }),
    ).toBe(false);
  });

  it('does not return a PostgreSQL URL when D1 is selected', async () => {
    vi.stubEnv('TRACE_DATABASE_DRIVER', 'd1');
    vi.stubEnv('DATABASE_URL', 'postgresql://should-not-be-used');

    await expect(getRequestDatabaseUrl()).rejects.toThrow(
      'TRACE D1 runtime is required; PostgreSQL fallback is disabled.',
    );
  });

  it('does not return a PostgreSQL URL for a production runtime without a driver', async () => {
    vi.stubEnv('TRACE_DEPLOYMENT_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://should-not-be-used');

    await expect(getRequestDatabaseUrl()).rejects.toThrow(
      'TRACE D1 runtime is required; PostgreSQL fallback is disabled.',
    );
  });

  it('selects the D1 request database for a valid production binding', async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: {
        TRACE_DEPLOYMENT_ENV: 'production',
        TRACE_DATABASE_DRIVER: 'd1',
        DB: {},
      },
    } as never);

    const handle = await createRequestDatabase();

    expect(handle.db).toBeDefined();
    await handle.client.end();
  });

  it('fails closed when production has no D1 binding', async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { TRACE_DEPLOYMENT_ENV: 'production', TRACE_DATABASE_DRIVER: 'd1' },
    } as never);

    await expect(createRequestDatabase()).rejects.toThrow(
      'TRACE D1 database binding is not configured.',
    );
  });

  it('fails closed when production selects a non-D1 driver', async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { TRACE_DEPLOYMENT_ENV: 'production', TRACE_DATABASE_DRIVER: 'postgres' },
    } as never);

    await expect(createRequestDatabase()).rejects.toThrow(
      'TRACE production requires TRACE_DATABASE_DRIVER=d1.',
    );
  });
});
