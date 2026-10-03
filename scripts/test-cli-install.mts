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
  /^([a-f0-9]{64})  (mathofdynamic-trace-cli-(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?).tgz)$/.exec(
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
    env: { ...process.env, TRACE_CONFIG_HOME: config },
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
assert.equal(run('git', ['status', '--porcelain']), '', 'Acceptance needs a clean checkout');
await assert.rejects(access(join(checkout, '.trace')));
await assert.rejects(access(join(checkout, 'node_modules')));
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
assert.equal(
  manifest.dependencies,
  undefined,
  'Release must have no workspace/runtime dependencies',
);
run(executable, ['init', '--yes']);
assert.deepEqual(JSON.parse(run(executable, ['validate', '--json'])), []);
for (const path of ['config.yml', 'schema-version', 'README.md', 'state', 'reports/daily']) {
  await access(join(checkout, '.trace', path));
}
const analysis = JSON.parse(run(executable, ['analyze', '--json']));
assert.equal(analysis.analysis.provenance.sourceCodeSentToProvider, false);
const artifact = await readFile(analysis.artifact.path, 'utf8');
assert(artifact.includes(run('git', ['rev-parse', 'HEAD'])));
assert(artifact.includes('Working tree: **clean**'));
assert(artifact.includes('Source code sent to a model: **no**'));
assert.deepEqual(JSON.parse(run(executable, ['validate', '--json'])), []);
const status = JSON.parse(run(executable, ['status', '--json']));
assert.equal(status.trace.valid, true);
assert.equal(status.dashboard.connected, false);
const plan = JSON.parse(run(executable, ['sync', '--dry-run', '--json']));
assert.equal(plan.dryRun, true);
assert.equal(plan.connected, false);
assert.equal(plan.sourceCodeIncluded, false);
assert.equal(plan.codeSnippetsIncluded, false);
assert(plan.eligible.length > 0, 'Fresh analysis must be eligible for source-free planning');

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
      schemaValid: true,
      rootTraceIgnored: true,
      credentialsCreated: false,
      productionContact: false,
    },
    null,
    2,
  ),
);
