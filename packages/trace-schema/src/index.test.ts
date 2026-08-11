import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeArtifact, writeArtifact } from './index.js';

const metadata = {
  schema_version: '0.1' as const,
  id: 'decision-test-001',
  artifact_type: 'decision' as const,
  repository: { provider: 'github', owner: 'example', name: 'atlas-ts' },
  created_at: '2026-08-08T08:00:00Z',
  updated_at: '2026-08-08T08:00:00Z',
  generator: 'test/0.1',
  execution_origin: 'local' as const,
  source_refs: [],
  evidence: [],
  review_status: 'draft' as const,
  sensitivity: 'internal' as const,
  sync_policy: 'local_only' as const,
};

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('safe trace artifacts', () => {
  it('rejects path traversal and unsafe Markdown', async () => {
    root = await mkdtemp(join(tmpdir(), 'trace-schema-'));
    await expect(
      writeArtifact({
        traceRoot: root,
        relativePath: '../outside.md',
        metadata,
        markdown: '# Test',
      }),
    ).rejects.toThrow(/escapes/);
    expect(() => serializeArtifact(metadata, '<script>alert(1)</script>')).toThrow(
      /Unsafe Markdown/,
    );
  });

  it('writes deterministic front matter atomically and refuses silent overwrite', async () => {
    root = await mkdtemp(join(tmpdir(), 'trace-schema-'));
    const first = await writeArtifact({
      traceRoot: root,
      relativePath: 'decisions/decision-test-001.md',
      metadata,
      markdown: '# Test',
    });
    expect(first.dryRun).toBe(false);
    expect(first.checksum).toHaveLength(64);
    await expect(
      writeArtifact({
        traceRoot: root,
        relativePath: 'decisions/decision-test-001.md',
        metadata,
        markdown: '# Changed',
      }),
    ).rejects.toThrow(/already exists/);
  });
});
