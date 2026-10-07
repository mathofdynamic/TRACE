import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as analysisModule from '@trace/analysis';
import { main } from './cli.js';
import { collectSyncArtifacts, buildManifest, sync, writeCredential } from './cloud.js';
import {
  parseArtifact,
  serializeArtifact,
  artifactMetadataSchema,
  prBriefAttributionIssue,
  prBriefProjectionSchema,
} from '@trace/schema';

const run = promisify(execFile);
let root: string;
let previous: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'trace-side-effects-'));
  previous = process.cwd();
  await run('git', ['init', '-b', 'main'], { cwd: root });
  await writeFile(join(root, '.gitignore'), '.trace/\n');
  await writeFile(
    join(root, 'sample.ts'),
    "export const PRIVATE_SOURCE_SENTINEL = 'ghp_123456789012345678901234567890123456';\n",
  );
  await run('git', ['add', '.'], { cwd: root });
  await run(
    'git',
    [
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=trace@example.test',
      'commit',
      '-m',
      'Initial',
    ],
    { cwd: root },
  );
  process.chdir(root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  process.chdir(previous);
  await rm(root, { recursive: true, force: true });
});
it('generates a projected PR brief eligible in the exact issue reproduction', async () => {
  await main(['init', '--yes']);
  const result = await main(['pr', '7', '--write', '--yes']);
  expect(result.code).toBe(0);
  const artifact = parseArtifact(
    await readFile((result.value as { artifact: { path: string } }).artifact.path, 'utf8'),
  );
  expect(artifact.metadata.dashboard).toBeDefined();
  const plan = await collectSyncArtifacts(root);
  expect(plan.eligible.map((e) => e.manifest.type)).toContain('pr_brief');
  const preview = await main(['sync', '--dry-run']);
  expect(preview.value).toMatchObject({
    eligible: [expect.objectContaining({ type: 'pr_brief' })],
    sourceCodeIncluded: false,
    codeSnippetsIncluded: false,
  });
});

