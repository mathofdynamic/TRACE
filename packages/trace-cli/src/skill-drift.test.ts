import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { collectSyncArtifacts, connect, sync } from './cloud.js';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  artifactMetadataSchema,
  dashboardProjectionSchema,
  schemaVersion,
  syncableArtifactTypes,
  syncManifestSchema,
  syncProtocolVersion,
} from '@trace/schema';
import { main } from './cli.js';

// Drift protection for skills/trace. These checks fail when the
// public CLI/schema contract changes without a review of the Skill. They do not
// generate the Skill; operational judgment stays human-written.

const skillDir = fileURLToPath(new URL('../../../skills/trace/', import.meta.url));
const cliSource = await readFile(fileURLToPath(new URL('./cli.ts', import.meta.url)), 'utf8');
const cloudSource = await readFile(fileURLToPath(new URL('./cloud.ts', import.meta.url)), 'utf8');

const read = (name: string) => readFile(`${skillDir}${name}`, 'utf8');
const referenceNames = [
  'lifecycle.md',
  'trace-directory.md',
  'artifact-contract.md',
  'dashboard-contract.md',
  'automation.md',
  'safety.md',
  'troubleshooting.md',
];
const nonexistentCommands = ['watch', 'daemon', 'auto', 'monitor', 'hooks'];

async function allFiles() {
  const files = new Map<string, string>([['SKILL.md', await read('SKILL.md')]]);
  for (const name of referenceNames)
    files.set(`references/${name}`, await read(`references/${name}`));
  for (const name of [
    'README.md',
    'workflows/validate.md',
    'workflows/daily-report.md',
    'workflows/pr-review.md',
  ])
    files.set(name, await read(name));
  return files;
}

