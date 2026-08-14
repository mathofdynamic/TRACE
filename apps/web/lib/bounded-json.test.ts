import { describe, expect, it } from 'vitest';
import { jsonRouteError, readBoundedJson, requestCorrelationId } from './bounded-json';

describe('readBoundedJson', () => {
  it('accepts bounded JSON', async () => {
    const request = new Request('https://trace.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
    await expect(readBoundedJson(request, 64)).resolves.toEqual({ ok: true });
  });

  it('keeps correlation identifiers bounded and returns them on server errors', async () => {
    const request = new Request('https://trace.test', {
      headers: { 'x-trace-request-id': 'sync-test-1' },
    });
    expect(requestCorrelationId(request)).toBe('sync-test-1');
    const response = jsonRouteError(new Error('internal'), {
      requestId: 'sync-test-1',
      route: 'sync.complete',
    });
    expect(response.status).toBe(500);
    expect(response.headers.get('x-trace-request-id')).toBe('sync-test-1');
  });

  it('rejects oversized and non-JSON requests', async () => {
    const oversized = new Request('https://trace.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(100) }),
    });
    await expect(readBoundedJson(oversized, 20)).rejects.toMatchObject({ status: 413 });
    const wrongType = new Request('https://trace.test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    await expect(readBoundedJson(wrongType)).rejects.toMatchObject({ status: 415 });
  });
});
