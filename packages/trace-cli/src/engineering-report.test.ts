import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { collectEngineeringReport, reportPeriod, type ReportRunner } from './engineering-report.js';
import { main } from './cli.js';
import { collectSyncArtifacts } from './cloud.js';
import { engineeringReportSchema, parseArtifact, writeArtifact } from '@trace/schema';

const now = new Date('2026-10-05T20:00:00Z');
const weekly = () => reportPeriod('weekly', '2026-10-05', 'UTC', now);
const git = (root: string, args: string[], date?: string) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
  }).trim();
async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'trace-period-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'user.email', 'test@example.test']);
  await writeFile(join(root, '.gitignore'), '.trace/\n');
  await writeFile(join(root, 'package.json'), '{}');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'Outside period'], '2026-09-28T23:59:59Z');
  for (let day = 29; day <= 30; day++) {
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ version: day === 29 ? '0.1.0' : '0.1.1' }),
    );
    git(root, ['add', '.']);
    git(root, ['commit', '-m', `Engineering change ${day}`], `2026-09-${day}T12:00:00Z`);
  }
  await writeFile(join(root, 'later.txt'), 'not source output');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'Outside after period'], '2026-10-06T00:00:00Z');
  return root;
}

describe('period engineering reports', () => {
  it('defines seven calendar days ending on the selected date, plus one-day and DST boundaries', () => {
    expect(weekly()).toMatchObject({
      start: '2026-09-29T00:00:00.000Z',
      end: '2026-10-06T00:00:00.000Z',
    });
    const dst = reportPeriod('daily', '2026-03-08', 'America/New_York', now);
    expect((Date.parse(dst.end) - Date.parse(dst.start)) / 3_600_000).toBe(23);
    const tehran = reportPeriod('weekly', '2026-10-05', 'Asia/Tehran', now);
    expect(tehran.start).toBe('2026-09-28T20:30:00.000Z');
    expect(() => reportPeriod('daily', '2026-02-30', 'UTC', now)).toThrow();
    expect(() => reportPeriod('daily', '2027-01-01', 'UTC', now)).toThrow('future');
  });
  it('aggregates committed period history, deduplicates paths and detects version changes, excluding dirty edits and out-of-period commits', async () => {
    const root = await repository();
    await writeFile(join(root, 'dirty.ts'), 'const privateSource = 42');
    const document = await collectEngineeringReport(root, weekly());
    expect(engineeringReportSchema.safeParse(document).success).toBe(true);
    expect(document.sections.find((s) => s.id === 'summary')?.summary).toBe(
      '2 commits · Not available PRs merged · 1 files changed',
    );
    expect(document.sections.find((s) => s.id === 'commits')?.items).toHaveLength(2);
    expect(document.sections.find((s) => s.id === 'releases')?.items[0]?.title).toContain(
      '0.1.0 → 0.1.1',
    );
    expect(JSON.stringify(document)).not.toContain('privateSource');
    expect(document.sections.find((s) => s.id === 'findings')?.summary).toContain('Not available');
  });
  it('counts more than ten period commits despite nonmonotonic graph timestamps', async () => {
    const root = await repository();
    for (let index = 0; index < 12; index++)
      git(
        root,
        ['commit', '--allow-empty', '-m', `Period change ${index}`],
        '2026-10-01T12:00:00Z',
      );
    const doc = await collectEngineeringReport(root, weekly());
    expect(doc.sections.find((s) => s.id === 'commits')?.items).toHaveLength(14);
    expect(doc.sections.find((s) => s.id === 'summary')?.summary).toContain('14 commits');
  });
  it('uses verified paginated GitHub event metadata and labels open PRs as a current snapshot', async () => {
    const root = await repository();
    git(root, ['remote', 'add', 'origin', 'https://github.com/example/project.git']);
    const runner: ReportRunner = async (command, args, cwd) => {
      if (command === 'git') return git(cwd, args);
      if (args[1]?.includes('pulls'))
        return JSON.stringify([
          {
            number: 1,
            title: 'Merged change',
            html_url: 'https://github.com/example/project/pull/1',
            state: 'closed',
            merged_at: '2026-10-01T12:00:00Z',
          },
          {
            number: 2,
            title: 'Open now',
            html_url: 'https://github.com/example/project/pull/2',
            state: 'open',
            merged_at: null,
          },
          {
            number: 3,
            title: 'Outside period',
            html_url: 'https://github.com/example/project/pull/3',
            state: 'closed',
            merged_at: '2026-09-28T12:00:00Z',
          },
        ]);
      return JSON.stringify([
        {
          name: 'CLI release',
          tag_name: 'v0.1.1',
          draft: false,
          published_at: '2026-10-05T12:00:00Z',
          html_url: 'https://github.com/example/project/releases/tag/v0.1.1',
        },
      ]);
    };
    const doc = await collectEngineeringReport(root, weekly(), true, runner);
    expect(doc.sections.find((s) => s.id === 'pull-requests')?.summary).toContain(
      '1 merged during the period; 1 open now',
    );
    expect(doc.sections.find((s) => s.id === 'pull-requests')?.items).toHaveLength(2);
    expect(
      doc.sections.find((s) => s.id === 'releases')?.items.some((i) => i.title === 'CLI release'),
    ).toBe(true);
  });
  it('does not convert failed GitHub reads or shallow Git history into zero counts', async () => {
    const root = await repository();
    git(root, ['remote', 'add', 'origin', 'https://github.com/example/project.git']);
    const runner: ReportRunner = async (command, args, cwd) => {
      if (command === 'gh') throw new Error('offline');
      if (args.includes('--is-shallow-repository')) return 'true';
      return git(cwd, args);
    };
    const doc = await collectEngineeringReport(root, weekly(), true, runner);
    expect(doc.sections.find((s) => s.id === 'summary')?.summary).toBe(
      'Not available commits · Not available PRs merged · Not available files changed',
    );
    expect(doc.sources.find((s) => s.name === 'Git')?.status).toBe('partial');
  });
  it('links each changed path only to commits that changed it', async () => {
    const root = await repository();
    await writeFile(join(root, 'isolated.txt'), 'Explicit provenance test fixture');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'Isolated change'], '2026-10-01T12:00:00Z');
    const head = git(root, ['rev-parse', 'HEAD']);
    const doc = await collectEngineeringReport(root, weekly());
    const items = doc.sections.find((s) => s.id === 'files')!.items;
    expect(items.find((item) => item.title === 'isolated.txt')!.evidence).toEqual([
      `commit:${head}`,
    ]);
    expect(items.find((item) => item.title === 'package.json')!.evidence).not.toContain(
      `commit:${head}`,
    );
  });
  it('keeps version totals unavailable when Git history fails but GitHub is verified', async () => {
    const root = await repository();
    git(root, ['remote', 'add', 'origin', 'https://github.com/example/project.git']);
    const runner: ReportRunner = async (command, args, cwd) => {
      if (command === 'gh') return '[]';
      if (args[0] === 'log') throw new Error('history unavailable');
      return git(cwd, args);
    };
    const doc = await collectEngineeringReport(root, weekly(), true, runner);
    expect(doc.sections.find((s) => s.id === 'releases')!.summary).toContain(
      'Version transitions: Not available',
    );
  });
  it('bounds wide monorepo area summaries while preserving the verified path and area totals', async () => {
    const root = await repository();
    const runner: ReportRunner = async (command, args, cwd) => {
      if (args[0] === 'diff-tree')
        return Array.from({ length: 150 }, (_, i) => `area-${i}-${'x'.repeat(40)}/file.txt`).join(
          '\n',
        );
      return git(cwd, args);
    };
    const doc = await collectEngineeringReport(root, weekly(), false, runner);
    expect(engineeringReportSchema.safeParse(doc).success).toBe(true);
    const files = doc.sections.find((section) => section.id === 'files')!;
    expect(files.summary).toContain('150 unique paths across 150 areas');
    expect(files.summary).toContain('area display limited');
    expect(files.summary.length).toBeLessThan(4000);
  });
  it('excludes foreign records with absent or non-GitHub origin using the local repository identity', async () => {
    const root = await repository();
    const previous = process.cwd();
    try {
      process.chdir(root);
      await main(['init', '--yes']);
    } finally {
      process.chdir(previous);
    }
    for (const name of [basename(root), 'foreign-project']) {
      await writeArtifact({
        traceRoot: join(root, '.trace'),
        relativePath: `risks/${name}.md`,
        metadata: {
          schema_version: '0.1',
          id: name === basename(root) ? 'risk-local' : 'risk-foreign',
          artifact_type: 'risk',
          repository: { provider: 'git', owner: 'local', name },
          created_at: '2026-10-01T12:00:00.000Z',
          updated_at: '2026-10-01T12:00:00.000Z',
          generator: 'test',
          execution_origin: 'local',
          source_refs: [],
          evidence: [],
          review_status: 'draft',
          sensitivity: 'internal',
          sync_policy: 'allowlisted',
          dashboard: { title: name, summary: 'Explicit identity test fixture', items: [] },
        },
        markdown: 'Explicit identity test fixture.',
      });
    }
    for (const remote of [null, 'https://example.test/local/project.git']) {
      if (remote) git(root, ['remote', 'add', 'origin', remote]);
      const doc = await collectEngineeringReport(root, weekly());
      expect(
        doc.sections.find((section) => section.id === 'attention')!.items.map((i) => i.title),
      ).toEqual([basename(root)]);
    }
  });
  it('does not promote confidential, local-only, foreign-repository or code-bearing records into a report', async () => {
    const root = await repository();
    git(root, ['remote', 'add', 'origin', 'https://github.com/example/project.git']);
    const previous = process.cwd();
    try {
      process.chdir(root);
      await main(['init', '--yes']);
    } finally {
      process.chdir(previous);
    }
    for (const [id, sensitivity, policy, owner, body] of [
      ['risk-allowed', 'internal', 'allowlisted', 'example', 'Verified local observation.'],
      ['risk-sensitive', 'confidential', 'allowlisted', 'example', 'Confidential observation.'],
      ['risk-private', 'internal', 'local_only', 'example', 'Private observation.'],
      ['risk-foreign', 'internal', 'allowlisted', 'other', 'Different repository.'],
      ['risk-code', 'internal', 'allowlisted', 'example', '```source code```'],
    ] as const) {
      await writeArtifact({
        traceRoot: join(root, '.trace'),
        relativePath: `risks/${id}.md`,
        metadata: {
          schema_version: '0.1',
          id,
          artifact_type: 'risk',
          repository: { provider: 'github', owner, name: 'project' },
          created_at: '2026-10-01T12:00:00.000Z',
          updated_at: '2026-10-01T12:00:00.000Z',
          generator: 'test',
          execution_origin: 'local',
          source_refs: [],
          evidence: [],
          review_status: 'draft',
          sensitivity,
          sync_policy: policy,
          dashboard: { title: id, summary: body, status: 'open', items: [] },
        },
        markdown: body,
      });
    }
    const doc = await collectEngineeringReport(root, weekly());
    const attention = doc.sections.find((s) => s.id === 'attention')!;
    expect(attention.items.map((i) => i.title)).toEqual(['risk-allowed']);
    expect(JSON.stringify(doc)).not.toContain('Confidential observation');
    expect(JSON.stringify(doc)).not.toContain('Private observation');
    const config = parseYaml(await readFile(join(root, '.trace/config.yml'), 'utf8'));
    config.sync_policy.allow = config.sync_policy.allow.filter((type: string) => type !== 'risk');
    await writeFile(join(root, '.trace/config.yml'), yamlStringify(config));
    const restricted = await collectEngineeringReport(root, weekly());
    expect(restricted.sections.find((s) => s.id === 'attention')!.items).toHaveLength(0);
  });
  it('keeps a large report inside the sync size budget without changing verified totals', async () => {
    const root = await repository();
    const previous = process.cwd();
    try {
      process.chdir(root);
      await main(['init', '--yes']);
      for (let index = 0; index < 100; index++)
        await writeArtifact({
          traceRoot: join(root, '.trace'),
          relativePath: `risks/risk-size-${index}.md`,
          metadata: {
            schema_version: '0.1',
            id: `risk-size-${index}`,
            artifact_type: 'risk',
            repository: { provider: 'git', owner: 'local', name: basename(root) },
            created_at: '2026-10-01T12:00:00.000Z',
            updated_at: '2026-10-01T12:00:00.000Z',
            generator: 'test',
            execution_origin: 'local',
            source_refs: [],
            evidence: [],
            review_status: 'draft',
            sensitivity: 'internal',
            sync_policy: 'allowlisted',
            dashboard: {
              title: `Risk observation ${index}`,
              summary: 'Verified observation. '.repeat(90),
              items: [],
            },
          },
          markdown: 'Explicit size-budget test fixture.',
        });
      const result = await main(['report', 'weekly', '--date', '2026-10-05', '--yes']);
      expect(result.code).toBe(0);
      const content = await readFile(join(root, '.trace/reports/weekly/2026-10-05.md'), 'utf8');
      expect(Buffer.byteLength(content)).toBeLessThanOrEqual(240_000);
      expect(content).toContain('100 recorded local items');
      expect(content).toContain('display shortened');
    } finally {
      process.chdir(previous);
    }
  });
  it('dirty reports remain local-only after reverting changes and HEAD advancement excludes clean reports', async () => {
    const root = await repository();
    const previous = process.cwd();
    try {
      process.chdir(root);
      await main(['init', '--yes']);
      await writeFile(join(root, 'dirty.txt'), 'exploratory');
      await main(['report', 'daily', '--date', '2026-10-05', '--yes']);
      git(root, ['clean', '-f', 'dirty.txt']);
      expect(
        (await collectSyncArtifacts(root)).excluded.some((a) => a.reason === 'local-only policy'),
      ).toBe(true);
      await main(['report', 'daily', '--date', '2026-10-05', '--yes']);
      expect(
        (await collectSyncArtifacts(root)).eligible.some((a) => a.manifest.type === 'daily_report'),
      ).toBe(true);
      git(root, ['commit', '--allow-empty', '-m', 'Advance HEAD']);
      expect(
        (await collectSyncArtifacts(root)).excluded.some((a) =>
          a.reason.includes('historical report'),
        ),
      ).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });
  it('reports unavailable history locally before the first commit and supports detached local planning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-report-unborn-'));
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.name', 'Test']);
    git(root, ['config', 'user.email', 'test@example.test']);
    await writeFile(join(root, '.gitignore'), '.trace/\n');
    const previous = process.cwd();
    try {
      process.chdir(root);
      expect((await main(['report', 'daily', '--yes'])).code).toBe(2);
      await main(['init', '--yes']);
      const unborn = await main(['report', 'daily', '--yes']);
      expect(unborn.code).toBe(0);
      expect(unborn.value).toMatchObject({
        authoritative: false,
        document: {
          sources: expect.arrayContaining([
            expect.objectContaining({ name: 'Git', status: 'not_available' }),
          ]),
        },
      });
      git(root, ['add', '.']);
      git(root, ['commit', '-m', 'Initialized fixture']);
      git(root, ['checkout', '--detach']);
      const clean = await main(['report', 'daily', '--yes']);
      expect(clean.code).toBe(0);
      expect(clean.value).toMatchObject({ authoritative: true });
      expect(
        (await collectSyncArtifacts(root)).eligible.some((a) => a.manifest.type === 'daily_report'),
      ).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });
  it('writes a real validated CLI scaffold/report, retains provenance, and refuses stale report publication', async () => {
    const root = await repository();
    const previous = process.cwd();
    try {
      process.chdir(root);
      expect((await main(['init', '--yes'])).code).toBe(0);
      const result = await main(['report', 'weekly', '--date', '2026-10-05', '--yes']);
      expect(result.code).toBe(0);
      const artifact = parseArtifact(
        await readFile(join(root, '.trace/reports/weekly/2026-10-05.md'), 'utf8'),
      );
      expect(artifact.metadata.dashboard?.head_commit).toBe(git(root, ['rev-parse', 'HEAD']));
      expect(
        artifact.metadata.evidence.some((e) => e.locator === 'trace:engineering-report:v1'),
      ).toBe(true);
      expect(artifact.markdown).toContain('## Executive summary');
      expect(
        (await collectSyncArtifacts(root)).eligible.some(
          (a) => a.manifest.type === 'weekly_report',
        ),
      ).toBe(true);
      git(root, ['checkout', '-b', 'other']);
      expect(
        (await collectSyncArtifacts(root)).excluded.some((a) =>
          a.reason.includes('historical report'),
        ),
      ).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });
});
