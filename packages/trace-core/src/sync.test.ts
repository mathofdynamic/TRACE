import { describe, expect, it } from 'vitest';
import { createSyncPlan, redactSyncText } from './index.js';

describe('selective sync contract', () => {
  it('plans only allowlisted artifact transfers and exposes divergence', () => {
    const manifest = {
      protocolVersion: '0.1' as const,
      repository: 'acme/app',
      generatedAt: new Date().toISOString(),
      sourceCodeIncluded: false as const,
      artifacts: [
        {
          id: 'daily-1',
          path: 'reports/daily/2026-08-08.md',
          artifactType: 'daily_report',
          checksum: 'a',
          sensitivity: 'internal' as const,
          revision: 'r2',
          sizeBytes: 10,
        },
      ],
    };
    expect(
      createSyncPlan(
        manifest,
        {
          allowedArtifactTypes: ['daily_report'],
          maximumSensitivity: 'internal',
          localOnlyPaths: [],
          structuredOnly: false,
          requireApproval: false,
          allowedOrigins: ['local'],
        },
        [{ ...manifest.artifacts[0]!, checksum: 'b', revision: 'r1' }],
      )[0]?.action,
    ).toBe('conflict');
  });

  it('redacts secret-like values without exposing removed content', () => {
    const result = redactSyncText('token=super-secret-value');
    expect(result.text).not.toContain('super-secret-value');
    expect(result.categories).toContain('secret-like-value');
  });
});
