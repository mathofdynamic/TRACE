import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Exercise the installed executable, never the workspace CLI or its node_modules.
const [releaseArgument, checkoutArgument] = process.argv.slice(2);
assert(
  releaseArgument && checkoutArgument,
  'Usage: test-cli-install <release directory> <fresh TRACE checkout>',
);
const release = resolve(releaseArgument);
const checksumLine = (await readFile(join(release, 'SHA256SUMS'), 'utf8')).trim();
const checksumMatch =
  /^([a-f0-9]{64}) {2}(mathofdynamic-trace-cli-(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)\.tgz)$/.exec(
    checksumLine,
  );
assert(checksumMatch, 'Release must contain one safe versioned archive checksum');
const [, checksum, archiveName, expectedVersion] = checksumMatch;
const archive = join(release, archiveName!);
const checkout = resolve(checkoutArgument);
const prefix = await mkdtemp(join(tmpdir(), 'trace-install-'));
const config = await mkdtemp(join(tmpdir(), 'trace-acceptance-config-'));
const windows = process.platform === 'win32';
const run = (command: string, args: string[], cwd = checkout) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: windows,
    env: {
      ...process.env,
      TRACE_CONFIG_HOME: config,
      TRACE_AI_PROVIDER: '',
      TRACE_AI_BASE_URL: '',
      TRACE_AI_MODEL: '',
      TRACE_AI_API_KEY: '',
      TRACE_AI_DATA_POLICY: '',
    },
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
assert.equal(run('git', ['status', '--porcelain']), '', 'Acceptance needs a clean checkout');
await assert.rejects(access(join(checkout, '.trace')));
await assert.rejects(access(join(checkout, 'node_modules')));
// Actions checks out a detached PR merge commit. Give this disposable checkout a named branch
// without changing its source commit; authoritative artifact sync requires branch attribution.
if (!run('git', ['branch', '--show-current'])) run('git', ['switch', '-c', 'trace-cli-acceptance']);
// Give only the disposable acceptance checkout the intended GitHub identity. No fetch/auth occurs.
run('git', ['remote', 'set-url', 'origin', 'https://github.com/mathofdynamic/TRACE.git']);
assert.equal(
  createHash('sha256')
    .update(await readFile(archive))
    .digest('hex'),
  checksum,
);
run(windows ? 'npm.cmd' : 'npm', [
  'install',
  '--global',
  '--ignore-scripts',
  '--prefix',
  prefix,
  archive,
]);
const executable = windows ? join(prefix, 'trace.cmd') : join(prefix, 'bin', 'trace');
assert.equal(run(executable, ['--version']), `trace ${expectedVersion}`);
const manifest = JSON.parse(
  await readFile(
    join(
      prefix,
      windows ? 'node_modules' : 'lib/node_modules',
      '@mathofdynamic/trace-cli/package.json',
    ),
    'utf8',
  ),
);
assert.equal(manifest.name, '@mathofdynamic/trace-cli');
assert.equal(manifest.version, expectedVersion);
assert.equal(manifest.scripts, undefined, 'Release must have no lifecycle/install scripts');
assert.deepEqual(
  (
    await readdir(
      join(prefix, windows ? 'node_modules' : 'lib/node_modules', '@mathofdynamic/trace-cli'),
    )
  ).sort(),
  ['README.md', 'THIRD_PARTY_NOTICES.txt', 'dist', 'package.json'],
  'Release must contain only the reviewed bundle, metadata and documentation',
);
assert.deepEqual(
  await readdir(
    join(prefix, windows ? 'node_modules' : 'lib/node_modules', '@mathofdynamic/trace-cli/dist'),
  ),
  ['cli.js'],
  'Release must contain no native addons or runtime state',
);
assert.equal(
  manifest.dependencies,
  undefined,
  'Release must have no workspace/runtime dependencies',
);
const rulesList = JSON.parse(run(executable, ['rules', 'list', '--json']));
assert(Array.isArray(rulesList.rules));
assert.equal(rulesList.source, 'built-in baseline');
assert.deepEqual(JSON.parse(run(executable, ['rules', 'effective', '--json'])), rulesList);
assert.deepEqual(JSON.parse(run(executable, ['rules', 'validate', '--json'])), {
  valid: true,
  errors: [],
});
assert(Array.isArray(JSON.parse(run(executable, ['rules', 'test', '--json'])).rules));
// Historical 0.1/0.2 archives predate these contracts; published 0.3+ must pass them.
const [major, minor] = expectedVersion!.split('.').map(Number);
const requireCurrentContract =
  major! > 0 || minor! >= 3 || process.env.TRACE_ACCEPTANCE_PUBLISHED_RELEASE !== 'true';