const git = async (...args: string[]) => (await run('git', args, { cwd: root })).stdout.trim();
const generate = async () => {
  await main(['init', '--yes']);
  const r = await main(['pr', '7', '--write', '--yes']);
  const path = (r.value as { artifact: { path: string } }).artifact.path;
  const content = await readFile(path, 'utf8');
  return { path, content, artifact: parseArtifact(content) };
};
it('preserves source-free projection, canonical body and current attribution', async () => {
  const { content, artifact } = await generate();
  expect(artifact.metadata.dashboard?.pull_request).toMatchObject({
    number: 7,
    findings: expect.any(Number),
    input: { working_tree: 'clean', stable: true },
  });
  expect(content).not.toContain('PRIVATE_SOURCE_SENTINEL');
  expect(content).not.toContain('ghp_123456');
  expect(content).not.toContain(root);
  expect(content).not.toContain('```');
  const target = { branch: 'main', headCommit: await git('rev-parse', 'HEAD') };
  expect(prBriefAttributionIssue(artifact.metadata, target)).toBeNull();
  expect(prBriefAttributionIssue(artifact.metadata, { ...target, branch: 'other' })).toContain(
    'branch',
  );
  expect(
    prBriefAttributionIssue(artifact.metadata, { ...target, headCommit: 'a'.repeat(40) }),
  ).toContain('commit');
  expect(prBriefAttributionIssue(artifact.metadata, target, 'wrong/repository')).toContain(
    'identity',
  );
});
it('excludes historical commit and branch briefs without deleting them', async () => {
  const generated = await generate();
  await git('switch', '-c', 'other');
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  await git('switch', 'main');
  await run(
    'git',
    [
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=trace@example.test',
      'commit',
      '--allow-empty',
      '-m',
      'Advance',
    ],
    { cwd: root },
  );
  expect((await collectSyncArtifacts(root)).excluded[0]?.reason).toContain('commit');
  expect(await readFile(generated.path, 'utf8')).toBe(generated.content);
});
it('never rehabilitates dirty input by reverting changes', async () => {
  await writeFile(join(root, 'dirty.txt'), 'local exploratory input');
  const { artifact } = await generate();
  expect(artifact.metadata.sync_policy).toBe('local_only');
  await rm(join(root, 'dirty.txt'));
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
});
it('keeps unstable input local-only', async () => {
  const original = analysisModule.analyzeChanges;
  vi.spyOn(analysisModule, 'analyzeChanges').mockImplementation(async (...args) => {
    const result = await original(...args);
    await writeFile(join(root, 'changed-during-analysis.txt'), 'not authoritative');
    return result;
  });
  const { artifact } = await generate();
  expect(artifact.metadata.sync_policy).toBe('local_only');
  expect(artifact.metadata.dashboard?.pull_request?.input.stable).toBe(false);
});
it('rejects unsafe/malformed projections and noncanonical bodies', async () => {
  const { artifact } = await generate();
  const d = artifact.metadata.dashboard!;
  for (const field of [
    { title: 'const secret = 42' },
    { summary: '/tmp/private-file' },
    { pull_request: { ...d.pull_request, source: 'private code' } },
    { pull_request: { ...d.pull_request, owner: 'wrong-owner' } },
  ]) {
    expect(
      artifactMetadataSchema.safeParse({ ...artifact.metadata, dashboard: { ...d, ...field } })
        .success,
    ).toBe(false);
  }
  expect(() => serializeArtifact(artifact.metadata, 'const privateSource = 42')).toThrow(
    /noncanonical/,
  );
  expect(() =>
    parseArtifact(serializeArtifact(artifact.metadata, artifact.markdown) + '\nprivate patch'),
  ).toThrow(/noncanonical/);
});
it('real sync uploads only the validated brief and preserves privacy flags', async () => {
  await git('remote', 'add', 'origin', 'https://github.com/example/project.git');
  const { content } = await generate();
  const target = { branch: 'main', headCommit: await git('rev-parse', 'HEAD') };
  const binding = {
    server: 'https://trace.example.test',
    repositoryId: '11111111-1111-4111-8111-111111111111',
    repository: 'example/project',
    workspaceId: 'fixture',
    workspaceName: 'Fixture',
    connectedAt: new Date().toISOString(),
  };
  await writeFile(join(root, '.trace/state/dashboard.json'), JSON.stringify(binding));
  const config = await mkdtemp(join(tmpdir(), 'trace-pr-credential-'));
  const previousConfig = process.env.TRACE_CONFIG_HOME;
  process.env.TRACE_CONFIG_HOME = config;
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body));
    calls.push({ path, body });
    return new Response(
      JSON.stringify(
        path.endsWith('negotiate')
          ? {
              operationId: '11111111-1111-4111-8111-111111111111',
              missing: ['pr-github-7'],
              conflicts: [],
              status: 'uploading',
            }
          : { completed: true },
      ),
      { status: 200 },
    );
  });
  try {
    await writeCredential({
      server: binding.server,
      accessToken: 'trc_fixture-token',
      connectionId: 'fixture',
      savedAt: new Date().toISOString(),
    });
    const plan = await buildManifest(root, binding, target.branch, target.headCommit);
    expect(plan.manifest).toMatchObject({ sourceCodeIncluded: false, codeSnippetsIncluded: false });
    const mismatchedBinding = await buildManifest(
      root,
      { ...binding, repository: 'example/wrong' },
      target.branch,
      target.headCommit,
    );
    expect(mismatchedBinding.manifest.artifacts.some((entry) => entry.type === 'pr_brief')).toBe(
      false,
    );
    expect(
      mismatchedBinding.excluded.some((entry) => entry.reason.includes('repository identity')),
    ).toBe(true);
    await sync(root, target.branch, target.headCommit, false);
    expect(calls.find((c) => c.path.endsWith('/artifact'))?.body.content).toBe(content);
    expect(JSON.stringify(calls)).not.toContain('PRIVATE_SOURCE_SENTINEL');
    expect(calls.find((c) => c.path.endsWith('/negotiate'))?.body).toMatchObject({
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
    });
  } finally {
    if (previousConfig === undefined) delete process.env.TRACE_CONFIG_HOME;
    else process.env.TRACE_CONFIG_HOME = previousConfig;
    await rm(config, { recursive: true, force: true });
  }
});

