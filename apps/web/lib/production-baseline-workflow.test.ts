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
