import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArtifact, serializeArtifact } from '@trace/schema';
import { main } from './cli.js';
import { buildManifest, collectSyncArtifacts, sync, writeCredential } from './cloud.js';
import { gitSnapshot } from './analysis-attribution.js';

const run = promisify(execFile);
const binding = {
  server: 'https://trace.example.test',
  repositoryId: '11111111-1111-4111-8111-111111111111',
  repository: 'mathofdynamic/TRACE',
  workspaceId: 'test',
  workspaceName: 'test',
  connectedAt: '2026-10-04T00:00:00.000Z',
};
let root: string;
let previous: string;
const git = async (...args: string[]) => (await run('git', args, { cwd: root })).stdout.trim();
const generate = async () => {
  const result = await main(['analyze', '--json']);
  expect(result.code).toBe(0);
  return (result.value as { artifact: { path: string } }).artifact.path;
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'trace-attribution-'));
  previous = process.cwd();
  await git('init', '-b', 'main');
  await git('remote', 'add', 'origin', 'https://github.com/mathofdynamic/TRACE.git');
  await writeFile(join(root, '.gitignore'), '.trace/\n');
  await writeFile(join(root, 'sample.ts'), 'export const value = 1;\n');
  await git('add', '.');
  await git(
    '-c',
    'user.name=TRACE Test',
    '-c',
    'user.email=trace@example.test',
    'commit',
    '-m',
    'Initial',
  );
  process.chdir(root);
  expect((await main(['init', '--yes'])).code).toBe(0);
});
afterEach(async () => {
  process.chdir(previous);
  await rm(root, { recursive: true, force: true });
});

