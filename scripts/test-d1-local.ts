import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

type D1Result = {
  results?: Array<Record<string, unknown>>;
  success?: boolean;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const config = join(root, 'packages', 'db', 'wrangler.d1.jsonc');
const persistence = mkdtempSync(join(tmpdir(), 'trace-d1-local-'));
const resolvedPersistence = resolve(persistence);
const resolvedTemp = resolve(tmpdir());

if (
  !resolvedPersistence.startsWith(`${resolvedTemp}\\`) &&
  !resolvedPersistence.startsWith(`${resolvedTemp}/`)
) {
  throw new Error(`Refusing to use unexpected persistence path: ${resolvedPersistence}`);
}

function runWrangler(args: string[], captureJson = false) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: captureJson ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.status !== 0) {
    if (captureJson) process.stderr.write(result.stderr);
    throw new Error(`Wrangler exited with status ${String(result.status)}`);
  }

  return captureJson ? result.stdout : '';
}

function execute(command: string) {
  const output = runWrangler(
    [
      'd1',
      'execute',
      'trace-d1-local',
      '--local',
      '--persist-to',
      persistence,
      '--config',
      config,
      '--command',
      command,
      '--json',
    ],
    true,
  );
  return JSON.parse(output) as D1Result[];
}

try {
  runWrangler([
    'd1',
    'migrations',
    'apply',
    'trace-d1-local',
    '--local',
    '--persist-to',
    persistence,
    '--config',
    config,
  ]);

  const tableResult = execute(
    "SELECT count(*) AS table_count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
  );
  const tableCount = Number(tableResult[0]?.results?.[0]?.table_count);
  if (tableCount !== 22) throw new Error(`Expected 22 TRACE tables, found ${tableCount}`);

  const recordResult = execute(
    [
      "INSERT INTO users (id, email, email_verified) VALUES ('cf1-user', 'cf1@example.invalid', 0)",
      "INSERT INTO audit_events (id, action, subject_type, metadata) VALUES ('cf1-audit', 'cf1.test', 'schema', '{\"driver\":\"d1\"}')",
      "SELECT users.email, typeof(users.created_at) AS timestamp_type, json_extract(audit_events.metadata, '$.driver') AS json_driver FROM users CROSS JOIN audit_events WHERE users.id = 'cf1-user' AND audit_events.id = 'cf1-audit'",
    ].join('; '),
  );
  const row = recordResult.at(-1)?.results?.[0];
  if (
    row?.email !== 'cf1@example.invalid' ||
    row.timestamp_type !== 'integer' ||
    row.json_driver !== 'd1'
  ) {
    throw new Error(`Unexpected D1 round-trip result: ${JSON.stringify(row)}`);
  }

  process.stdout.write(
    `D1 local integration passed: ${tableCount} tables, JSON and timestamp round-trip verified.\n`,
  );
} finally {
  rmSync(resolvedPersistence, { recursive: true, force: true });
}
