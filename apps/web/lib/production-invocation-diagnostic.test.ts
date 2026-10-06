import { describe, expect, it, vi } from 'vitest';
import {
  diagnoseInvocation,
  invocationQuery,
  invocationSummary,
} from '../../../scripts/production-invocation-diagnostic';

describe('protected invocation diagnostic', () => {
  it('bounds a read-only query to the exact Worker and Ray time window', () => {
    expect(invocationQuery('a46324dd8dcdb51e', '2026-10-06T08:02:28Z')).toMatchObject({
      dry: true,
      limit: 100,
      parameters: { needle: { value: 'a46324dd8dcdb51e' } },
    });
    expect(() => invocationQuery('invalid', '2026-10-06T08:02:28Z')).toThrow();
  });
  it('retains metrics without leaking callback secrets or private repository metadata', () => {
    const result = invocationSummary({
      timestamp: 1791273748000,
      $metadata: { rayId: 'a46324dd8dcdb51e', error: 'CPU limit exceeded: private-repo secret' },
      $workers: {
        outcome: 'exceededCpu',
        cpuTimeMs: 10.4,
        wallTimeMs: 950,
        event: { request: { url: 'https://worker/api/github/setup?code=secret' } },
      },
      source: { message: 'private-repo' },
    });
    expect(result).toMatchObject({
      outcome: 'exceededCpu',
      cpuTimeMs: 10.4,
      errorClass: 'CPU_LIMIT',
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|private-repo|code=/);
  });
  it.each([
    ['exceededCpu', 'CPU_LIMIT'],
    ['exceededMemory', 'MEMORY_LIMIT'],
  ])('classifies recorded %s without optional error text', (outcome, errorClass) => {
    expect(invocationSummary({ $workers: { outcome } })).toMatchObject({ outcome, errorClass });
  });
  it('does not mistake upstream rate limiting for Worker subrequest exhaustion', () => {
    expect(invocationSummary({ $metadata: { error: 'Too many requests' } }).errorClass).toBe(
      'OTHER_ERROR_REDACTED',
    );
    expect(invocationSummary({ $metadata: { error: 'Too many subrequests' } }).errorClass).toBe(
      'SUBREQUEST_LIMIT',
    );
  });
  it('reports permission denial explicitly without printing credentials', async () => {
    await expect(
      diagnoseInvocation(
        {
          CLOUDFLARE_ACCOUNT_ID: 'c5d6cf110905c91fc3eed1abaf8236a2',
          CLOUDFLARE_API_TOKEN: 'secret',
          INVOCATION_RAY_ID: 'a46324dd8dcdb51e',
          INVOCATION_TIMESTAMP: '2026-10-06T08:02:28Z',
        },
        vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
      ),
    ).rejects.toThrow('HTTP 403');
  });
});