function traceInvocations(markdown: string) {
  const invocations: string[] = [];
  let inFence = false;
  for (const raw of markdown.split('\n')) {
    if (raw.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      const line = raw.replace(/#.*$/, '').trim();
      if (/^trace\s/.test(line)) invocations.push(line);
    } else {
      for (const match of raw.matchAll(/`(trace\s[^`]+)`/g)) invocations.push(match[1]!);
    }
  }
  return invocations;
}

function withoutNonexistentSection(markdown: string) {
  return markdown.replace(/## Commands that do NOT exist[\s\S]*?(?=\n## )/, '');
}

const run = promisify(execFile);

async function assertDocumentedCommands(files: Map<string, string>) {
  const usage = (await main(['__unknown__'])).value as { commands: string[] };
  const commands = new Set(usage.commands.map((entry) => entry.split(' ')[0]));
  // No public flag registry exists: narrow flag-literal checks supplement executable
  // write/preview/privacy tests below, without depending on dispatch syntax/formatting.
  const flagSource = cliSource + cloudSource;
  for (const [name, text] of files) {
    const scanned = name === 'references/automation.md' ? withoutNonexistentSection(text) : text;
    for (const invocation of traceInvocations(scanned)) {
      const [, command, subcommand] = invocation.split(/\s+/);
      const subcommands: Record<string, string[]> = {
        report: ['daily', 'weekly'],
        rules: ['list', 'effective', 'validate', 'test'],
        config: ['show'],
        sync: ['status'],
      };
      if (command && subcommands[command] && subcommand && /^[a-z]+$/.test(subcommand))
        expect(subcommands[command], `${name}: ${invocation}`).toContain(subcommand);
      if (!command || command.startsWith('<') || ['-v', '--version'].includes(command)) continue;
      expect(commands.has(command), `${name}: ${invocation}`).toBe(true);
      for (const flag of invocation.match(/--[a-z][a-z-]*/g) ?? [])
        expect(flagSource, `${name}: ${flag}`).toContain(flag);
    }
  }
}

function assertReferenceContract(files: Map<string, string>, cliVersion: string) {
  const skill = files.get('SKILL.md')!;
  for (const value of [
    `CLI \`${cliVersion}\``,
    `artifact schema \`${schemaVersion}\``,
    `sync protocol \`${syncProtocolVersion}\``,
  ])
    expect(skill).toContain(value);
  const artifact = files.get('references/artifact-contract.md')!;
  for (const type of artifactMetadataSchema.shape.artifact_type.options)
    expect(artifact).toContain('`' + type + '`');
  for (const field of Object.keys(dashboardProjectionSchema.shape))
    expect(files.get('references/dashboard-contract.md')).toContain(field);
  for (const limit of ['262144', '2,097,152', '64 artifacts'])
    expect(files.get('references/safety.md')).toContain(limit);
  expect(files.get('references/safety.md')).toContain('sourceCodeIncluded: false');
  expect(files.get('references/safety.md')).toContain('codeSnippetsIncluded: false');
}

function publicationPolicy(text: string) {
  const block = text
    .match(/```yaml\n([\s\S]*?)```/g)
    ?.find((part) => part.includes('publication_policy:'));
  expect(block).toBeDefined();
  const policy = parse(block!.replace(/^```yaml\n|```$/g, '')).publication_policy;
  expect(policy).toEqual({
    dirty_analysis_sync: false,
    clean_worktree_required: true,
    fresh_clean_analysis_required: true,
    all_eligible_analysis_verified_clean: true,
    real_cli_semantic_provider: false,
  });
  return policy;
}

describe('TRACE Skill drift checks', () => {
  it('has valid front matter and the expected package files', async () => {
    const skill = await read('SKILL.md');
    expect(skill).toMatch(/^---\nname: trace\ndescription: .+\n---\n/);
    expect(skill.split('\n').length).toBeLessThan(200);
    const references = await readdir(`${skillDir}references`);
    expect(references.sort()).toEqual([...referenceNames].sort());
  });

  it('declares the CLI, schema, and sync protocol versions it targets', async () => {
    const skill = await read('SKILL.md');
    const version = String((await main(['--version'])).value).replace('trace ', '');
    expect(skill).toContain(`CLI \`${version}\``);
    expect(skill).toContain(`artifact schema \`${schemaVersion}\``);
    expect(skill).toContain(`sync protocol \`${syncProtocolVersion}\``);
  });

  it('checks documented commands against public usage, with executable subcommand probes', async () => {
    await assertDocumentedCommands(await allFiles());
    for (const command of nonexistentCommands) expect((await main([command])).code).toBe(2);
    for (const subcommand of ['list', 'effective', 'validate'])
      expect((await main(['rules', subcommand])).code).toBe(0);
    for (const subcommand of ['explain', 'diff'])
      expect((await main(['rules', subcommand])).code).toBe(2);
    expect(await read('references/automation.md')).toContain('trace rules explain');
  });

  it('mutation-checks documentation commands and flags instead of dispatch implementation formatting', async () => {
    const files = await allFiles();
    for (const bad of [
      'trace invented',
      'trace analyze --invented-flag',
      'trace report hourly',
      'trace rules explain',
    ]) {
      const mutated = new Map(files);
      mutated.set('SKILL.md', files.get('SKILL.md')! + '\n`' + bad + '`\n');
      await expect(assertDocumentedCommands(mutated)).rejects.toThrow();
    }
  });

  it('mutation-checks versions, types, projection fields, privacy and limits', async () => {
    const files = await allFiles();
    const version = String((await main(['--version'])).value).replace('trace ', '');
    assertReferenceContract(files, version);
    for (const [file, original] of [
      ['SKILL.md', `CLI \`${version}\``],
      ['SKILL.md', `artifact schema \`${schemaVersion}\``],
      ['SKILL.md', `sync protocol \`${syncProtocolVersion}\``],
      ['references/artifact-contract.md', '`pr_brief`'],
      ['references/dashboard-contract.md', 'head_commit'],
      ['references/safety.md', '262144'],
      ['references/safety.md', '2,097,152'],
      ['references/safety.md', '64 artifacts'],
      ['references/safety.md', 'sourceCodeIncluded: false'],
      ['references/safety.md', 'codeSnippetsIncluded: false'],
    ]) {
      const mutated = new Map(files);
      mutated.set(file!, files.get(file!)!.replaceAll(original!, '__mutated__'));
      expect(() => assertReferenceContract(mutated, version)).toThrow();
    }
  });

  it('protects clean publication and no real AI claims, including policy mutations', async () => {
    const safety = await read('references/safety.md');
    const policy = publicationPolicy(safety);
    const eligible = (status: string, freshlyAnalyzedClean: boolean, allEligibleClean = true) =>
      (!policy.clean_worktree_required || status === '') &&
      (!policy.fresh_clean_analysis_required || freshlyAnalyzedClean) &&
      (!policy.all_eligible_analysis_verified_clean || allEligibleClean);
    expect(eligible(' M sample.ts', true)).toBe(false);
    expect(eligible('?? new.ts', false)).toBe(false);
    expect(eligible('', false)).toBe(false);
    expect(eligible('', true)).toBe(true);
    expect(eligible('', true, false)).toBe(false);
    for (const [key, value] of Object.entries(policy))
      expect(() =>
        publicationPolicy(safety.replace(`${key}: ${value}`, `${key}: ${!value}`)),
      ).toThrow();
    for (const name of [
      'SKILL.md',
      'references/lifecycle.md',
      'references/automation.md',
      'references/troubleshooting.md',
      'references/safety.md',
    ]) {
      const doc = await read(name);
      expect(doc).toContain('git status --porcelain');
      expect(doc).toMatch(/(?:DO NOT|MUST NOT) sync/);
    }
    expect(await read('SKILL.md')).not.toContain('enables optional semantic analysis');
  });

  it('exercises CLI lifecycle, initialization gap, PR exclusion and privacy entirely offline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-skill-contract-'));
    const previous = process.cwd();
    try {
      await run('git', ['init', '-b', 'main', root]);
      await writeFile(join(root, 'sample.ts'), 'export const value = 1;\n');
      await run('git', ['add', '.'], { cwd: root });
      await run(
        'git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.test',
          'commit',
          '-m',
          'fixture',
        ],
        { cwd: root },
      );
      await writeFile(join(root, '.git', 'info', 'exclude'), '.trace/\n');
      process.chdir(root);
      const value = async (args: string[]) => (await main(args)).value as Record<string, unknown>;
      for (const args of [['analyze', '--dry-run'], ['analyze']]) {
        expect(await main(args)).toMatchObject({
          code: 2,
          value: {
            error: 'TRACE is not initialized in this repository. Run `trace init --yes` first.',
          },
        });
        await expect(access(join(root, '.trace'))).rejects.toThrow();
      }
      await expect(connect(root, 'https://github.com/example/project.git')).rejects.toThrow(
        'TRACE is not initialized in this repository.',
      );
      expect(await value(['init'])).toHaveProperty('dryRun', true);
      await expect(access(join(root, '.trace'))).rejects.toThrow();
      expect(await value(['init', '--yes'])).toHaveProperty('initialized', true);
      expect((await value(['analyze', '--dry-run'])).artifact).toMatchObject({ dryRun: true });
      await expect(access(join(root, '.trace', 'analyses'))).rejects.toThrow();
      expect((await value(['analyze'])).artifact).toMatchObject({ dryRun: false });
      await expect(access(join(root, '.trace', 'analyses'))).resolves.toBeUndefined();
      expect((await main(['validate'])).value).toEqual([]);
      await expect(connect(root, 'invalid')).rejects.toThrow(
        'remote.origin.url is not an unambiguous GitHub repository URL.',
      );
      expect(await value(['report', 'daily', '--date', '2026-01-01'])).toHaveProperty(
        'dryRun',
        true,
      );
      expect((await value(['report', 'weekly'])).artifact).toMatchObject({ dryRun: true });
      expect(
        (await value(['pr', '7', '--base', 'main', '--base-sha', 'a'.repeat(40)])).dryRun,
      ).toBe(true);
      expect((await main(['pr', '7', '--write'])).code).toBe(2);
      expect((await main(['pr', '7', '--write', '--yes'])).code).toBe(0);
      expect((await collectSyncArtifacts(root)).excluded).toContainEqual({
        path: 'pull-requests/git-7.md',
        reason: 'no dashboard projection',
      });
      expect(await value(['sync', '--dry-run'])).toMatchObject({
        connected: false,
        sourceCodeIncluded: false,
        codeSnippetsIncluded: false,
      });
      await expect(sync(root, 'main', 'a'.repeat(40), false)).rejects.toThrow(
        'Run trace connect before trace sync.',
      );
      const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
      await writeFile(join(root, 'sample.ts'), 'export const value = 2;\n');
      expect((await run('git', ['status', '--porcelain'], { cwd: root })).stdout).not.toBe('');
      const dirty = await value(['analyze']);
      expect(
        (await value(['inspect', (dirty.artifact as { path: string }).path])).dashboard,
      ).toMatchObject({ head_commit: head });
      await writeFile(join(root, 'sample.ts'), 'export const value = 1;\n');
      expect((await run('git', ['status', '--porcelain'], { cwd: root })).stdout).toBe('');
      // Reverting contents leaves the same-HEAD artifact in place; policy still requires regeneration.
      expect(
        (await value(['inspect', (dirty.artifact as { path: string }).path])).dashboard,
      ).toMatchObject({ head_commit: head });
      const withAi = await value(['analyze', '--with-ai']);
      expect(withAi.analysis).toMatchObject({
        provenance: { semanticProvider: 'fake', sourceCodeSentToProvider: false },
      });
      expect((await main(['config', 'show'])).code).toBe(0);
      expect((await main(['rules', 'test'])).code).toBe(0);
    } finally {
      process.chdir(previous);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('documents every artifact type and splits syncable types correctly', async () => {
    const doc = await read('references/artifact-contract.md');
    const types = artifactMetadataSchema.shape.artifact_type.options as readonly string[];
    const section = doc.slice(
      doc.indexOf('## Syncable types'),
      doc.indexOf('## What the CLI generates'),
    );
    const [syncable, notSyncable] = section.split('Not syncable');
    for (const type of types) {
      expect(doc, `type ${type}`).toContain(`\`${type}\``);
      const isSyncable = (syncableArtifactTypes as readonly string[]).includes(type);
      expect(isSyncable ? syncable : notSyncable, `syncable placement of ${type}`).toContain(
        `\`${type}\``,
      );
      expect(isSyncable ? notSyncable : syncable, `syncable placement of ${type}`).not.toContain(
        `\`${type}\``,
      );
    }
    expect(doc).toContain(`Artifact types (${types.length})`);
    expect(doc).toContain(`Syncable types (${syncableArtifactTypes.length})`);
  });

  it('documents every dashboard projection field and stays strict', async () => {
    const doc = await read('references/dashboard-contract.md');
    for (const key of Object.keys(dashboardProjectionSchema.shape))
      expect(doc, `projection field ${key}`).toContain(key);
    for (const key of ['id', 'title', 'detail', 'severity', 'classification', 'evidence', 'status'])
      expect(doc).toContain(key);
    const item = {
      id: 'a',
      title: 't',
      detail: 'd',
      severity: 'low',
      classification: 'deterministic',
      evidence: ['f'],
      status: 's',
    };
    expect(
      dashboardProjectionSchema.safeParse({ title: 't', summary: 's', items: [item] }).success,
    ).toBe(true);
    expect(
      dashboardProjectionSchema.safeParse({
        title: 't',
        summary: 's',
        items: [{ ...item, extra: 1 }],
      }).success,
    ).toBe(false);
  });

  it('keeps documented sync limits and privacy literals aligned with the schema', async () => {
    const safety = await read('references/safety.md');
    expect(safety).toContain('262144');
    expect(safety).toContain('2,097,152');
    expect(safety).toContain('64 artifacts');
    const artifact = (index: number, size = 100) => ({
      id: `artifact-${index}`,
      type: 'analysis',
      path: `analyses/a-${index}.md`,
      sha256: 'a'.repeat(64),
      size,
      schemaVersion,
      sensitivity: 'internal',
      revision: '2026-01-01T00:00:00.000Z',
    });
    const manifest = (
      artifacts: unknown[],
      flags = { sourceCodeIncluded: false, codeSnippetsIncluded: false },
    ) => ({
      protocolVersion: syncProtocolVersion,
      schemaVersion,
      syncId: '00000000-0000-4000-8000-000000000000',
      repositoryId: '00000000-0000-4000-8000-000000000001',
      repository: 'a/b',
      executionOrigin: 'local',
      traceVersion: '0.1.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseOperationId: null,
      git: { branch: 'main', headCommit: 'abcdef1' },
      artifacts,
      ...flags,
    });
    const ok = (value: unknown) => syncManifestSchema.safeParse(value).success;
    expect(ok(manifest(Array.from({ length: 64 }, (_, i) => artifact(i))))).toBe(true);
    expect(ok(manifest(Array.from({ length: 65 }, (_, i) => artifact(i))))).toBe(false);
    expect(ok(manifest([artifact(1, 262_144)]))).toBe(true);
    expect(ok(manifest([artifact(1, 262_145)]))).toBe(false);
    expect(ok(manifest(Array.from({ length: 8 }, (_, i) => artifact(i, 262_144))))).toBe(true);
    expect(ok(manifest(Array.from({ length: 9 }, (_, i) => artifact(i, 262_144))))).toBe(false);
    expect(
      ok(manifest([], { sourceCodeIncluded: true, codeSnippetsIncluded: false } as never)),
    ).toBe(false);
    expect(
      ok(manifest([], { sourceCodeIncluded: false, codeSnippetsIncluded: true } as never)),
    ).toBe(false);
  });

  it('lists every default sync allowlist entry and exclusion reason from source', async () => {
    const directory = await read('references/trace-directory.md');
    const fixtureConfig = parse(
      await readFile(
        fileURLToPath(
          new URL('../../../tests/fixtures/trace-project/.trace/config.yml', import.meta.url),
        ),
        'utf8',
      ),
    );
    for (const type of fixtureConfig.sync_policy.allow) expect(directory).toContain(type);
    const safety = await read('references/safety.md');
    for (const reason of [
      'unsafe path',
      'sync is disabled in .trace/config.yml',
      'artifact type is not allowlisted',
      'not locally generated',
      'local-only policy',
      'sensitivity policy',
      'no dashboard projection',
      'code snippets are disabled',
      'artifact exceeds 256 KiB',
      'symlink escapes .trace',
    ]) {
      expect(cloudSource, `stable exclusion ${reason}`).toContain(reason);
      expect(safety, `doc reason ${reason}`).toContain(reason);
    }
  });

  it('keeps stable error messages quoted in troubleshooting accurate', async () => {
    const doc = await read('references/troubleshooting.md');
    for (const message of [
      'TRACE is not initialized in this repository.',
      'remote.origin.url is not an unambiguous GitHub repository URL.',
      'Repository identity is ambiguous.',
      'Run trace connect before trace sync.',
      'Run trace login for the server configured by trace connect.',
      'Dashboard divergence requires review; no local files were changed.',
      'Device authorization expired. Run trace login again.',
    ]) {
      expect(cloudSource, message).toContain(message);
      expect(doc, message).toContain(message);
    }
  });

  it('keeps public-only content: no credentials, internal hosts, or installation ids', async () => {
    for (const [name, text] of await allFiles()) {
      expect(text, name).not.toMatch(
        /workers\.dev|pages\.dev|trc_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9]|installation\s+\d{4,}/i,
      );
    }
  });
});
