import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/production-queue-drain-check.yml'),
  'utf8',
);

describe('production Queue drain workflow safety contract', () => {
  it('is manual-only, read-only, environment-scoped, and feature-ref restricted', () => {
    expect(workflow).toMatch(/^on:\s*\n  workflow_dispatch:\s*$/m);
    expect(workflow).not.toMatch(/^  (push|pull_request|schedule):/m);
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('environment: production-canary');
    expect(workflow).toContain("github.ref == 'refs/heads/feat/cloudflare-native-runtime'");
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(workflow.match(/\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/g)).toHaveLength(1);
    expect(workflow).not.toMatch(/set\s+-x|echo\s+.*CLOUDFLARE_API_TOKEN/i);
  });

  it('pins the production account and Queue and performs GET requests only', () => {
    expect(workflow).toContain("'c5d6cf110905c91fc3eed1abaf8236a2'");
    expect(workflow).toContain("'9ef092975a554ba296a63b162b16522f'");
    expect(workflow).toContain("'trace-production-jobs'");
    expect(workflow.match(/fetch\(/g)).toHaveLength(1);
    expect(workflow).toContain("method: 'GET'");
    expect(workflow.match(/method\s*:/g)).toHaveLength(1);

    for (const forbidden of [
      '/messages',
      '/purge',
      '/ack',
      '/retry',
      'queues/consumers',
      'wrangler deploy',
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  it('limits observations and waits 30 seconds then 60 seconds', () => {
    expect(workflow).toContain('attempt <= 3');
    expect(workflow).toContain('await wait(30000)');
    expect(workflow).toContain('await wait(60000)');
    expect(workflow).toContain('Observation ${attempt} UTC');
  });

  it('passes only when backlog reaches zero and fails after the final nonzero read', () => {
    expect(workflow).toContain('metrics.backlog_count === 0');
    expect(workflow).toContain('DRAIN STATUS: PASS (current backlog_count is 0).');
    expect(workflow).toContain('if (!drained)');
    expect(workflow).toContain('DRAIN STATUS: NOT DRAINED after three bounded observations.');
    expect(workflow).toContain('process.exitCode = 1');
  });
});
