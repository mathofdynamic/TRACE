import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
  await run('git', ['remote', 'add', 'origin', 'https://github.com/example/project.git'], {
    cwd: root,
  });
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
it.each(['dirty', 'branch', 'commit'] as const)(
  'rejects transient collected %s input even when snapshots are restored',
  async (change) => {
    const original = analysisModule.analyzeChanges;
    vi.spyOn(analysisModule, 'analyzeChanges').mockImplementation(async (input) => {
      if (change === 'dirty') input.changeSet.workingTree = 'dirty';
      if (change === 'branch') input.changeSet.headRef = 'transient-branch';
      if (change === 'commit') input.changeSet.commits[0]!.sha = 'b'.repeat(40);
      return original(input);
    });
    const { artifact } = await generate();
    expect(artifact.metadata.sync_policy).toBe('local_only');
    expect(artifact.metadata.dashboard?.pull_request?.input.stable).toBe(false);
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  },
);
it('rejects unsafe/malformed projections and noncanonical bodies', async () => {
  const { artifact } = await generate();
  const d = artifact.metadata.dashboard!;
  expect(
    artifactMetadataSchema.safeParse({ ...artifact.metadata, generator: 'int main(){return 42;}' })
      .success,
  ).toBe(false);
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
  await git('remote', 'set-url', 'origin', 'https://github.com/example/project.git');
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
  await git('remote', 'set-url', 'origin', 'https://github.com/example/different.git');
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
it.each(['@', 'feature/foo@bar', 'release/1.0+build', 'topic=one', 'feature,csv', 'feature/تست'])(
  'generates and syncs a brief on valid Git branch %s',
  async (branch) => {
    await git('remote', 'set-url', 'origin', 'https://github.com/example/project.git');
    await git('check-ref-format', '--branch', branch);
    await git('checkout', '-b', branch);
    const { artifact } = await generate();
    expect(artifact.metadata.dashboard?.branch).toBe(branch);
    const plan = await buildManifest(
      root,
      {
        server: 'https://trace.example.test',
        repositoryId: '11111111-1111-4111-8111-111111111111',
        repository: 'example/project',
        workspaceId: 'fixture',
        workspaceName: 'Fixture',
        connectedAt: new Date().toISOString(),
      },
      branch,
      await git('rev-parse', 'HEAD'),
    );
    expect(plan.manifest.git.branch).toBe(branch);
    expect(plan.manifest.artifacts.some((entry) => entry.type === 'pr_brief')).toBe(true);
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

it('uses only a positional PR number and never interprets numeric Git options as the identifier', async () => {
  await main(['init', '--yes']);
  for (const option of ['--base', '--base-sha']) {
    const invalid = await main(['pr', option, '123', '--write', '--yes']);
    expect(invalid.code).toBe(2);
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  }
  const valid = await main(['pr', '--base', '123', '--base-sha', '456', '7', '--write', '--yes']);
  expect(valid.code).toBe(0);
  const parsed = parseArtifact(
    await readFile((valid.value as { artifact: { path: string } }).artifact.path, 'utf8'),
  );
  expect(parsed.metadata.dashboard?.pull_request?.number).toBe(7);
});
it('rejects missing or contradictory commit provenance even with a current projection', async () => {
  const { artifact } = await generate();
  for (const source_refs of [
    [],
    [{ type: 'commit', locator: 'a'.repeat(40) }],
    [
      { type: 'commit', locator: artifact.metadata.dashboard!.head_commit },
      { type: 'commit', locator: 'a'.repeat(40) },
    ],
  ]) {
    expect(artifactMetadataSchema.safeParse({ ...artifact.metadata, source_refs }).success).toBe(
      false,
    );
  }
});

it('excludes a current brief when the saved dashboard binding names another repository', async () => {
  await git('remote', 'set-url', 'origin', 'https://github.com/example/project.git');
  await generate();
  const headCommit = await git('rev-parse', 'HEAD');
  const plan = await buildManifest(
    root,
    {
      server: 'https://trace.example.test',
      repositoryId: '11111111-1111-4111-8111-111111111111',
      repository: 'example/wrong',
      workspaceId: 'fixture',
      workspaceName: 'Fixture',
      connectedAt: new Date().toISOString(),
    },
    'main',
    headCommit,
  );
  expect(plan.manifest.artifacts.some((entry) => entry.type === 'pr_brief')).toBe(false);
  expect(plan.excluded.some((entry) => entry.reason.includes('repository identity'))).toBe(true);
  expect(plan.manifest).toMatchObject({ sourceCodeIncluded: false, codeSnippetsIncluded: false });
});

it.each([
  ...(process.platform === 'win32' ? [] : ['project=>demo']),
  'diff --git archive',
  'class action',
  'import map',
  'my project',
  'project+demo',
  'پروژه',
  'project (demo)',
  'my [project]',
])('supports safe local checkout name %s without a GitHub remote', async (name) => {
  await git('remote', 'remove', 'origin');
  const relocated = join(dirname(root), `${name}-${basename(root)}`);
  process.chdir(previous);
  await rename(root, relocated);
  root = relocated;
  process.chdir(root);
  const { artifact } = await generate();
  expect(artifact.metadata.repository.provider).toBe('git');
  expect(artifact.metadata.sync_policy).toBe('local_only');
  expect(artifact.metadata.repository.name).toBe(basename(root));
  expect(
    prBriefProjectionSchema.safeParse({
      ...artifact.metadata.dashboard!.pull_request,
      provider: 'github',
    }).success,
  ).toBe(false);
  expect(
    (await collectSyncArtifacts(root)).eligible.some((entry) => entry.manifest.type === 'pr_brief'),
  ).toBe(false);
});

it('accepts a real Git branch longer than 255 characters and includes it in the sync contract', async () => {
  const branch = 'a'.repeat(200) + '/' + 'b'.repeat(100);
  await git('remote', 'set-url', 'origin', 'https://github.com/example/project.git');
  await git('config', 'core.longpaths', 'true');
  await git('check-ref-format', '--branch', branch);
  await git('checkout', '-b', branch);
  const { artifact } = await generate();
  expect(artifact.metadata.dashboard?.branch).toBe(branch);
  const plan = await buildManifest(
    root,
    {
      server: 'https://trace.example.test',
      repositoryId: '11111111-1111-4111-8111-111111111111',
      repository: 'example/project',
      workspaceId: 'fixture',
      workspaceName: 'Fixture',
      connectedAt: new Date().toISOString(),
    },
    branch,
    await git('rev-parse', 'HEAD'),
  );
  expect(plan.manifest.git.branch).toBe(branch);
  expect(plan.manifest.artifacts.some((entry) => entry.type === 'pr_brief')).toBe(true);
  expect(
    (await collectSyncArtifacts(root)).eligible.some((entry) => entry.manifest.type === 'pr_brief'),
  ).toBe(true);
});
it('requires a positive number for persisted briefs while preserving numberless read-only previews', async () => {
  await main(['init', '--yes']);
  expect((await main(['pr'])).code).toBe(0);
  const result = await main(['pr', '--write', '--yes']);
  expect(result.code).toBe(2);
  expect(result.value).toMatchObject({ error: 'PR artifact writes require a positive PR number.' });
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
});

it('keeps non-GitHub briefs local until regenerated with a matching GitHub identity', async () => {
  await git('remote', 'remove', 'origin');
  const generated = await generate();
  expect(generated.artifact.metadata.sync_policy).toBe('local_only');
  await writeFile(
    generated.path,
    serializeArtifact(
      { ...generated.artifact.metadata, sync_policy: 'repository_authoritative' },
      generated.artifact.markdown,
    ),
  );
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  expect((await main(['sync', '--dry-run'])).value).toMatchObject({
    eligible: [],
    sourceCodeIncluded: false,
    codeSnippetsIncluded: false,
  });
  await git('remote', 'add', 'origin', 'https://github.com/example/project.git');
  await generate();
  expect((await collectSyncArtifacts(root)).eligible.map((entry) => entry.manifest.type)).toEqual([
    'pr_brief',
  ]);
});
it('preserves legacy generic-dashboard briefs for validation but excludes them from sync', async () => {
  const generated = await generate();
  const legacy = {
    ...generated.artifact.metadata,
    dashboard: { ...generated.artifact.metadata.dashboard!, pull_request: undefined },
    evidence: [],
  };
  await writeFile(generated.path, serializeArtifact(legacy, '# Existing generic projected brief'));
  expect(
    parseArtifact(await readFile(generated.path, 'utf8')).metadata.dashboard?.pull_request,
  ).toBeUndefined();
  expect((await main(['validate'])).code).toBe(0);
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
  expect(
    (await collectSyncArtifacts(root)).excluded.some((entry) =>
      entry.reason.includes('projection'),
    ),
  ).toBe(true);
});

it('treats code-like tokens in typed Git branch names as identity, retaining credential checks', async () => {
  const { artifact } = await generate();
  const projection = artifact.metadata.dashboard!.pull_request!;
  for (const branch of ['feature/a=>b', 'feature/a>b', 'feature/a<b']) {
    await git('check-ref-format', '--branch', branch);
    const input = { ...projection.input, branch };
    const metadata = {
      ...artifact.metadata,
      evidence: [{ ...artifact.metadata.evidence[0]!, metadata: input }],
      dashboard: {
        ...artifact.metadata.dashboard!,
        branch,
        pull_request: { ...projection, input },
      },
    };
    expect(
      parseArtifact(serializeArtifact(metadata, artifact.markdown)).metadata.dashboard?.branch,
    ).toBe(branch);
  }
  expect(
    prBriefProjectionSchema.safeParse({
      ...projection,
      input: { ...projection.input, branch: 'feature/ghp_123456789012345678901234567890123456' },
    }).success,
  ).toBe(false);
  // Windows cannot create ref filenames containing >; schema and Git ref-format checks run there.
  if (process.platform !== 'win32') {
    await git('checkout', '-b', 'feature/a=>b');
    const generated = await generate();
    expect(generated.artifact.metadata.dashboard?.branch).toBe('feature/a=>b');
    expect(
      (await collectSyncArtifacts(root)).eligible.some(
        (entry) => entry.manifest.type === 'pr_brief',
      ),
    ).toBe(true);
  }
});

it('keeps refs with upload-forbidden literal markers local-only before negotiation', async () => {
  const { artifact } = await generate();
  const projection = artifact.metadata.dashboard!.pull_request!;
  for (const branch of ['feature/<script>alert', 'feature/```literal']) {
    await git('check-ref-format', '--branch', branch);
    const input = { ...projection.input, branch };
    const metadata = {
      ...artifact.metadata,
      evidence: [{ ...artifact.metadata.evidence[0]!, metadata: input }],
      dashboard: {
        ...artifact.metadata.dashboard!,
        branch,
        pull_request: { ...projection, input },
      },
    };
    expect(
      parseArtifact(serializeArtifact(metadata, artifact.markdown)).metadata.dashboard?.branch,
    ).toBe(branch);
    expect(prBriefAttributionIssue(metadata, { branch, headCommit: input.head_commit! })).toContain(
      'sync content policy',
    );
  }
  if (process.platform !== 'win32') {
    await git('checkout', '-b', 'feature/<script>alert');
    const generated = await generate();
    expect(generated.artifact.metadata.sync_policy).toBe('local_only');
    expect((await main(['sync', '--dry-run'])).value).toMatchObject({
      eligible: [],
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
    });
    await writeFile(
      generated.path,
      serializeArtifact(
        { ...generated.artifact.metadata, sync_policy: 'repository_authoritative' },
        generated.artifact.markdown,
      ),
    );
    expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
    expect(
      (await collectSyncArtifacts(root)).excluded.some((entry) =>
        entry.reason.includes('sync content policy'),
      ),
    ).toBe(true);
  }
});

it('keeps typed local identity token handling separate from credential and markup rejection', async () => {
  const { artifact } = await generate();
  const p = { ...artifact.metadata.dashboard!.pull_request!, provider: 'git' as const };
  for (const repository of ['project=>demo', 'diff --git archive'])
    expect(prBriefProjectionSchema.safeParse({ ...p, repository }).success).toBe(true);
  for (const repository of [
    'project<script>',
    'project/child',
    'project\\child',
    'ghp_123456789012345678901234567890123456',
  ])
    expect(prBriefProjectionSchema.safeParse({ ...p, repository }).success).toBe(false);
});
