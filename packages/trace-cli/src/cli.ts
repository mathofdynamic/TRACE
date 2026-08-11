import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parse, stringify } from 'yaml';
import {
  analyzeChanges,
  createPullRequestBrief,
  renderReport,
  renderPullRequestBrief,
  weeklyWindow,
  type PullRequestInput,
} from '@trace/analysis';
import type { NormalizedChangeSet } from '@trace/core';
import { evaluateRules, initialRules, mergeEffectiveRules, validateRule } from '@trace/rules';
import { parseArtifact, validateTraceDirectory, writeArtifact } from '@trace/schema';

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
        sync_policy: 'local_only',
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
  const status = await git(['status', '--porcelain'], root);
  const branch = await git(['branch', '--show-current'], root).catch(() => '');
  const remote = await git(['config', '--get', 'remote.origin.url'], root).catch(() => '');
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
    repository: { provider: remote.includes('github') ? 'github' : 'git', name, root },
    headRef: branch,
    commits,
    changedFiles: statusFiles,
    additions: 0,
    deletions: 0,
    workingTree: status ? 'dirty' : 'clean',
    evidence: commits.map((commit) => ({ type: 'commit' as const, locator: commit.sha })),
  };
}

async function daily(args: string[]): Promise<CliResult> {
  const root = await repoRoot();
  const changeSet = await changes(args);
  const date =
    args.find((arg, index) => args[index - 1] === '--date') ??
    new Date().toISOString().slice(0, 10);
  const owner = changeSet.repository.owner ?? 'local';
  const metadata = {
    schema_version: '0.1' as const,
    id: `daily-${date}`,
    artifact_type: 'daily_report' as const,
    repository: { provider: changeSet.repository.provider, owner, name: changeSet.repository.name },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    generator: 'trace-cli/0.1',
    execution_origin: 'local' as const,
    source_refs: changeSet.evidence,
    evidence: changeSet.evidence,
    review_status: 'draft' as const,
    sensitivity: 'internal' as const,
    sync_policy: 'local_only' as const,
  };
  const analysis = args.includes('--with-ai')
    ? await analyzeChanges({ root, changeSet, withSemantic: true })
    : undefined;
  const body = `# Daily report — ${date}\n\n## Known\n\n- Working tree: **${changeSet.workingTree}**.\n- Recent commits observed: **${changeSet.commits.length}**.\n- Changed paths observed: **${changeSet.changedFiles.length}**.\n\n## Unknown\n\n- The intended product goal was not inferred from filenames or commit subjects.\n- No semantic findings or model interpretation are included in this deterministic draft.\n`;
  const finalBody = analysis
    ? `${body}\n## Analysis snapshot\n\n- Deterministic findings: **${analysis.findings.length}**.\n- Semantic provider: **${analysis.provenance.semanticProvider ?? 'none'}**.\n- Context items: **${analysis.context.items.length}**.\n`
    : body;
  const result = await writeArtifact({
    traceRoot: join(root, '.trace'),
    relativePath: `reports/daily/${date}.md`,
    metadata,
    markdown: finalBody,
    dryRun: !args.includes('--yes') || args.includes('--dry-run'),
  });
  return { code: 0, value: result };
}

async function weekly(args: string[]): Promise<CliResult> {
  const root = await repoRoot();
  const changeSet = await changes(args);
  const window = weeklyWindow(new Date(), 'UTC');
  const items = changeSet.changedFiles.map((file) => ({
    id: `change-${file.path}`,
    kind: 'change' as const,
    title: file.path,
    detail: `${file.status} file observed in the local working tree`,
    evidenceIds: [`file:${file.path}`],
    materiality: 'medium' as const,
    included: true,
  }));
  const markdown = renderReport({ window, items }, 'weekly');
  const metadata = {
    schema_version: '0.1' as const,
    id: `weekly-${window.startUtc.slice(0, 10)}`,
    artifact_type: 'weekly_report' as const,
    repository: {
      provider: changeSet.repository.provider,
      owner: changeSet.repository.owner ?? 'local',
      name: changeSet.repository.name,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    generator: 'trace-cli/0.1',
    execution_origin: 'local' as const,
    source_refs: changeSet.evidence,
    evidence: changeSet.evidence,
    review_status: 'draft' as const,
    sensitivity: 'internal' as const,
    sync_policy: 'local_only' as const,
  };
  const artifact = await writeArtifact({
    traceRoot: join(root, '.trace'),
    relativePath: `reports/weekly/${window.startUtc.slice(0, 10)}.md`,
    metadata,
    markdown,
    dryRun: !args.includes('--yes') || args.includes('--dry-run'),
  });
  return { code: 0, value: { window, artifact } };
}

async function analyzeCommand(args: string[]): Promise<CliResult> {
  if (args[1] !== 'changes') {
    return { code: 2, value: { error: 'Use: trace analyze changes [--with-ai]' } };
  }
  const root = await repoRoot();
  const changeSet = await changes(args);
  const result = await analyzeChanges({
    root,
    changeSet,
    withSemantic: args.includes('--with-ai'),
  });
  return { code: 0, value: result };
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
    generator: 'trace-cli/0.1',
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

async function main(args: string[]): Promise<CliResult> {
  const [command, subcommand] = args;
  if (command === '--version' || command === '-v') return { code: 0, value: 'trace 0.1.0' };
  if (command === 'init') return init(args);
  if (command === 'status') {
    const root = await repoRoot();
    const trace = join(root, '.trace');
    const issues = await validateTraceDirectory(trace);
    return {
      code: issues.length ? 1 : 0,
      value: { repository: root, trace, valid: issues.length === 0, issues },
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
  if (command === 'sync' && subcommand === 'status')
    return {
      code: 0,
      value: { configured: false, mode: 'local', message: 'No sync endpoint is configured.' },
    };
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
        'status',
        'validate',
        'inspect',
        'changes',
        'analyze changes [--with-ai]',
        'report daily',
        'pr',
        'rules list|explain|validate|test|effective|diff',
        'sync status',
        'config show',
        'doctor',
      ],
    },
  };
}

const result = await main(process.argv.slice(2));
console.log(output(result.value, jsonFlag(process.argv.slice(2))));
process.exitCode = result.code;
