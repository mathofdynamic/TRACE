#!/usr/bin/env node
import { collectEngineeringReport, reportPeriod } from './engineering-report.js';
import { analysisInputCheck, gitSnapshot, sameSnapshot } from './analysis-attribution.js';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import {
  analyzeChanges,
  createPullRequestBrief,
  renderPullRequestBrief,
  type PullRequestInput,
} from '@trace/analysis';
import type { NormalizedChangeSet } from '@trace/core';
import { evaluateRules, initialRules, mergeEffectiveRules, validateRule } from '@trace/rules';
import {
  parseArtifact,
  serializeArtifact,
  type ArtifactMetadata,
  engineeringReportSchema,
  reportEvidenceLocator,
  stableArtifactId,
  validateTraceDirectory,
  writeArtifact,
} from '@trace/schema';
import {
  connect as connectDashboard,
  login as loginDashboard,
  logout as logoutDashboard,
  normalizeGitHubRemote,
  readBinding,
  sync as syncDashboard,
  syncStatus as dashboardSyncStatus,
  cloudEnvironmentForServer,
  whoami as dashboardWhoami,
  resolveCloudTarget,
} from './cloud.js';

const run = promisify(execFile);

export type CliResult = { code: number; value: unknown };

async function git(args: string[], cwd: string) {
  const result = await run('git', args, { cwd, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout.trim();
}

async function repoRoot(cwd = process.cwd()) {
  try {
    return await git(['rev-parse', '--show-toplevel'], cwd);
  } catch {
    return resolve(cwd);
  }
}

function jsonFlag(args: string[]) {
  return args.includes('--json');
}
function output(value: unknown, json: boolean) {
  return json ? JSON.stringify(value, null, 2) : value;
}

async function init(args: string[]): Promise<CliResult> {
  const root = await repoRoot();
  const traceRoot = join(root, '.trace');
  const files = new Map<string, string>([
    [
      'README.md',
      '# TRACE artifacts\n\nThis directory is repository-native project memory. Validate it with `trace validate`.\n',
    ],
    ['schema-version', '0.1\n'],
    [
      'config.yml',
      stringify({
        schema_version: '0.1',
        execution_mode: 'local',
        repository: { provider: 'git', name: resolve(root).split(/[\\/]/).pop() ?? 'repository' },
        git_write_policy: 'disabled',
        sync_policy: {
          enabled: true,
          default: 'local_only',
          allow: [
            'analysis',
            'daily_report',
            'weekly_report',
            'pr_brief',
            'decision',
            'risk',
            'conflict',
          ],
          include_code_snippets: false,
        },
      }),
    ],
  ]);
  const existing: string[] = [];
  for (const [name] of files) {
    try {
      await access(join(traceRoot, name));
      existing.push(name);
    } catch {
      // Missing files are expected during initialization.
    }
  }
  if (existing.length && !args.includes('--yes'))
    return {
      code: 2,
      value: {
        error: 'TRACE already exists; use --yes only to adopt without overwriting existing files.',
        existing,
      },
    };
  const preview = {
    root,
    traceRoot,
    files: [...files.keys()],
    directories: [
      'reports/daily',
      'reports/weekly',
      'pull-requests',
      'decisions',
      'risks',
      'debt',
      'state',
      'indexes',
    ],
  };
  if (!args.includes('--yes') || args.includes('--dry-run'))
    return { code: 0, value: { dryRun: true, preview } };
  await Promise.all(
    preview.directories.map((directory) => mkdir(join(traceRoot, directory), { recursive: true })),
  );
  for (const [name, content] of files) {
    if (!existing.includes(name)) await writeFile(join(traceRoot, name), content, 'utf8');
  }
  return { code: 0, value: { initialized: true, ...preview } };
}

async function changes(args: string[]): Promise<NormalizedChangeSet> {
  const root = await repoRoot();
  const status = await git(
    ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'],
    root,
  );
  const branch = await git(['branch', '--show-current'], root).catch(() => '');
  const remote = await git(['config', '--get', 'remote.origin.url'], root).catch(() => '');
  const githubIdentity = normalizeGitHubRemote(remote);
  const name = resolve(root).split(/[\\/]/).pop() ?? 'repository';
  const commitsRaw = await git(['log', '-10', '--format=%H%x1f%s%x1f%an%x1f%aI'], root).catch(
    () => '',
  );
  const commits = commitsRaw
    ? commitsRaw.split('\n').map((line) => {
        const [sha, subject, author, authoredAt] = line.split('\x1f');
        return {
          sha: sha ?? 'unknown',
          subject: subject ?? '',
          author,
          authoredAt,
        };
      })
    : [];
  const statusFiles = status
    ? status.split('\n').map((line) => ({
        path: line.slice(3),
        status: (line.slice(0, 2).trim() === '??'
          ? 'added'
          : line.slice(0, 2).includes('D')
            ? 'deleted'
            : line.slice(0, 2).includes('R')
              ? 'renamed'
              : line.slice(0, 2).includes('A')
                ? 'added'
                : 'modified') as NormalizedChangeSet['changedFiles'][number]['status'],
      }))
    : [];
  return {
    repository: {
      provider: githubIdentity ? 'github' : 'git',
      owner: githubIdentity?.split('/')[0],
      name: githubIdentity?.split('/')[1] ?? name,
      root,
    },
    headRef: branch,
    commits,
    changedFiles: statusFiles,
    additions: 0,
    deletions: 0,
    workingTree: status ? 'dirty' : 'clean',
    evidence: commits.map((commit) => ({ type: 'commit' as const, locator: commit.sha })),
  };
}

async function engineeringReport(args: string[], kind: 'daily' | 'weekly'): Promise<CliResult> {
  const root = await repoRoot();
  if (
    !(await access(join(root, '.trace', 'config.yml'))
      .then(() => true)
      .catch(() => false))
  )
    return {
      code: 2,
      value: {
        error: 'TRACE is not initialized in this repository. Run `trace init --yes` first.',
      },
    };
  const before = await gitSnapshot(root).catch(() => ({
    branch: '',
    headCommit: '',
    workingTree: 'dirty' as const,
  }));
  const now = new Date();
  const option = (name: string) => args.find((arg, index) => args[index - 1] === name);
  const timeZone = option('--timezone') ?? 'UTC';
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const date = option('--date') ?? localDate;
  const period = reportPeriod(kind, date, timeZone, now);
  const document = engineeringReportSchema.parse(
    await collectEngineeringReport(
      root,
      period,
      args.includes('--github'),
      undefined,
      before.headCommit,
    ),
  );
  const after = await gitSnapshot(root).catch(() => ({
    branch: '',
    headCommit: '',
    workingTree: 'dirty' as const,
  }));
  const clean =
    before.workingTree === 'clean' && sameSnapshot(before, after) && Boolean(before.headCommit);
  const remote = await git(['config', '--get', 'remote.origin.url'], root).catch(() => '');
  const identity = normalizeGitHubRemote(remote);
  const [owner, name] = identity?.split('/') ?? ['local', resolve(root).split(/[\\/]/).pop()!];
  document.sections.find((section) => section.id === 'freshness')!.summary += clean
    ? ' Generation inputs: clean committed checkout.'
    : ' Generation inputs: dirty or unstable checkout; local-only exploratory report.';
  const evidence = [
    { type: 'check' as const, locator: reportEvidenceLocator, metadata: { document } },
    {
      type: 'check' as const,
      locator: 'trace:report-input:v1',
      metadata: {
        head_commit: before.headCommit,
        branch: before.branch,
        working_tree: clean ? 'clean' : 'dirty',
      },
    },
  ];
  const renderMarkdown = () =>
    `# ${kind === 'daily' ? 'Daily' : 'Weekly'} engineering report\n\n` +
    document.sections
      .map(
        (section) =>
          `## ${section.title}\n\n${section.summary}\n\n` +
          section.items
            .map(
              (item) =>
                `- ${item.url ? `[${item.title.replace(/[[\]\n]/g, ' ')}](${item.url})` : item.title}${item.detail ? ` — ${item.detail}` : ''}`,
            )
            .join('\n'),
      )
      .join('\n\n');
  const relativePath = `reports/${kind}/${date}.md`;
  const previousCreatedAt = await readFile(join(root, '.trace', relativePath), 'utf8')
    .then((content) => parseArtifact(content).metadata.created_at)
    .catch(() => now.toISOString());
  const metadata: ArtifactMetadata = {
    schema_version: '0.1',
    id: `${kind}-${date}`,
    artifact_type: kind === 'daily' ? 'daily_report' : 'weekly_report',
    repository: { provider: identity ? 'github' : 'git', owner: owner!, name: name! },
    created_at: previousCreatedAt,
    updated_at: now.toISOString(),
    generator: 'trace-cli/0.2.0',
    execution_origin: 'local',
    source_refs: before.headCommit ? [{ type: 'commit', locator: before.headCommit }] : [],
    evidence,
    review_status: 'draft',
    sensitivity: 'internal',
    sync_policy: clean ? 'allowlisted' : 'local_only',
    dashboard: {
      title: `${kind === 'daily' ? 'Daily' : 'Weekly'} report — ${date}`,
      summary: document.sections.find((s) => s.id === 'summary')!.summary,
      branch: before.branch || undefined,
      head_commit: before.headCommit || undefined,
      status: 'completed',
      items: [],
    },
  };
  let markdown = renderMarkdown();
  const shortened = new Set<string>();
  while (Buffer.byteLength(serializeArtifact(metadata, markdown), 'utf8') > 240_000) {
    const largest = [...document.sections].sort((a, b) => b.items.length - a.items.length)[0]!;
    if (!largest.items.length)
      throw new Error('Report metadata exceeds the safe artifact size budget.');
    largest.items.pop();
    if (!shortened.has(largest.id)) {
      largest.summary +=
        ' Evidence display shortened to fit the safe artifact size budget; collected totals are unchanged.';
      shortened.add(largest.id);
    }
    markdown = renderMarkdown();
  }
  const artifact = await writeArtifact({
    traceRoot: join(root, '.trace'),
    relativePath,
    overwrite: true,
    metadata,

    markdown,
    dryRun: !args.includes('--yes') || args.includes('--dry-run'),
  });
  return {
    code: 0,
    value: {
      window: period,
      artifact,
      ...(kind === 'daily' ? artifact : {}),
      document,
      authoritative: clean,
    },
  };
}
const daily = (args: string[]) => engineeringReport(args, 'daily');
const weekly = (args: string[]) => engineeringReport(args, 'weekly');

async function analyzeCommand(args: string[]): Promise<CliResult> {
  if (args[1] && args[1] !== 'changes' && !args[1].startsWith('--'))
    return { code: 2, value: { error: 'Use: trace analyze [changes] [--with-ai]' } };
  const root = await repoRoot();
  const before = await gitSnapshot(root).catch(() => null);
  const changeSet = await changes(args);
  const result = await analyzeChanges({
    root,
    changeSet,
    withSemantic: args.includes('--with-ai'),
  });
  const after = await gitSnapshot(root).catch(() => null);
  const verifiedClean =
    before !== null &&
    after !== null &&
    before.workingTree === 'clean' &&
    changeSet.workingTree === 'clean' &&
    sameSnapshot(before, after) &&
    changeSet.commits[0]?.sha === before.headCommit &&
    changeSet.headRef === before.branch;
  const inputEvidence = {
    type: 'check' as const,
    locator: analysisInputCheck,
    metadata: {
      head_commit: before?.headCommit ?? changeSet.commits[0]?.sha,
      branch: before?.branch ?? changeSet.headRef,
      working_tree: verifiedClean ? 'clean' : 'dirty',
    },
  };
  const now = new Date().toISOString();
  const headCommit = changeSet.commits[0]?.sha;
  const artifactId = stableArtifactId(
    'analysis',
    `${changeSet.repository.provider}:${changeSet.repository.owner ?? 'local'}:${changeSet.repository.name}:${headCommit ?? changeSet.headRef ?? result.analysisId}`,
  );
  const artifact = await writeArtifact({
    traceRoot: join(root, '.trace'),
    relativePath: `analyses/${artifactId}.md`,
    overwrite: true,
    dryRun: args.includes('--dry-run'),
    metadata: {
      schema_version: '0.1',
      id: artifactId,
      artifact_type: 'analysis',
      repository: {
        provider: changeSet.repository.provider,
        owner: changeSet.repository.owner ?? 'local',
        name: changeSet.repository.name,
      },
      created_at: now,
      updated_at: now,
      generator: 'trace-cli/0.2.0',
      execution_origin: 'local',
      source_refs: changeSet.evidence,
      evidence: [...changeSet.evidence, inputEvidence],
      review_status: 'draft',
      sensitivity: 'internal',
      sync_policy: verifiedClean ? 'allowlisted' : 'local_only',
      dashboard: {
        title: `Local analysis of ${changeSet.repository.name}`,
        summary: `${result.findings.length} deterministic findings from ${result.parserCoverage.supportedFiles} supported files. Source code remains local.`,
        branch: changeSet.headRef || undefined,
        head_commit: headCommit,
        status: 'completed',
        items: result.findings.slice(0, 100).map((finding) => ({
          id: finding.id,
          title: finding.title,
          detail: finding.detail,
          severity: finding.severity,
          classification: finding.classification,
          evidence: finding.evidenceIds.slice(0, 20),
        })),
      },
    },
    markdown: `# Local analysis\n\n## Known\n\n- Deterministic findings: **${result.findings.length}**.\n- Supported files: **${result.parserCoverage.supportedFiles}**.\n- Working tree: **${changeSet.workingTree}**.\n\n## Provenance\n\n- Engine: ${result.provenance.engine}.\n- Parser: ${result.provenance.parser}.\n- Source code sent to a model: **${result.provenance.sourceCodeSentToProvider ? 'yes' : 'no'}**.\n\n## Findings\n\n${result.findings.map((finding) => `- **${finding.title}** — ${finding.detail}`).join('\n') || '- No deterministic findings.'}\n`,
  });
  return {
    code: 0,
    value: {
      analysis: {
        id: result.analysisId,
        parserCoverage: result.parserCoverage,
        findings: result.findings,
        conflicts: result.conflicts,
        warnings: result.warnings,
        provenance: result.provenance,
        input: inputEvidence.metadata,
      },
      artifact: {
        path: artifact.path,
        checksum: artifact.checksum,
        dryRun: artifact.dryRun,
      },
    },
  };
}

async function prCommand(args: string[]): Promise<CliResult> {
  const root = await repoRoot();
  const changeSet = await changes(args);
  const numberArg = args.find((arg) => /^\d+$/.test(arg));
  const input: PullRequestInput = {
    provider: changeSet.repository.provider,
    owner: changeSet.repository.owner ?? 'local',
    repository: changeSet.repository.name,
    number: numberArg ? Number(numberArg) : 0,
    title: 'Local change analysis',
    baseRef: args.find((arg, index) => args[index - 1] === '--base') ?? 'unknown',
    headRef: changeSet.headRef ?? 'working-tree',
    baseSha: args.find((arg, index) => args[index - 1] === '--base-sha') ?? 'unknown',
    headSha: changeSet.commits[0]?.sha ?? 'working-tree',
    trigger: 'manual',
  };
  const analysis = await analyzeChanges({
    root,
    changeSet,
    withSemantic: args.includes('--with-ai'),
  });
  const brief = createPullRequestBrief(input, analysis);
  const markdown = renderPullRequestBrief(brief);
  if (!args.includes('--write')) {
    return {
      code: 0,
      value: {
        dryRun: true,
        brief,
        markdown,
        message: 'Pass --write --yes to create the local .trace PR artifact.',
      },
    };
  }
  if (!args.includes('--yes')) {
    return { code: 2, value: { error: 'Refusing to write without --yes.', dryRun: true, brief } };
  }
  const metadata = {
    schema_version: '0.1' as const,
    id: `pr-${input.provider}-${input.number || 'local'}`,
    artifact_type: 'pr_brief' as const,
    repository: { provider: input.provider, owner: input.owner, name: input.repository },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    generator: 'trace-cli/0.2.0',
    execution_origin: 'local' as const,
    source_refs: changeSet.evidence,
    evidence: changeSet.evidence,
    review_status: 'draft' as const,
    sensitivity: 'internal' as const,
    sync_policy: 'repository_authoritative' as const,
  };
  const artifact = await writeArtifact({
    traceRoot: join(root, '.trace'),
    relativePath: `pull-requests/${input.provider}-${input.number || 'local'}.md`,
    metadata,
    markdown,
    dryRun: args.includes('--dry-run'),
  });
  return { code: 0, value: { brief, artifact } };
}

async function rulesCommand(args: string[]): Promise<CliResult> {
  const subcommand = args[1] ?? 'list';
  const rules = mergeEffectiveRules(initialRules);
  if (subcommand === 'list' || subcommand === 'effective')
    return { code: 0, value: { source: 'built-in baseline', rules } };
  if (subcommand === 'validate') {
    const errors = rules.flatMap((rule) =>
      validateRule(rule).map((error) => ({ rule: rule.id, error })),
    );
    return { code: errors.length ? 1 : 0, value: { valid: errors.length === 0, errors } };
  }
  if (subcommand === 'test') {
    const changeSet = await changes(args);
    return { code: 0, value: { rules: evaluateRules(changeSet, rules) } };
  }
  return {
    code: 2,
    value: { error: 'Use: trace rules list|explain|validate|test|effective|diff' },
  };
}

export async function main(args: string[]): Promise<CliResult> {
  const [command, subcommand] = args;
  if (command === '--version' || command === '-v') return { code: 0, value: 'trace 0.2.0' };
  if (command === 'init') return init(args);
  if (command === 'login') return { code: 0, value: await loginDashboard(args) };
  if (command === 'whoami') return { code: 0, value: await dashboardWhoami() };
  if (command === 'logout') return { code: 0, value: await logoutDashboard() };
  if (command === 'connect') {
    const root = await repoRoot();
    const remote = await git(['config', '--get', 'remote.origin.url'], root).catch(() => '');
    return { code: 0, value: await connectDashboard(root, remote) };
  }
  if (command === 'status') {
    const root = await repoRoot();
    const trace = join(root, '.trace');
    const issues = await validateTraceDirectory(trace);
    const remote = await git(['config', '--get', 'remote.origin.url'], root).catch(() => '');
    const binding = await readBinding(root);
    const target = binding ? undefined : resolveCloudTarget();
    return {
      code: issues.length ? 1 : 0,
      value: {
        repository: { root, github: normalizeGitHubRemote(remote) },
        trace: { path: trace, valid: issues.length === 0, issues },
        dashboard: binding
          ? {
              connected: true,
              environment: cloudEnvironmentForServer(binding.server),
              repository: binding.repository,
              workspace: binding.workspaceName,
              server: binding.server,
            }
          : {
              connected: false,
              environment: target!.environment,
              server: target!.server,
              next: 'Run trace login, then trace connect.',
            },
      },
    };
  }
  if (command === 'changes') return { code: 0, value: await changes(args) };
  if (command === 'analyze') return analyzeCommand(args);
  if (command === 'validate')
    return {
      code: (await validateTraceDirectory(join(await repoRoot(), '.trace'))).length ? 1 : 0,
      value: await validateTraceDirectory(join(await repoRoot(), '.trace')),
    };
  if (command === 'report' && subcommand === 'daily') return daily(args);
  if (command === 'report' && subcommand === 'weekly') return weekly(args);
  if (command === 'sync') {
    const root = await repoRoot();
    if (subcommand === 'status')
      return {
        code: 0,
        value: await dashboardSyncStatus(root, args.includes('--accept-dashboard-base')),
      };
    const branch = await git(['branch', '--show-current'], root);
    const headCommit = await git(['rev-parse', 'HEAD'], root);
    return {
      code: 0,
      value: await syncDashboard(root, branch, headCommit, args.includes('--dry-run')),
    };
  }
  if (command === 'config' && subcommand === 'show') {
    const root = await repoRoot();
    const source = await readFile(join(root, '.trace/config.yml'), 'utf8').catch(() => '');
    return {
      code: source ? 0 : 1,
      value: source
        ? { source: '.trace/config.yml', config: parse(source) }
        : { error: 'No .trace/config.yml found.' },
    };
  }
  if (command === 'doctor') {
    const root = await repoRoot();
    const checks = {
      node: process.versions.node,
      git: await git(['--version'], root)
        .then(() => true)
        .catch(() => false),
      repository: root,
      trace: (await validateTraceDirectory(join(root, '.trace'))).length === 0,
      dashboard: await readBinding(root),
    };
    return { code: checks.git && checks.trace ? 0 : 1, value: checks };
  }
  if (command === 'inspect' && subcommand) {
    const artifact = parseArtifact(await readFile(resolve(subcommand), 'utf8'));
    return { code: 0, value: artifact.metadata };
  }
  if (command === 'pr') return prCommand(args);
  if (command === 'rules') return rulesCommand(args);
  return {
    code: 2,
    value: {
      error: 'Unknown command.',
      commands: [
        'init',
        'login',
        'whoami',
        'logout',
        'connect',
        'status',
        'validate',
        'inspect',
        'changes',
        'analyze [changes] [--with-ai]',
        'report daily',
        'pr',
        'rules list|explain|validate|test|effective|diff',
        'sync [--dry-run]',
        'sync status [--accept-dashboard-base]',
        'config show',
        'doctor',
      ],
    },
  };
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => '') : '';
const modulePath = await realpath(fileURLToPath(import.meta.url));
// Resolve both paths: Windows npm shims may use short names and different casing.
const invokedDirectly =
  process.platform === 'win32'
    ? invokedPath.toLowerCase() === modulePath.toLowerCase()
    : invokedPath === modulePath;
if (invokedDirectly) {
  try {
    const result = await main(process.argv.slice(2));
    console.log(output(result.value, jsonFlag(process.argv.slice(2))));
    process.exitCode = result.code;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
