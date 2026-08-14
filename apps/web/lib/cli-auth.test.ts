import { describe, expect, it } from 'vitest';
import { hashCredential, CLI_SCOPES } from './cli-auth';

describe('CLI credential boundary', () => {
  it('uses one-way hashes and least-privilege scopes', () => {
    const token = 'trc_example-secret';
    expect(hashCredential(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCredential(token)).not.toContain(token);
    expect(CLI_SCOPES).toEqual(['repository:read', 'sync:write']);
  });
});