it('keeps existing analysis/report sync eligible in a mixed batch and rejects changed repository identity', async () => {
  await main(['init', '--yes']);
  await main(['analyze', '--yes']);
  await main(['report', 'daily', '--yes']);
  await main(['pr', '7', '--write', '--yes']);
  const plan = await collectSyncArtifacts(root);
  expect(plan.eligible.map((entry) => entry.manifest.type)).toEqual(
    expect.arrayContaining(['analysis', 'daily_report', 'pr_brief']),
  );
  await git('remote', 'add', 'origin', 'https://github.com/example/different.git');
  const changed = await collectSyncArtifacts(root);
  expect(changed.eligible.some((entry) => entry.manifest.type === 'pr_brief')).toBe(false);
  expect(changed.excluded.some((entry) => entry.reason.includes('repository'))).toBe(true);
});

it('keeps a detached-HEAD PR brief local-only instead of inventing branch attribution', async () => {
  await git('checkout', '--detach');
  const { artifact } = await generate();
  expect(artifact.metadata.sync_policy).toBe('local_only');
  expect(
    (await collectSyncArtifacts(root)).eligible.some((entry) => entry.manifest.type === 'pr_brief'),
  ).toBe(false);
});

it('regenerates legacy and dirty briefs safely while repeated dry-runs preserve bytes', async () => {
  const generated = await generate();
  await writeFile(
    generated.path,
    serializeArtifact(
      { ...generated.artifact.metadata, dashboard: undefined, evidence: [] },
      '# Legacy brief',
    ),
  );
  expect((await main(['pr', '7', '--write', '--yes'])).code).toBe(0);
  expect(
    (await collectSyncArtifacts(root)).eligible.some((entry) => entry.manifest.type === 'pr_brief'),
  ).toBe(true);
  await writeFile(join(root, 'dirty.txt'), 'local-only input');
  await main(['pr', '7', '--write', '--yes']);
  expect(parseArtifact(await readFile(generated.path, 'utf8')).metadata.sync_policy).toBe(
    'local_only',
  );
  await rm(join(root, 'dirty.txt'));
  const dirtyContent = await readFile(generated.path, 'utf8');
  for (let i = 0; i < 2; i++) await main(['pr', '7', '--write', '--yes', '--dry-run']);
  expect(await readFile(generated.path, 'utf8')).toBe(dirtyContent);
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  await main(['pr', '7', '--write', '--yes']);
  expect(
    (await collectSyncArtifacts(root)).eligible.some((entry) => entry.manifest.type === 'pr_brief'),
  ).toBe(true);
});
it.each(['feature/foo@bar', 'release/1.0+build', 'topic=one', 'feature,csv', 'feature/تست'])(
  'generates and syncs a brief on valid Git branch %s',
  async (branch) => {
    await git('check-ref-format', '--branch', branch);
    await git('checkout', '-b', branch);
    const { artifact } = await generate();
    expect(artifact.metadata.dashboard?.branch).toBe(branch);
    expect(
      (await collectSyncArtifacts(root)).eligible.some(
        (entry) => entry.manifest.type === 'pr_brief',
      ),
    ).toBe(true);
  },
);

it('rejects invalid Git refs rather than allowing unsafe attribution strings', async () => {
  const { artifact } = await generate();
  const p = artifact.metadata.dashboard!.pull_request!;
  for (const branch of [
    './topic',
    'topic..one',
    'topic@{one',
    'topic.lock',
    'topic/',
    'topic~one',
    'topic one',
    'topic\\one',
    'topic[one',
  ]) {
    expect(prBriefProjectionSchema.safeParse({ ...p, input: { ...p.input, branch } }).success).toBe(
      false,
    );
  }
});