describe('analysis synchronization attribution', () => {
  it('retains historical commits and branches while selecting only fresh current analysis in a mixed batch', async () => {
    const old = await generate();
    const oldBytes = await readFile(old, 'utf8');
    await git('switch', '-c', 'other');
    await writeFile(join(root, 'sample.ts'), 'export const value = 2;\n');
    await git('add', '.');
    await git(
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=trace@example.test',
      'commit',
      '-m',
      'Other',
    );
    const other = await generate();
    const otherBytes = await readFile(other, 'utf8');
    await git('switch', 'main');
    await writeFile(join(root, 'sample.ts'), 'export const value = 3;\n');
    await git('add', '.');
    await git(
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=trace@example.test',
      'commit',
      '-m',
      'Current',
    );
    const current = await generate();
    const target = await gitSnapshot(root);
    const plan = await buildManifest(root, binding, target.branch, target.headCommit);
    expect(plan.manifest.artifacts.map((item) => item.id)).toEqual([
      parseArtifact(await readFile(current, 'utf8')).metadata.id,
    ]);
    expect(plan.excluded).toHaveLength(2);
    expect(plan.excluded.every((item) => item.reason.includes('commit differs'))).toBe(true);
    expect(plan.manifest).toMatchObject({
      git: { branch: 'main', headCommit: target.headCommit },
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
    });
    expect(await readFile(old, 'utf8')).toBe(oldBytes);
    expect(await readFile(other, 'utf8')).toBe(otherBytes);
  });
  it('excludes another branch even when the commit is identical', async () => {
    await git('switch', '-c', 'other');
    const path = await generate();
    const bytes = await readFile(path, 'utf8');
    await git('switch', 'main');
    expect((await collectSyncArtifacts(root)).excluded[0]?.reason).toContain('branch differs');
    expect(await readFile(path, 'utf8')).toBe(bytes);
    await generate();
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(1);
  });
  it.each(['tracked', 'staged', 'untracked'])(
    'does not rehabilitate %s dirty analysis after reverting changes',
    async (kind) => {
      const path = join(root, kind === 'untracked' ? 'extra.ts' : 'sample.ts');
      await writeFile(path, 'export const value = 999;\n');
      if (kind === 'staged') await git('add', 'sample.ts');
      const artifact = await generate();
      expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
      if (kind === 'untracked') await rm(path);
      else await git('restore', '--source=HEAD', '--staged', '--worktree', 'sample.ts');
      expect((await gitSnapshot(root)).workingTree).toBe('clean');
      expect((await collectSyncArtifacts(root)).excluded[0]?.reason).toBe('local-only policy');
      const snapshot = await gitSnapshot(root);
      expect(
        (await buildManifest(root, binding, snapshot.branch, snapshot.headCommit)).manifest
          .artifacts,
      ).toHaveLength(0);
      await generate();
      expect((await collectSyncArtifacts(root)).eligible).toHaveLength(1);
      expect(await readFile(artifact, 'utf8')).toContain('working_tree: clean');
    },
  );
  it('does not trust Git configuration that hides untracked input', async () => {
    await git('config', 'status.showUntrackedFiles', 'no');
    const extra = join(root, 'extra.ts');
    await writeFile(extra, 'export const uncommitted = 1;\n');
    expect(await git('status', '--porcelain')).toBe('');
    expect((await gitSnapshot(root)).workingTree).toBe('dirty');
    const path = await generate();
    expect(parseArtifact(await readFile(path, 'utf8')).metadata.sync_policy).toBe('local_only');
    await rm(extra);
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  });
  it('still rejects dirty input provenance if an artifact is relabeled allowlisted', async () => {
    await writeFile(join(root, 'sample.ts'), 'export const value = 999;\n');
    const path = await generate();
    await git('restore', 'sample.ts');
    const artifact = parseArtifact(await readFile(path, 'utf8'));
    artifact.metadata.sync_policy = 'allowlisted';
    await writeFile(path, serializeArtifact(artifact.metadata, artifact.markdown));
    expect((await collectSyncArtifacts(root)).excluded[0]?.reason).toContain(
      'not generated from a clean',
    );
  });
  it('excludes analysis when HEAD advances and rejects stale caller context', async () => {
    await generate();
    const old = await gitSnapshot(root);
    await git(
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=trace@example.test',
      'commit',
      '--allow-empty',
      '-m',
      'Advance',
    );
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
    await expect(buildManifest(root, binding, old.branch, old.headCommit)).rejects.toThrow(
      'HEAD changed',
    );
  });
  it('real sync sends only the current analysis and the connected dry-run exposes its attribution', async () => {
    const historical = await generate();
    await git(
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=trace@example.test',
      'commit',
      '--allow-empty',
      '-m',
      'Current',
    );
    const current = await generate();
    const id = parseArtifact(await readFile(current, 'utf8')).metadata.id;
    const target = await gitSnapshot(root);
    await writeFile(join(root, '.trace/state/dashboard.json'), JSON.stringify(binding));
    const dryRun = await main(['sync', '--dry-run', '--json']);
    expect(dryRun.value).toMatchObject({
      git: { branch: 'main', headCommit: target.headCommit },
      eligible: [{ id }],
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
    });
    const config = await mkdtemp(join(tmpdir(), 'trace-attribution-credential-'));
    const previousConfig = process.env.TRACE_CONFIG_HOME;
    process.env.TRACE_CONFIG_HOME = config;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      expect(String(input)).toBe(`${binding.server}/api/sync/negotiate`);
      const manifest = JSON.parse(String(init?.body));
      expect(manifest.artifacts.map((item: { id: string }) => item.id)).toEqual([id]);
      expect(manifest.git).toEqual({ branch: 'main', headCommit: target.headCommit });
      expect(manifest.sourceCodeIncluded).toBe(false);
      expect(manifest.codeSnippetsIncluded).toBe(false);
      return new Response(
        JSON.stringify({
          operationId: 'test-completed',
          status: 'completed',
          missing: [],
          conflicts: [],
          idempotent: true,
        }),
        { status: 200 },
      );
    });
    try {
      await writeCredential({
        server: binding.server,
        accessToken: 'trc_test-attribution',
        connectionId: 'test',
        savedAt: new Date().toISOString(),
      });
      expect(await sync(root, 'main', target.headCommit, false)).toMatchObject({
        status: 'completed',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      await expect(readFile(historical, 'utf8')).resolves.toContain('head_commit:');
    } finally {
      fetch.mockRestore();
      if (previousConfig === undefined) delete process.env.TRACE_CONFIG_HOME;
      else process.env.TRACE_CONFIG_HOME = previousConfig;
      await rm(config, { recursive: true, force: true });
    }
  });
  it('rejects dirty synchronization before any network request even if an older clean analysis exists', async () => {
    await generate();
    const snapshot = await gitSnapshot(root);
    await writeFile(join(root, '.trace/state/dashboard.json'), JSON.stringify(binding));
    await writeFile(join(root, 'sample.ts'), 'export const value = 9;\n');
    await expect(sync(root, snapshot.branch, snapshot.headCommit, false)).rejects.toThrow(
      'clean working tree',
    );
  });
  it('keeps analysis before the first commit local-only rather than claiming a committed input', async () => {
    await git('checkout', '--orphan', 'unborn');
    const path = await generate();
    expect(parseArtifact(await readFile(path, 'utf8')).metadata.sync_policy).toBe('local_only');
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  });
  it('supports detached local dry-run but refuses authoritative sync without a named branch', async () => {
    await git('checkout', '--detach');
    await generate();
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(1);
    const target = await gitSnapshot(root);
    await expect(buildManifest(root, binding, target.branch, target.headCommit)).rejects.toThrow(
      'named Git branch',
    );
  });
  it('fails closed for legacy analysis without structured input provenance', async () => {
    const path = await generate();
    const artifact = parseArtifact(await readFile(path, 'utf8'));
    artifact.metadata.evidence = artifact.metadata.evidence.filter((item) => item.type !== 'check');
    await writeFile(path, serializeArtifact(artifact.metadata, artifact.markdown));
    expect((await collectSyncArtifacts(root)).excluded[0]?.reason).toContain(
      'provenance is unverified',
    );
    await generate();
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(1);
  });
  it('retains privacy exclusions on an otherwise current clean analysis', async () => {
    const path = await generate();
    await writeFile(path, (await readFile(path, 'utf8')) + '\n```ts\nconst value = 1;\n```\n');
    expect((await collectSyncArtifacts(root)).excluded[0]?.reason).toBe(
      'code snippets are disabled',
    );
  });
});
