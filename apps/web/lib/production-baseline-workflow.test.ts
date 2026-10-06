import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/production-fixture-baseline-check.yml', import.meta.url),
  'utf8',
);
describe('protected production baseline inspection workflow', () => {
  it('uses the protected credential only in a manual exact-ref read-only workflow', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: production-canary');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('"${REQUESTED_SHA,,}" != "${DISPATCH_SHA,,}"');
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
    expect(workflow).not.toMatch(/wrangler (deploy|rollback)|secret put|secrets-file|consumer add/);
  });
  it('requires candidate source ancestry on main and retains the guarded before path', () => {
    expect(workflow).toContain('git merge-base --is-ancestor "$SOURCE_SHA" HEAD');
    expect(workflow).toContain('[[ "$GITHUB_REF" == refs/heads/main ]]');
    expect(workflow).toContain('inspect-reviewed-owner');
    expect(workflow).toContain('verify-production-fixture-transition.ts before');
    expect(workflow).toContain('REVIEWED_WORKER_VERSION_ID: ${{ inputs.worker_version_id }}');
    expect(workflow).toContain('REVIEWED_WORKER_SOURCE_SHA: ${{ inputs.source_sha }}');
    expect(workflow).toContain(
      'OWNER_CATALOG_DIAGNOSTIC_PUBLIC_KEY: ${{ inputs.diagnostic_public_key }}',
    );
    expect(workflow).not.toContain('DIAGNOSTIC_PRIVATE_KEY');
  });
});

const canaryWorkflow = readFileSync(
  new URL('../../../.github/workflows/validate-production-canary.yml', import.meta.url),
  'utf8',
);
describe('exact application release with reviewed rollback verification', () => {
  it('keeps the exact application SHA while pinning guard source to the protected workflow commit', () => {
    expect(canaryWorkflow).toContain('ref: ${{ inputs.sha }}');
    expect(canaryWorkflow).toContain('ref: ${{ github.sha }}');
    expect(canaryWorkflow).toContain('path: .trace-cache/production-verifier');
    expect(canaryWorkflow).toContain('persist-credentials: false');
    expect(canaryWorkflow).toContain('[[ "$actual_verifier_sha" == "$VERIFIER_SHA" ]]');
    expect(canaryWorkflow).toContain(
      'git merge-base --is-ancestor "$EXPECTED_SHA" "$VERIFIER_SHA"',
    );
    expect(canaryWorkflow).toContain('[[ "$(git rev-parse HEAD)" == "${EXPECTED_SHA,,}" ]]');
  });
  it('uses the same reviewed guard for capture, acceptance, side effects and rollback', () => {
    const guardedCommand =
      'pnpm exec tsx .trace-cache/production-verifier/scripts/verify-production-fixture-transition.ts';
    expect(canaryWorkflow.split(guardedCommand)).toHaveLength(5);
    expect(canaryWorkflow).not.toContain(
      'pnpm exec tsx scripts/verify-production-fixture-transition.ts',
    );
    const build = canaryWorkflow.indexOf('Build the Cloudflare bundle');
    const checkout = canaryWorkflow.indexOf('Check out reviewed production verification tooling');
    const capture = canaryWorkflow.indexOf(
      'Capture verified production baseline before fixture deployment',
    );
    const deploy = canaryWorkflow.indexOf('      - name: Deploy production canary');
    expect(build).toBeLessThan(checkout);
    expect(checkout).toBeLessThan(capture);
    expect(capture).toBeLessThan(deploy);
    expect(canaryWorkflow).toContain("steps.capture_transition_baseline.outcome == 'success'");
    expect(canaryWorkflow).toContain('--message "TRACE production canary $DEPLOY_SHA"');
  });
});
