import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appWorkflow = readFileSync(
  new URL(
    '../../../.github/workflows/production-github-fixture-installation-check.yml',
    import.meta.url,
  ),
  'utf8',
);
const d1Workflow = readFileSync(
  new URL('../../../.github/workflows/production-fixture-d1-state-check.yml', import.meta.url),
  'utf8',
);

describe('production fixture verification workflows', () => {
  it('keeps the App installation verifier manual, feature-ref restricted, and minimally credentialed', () => {
    expect(appWorkflow).toContain('workflow_dispatch:');
    expect(appWorkflow).toContain("github.ref == 'refs/heads/feat/cloudflare-native-runtime'");
    expect(appWorkflow).toContain('permissions:\n  contents: read');
    expect(appWorkflow).toContain('timeout-minutes: 5');
    expect(appWorkflow).toContain('environment: production-canary');
    expect(appWorkflow).toContain('TRACE_GITHUB_APP_ID: ${{ vars.TRACE_GITHUB_APP_ID }}');
    expect(appWorkflow).toContain(
      'TRACE_GITHUB_APP_CLIENT_ID: ${{ vars.TRACE_GITHUB_APP_CLIENT_ID }}',
    );
    expect(appWorkflow).toContain(
      'TRACE_GITHUB_APP_PRIVATE_KEY: ${{ secrets.TRACE_GITHUB_APP_PRIVATE_KEY }}',
    );
    for (const forbiddenSecret of [
      'CLOUDFLARE_API_TOKEN',
      'TRACE_GITHUB_APP_CLIENT_SECRET',
      'TRACE_GITHUB_WEBHOOK_SECRET',
      'TRACE_GITHUB_OAUTH_CLIENT_SECRET',
      'TRACE_AUTH_SECRET',
    ]) {
      expect(appWorkflow).not.toContain(forbiddenSecret);
    }
    expect(appWorkflow).not.toContain('wrangler deploy');
    expect(appWorkflow).not.toContain('upload-artifact');
  });

  it('keeps D1 checks to fixed stages, exact source checkout, and protected read-only credentials', () => {
    expect(d1Workflow).toContain('workflow_dispatch:');
    expect(d1Workflow).toContain("github.ref == 'refs/heads/feat/cloudflare-native-runtime'");
    expect(d1Workflow).toContain('permissions:\n  contents: read');
    expect(d1Workflow).toContain('timeout-minutes: 5');
    expect(d1Workflow).toContain('environment: production-canary');
    expect(d1Workflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(d1Workflow).toContain('before-oauth');
    expect(d1Workflow).toContain('after-oauth');
    expect(d1Workflow).toContain('after-installation');
    expect(d1Workflow).not.toContain('wrangler deploy');
    expect(d1Workflow).not.toContain('secret put');
    expect(d1Workflow).not.toContain('Queue Push');
  });
});
