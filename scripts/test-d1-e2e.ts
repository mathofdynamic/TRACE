import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const config = path.join(web, 'wrangler.jsonc');
const authSecret = 'trace-d1-e2e-secret-change-this-32-chars';
const baseUrl = 'http://127.0.0.1:8787';
const persistence = path.join(root, '.trace-cache', `d1-e2e-${randomUUID()}`);
const d1TestEnvironment = {
  ...process.env,
  NO_UPDATE_NOTIFIER: '1',
  WRANGLER_SEND_METRICS: 'false',
  // This deliberately invalid legacy URL proves that the D1 worker does not
  // fall back to PostgreSQL when the D1 binding is present.
  DATABASE_URL: '',
  TRACE_DATABASE_DRIVER: 'd1',
};

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
    env: d1TestEnvironment,
  });
  if (result.status !== 0) {
    throw new Error(
      `Wrangler failed (${String(result.status)}): ${result.stderr.slice(-2_000)}${result.stdout.slice(-2_000)}`,
    );
  }
}

async function assertNoPageOverflow(page: Page, route: string) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  if (
    metrics.documentWidth > metrics.viewportWidth + 1 ||
    metrics.bodyWidth > metrics.viewportWidth + 1
  ) {
    throw new Error(
      `D1 browser route ${route} has page-level horizontal overflow: ${JSON.stringify(metrics)}`,
    );
  }
}

async function waitForDialog(page: Page, name?: RegExp | string): Promise<Locator> {
  const dialog = name ? page.getByRole('dialog', { name }) : page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  return dialog;
}

