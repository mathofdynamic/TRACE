import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildWranglerTailArgs,
  classifyTailFailure,
  normalizeWranglerVersionOutput,
  reportBeforeCleanup,
  runOnlyAfterTailReady,
  safeWranglerVersionDiagnostic,
  sanitizeTailDiagnostic,
  waitForChildClose,
} from '../../../scripts/production-tail-observability.js';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

describe('production tail observability harness', () => {
  it.each([
    ['4.120.1', '4.120.1'],
    ['wrangler 4.120.1', 'wrangler 4.120.1'],
    ['4.121.0', '4.121.0'],
    ['wrangler 5.0.0', 'wrangler 5.0.0'],
    ['wrangler 5.0.0-beta.1', 'wrangler 5.0.0-beta.1'],
  ])(
    'normalizes safe Wrangler output %s without enforcing a presentation format',
    (raw, expected) => {
      expect(normalizeWranglerVersionOutput(raw)).toBe(expected);
      expect(normalizeWranglerVersionOutput(`${raw}\r\n`)).toBe(expected);
    },
  );

  it('accepts the exact bare semver output that stopped the previous fixture run', () => {
    expect(normalizeWranglerVersionOutput('4.120.1')).toBe('4.120.1');
  });

  it.each([
    ['empty output', ''],
    ['whitespace-only output', ' \r\n  '],
    ['embedded control character', '4.120.1\u001b[31m'],
    ['tab control character', '4.120.1\t'],
    ['unbounded first line', `${'v'.repeat(161)}`],
    ['oversized output', '4.120.1\n' + 'x'.repeat(4_100)],
  ])('rejects %s without echoing its content', (_label, raw) => {
    expect(() => normalizeWranglerVersionOutput(raw)).toThrow();
    expect(safeWranglerVersionDiagnostic(raw)).toBe('UNAVAILABLE');
  });

  it('keeps Wrangler display text diagnostic-only and independent of the exact-version tail command', () => {
    const expected = [
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
    ];

    for (const output of ['4.120.1', 'wrangler 4.120.1', 'wrangler 5.0.0']) {
      expect(normalizeWranglerVersionOutput(output)).toBe(output);
      expect(
        buildWranglerTailArgs('simple', 'trace-production', 'b64aec75-81c4-4146-964d-8ff456bbe726'),
      ).toEqual(expected);
    }
    expect(safeWranglerVersionDiagnostic('\u001b[31m')).toBe('UNAVAILABLE');
  });

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

  it('waits for child close after exit so stdout and stderr pipes can drain', async () => {
    const child = new EventEmitter();
    let completed = false;
    const result = waitForChildClose(child as never).then((value) => {
      completed = true;
      return value;
    });

    child.emit('exit', 1, null);
    await Promise.resolve();
    expect(completed).toBe(false);

    child.emit('close', 1, null);
    await expect(result).resolves.toEqual({ code: 1, signal: null });
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

  it('materializes the comparison config without introducing an unrelated Cloudflare build', () => {
    const smoke = readFileSync(path.join(root, 'scripts/production-tail-smoke.ts'), 'utf8');
    expect(smoke).toContain('materializeGeneratedClosedConfig(workerVariables)');
    expect(smoke).toContain("kind: 'config'");
    expect(smoke).not.toContain("['cf:build']");
  });

  it('keeps the simple smoke proof independent of the optional config/env comparison', () => {
    const smoke = readFileSync(path.join(root, 'scripts/production-tail-smoke.ts'), 'utf8');
    expect(smoke.indexOf("kind: 'simple'")).toBeLessThan(smoke.indexOf('TAIL_SMOKE_SIMPLE=PASS'));
    expect(smoke.indexOf('TAIL_SMOKE_SIMPLE=PASS')).toBeLessThan(
      smoke.indexOf('materializeGeneratedClosedConfig(workerVariables)'),
    );
  });

  it('captures diagnostic-only version text before exact-version tail and route acceptance', () => {
    const workflow = readFileSync(
      path.join(root, '.github/workflows/validate-production-canary.yml'),
      'utf8',
    );
    const capture = workflow.indexOf('Capture deployed fixture identity before acceptance probes');
    const secrets = workflow.indexOf('Verify deployed production Worker secret names');
    const version = workflow.indexOf('Record Wrangler version for bounded tail diagnostics');
    const tailAndRoutes = workflow.indexOf(
      'Verify fixture routes and bounded production error tail',
    );
    const sideEffects = workflow.indexOf(
      'Verify fixture transition side effects after acceptance probes',
    );
    const rollback = workflow.indexOf('Inspect and safely roll back a failed fixture transition');

    expect(capture).toBeGreaterThanOrEqual(0);
    expect(capture).toBeLessThan(secrets);
    expect(secrets).toBeLessThan(version);
    expect(version).toBeLessThan(tailAndRoutes);
    expect(tailAndRoutes).toBeLessThan(sideEffects);
    expect(sideEffects).toBeLessThan(rollback);
    expect(workflow).toContain(
      'pnpm exec wrangler --version | pnpm exec tsx scripts/production-fixture-tail-acceptance.ts normalize-version',
    );
    expect(workflow).not.toMatch(/version=.*=~|unexpected format/i);
    expect(workflow).toContain(
      'WRANGLER_VERSION: ${{ steps.tail_wrangler_version.outputs.version }}',
    );

    const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain(
      'pnpm exec wrangler --version | pnpm exec tsx scripts/production-fixture-tail-acceptance.ts normalize-version',
    );
  });

  it('keeps the dedicated smoke workflow manual, feature-ref restricted, and credential-minimal', () => {
    const workflow = readFileSync(
      path.join(root, '.github/workflows/production-tail-smoke.yml'),
      'utf8',
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.ref == 'refs/heads/feat/cloudflare-native-runtime'");
    expect(workflow).toContain('git merge-base --is-ancestor "$approved_sha" HEAD');
    expect(workflow).toContain('ref: feat/cloudflare-native-runtime');
    expect(workflow).toContain('ref: ${{ steps.verify_sha.outputs.sha }}');
    expect(workflow).toContain('expected_sha="${EXPECTED_SHA,,}"');
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