const requireRulesHelpContract = requireCurrentContract;
if (requireRulesHelpContract) {
  const rulesUsage = 'rules list|effective|validate|test';
  assert.deepEqual(JSON.parse(run(executable, ['rules', '--help', '--json'])), {
    usage: `Use: trace ${rulesUsage}`,
  });
  const help = JSON.parse(run(executable, ['--help', '--json']));
  assert.deepEqual(
    help.commands.filter((entry: string) => entry.startsWith('rules ')),
    [rulesUsage],
  );
  for (const subcommand of ['explain', 'diff', '__unknown__']) {
    let rejected = false;
    try {
      run(executable, ['rules', subcommand, '--json']);
    } catch (error) {
      const failure = error as { status: number; stdout: string };
      assert.equal(failure.status, 2);
      assert.deepEqual(JSON.parse(String(failure.stdout)), { error: `Use: trace ${rulesUsage}` });
      rejected = true;
    }
    assert(rejected, 'Unsupported rules subcommand must return exit 2');
  }
}
await assert.rejects(
  access(join(checkout, '.trace')),
  'Rules/help must not initialize the checkout',
);
run(executable, ['init', '--yes']);
assert.deepEqual(JSON.parse(run(executable, ['validate', '--json'])), []);
for (const path of ['config.yml', 'schema-version', 'README.md', 'state', 'reports/daily']) {
  await access(join(checkout, '.trace', path));
}
if (requireRulesHelpContract) {
  let rejected = false;
  try {
    run(executable, ['analyze', '--with-ai', '--json']);
  } catch (error) {
    const failure = error as { status: number; stdout: string };
    assert.equal(failure.status, 2);
    const result = JSON.parse(String(failure.stdout));
    assert.equal(result.errorCode, 'AI_NOT_CONFIGURED');
    assert(result.error.includes('TRACE_AI_DATA_POLICY'));
    rejected = true;
  }
  assert(rejected, 'AI request without explicit configuration must fail');
  await assert.rejects(access(join(checkout, '.trace/analyses')));
}
const analysis = JSON.parse(run(executable, ['analyze', '--json']));
assert.equal(analysis.analysis.provenance.sourceCodeSentToProvider, false);
const artifact = await readFile(analysis.artifact.path, 'utf8');
assert(artifact.includes(run('git', ['rev-parse', 'HEAD'])));
assert(artifact.includes(`trace-cli/${expectedVersion}`));
assert(artifact.includes('Working tree: **clean**'));
assert(artifact.includes('Source code sent to a model: **no**'));
assert.deepEqual(JSON.parse(run(executable, ['validate', '--json'])), []);
const supportsPeriodReports =
  Number(expectedVersion!.split('.')[0]) > 0 || Number(expectedVersion!.split('.')[1]) >= 2;
if (supportsPeriodReports) {
  for (const kind of ['daily', 'weekly'] as const) {
    const report = JSON.parse(run(executable, ['report', kind, '--yes', '--json']));
    assert.equal(report.authoritative, true);
    assert.equal(report.document.period.kind, kind);
    const duration =
      Date.parse(report.document.period.end) - Date.parse(report.document.period.start);
    assert.equal(duration, (kind === 'daily' ? 1 : 7) * 86_400_000);
    assert.equal(report.document.period.timeZone, 'UTC');
    assert.equal(report.document.sections.length, 11);
    assert(
      report.document.sources.some(
        (source: { name: string; status: string }) =>
          source.name === 'GitHub' && source.status === 'not_available',
      ),
    );
    const reportContent = await readFile(report.artifact.path, 'utf8');
    assert(reportContent.includes('trace:engineering-report:v1'));
    assert(reportContent.includes('trace:report-input:v1'));
    assert(reportContent.includes(`trace-cli/${expectedVersion}`));
    assert(reportContent.includes(run('git', ['rev-parse', 'HEAD'])));
    assert(reportContent.includes('## Executive summary'));
  }
  assert.deepEqual(JSON.parse(run(executable, ['validate', '--json'])), []);
}
// Both candidates and published 0.3+ archives must include the PR projection.
const requirePrProjection = requireCurrentContract;
const pr = JSON.parse(run(executable, ['pr', '7', '--write', '--yes', '--json']));
assert.equal(pr.artifact.dryRun, false);
const prContent = await readFile(pr.artifact.path, 'utf8');
if (requirePrProjection) {
  assert(prContent.includes('pull_request:'));
  assert(!prContent.includes('```'));
  assert(!prContent.includes(checkout));
}
const status = JSON.parse(run(executable, ['status', '--json']));
assert.equal(status.trace.valid, true);
assert.equal(status.dashboard.connected, false);
const plan = JSON.parse(run(executable, ['sync', '--dry-run', '--json']));
assert.equal(plan.dryRun, true);
assert.equal(plan.connected, false);
assert.equal(plan.sourceCodeIncluded, false);
assert.equal(plan.codeSnippetsIncluded, false);
if (requirePrProjection)
  assert(
    plan.eligible.some((item: { type: string }) => item.type === 'pr_brief'),
    'Fresh PR brief must be eligible',
  );
assert(plan.eligible.length > 0, 'Fresh analysis must be eligible for source-free planning');
if (supportsPeriodReports)
  for (const kind of ['daily_report', 'weekly_report']) {
    assert(plan.eligible.some((item: { type: string }) => item.type === kind));
  }

await assert.rejects(access(join(checkout, '.trace/state/dashboard.json')));
assert.deepEqual(await readdir(config), [], 'Local acceptance must not create credentials');
assert.equal(run('git', ['status', '--porcelain']), '', 'Runtime .trace must remain ignored');
assert.equal(run('git', ['check-ignore', '.trace/config.yml']), '.trace/config.yml');
console.log(
  JSON.stringify(
    {
      platform: process.platform,
      version: manifest.version,
      sha256: checksum,
      checkout: run('git', ['rev-parse', 'HEAD']),
      initialized: true,
      analyzed: true,
      dailyReport: supportsPeriodReports,
      weeklyReport: supportsPeriodReports,
      schemaValid: true,
      aiContract: requireRulesHelpContract
        ? 'explicit configuration required; deterministic default verified'
        : 'historical contract not required',
      rulesContract: requireRulesHelpContract
        ? 'pass'
        : 'historical help verification not required',
      rootTraceIgnored: true,
      credentialsCreated: false,
      productionContact: false,
    },
    null,
    2,
  ),
);