async function closeDialog(page: Page, dialog: Locator, label: string, requireClosingState = true) {
  if (requireClosingState) {
    await dialog.focus();
  }
  await page.keyboard.press('Escape');
  if (requireClosingState) {
    let state = await dialog.getAttribute('data-presence-state');
    if (state !== 'closing') {
      await page.waitForTimeout(10);
      state = await dialog.getAttribute('data-presence-state');
    }
    if (state !== 'closing') {
      const reducedMotion = await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      if (!reducedMotion && (await dialog.count()) > 0) {
        throw new Error(`${label} did not expose a closing presence state`);
      }
    }
  }
  await dialog.waitFor({ state: 'detached', timeout: 5_000 });
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
  const remoteHeadCommit = 'b'.repeat(40);
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
    `INSERT INTO github_repositories (id, organization_id, installation_id, github_repository_id, owner, name, full_name, default_branch, visibility, state, remote_head_sha, last_synchronized_at) VALUES (${sql(repositoryId)}, ${sql(organizationId)}, ${sql(installationId)}, '9007199254740995', ${sql(session.githubLogin)}, 'trace', ${sql(`${session.githubLogin}/trace`)}, 'main', 'private', 'active', ${sql(remoteHeadCommit)}, ${sql(now)})`,
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
        '--var',
        'TRACE_PUBLIC_URL:http://127.0.0.1:8787',
      ],
      {
        cwd: root,
        env: d1TestEnvironment,
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
      const context = await browser.newContext({
        baseURL: baseUrl,
        reducedMotion: 'no-preference',
      });
      // The local Wrangler runtime can tear down while Next prefetches every
      // navigation target in parallel. Prefetch is not part of the browser
      // parity contract, so keep the harness focused on explicit navigations.
      await context.route('**/*', async (route) => {
        const headers = route.request().headers();
        if (headers['next-router-prefetch'] === '1' || headers.purpose === 'prefetch') {
          await route.abort();
          return;
        }
        await route.continue();
      });
      const unauthenticatedContext = await browser.newContext({ baseURL: baseUrl });
      try {
        const protectedResponse = await unauthenticatedContext.request.get('/app', {
          maxRedirects: 0,
        });
        if (protectedResponse.status() !== 307) {
          throw new Error(
            `Unauthenticated /app returned ${protectedResponse.status()} instead of a redirect`,
          );
        }
        const location = protectedResponse.headers().location;
        const redirectUrl = location ? new URL(location, baseUrl) : null;
        if (
          redirectUrl?.pathname !== '/sign-in' ||
          redirectUrl.searchParams.get('next') !== '/app'
        ) {
          throw new Error(`Unauthenticated /app redirect was not scoped to sign-in: ${location}`);
        }
        const signInResponse = await unauthenticatedContext.request.get('/sign-in');
        if (!signInResponse.ok()) {
          throw new Error(`Sign-in route returned ${signInResponse.status()}`);
        }
      } finally {
        await unauthenticatedContext.close();
      }
      await context.addCookies([
        { name: 'trace_session', value: token, url: baseUrl, httpOnly: true, sameSite: 'Lax' },
      ]);
      const page = await context.newPage({ viewport: { width: 390, height: 844 } });
      let allowedNavigationPath: string | null = null;
      await context.route('**/*', async (route) => {
        const request = route.request();
        const requestPath = new URL(request.url()).pathname;
        const headers = request.headers();
        const isPrefetch =
          headers['next-router-prefetch'] === '1' || headers.purpose === 'prefetch';
        const isAppDocument = request.method() === 'GET' && requestPath.startsWith('/app');
        if (isPrefetch || (isAppDocument && requestPath !== allowedNavigationPath)) {
          await route.abort();
          return;
        }
        await route.continue();
      });
      const navigate = async (pathname: string) => {
        allowedNavigationPath = pathname;
        try {
          await page.goto(pathname, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        } finally {
          allowedNavigationPath = null;
        }
      };
      const health = await context.request.get('/api/health');
      if (!health.ok()) throw new Error(`D1 health failed with ${health.status()}`);
      try {
        await navigate('/app');
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
      // Exercise the real authenticated UI rather than relying only on route request-smokes.
      // The fixture deliberately has a remote head different from its local analysis so the
      // dashboard must present the needs-refresh workflow.
      await navigate('/app');
      try {
        await page.getByRole('heading', { name: 'Needs refresh' }).waitFor({
          state: 'visible',
          timeout: 10_000,
        });
      } catch {
        throw new Error(
          `D1 overview did not render the needs-refresh state at ${page.url()} (server exit ${String(server?.exitCode)}).\n${(await page.locator('body').innerText()).slice(0, 4_000)}\n${serverLog}`,
        );
      }
      await assertNoPageOverflow(page, '/app');

      const repositoryTrigger = page.getByRole('button', { name: /^Current repository:/ });
      await repositoryTrigger.click();
      const switcher = await waitForDialog(page, 'Switch repository');
      const repositorySearch = switcher.getByRole('textbox', { name: 'Search repositories' });
      await repositorySearch.fill('trace');
      await switcher
        .getByText(`${session.githubLogin}/trace`)
        .first()
        .waitFor({ state: 'visible' });
      await closeDialog(page, switcher, 'Project switcher', false);
      if (!(await repositoryTrigger.evaluate((element) => element === document.activeElement))) {
        throw new Error('Project switcher did not restore focus to its trigger');
      }

      const updateTrigger = page.getByRole('button', { name: 'Update TRACE', exact: true });
      await updateTrigger.click();
      const localAction = await waitForDialog(page, /Update TRACE/);
      const localActionText = await localAction.innerText();
      const analyzeIndex = localActionText.indexOf('trace analyze');
      const dryRunIndex = localActionText.indexOf('trace sync --dry-run');
      const syncIndex = localActionText.indexOf('trace sync', dryRunIndex + 1);
      if (!(analyzeIndex >= 0 && dryRunIndex > analyzeIndex && syncIndex > dryRunIndex)) {
        throw new Error(`Needs-refresh commands are not ordered correctly:\n${localActionText}`);
      }
      if (!localActionText.includes('Analysis stays on your computer')) {
        throw new Error('Local TRACE panel omitted its local-analysis boundary');
      }
      if ((await page.evaluate(() => document.body.style.overflow)) !== 'hidden') {
        throw new Error('Local TRACE dialog did not lock body scrolling');
      }
      if ((await localAction.getAttribute('data-presence-state')) !== 'open') {
        throw new Error('Local TRACE dialog did not reach the open presence state');
      }
      await closeDialog(page, localAction, 'Local TRACE action panel');
      if ((await page.evaluate(() => document.body.style.overflow)) !== '') {
        throw new Error('Local TRACE dialog did not restore body scrolling');
      }
      if (!(await updateTrigger.evaluate((element) => element === document.activeElement))) {
        throw new Error('Local TRACE dialog did not restore focus to its trigger');
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await navigate('/app/repositories');
      const adjustAccess = page.getByRole('button', { name: 'Adjust access', exact: true });
      try {
        await adjustAccess.click({ timeout: 10_000 });
      } catch {
        throw new Error(
          `Repository access control did not render at ${page.url()} (server exit ${String(server?.exitCode)}).\n${(await page.locator('body').innerText()).slice(0, 4_000)}\n${serverLog}`,
        );
      }
      const accessDialog = await waitForDialog(page, 'Manage repository access');
      const accessCheckbox = accessDialog.locator('input[type="checkbox"]').first();
      const initiallySelected = await accessCheckbox.isChecked();
      await accessCheckbox.click();
      if ((await accessCheckbox.isChecked()) === initiallySelected) {
        throw new Error('Repository access checkbox did not deselect');
      }
      const deselectResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/github/repositories') &&
          response.request().method() === 'POST',
      );
      await accessDialog
        .getByRole('button', { name: 'Save repository access', exact: true })
        .click();
      const deselectResponse = await deselectResponsePromise;
      if (!deselectResponse.ok()) {
        throw new Error(
          `Repository access deselect returned ${deselectResponse.status()}: ${await deselectResponse.text()}`,
        );
      }
      await accessDialog
        .getByText('Repository access saved successfully.', { exact: true })
        .waitFor({ state: 'visible' });
      await closeDialog(page, accessDialog, 'Repository access dialog');

      // Reload the server projection to prove the deselected repository remains
      // discoverable and that the mutation was persisted in D1.
      await navigate('/app/repositories');
      await page.getByRole('button', { name: 'Adjust access', exact: true }).click();
      const reloadedAccessDialog = await waitForDialog(page, 'Manage repository access');
      const reloadedCheckbox = reloadedAccessDialog.locator('input[type="checkbox"]').first();
      if (await reloadedCheckbox.isChecked()) {
        throw new Error('Deselect was not persisted to the D1 repository projection');
      }
      await reloadedCheckbox.click();
      if (!(await reloadedCheckbox.isChecked())) {
        throw new Error('Repository access checkbox did not reselect');
      }
      const reselectResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/github/repositories') &&
          response.request().method() === 'POST',
      );
      await reloadedAccessDialog
        .getByRole('button', { name: 'Save repository access', exact: true })
        .click();
      const reselectResponse = await reselectResponsePromise;
      if (!reselectResponse.ok()) {
        throw new Error(
          `Repository access reselect returned ${reselectResponse.status()}: ${await reselectResponse.text()}`,
        );
      }
      await reloadedAccessDialog
        .getByText('Repository access saved successfully.', { exact: true })
        .waitFor({ state: 'visible' });
      await closeDialog(page, reloadedAccessDialog, 'Repository access dialog');

      await navigate(`/app/repositories/${repositoryId}`);
      try {
        await page.getByRole('heading', { name: 'What TRACE knows' }).waitFor({
          state: 'visible',
          timeout: 10_000,
        });
      } catch {
        throw new Error(
          `Repository detail did not render at ${page.url()} (server exit ${String(server?.exitCode)}).\n${(await page.locator('body').innerText()).slice(0, 4_000)}\n${serverLog}`,
        );
      }
      const findingReview = page.getByRole('button', { name: 'Review', exact: true }).first();
      await findingReview.click();
      const findingDialog = await waitForDialog(page);
      const findingDialogText = await findingDialog.innerText();
      if (!findingDialogText.toLowerCase().includes('trace evidence records')) {
        throw new Error(
          `Finding detail did not distinguish TRACE evidence records:\n${findingDialogText}`,
        );
      }
      await closeDialog(page, findingDialog, 'Finding detail');

      await navigate('/app/changes');
      const changeInspect = page
        .getByRole('button', { name: 'Inspect details', exact: true })
        .first();
      await changeInspect.click();
      await closeDialog(page, await waitForDialog(page), 'Change inspect');

      await navigate('/app/conflicts');
      const conflictInspect = page
        .getByRole('button', { name: 'Inspect coordination plan', exact: true })
        .first();
      await conflictInspect.click();
      await closeDialog(page, await waitForDialog(page), 'Conflict inspect');

      await navigate('/app/reports');
      await assertNoPageOverflow(page, '/app/reports');
      await page.getByText('D1 E2E Daily Report').first().waitFor({ state: 'visible' });
      const quickInspect = page.getByRole('button', { name: /Quick inspect report/ }).first();
      await quickInspect.waitFor({ state: 'visible' });
      await quickInspect.click();
      await page.waitForTimeout(100);
      await closeDialog(page, await waitForDialog(page), 'Report quick inspect');

      for (const [reportId, expectedTitle] of [
        [dailyReportId, 'D1 E2E Daily Report'],
        [weeklyReportId, 'D1 E2E Weekly Report'],
      ] as const) {
        await navigate(`/app/reports/${reportId}`);
        await page.getByRole('heading', { name: expectedTitle }).waitFor({ state: 'visible' });
        await assertNoPageOverflow(page, `/app/reports/${reportId}`);
        await page.getByRole('tab', { name: 'Canonical TRACE Markdown' }).click();
        await page.locator('pre.raw-pre').waitFor({ state: 'visible' });
        await assertNoPageOverflow(page, `/app/reports/${reportId}#raw`);
      }

      await navigate('/app/decisions');
      await page.getByRole('button', { name: 'Draft decision prompt', exact: true }).click();
      const decisionDialog = await waitForDialog(page);
      if (
        !(await decisionDialog.innerText())
          .toLowerCase()
          .includes('browser does not mutate repository')
      ) {
        throw new Error(
          `Decision prompt builder did not expose copy-only semantics:\n${await decisionDialog.innerText()}`,
        );
      }
      await closeDialog(page, decisionDialog, 'Decision prompt builder');

      await navigate('/app/rules');
      await page.getByRole('button', { name: 'Draft rule prompt', exact: true }).click();
      const ruleDialog = await waitForDialog(page);
      if (
        !(await ruleDialog.innerText()).toLowerCase().includes('browser does not mutate repository')
      ) {
        throw new Error('Rule prompt builder did not expose copy-only semantics');
      }
      await closeDialog(page, ruleDialog, 'Rule prompt builder');

      await navigate('/app/activity');
      const activitySearch = page.getByPlaceholder(/Search activity events/);
      await activitySearch.fill('Local analysis');
      await page.getByText('Local analysis synced').first().waitFor({ state: 'visible' });

      await navigate('/app/settings');
      await page.getByRole('tab', { name: /Authorized Computers/ }).click();
      await page
        .getByRole('heading', { name: 'Authorized Computers' })
        .waitFor({ state: 'visible' });
      const renameTrigger = page.getByRole('button', { name: 'Rename', exact: true }).first();
      await renameTrigger.click();
      await closeDialog(
        page,
        await waitForDialog(page, 'Rename Authorized Computer'),
        'Rename dialog',
      );
      const revokeTrigger = page.getByRole('button', { name: 'Revoke', exact: true }).first();
      await revokeTrigger.click();
      await closeDialog(
        page,
        await waitForDialog(page, 'Revoke Computer Authorization'),
        'Revoke dialog',
      );

      await navigate('/app/documentation');
      await page.getByText('Authoritative documentation').first().waitFor({ state: 'visible' });

      // Recheck document-level overflow at the required responsive widths on the real D1 app.
      for (const width of [390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await navigate('/app');
        await page.getByRole('heading', { name: 'Needs refresh' }).waitFor({ state: 'visible' });
        await assertNoPageOverflow(page, `/app@${width}`);
      }
      await context.close();
    } finally {
      await browser.close();
    }
    process.stdout.write(
      'D1 Playwright E2E passed: authenticated routes, repository access, local TRACE workflow, overlays, reports, prompt builders, settings, and responsive overflow checks.\n',
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
