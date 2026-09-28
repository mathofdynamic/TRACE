import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildWranglerTailArgs,
  classifyTailFailure,
  reportBeforeCleanup,
  runOnlyAfterTailReady,
  sanitizeTailDiagnostic,
} from '../../../scripts/production-tail-observability.js';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

describe('production tail observability harness', () => {
  it('builds the simple explicit Worker/version tail without config or env', () => {
    expect(
      buildWranglerTailArgs('simple', 'trace-production', 'b64aec75-81c4-4146-964d-8ff456bbe726'),
    ).toEqual([
      'exec',
      'wrangler',
      'tail',
      'trace-production',
      '--format',
      'json',
      '--status',
      'error',
      '--version-id',
      'b64aec75-81c4-4146-964d-8ff456bbe726',
    ]);
  });

  it('builds the prior config/env form while retaining exact version targeting', () => {
    expect(
      buildWranglerTailArgs(
        'config',
        'trace-production',
        'b64aec75-81c4-4146-964d-8ff456bbe726',
        'apps/web/.trace-cache/production-canary/wrangler.json',
      ),
    ).toEqual([
      'exec',
      'wrangler',
      'tail',
      'trace-production',
      '--config',
      'apps/web/.trace-cache/production-canary/wrangler.json',
      '--env',
      'production',
      '--format',
      'json',
      '--status',
      'error',
      '--version-id',
      'b64aec75-81c4-4146-964d-8ff456bbe726',
    ]);
  });

  it('rejects an unpinned or mismatched target shape', () => {
    expect(() => buildWranglerTailArgs('config', 'trace-production', 'bad', 'config.json')).toThrow(
      'version ID',
    );
    expect(() =>
      buildWranglerTailArgs(
        'simple',
        'trace-production',
        'b64aec75-81c4-4146-964d-8ff456bbe726',
        'config.json',
      ),
    ).toThrow('must not receive');
  });

  it('redacts token, Bearer, and Authorization material before applying an 8 KiB cap', () => {
    const token = 'cf-secret-exact-token';
    const input = `bad request ${token}\nAuthorization: Bearer ${token}\nBearer abc.def-123\n${'x'.repeat(9000)}`;
    const output = sanitizeTailDiagnostic(input, token);
    expect(output).not.toContain(token);
    expect(output).not.toContain('abc.def-123');
    expect(output).toContain('Authorization: [REDACTED]');
    expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(8 * 1024);
    expect(output).toContain('[TRUNCATED]');
  });

  it.each([
    [
      'HTTP 403 from Cloudflare',
      'Cloudflare returned HTTP 403 (code 10000)',
      'AUTHORIZATION_FAILURE',
    ],
    ['missing Worker target', 'HTTP 404 Worker not found', 'WORKER_TARGET_FAILURE'],
    ['bad Wrangler options', 'Unknown option --not-a-flag', 'CONFIGURATION_FAILURE'],
    ['network failure', 'WebSocket connection timed out', 'NETWORK_FAILURE'],
    ['generic Wrangler error', 'Wrangler process stopped unexpectedly', 'WRANGLER_FAILURE'],
    ['unclassified text', 'process ended', 'UNKNOWN_FAILURE'],
  ] as const)('classifies %s from observed evidence', (_label, diagnostic, expected) => {
    expect(
      classifyTailFailure(diagnostic, {
        code: expected === 'UNKNOWN_FAILURE' ? 0 : 1,
        signal: null,
      }),
    ).toBe(expected);
  });

  it('does not invoke route or health probes until the tail-ready promise resolves true', async () => {
    const order: string[] = [];
    const result = await runOnlyAfterTailReady(
      Promise.resolve(true).then(() => {
        order.push('tail-ready');
        return true;
      }),
      async () => {
        order.push('probe');
        return 'ok';
      },
    );
    expect(result).toBe('ok');
    expect(order).toEqual(['tail-ready', 'probe']);
    await expect(runOnlyAfterTailReady(Promise.resolve(false), async () => 'ran')).rejects.toThrow(
      'probes were not run',
    );
  });

  it('reports captured stderr before cleanup removes its temporary files', async () => {
    const order: string[] = [];
    await reportBeforeCleanup(
      () => {
        order.push('stderr-reported');
      },
      () => {
        order.push('temporary-files-cleaned');
      },
    );
    expect(order).toEqual(['stderr-reported', 'temporary-files-cleaned']);
  });

  it('captures stdout, stderr, exit status, and Wrangler version privately under runner temp', () => {
    const harness = readFileSync(
      path.join(root, 'scripts/production-tail-observability.ts'),
      'utf8',
    );
    expect(harness).toContain('process.env.RUNNER_TEMP ?? os.tmpdir()');
    expect(harness).toContain("'stdout.jsonl'");
    expect(harness).toContain("'stderr.txt'");
    expect(harness).toContain("'exit.txt'");
    expect(harness).toContain("'wrangler-version.txt'");
    expect(harness).toContain('mode: 0o600');
    expect(harness).toContain('TAIL_SANITIZED_DIAGNOSTIC_BEGIN');
  });

  it('keeps the dedicated smoke workflow manual, feature-ref restricted, and credential-minimal', () => {
    const workflow = readFileSync(
      path.join(root, '.github/workflows/production-tail-smoke.yml'),
      'utf8',
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.ref == 'refs/heads/feat/cloudflare-native-runtime'");
    expect(workflow).toContain('environment: production-canary');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('secrets.CLOUDFLARE_API_TOKEN');
    for (const forbidden of [
      'TRACE_GITHUB_APP_PRIVATE_KEY',
      'TRACE_GITHUB_APP_CLIENT_SECRET',
      'TRACE_GITHUB_WEBHOOK_SECRET',
      'TRACE_GITHUB_OAUTH_CLIENT_SECRET',
      'TRACE_AUTH_SECRET',
      'wrangler deploy',
      'secret put',
      'queues messages send',
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
  });

  it('contains no tail diagnostic file artifact or mutating D1/Queue API method', () => {
    const script = readFileSync(path.join(root, 'scripts/production-tail-smoke.ts'), 'utf8');
    const harness = readFileSync(
      path.join(root, 'scripts/production-tail-observability.ts'),
      'utf8',
    );
    expect(script).not.toMatch(/method:\s*['"](PUT|PATCH|DELETE)['"]/i);
    expect(script).not.toMatch(/queues\/[^`"']+\/(messages|purge|ack|retry)/i);
    expect(script).not.toContain('wrangler deploy');
    expect(harness).toContain("method: 'GET'");
    expect(harness).not.toContain('upload-artifact');
  });
});
