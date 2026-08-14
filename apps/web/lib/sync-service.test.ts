import { describe, expect, it } from 'vitest';
import { syncManifestSchema } from '@trace/schema';

describe('sync protocol limits', () => {
  it('rejects source inclusion and traversal before persistence', () => {
    const manifest = {
      protocolVersion: '0.1',
      schemaVersion: '0.1',
      syncId: 'd1f6a51f-5c02-48ec-a26a-203f42b40224',
      repositoryId: '0d67ce1f-83a9-4eb6-b251-edbf2f042370',
      repository: 'mathofdynamic/TRACE',
      executionOrigin: 'local',
      traceVersion: '0.1.0',
      createdAt: '2026-08-12T00:00:00.000Z',
      baseOperationId: null,
      git: { branch: 'main', headCommit: 'abcdef1234567' },
      sourceCodeIncluded: true,
      codeSnippetsIncluded: false,
      artifacts: [
        {
          id: 'analysis-test',
          type: 'analysis',
          path: '../source.ts.md',
          sha256: 'a'.repeat(64),
          size: 20,
          schemaVersion: '0.1',
          sensitivity: 'internal',
          revision: '2026-08-12T00:00:00.000Z',
        },
      ],
    };
    expect(syncManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
