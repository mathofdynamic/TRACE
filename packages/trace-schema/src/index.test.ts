import { access, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isSafeTraceRelativePath,
  serializeArtifact,
  syncManifestSchema,
  validateTraceDirectory,
  writeArtifact,
} from './index.js';

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

describe('TRACE directory controls', () => {
  it('does not treat the root README as an artifact', async () => {
    root = await mkdtemp(join(tmpdir(), 'trace-schema-'));
    await writeFile(join(root, 'README.md'), '# TRACE artifacts\n');
    await expect(validateTraceDirectory(root)).resolves.toEqual([]);
  });
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

  it('previews repeatedly without creating a missing artifact root', async () => {
    root = await mkdtemp(join(tmpdir(), 'trace-schema-'));
    const traceRoot = join(root, '.trace');
    const options = {
      traceRoot,
      relativePath: 'decisions/test.md',
      metadata,
      markdown: '# Test',
      dryRun: true,
    };
    const first = await writeArtifact(options);
    expect(await writeArtifact(options)).toEqual(first);
    await expect(access(traceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects invalid writes before creating a missing artifact root', async () => {
    root = await mkdtemp(join(tmpdir(), 'trace-schema-'));
    const traceRoot = join(root, '.trace');
    for (const dryRun of [true, false]) {
      await expect(
        writeArtifact({
          traceRoot,
          relativePath: 'decisions/test.md',
          metadata,
          markdown: '<script>unsafe</script>',
          dryRun,
        }),
      ).rejects.toThrow(/Unsafe Markdown/);
      await expect(access(traceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('rejects symlink roots and children during previews without writing to their targets', async () => {
    root = await mkdtemp(join(tmpdir(), 'trace-schema-'));
    const outside = join(root, 'outside');
    await mkdir(outside);
    const linkedRoot = join(root, '.trace');
    await symlink(outside, linkedRoot, 'junction');
    await expect(
      writeArtifact({
        traceRoot: linkedRoot,
        relativePath: 'test.md',
        metadata,
        markdown: '# Test',
        dryRun: true,
      }),
    ).rejects.toThrow(/Symlink/);
    await rm(linkedRoot);
    await mkdir(linkedRoot);
    await symlink(outside, join(linkedRoot, 'decisions'), 'junction');
    await expect(
      writeArtifact({
        traceRoot: linkedRoot,
        relativePath: 'decisions/test.md',
        metadata,
        markdown: '# Test',
        dryRun: true,
      }),
    ).rejects.toThrow(/Symlink/);
    expect(await readdir(outside)).toEqual([]);
  });

  it.each([true, false])(
    'rejects symlinked ancestors of a missing root (dryRun=%s)',
    async (dryRun) => {
      root = await mkdtemp(join(tmpdir(), 'trace-schema-'));
      const outside = join(root, 'outside');
      await mkdir(outside);
      const link = join(root, 'link');
      await symlink(outside, link, 'junction');
      await expect(
        writeArtifact({
          traceRoot: join(link, '.trace'),
          relativePath: 'decisions/test.md',
          metadata,
          markdown: '# Test',
          dryRun,
        }),
      ).rejects.toThrow(/Symlink/);
      expect(await readdir(outside)).toEqual([]);
    },
  );

  it('accepts only bounded source-free sync manifests and safe .trace paths', () => {
    const artifact = {
      id: 'decision-test-001',
      type: 'decision' as const,
      path: 'decisions/decision-test-001.md',
      sha256: 'a'.repeat(64),
      size: 120,
      schemaVersion: '0.1' as const,
      sensitivity: 'internal' as const,
      revision: '2026-08-12T08:00:00.000Z',
    };
    expect(
      syncManifestSchema.parse({
        protocolVersion: '0.1',
        schemaVersion: '0.1',
        syncId: '3dcff4a8-e356-4d08-ae41-486490a3f293',
        repositoryId: 'eec43f39-40da-47b2-9453-4058bbf09018',
        repository: 'example/atlas-ts',
        executionOrigin: 'local',
        traceVersion: '0.1.0',
        createdAt: '2026-08-12T08:00:00.000Z',
        baseOperationId: null,
        git: { branch: 'main', headCommit: 'a31cc0123' },
        artifacts: [artifact],
        sourceCodeIncluded: false,
        codeSnippetsIncluded: false,
      }).artifacts,
    ).toHaveLength(1);
    for (const unsafe of [
      '../source.ts',
      '/etc/passwd.md',
      'C:\\secret.md',
      '%2e%2e/secret.md',
      '%252e%252e/secret.md',
      'reports\\daily.md',
    ]) {
      expect(isSafeTraceRelativePath(unsafe)).toBe(false);
    }
  });
});
