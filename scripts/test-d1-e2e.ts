import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const config = path.join(web, 'wrangler.jsonc');
const authSecret = 'trace-d1-e2e-secret-change-this-32-chars';
const baseUrl = 'http://127.0.0.1:8787';
const persistence = path.join(root, '.trace-cache', `d1-e2e-${randomUUID()}`);

if (!existsSync(path.join(web, '.open-next', 'worker.js'))) {
  throw new Error('D1 E2E requires apps/web/.open-next/worker.js; run pnpm cf:build first.');
}

function sql(value: string | number | boolean | null) {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function sessionCookie(user: { id: string; name: string; email: string; githubLogin: string }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      user: { ...user, image: null },
      issuedAt: now,
      expiresAt: now + 3600,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', authSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function runWrangler(args: string[]) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1', WRANGLER_SEND_METRICS: 'false' },
  });
  if (result.status !== 0) {
    throw new Error(
      `Wrangler failed (${String(result.status)}): ${result.stderr.slice(-2_000)}${result.stdout.slice(-2_000)}`,
    );
  }
}

async function waitForHealth(server: ChildProcess) {
  const deadline = Date.now() + 120_000;
  let lastError = 'server did not answer';
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`D1 server exited with ${server.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'request failed';
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`D1 server health timeout: ${lastError}`);
}

async function main() {
  mkdirSync(persistence, { recursive: true });
  const userId = randomUUID();
  const organizationId = randomUUID();
  const installationId = randomUUID();
  const repositoryId = randomUUID();
  const analysisRunId = randomUUID();
  const findingId = randomUUID();
  const connectionId = randomUUID();
  const syncOperationId = randomUUID();
  const pullRequestId = randomUUID();
  const dailyReportId = randomUUID();
  const weeklyReportId = randomUUID();
  const conflictRecordId = randomUUID();
  const decisionRecordId = randomUUID();
  const ruleRecordId = randomUUID();
  const session = {
    id: userId,
    name: 'D1 E2E User',
    email: `d1-${userId.slice(0, 8)}@example.invalid`,
    githubLogin: `d1-${userId.slice(0, 8)}`,
  };
  const token = sessionCookie(session);
  const now = Date.now();
  const headCommit = 'a'.repeat(40);
  const operationManifest = {
    protocolVersion: '0.1',
    schemaVersion: '0.1',
    syncId: randomUUID(),
    repositoryId,
    repository: `${session.githubLogin}/trace`,
    executionOrigin: 'local',
    traceVersion: '0.1.0',
    createdAt: new Date(now).toISOString(),
    baseOperationId: null,
    git: { branch: 'main', headCommit },
    artifacts: [],
    sourceCodeIncluded: false,
    codeSnippetsIncluded: false,
  };
  const projection = (title: string, summary: string, items: unknown[] = []) => ({
    title,
    summary,
    status: 'completed',
    analyzedCommit: headCommit,
    timeWindow: title.includes('Weekly') ? '2026-W38' : '2026-09-16',
    items,
  });
  const metadata = (id: string, type: string, title: string) => ({
    schema_version: '0.1',
    id,
    artifact_type: type,
    repository: { provider: 'github', owner: session.githubLogin, name: 'trace' },
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    generator: 'trace-d1-e2e',
    execution_origin: 'local',
    review_status: 'accepted',
    sensitivity: 'internal',
    sync_policy: 'allowlisted',
    dashboard: projection(title, `${title} summary`),
  });
  const findingItem = {
    id: 'finding-d1-e2e',
    title: 'D1 E2E finding',
    detail: 'A deterministic finding from the isolated D1 fixture.',
    severity: 'medium',
    classification: 'deterministic',
    evidence: [`commit:${headCommit}`],
  };
  const seed = [
    `INSERT INTO users (id, email, name) VALUES (${sql(userId)}, ${sql(session.email)}, ${sql(session.name)})`,
    `INSERT INTO sessions (id, user_id, token, expires_at) VALUES (${sql(randomUUID())}, ${sql(userId)}, ${sql(token)}, ${now + 3_600_000})`,
    `INSERT INTO onboarding_profiles (id, user_id, intended_usage, execution_mode, completed) VALUES (${sql(randomUUID())}, ${sql(userId)}, 'individual', 'local', 1)`,
    `INSERT INTO organizations (id, name, slug) VALUES (${sql(organizationId)}, 'D1 E2E Workspace', ${sql(`d1-e2e-${userId.slice(0, 8)}`)})`,
    `INSERT INTO memberships (id, organization_id, user_id, role) VALUES (${sql(randomUUID())}, ${sql(organizationId)}, ${sql(userId)}, 'owner')`,
    `INSERT INTO github_installations (id, organization_id, github_installation_id, account_login, account_type, state) VALUES (${sql(installationId)}, ${sql(organizationId)}, '9007199254740993', ${sql(session.githubLogin)}, 'User', 'active')`,
    `INSERT INTO github_repositories (id, organization_id, installation_id, github_repository_id, owner, name, full_name, default_branch, visibility, state, remote_head_sha, last_synchronized_at) VALUES (${sql(repositoryId)}, ${sql(organizationId)}, ${sql(installationId)}, '9007199254740995', ${sql(session.githubLogin)}, 'trace', ${sql(`${session.githubLogin}/trace`)}, 'main', 'private', 'active', ${sql(headCommit)}, ${sql(now)})`,
    `INSERT INTO github_installation_repositories (id, installation_id, github_repository_id, selected, permissions) VALUES (${sql(randomUUID())}, ${sql(installationId)}, '9007199254740995', 1, ${sql(JSON.stringify({ metadata: 'read' }))})`,
    `INSERT INTO analysis_runs (id, organization_id, repository_id, idempotency_key, profile, schema_version, head_sha, status, result) VALUES (${sql(analysisRunId)}, ${sql(organizationId)}, ${sql(repositoryId)}, ${sql(`d1-e2e-analysis-${analysisRunId}`)}, 'local-sync', '0.1', ${sql(headCommit)}, 'completed', ${sql(JSON.stringify({ title: 'D1 E2E analysis', summary: 'Persisted D1 analysis', origin: 'local' }))})`,
    `INSERT INTO analysis_findings (id, analysis_run_id, external_id, title, detail, severity, classification, evidence) VALUES (${sql(findingId)}, ${sql(analysisRunId)}, 'finding-d1-e2e', 'D1 E2E finding', 'A deterministic finding from the isolated D1 fixture.', 'medium', 'deterministic', ${sql(JSON.stringify([`commit:${headCommit}`]))})`,
    `INSERT INTO github_pull_requests (id, organization_id, repository_id, github_pull_request_id, number, title, state, head_sha, base_branch, author_login, url, last_synchronized_at) VALUES (${sql(pullRequestId)}, ${sql(organizationId)}, ${sql(repositoryId)}, '7000000000000001', 17, 'D1 E2E change', 'open', ${sql(headCommit)}, 'main', ${sql(session.githubLogin)}, 'https://github.com/example/trace/pull/17', ${sql(now)})`,
    `INSERT INTO cli_connections (id, organization_id, user_id, label, token_hash, scopes, expires_at) VALUES (${sql(connectionId)}, ${sql(organizationId)}, ${sql(userId)}, 'D1 E2E computer', 'd1-e2e-token-hash', ${sql(JSON.stringify(['repository:read', 'sync:write']))}, ${sql(now + 86_400_000)})`,
    `INSERT INTO sync_operations (id, organization_id, repository_id, connection_id, sync_id, idempotency_key, status, branch, head_commit, trace_version, schema_version, manifest, total_bytes, artifact_count, completed_at) VALUES (${sql(syncOperationId)}, ${sql(organizationId)}, ${sql(repositoryId)}, ${sql(connectionId)}, ${sql(randomUUID())}, ${sql(`d1-e2e-sync-${syncOperationId}`)}, 'completed', 'main', ${sql(headCommit)}, '0.1.0', '0.1', ${sql(JSON.stringify(operationManifest))}, 1024, 5, ${sql(now)})`,
    `INSERT INTO synced_artifacts (id, organization_id, repository_id, operation_id, artifact_id, artifact_type, path, checksum, size_bytes, sensitivity, schema_version, execution_origin, content, metadata, projection, generated_at) VALUES (${sql(dailyReportId)}, ${sql(organizationId)}, ${sql(repositoryId)}, ${sql(syncOperationId)}, 'd1-e2e-daily', 'daily_report', 'reports/daily-d1-e2e.md', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 512, 'internal', '0.1', 'local', ${sql('# Daily report\\n\\n## Summary\\n\\nD1 E2E daily report content.\\n')}, ${sql(JSON.stringify(metadata('d1-e2e-daily', 'daily_report', 'D1 E2E Daily Report')))}, ${sql(JSON.stringify(projection('D1 E2E Daily Report', 'D1 E2E daily report summary', [findingItem])))}, ${sql(now)})`,
    `INSERT INTO synced_artifacts (id, organization_id, repository_id, operation_id, artifact_id, artifact_type, path, checksum, size_bytes, sensitivity, schema_version, execution_origin, content, metadata, projection, generated_at) VALUES (${sql(weeklyReportId)}, ${sql(organizationId)}, ${sql(repositoryId)}, ${sql(syncOperationId)}, 'd1-e2e-weekly', 'weekly_report', 'reports/weekly-d1-e2e.md', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 512, 'internal', '0.1', 'local', ${sql('# Weekly report\\n\\n## Summary\\n\\nD1 E2E weekly report content.\\n')}, ${sql(JSON.stringify(metadata('d1-e2e-weekly', 'weekly_report', 'D1 E2E Weekly Report')))}, ${sql(JSON.stringify(projection('D1 E2E Weekly Report', 'D1 E2E weekly report summary', [])))}, ${sql(now)})`,
    `INSERT INTO synced_artifacts (id, organization_id, repository_id, operation_id, artifact_id, artifact_type, path, checksum, size_bytes, sensitivity, schema_version, execution_origin, content, metadata, projection, generated_at) VALUES (${sql(conflictRecordId)}, ${sql(organizationId)}, ${sql(repositoryId)}, ${sql(syncOperationId)}, 'd1-e2e-conflict', 'conflict', 'conflicts/d1-e2e.md', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 256, 'internal', '0.1', 'local', ${sql('# Conflict\\n')}, ${sql(JSON.stringify(metadata('d1-e2e-conflict', 'conflict', 'D1 E2E conflict')))}, ${sql(JSON.stringify(projection('D1 E2E conflict', 'D1 E2E conflict summary', [{ ...findingItem, id: 'conflict-d1-e2e', title: 'D1 E2E conflict' }])))}, ${sql(now)})`,
    `INSERT INTO synced_artifacts (id, organization_id, repository_id, operation_id, artifact_id, artifact_type, path, checksum, size_bytes, sensitivity, schema_version, execution_origin, content, metadata, projection, generated_at) VALUES (${sql(decisionRecordId)}, ${sql(organizationId)}, ${sql(repositoryId)}, ${sql(syncOperationId)}, 'd1-e2e-decision', 'decision', 'decisions/d1-e2e.md', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 256, 'internal', '0.1', 'local', ${sql('# Decision\\n')}, ${sql(JSON.stringify(metadata('d1-e2e-decision', 'decision', 'D1 E2E decision')))}, ${sql(JSON.stringify(projection('D1 E2E decision', 'D1 E2E decision summary', [])))}, ${sql(now)})`,
    `INSERT INTO synced_artifacts (id, organization_id, repository_id, operation_id, artifact_id, artifact_type, path, checksum, size_bytes, sensitivity, schema_version, execution_origin, content, metadata, projection, generated_at) VALUES (${sql(ruleRecordId)}, ${sql(organizationId)}, ${sql(repositoryId)}, ${sql(syncOperationId)}, 'd1-e2e-rule', 'rule', 'rules/d1-e2e.md', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 256, 'internal', '0.1', 'local', ${sql('# Rule\\n')}, ${sql(JSON.stringify(metadata('d1-e2e-rule', 'rule', 'D1 E2E rule')))}, ${sql(JSON.stringify(projection('D1 E2E rule', 'D1 E2E rule summary', [])))}, ${sql(now)})`,
    `INSERT INTO audit_events (id, organization_id, actor_user_id, action, subject_type) VALUES (${sql(randomUUID())}, ${sql(organizationId)}, ${sql(userId)}, 'd1.e2e.seeded', 'repository')`,
    `INSERT INTO audit_events (id, organization_id, actor_user_id, action, subject_type, subject_id, created_at, updated_at) VALUES (${sql(randomUUID())}, ${sql(organizationId)}, ${sql(userId)}, 'local.sync.completed', 'sync_operation', ${sql(syncOperationId)}, ${sql(now)}, ${sql(now)})`,
  ].join('; ');

  let server: ChildProcess | null = null;
  let serverLog = '';
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
      '--env',
      'local-d1',
    ]);
    runWrangler([
      'd1',
      'execute',
      'trace-d1-local',
      '--local',
      '--persist-to',
      persistence,
      '--config',
      config,
      '--env',
      'local-d1',
      '--command',
      seed,
    ]);

    server = spawn(
      process.execPath,
      [
        wrangler,
        'dev',
        '--env',
        'local-d1',
        '--config',
        config,
        '--persist-to',
        persistence,
        '--ip',
        '127.0.0.1',
        '--port',
        '8787',
        '--var',
        `TRACE_AUTH_SECRET:${authSecret}`,
      ],
      {
        cwd: root,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1', WRANGLER_SEND_METRICS: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout?.on('data', (chunk: Buffer) => {
      serverLog = `${serverLog}${chunk.toString()}`.slice(-8_000);
    });
    server.stderr?.on('data', (chunk: Buffer) => {
      serverLog = `${serverLog}${chunk.toString()}`.slice(-8_000);
    });
    await waitForHealth(server);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ baseURL: baseUrl });
      await context.addCookies([
        { name: 'trace_session', value: token, url: baseUrl, httpOnly: true, sameSite: 'Lax' },
      ]);
      const page = await context.newPage({ viewport: { width: 390, height: 844 } });
      const health = await context.request.get('/api/health');
      if (!health.ok()) throw new Error(`D1 health failed with ${health.status()}`);
      try {
        await page.goto('/app', { waitUntil: 'commit', timeout: 120_000 });
      } catch (error) {
        throw new Error(
          `D1 dashboard navigation failed: ${error instanceof Error ? error.message : String(error)}\n${serverLog}`,
        );
      }
      if (!page.url().endsWith('/app')) {
        throw new Error(
          `D1 auth redirected to ${page.url()}\n${(await page.locator('body').innerText()).slice(0, 1_000)}`,
        );
      }
      try {
        await page.getByText(`${session.githubLogin}/trace`).first().waitFor({
          state: 'visible',
          timeout: 20_000,
        });
      } catch {
        throw new Error(
          `D1 dashboard did not render the seeded repository.\n${(await page.locator('body').innerText()).slice(0, 2_000)}\n${serverLog}`,
        );
      }
      await page.goto('/app/repositories', { waitUntil: 'commit', timeout: 120_000 });
      await page.getByText(`${session.githubLogin}/trace`).first().waitFor({
        state: 'visible',
        timeout: 20_000,
      });
      const routeChecks: Array<[string, string]> = [
        [`/app/repositories/${repositoryId}`, 'D1 E2E finding'],
        [`/app/repositories/${repositoryId}/pull-requests`, 'D1 E2E change'],
        [`/app/repositories/${repositoryId}/findings`, 'D1 E2E finding'],
        [`/app/repositories/${repositoryId}/reports`, 'D1 E2E Daily Report'],
        ['/app/changes', 'D1 E2E change'],
        ['/app/conflicts', 'D1 E2E conflict'],
        ['/app/reports', 'D1 E2E Daily Report'],
        [`/app/reports/${dailyReportId}`, 'D1 E2E Daily Report'],
        [`/app/reports/${weeklyReportId}`, 'D1 E2E Weekly Report'],
        ['/app/decisions', 'D1 E2E decision'],
        ['/app/rules', 'D1 E2E rule'],
        ['/app/activity', 'Local analysis synced'],
        ['/app/settings', 'Authorized Computers'],
        ['/app/documentation', 'Authoritative documentation'],
      ];
      for (const [route, expectedText] of routeChecks) {
        const response = await context.request.get(route, { timeout: 120_000 });
        const responseBody = await response.text();
        if (!response.ok()) {
          throw new Error(
            `D1 route ${route} returned ${response.status()}.\n${responseBody.slice(0, 4_000)}`,
          );
        }
        if (!responseBody.includes(expectedText)) {
          throw new Error(
            `D1 route ${route} did not render ${expectedText}.\n${responseBody.slice(0, 4_000)}`,
          );
        }
      }
      await context.close();
    } finally {
      await browser.close();
    }
    process.stdout.write(
      'D1 Playwright E2E passed: health, persisted session, dashboard, and repositories.\n',
    );
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    try {
      rmSync(persistence, { recursive: true, force: true });
    } catch {
      // Wrangler can retain a transient Windows file handle after SIGTERM.
      // The directory is ignored and contains only disposable local D1 state.
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
