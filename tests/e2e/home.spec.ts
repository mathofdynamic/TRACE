import { expect, test } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';
import { Client } from 'pg';

const databaseUrl = 'postgresql://trace:change-me@127.0.0.1:3002/trace_dev';
const authSecret = 'trace-playwright-secret-change-this-32-chars';
const appBaseUrl = process.env.TRACE_E2E_BASE_URL ?? 'http://127.0.0.1:3001';

type SeedOptions = {
  profileComplete?: boolean;
  installation?: boolean;
  repositoryState?: 'available' | 'active';
  analysis?: 'completed' | 'running' | 'failed';
  finding?: boolean;
  pullRequest?: boolean;
  localSync?: boolean;
};

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

async function seedWorkspace(options: SeedOptions = {}) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const suffix = randomUUID().slice(0, 8);
  const user = {
    id: randomUUID(),
    name: `TRACE ${suffix}`,
    email: `trace-${suffix}@example.com`,
    githubLogin: `trace-${suffix}`,
  };
  let organizationId: string | null = null;
  let repositoryId: string | null = null;
  try {
    await client.query('INSERT INTO users (id, email, name) VALUES ($1, $2, $3)', [
      user.id,
      user.email,
      user.name,
    ]);
    if (options.profileComplete !== false) {
      await client.query(
        'INSERT INTO onboarding_profiles (user_id, intended_usage, execution_mode, completed) VALUES ($1, $2, $3, true)',
        [user.id, 'individual', 'undecided'],
      );
    }
    if (options.installation) {
      const organization = await client.query<{ id: string }>(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        [`TRACE ${suffix}`, `trace-${suffix}`],
      );
      organizationId = organization.rows[0]!.id;
      await client.query(
        'INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)',
        [organizationId, user.id, 'owner'],
      );
      const installation = await client.query<{ id: string }>(
        'INSERT INTO github_installations (organization_id, github_installation_id, account_login, account_type, state) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [organizationId, Number.parseInt(suffix, 16) + 10_000, `trace-${suffix}`, 'User', 'active'],
      );
      const installationId = installation.rows[0]!.id;
      if (options.repositoryState) {
        const githubRepositoryId = Number.parseInt(suffix, 16) + 100_000;
        const repository = await client.query<{ id: string }>(
          'INSERT INTO github_repositories (organization_id, installation_id, github_repository_id, owner, name, full_name, default_branch, visibility, state, last_synchronized_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id',
          [
            organizationId,
            installationId,
            githubRepositoryId,
            `trace-${suffix}`,
            'project',
            `trace-${suffix}/project`,
            'main',
            'private',
            options.repositoryState,
          ],
        );
        repositoryId = repository.rows[0]!.id;
        await client.query(
          'INSERT INTO github_installation_repositories (installation_id, github_repository_id, selected, permissions) VALUES ($1, $2, $3, $4::jsonb)',
          [
            installationId,
            githubRepositoryId,
            options.repositoryState === 'active',
            JSON.stringify({ metadata: 'read', contents: 'read' }),
          ],
        );
        if (options.analysis) {
          const run = await client.query<{ id: string }>(
            'INSERT INTO analysis_runs (organization_id, repository_id, idempotency_key, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [organizationId, repositoryId, `e2e-${suffix}`, options.analysis],
          );
          const analysisRunId = run.rows[0]!.id;
          if (options.finding) {
            await client.query(
              'INSERT INTO analysis_findings (analysis_run_id, external_id, title, detail, severity, classification, evidence) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)',
              [
                analysisRunId,
                `finding-${suffix}`,
                'Session invalidation needs review',
                'Two persisted changes affect the session lifecycle.',
                'high',
                'deterministic',
                JSON.stringify(['auth/session.ts']),
              ],
            );
          }
        }
        if (options.localSync) {
          const connection = await client.query<{ id: string }>(
            "INSERT INTO cli_connections (organization_id, user_id, label, token_hash, scopes, expires_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW() + INTERVAL '30 days') RETURNING id",
            [
              organizationId,
              user.id,
              'Playwright local connection',
              `playwright-${suffix}`,
              JSON.stringify(['repository:read', 'sync:write']),
            ],
          );
          const operation = await client.query<{ id: string }>(
            'INSERT INTO sync_operations (organization_id, repository_id, connection_id, sync_id, idempotency_key, status, branch, head_commit, trace_version, schema_version, manifest, total_bytes, artifact_count, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, NOW()) RETURNING id',
            [
              organizationId,
              repositoryId,
              connection.rows[0]!.id,
              `sync-${suffix}`,
              `sync-key-${suffix}`,
              'completed',
              'main',
              'abcdef1234567890abcdef1234567890abcdef12',
              '0.1.0',
              '0.1',
              JSON.stringify({ fixture: true }),
              600,
              2,
            ],
          );
          const operationId = operation.rows[0]!.id;
          await client.query(
            'UPDATE github_repositories SET remote_head_sha = $1, last_synchronized_at = NOW() WHERE id = $2',
            ['abcdef1234567890abcdef1234567890abcdef12', repositoryId],
          );
          const longFixturePath =
            'apps/web/app/(app)/app/repositories/[repositoryId]/reports/weekly-report-detail.tsx';
          const records = [
            {
              id: `analysis-${suffix}`,
              type: 'analysis',
              path: `analyses/analysis-${suffix}.md`,
              projection: {
                title: 'Local repository analysis',
                summary: 'Deterministic findings generated locally. Source code remained local.',
                status: 'completed',
                items: [
                  {
                    id: `local-finding-${suffix}`,
                    title: 'Local schema change needs review',
                    detail: 'A migration changed in the synchronized project record.',
                    severity: 'medium',
                    classification: 'deterministic',
                    evidence: ['commit:abcdef1234567890abcdef1234567890abcdef12'],
                  },
                ],
              },
              content: '# Local analysis\n\nApproved source-free analysis record.\n',
            },
            {
              id: `daily-${suffix}`,
              type: 'daily_report',
              path: `reports/daily/2026-08-12-${suffix}.md`,
              projection: {
                title: 'Daily project report',
                summary: 'One meaningful local change was synchronized.',
                status: 'completed',
                items: [
                  {
                    id: `change-${suffix}`,
                    title: 'Sync protocol hardened',
                    detail: `Modified path: ${longFixturePath}`,
                    classification: 'deterministic',
                    evidence: ['commit:abcdef1234567890abcdef1234567890abcdef12'],
                  },
                ],
              },
              content: '# Daily report\n\nApproved source-free report.\n',
            },
            {
              id: `weekly-${suffix}`,
              type: 'weekly_report',
              path: `reports/weekly/2026-08-10-${suffix}.md`,
              projection: {
                title: 'Weekly project report',
                summary: 'The approved weekly record summarizes the synchronized project changes.',
                status: 'completed',
                items: [
                  {
                    id: `weekly-change-${suffix}`,
                    title: 'Repository state stayed source-free',
                    detail: `Only approved TRACE records were synchronized from ${longFixturePath}.`,
                    classification: 'deterministic',
                    evidence: ['commit:abcdef1234567890abcdef1234567890abcdef12'],
                  },
                ],
              },
              content: '# Weekly report\n\nApproved source-free weekly report.\n',
            },
          ];
          for (const record of records) {
            await client.query(
              'INSERT INTO synced_artifacts (organization_id, repository_id, operation_id, artifact_id, artifact_type, path, checksum, size_bytes, sensitivity, schema_version, execution_origin, content, metadata, projection, generated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, NOW())',
              [
                organizationId,
                repositoryId,
                operationId,
                record.id,
                record.type,
                record.path,
                'a'.repeat(64),
                record.content.length,
                'internal',
                '0.1',
                'local',
                record.content,
                JSON.stringify({ updated_at: new Date().toISOString(), fixture: true }),
                JSON.stringify(record.projection),
              ],
            );
          }
        }
        if (options.pullRequest) {
          await client.query(
            'INSERT INTO github_pull_requests (organization_id, repository_id, github_pull_request_id, number, title, state, author_login, url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [
              organizationId,
              repositoryId,
              Number.parseInt(suffix, 16) + 200_000,
              42,
              'Refine session lifecycle',
              'open',
              'trace-author',
              'https://github.com/example/project/pull/42',
            ],
          );
        }
      }
    }
  } finally {
    await client.end();
  }

  return {
    user,
    repositoryId,
    cookie: sessionCookie(user),
    async cleanup() {
      const cleanupDatabase = new Client({ connectionString: databaseUrl });
      await cleanupDatabase.connect();
      try {
        if (organizationId) {
          await cleanupDatabase.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
        }
        await cleanupDatabase.query('DELETE FROM users WHERE id = $1', [user.id]);
      } finally {
        await cleanupDatabase.end();
      }
    },
  };
}

test('foundation home page identifies the current phase', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Git is the history/i })).toBeVisible();
  await expect(
    page.getByText('Early implementation. Public claims are deliberately limited to what exists.'),
  ).toBeVisible();
});

test('health route exposes only safe service status', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toEqual({ service: 'web', status: 'ok' });
});

test('public navigation exposes the documented routes', async ({ page }) => {
  await page.goto('/');
  for (const label of ['Product', 'Security', 'Specification', 'Pricing', 'Docs']) {
    await expect(
      page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: label }),
    ).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Start with TRACE' }).first()).toHaveAttribute(
    'href',
    '/sign-in',
  );
});

test('protected application routes redirect unauthenticated visitors', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp|\/sign-in\?next=\/app/);
  await expect(page.getByRole('heading', { name: /Understand what changed/i })).toBeVisible();
});

test('sign-up redirects to the canonical sign-in path and preserves a safe next route', async ({
  page,
}) => {
  await page.goto('/sign-up?next=%2Fapp%2Frepositories');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Frepositories/);
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
});

test('sign-up rejects an external next destination', async ({ page }) => {
  await page.goto('/sign-up?next=https%3A%2F%2Fevil.example');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fonboarding/);
});

test('direct GitHub OAuth and onboarding APIs keep unauthenticated state explicit', async ({
  request,
}) => {
  const authStart = await request.get('/api/auth/github?next=%2Fapp', { maxRedirects: 0 });
  expect(authStart.status()).toBe(302);
  expect(authStart.headers().location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  expect(authStart.headers().location).toContain(
    encodeURIComponent(`${appBaseUrl}/api/auth/github/callback`),
  );
  expect(authStart.headers()['set-cookie']).toContain('trace_github_state=');
  const onboarding = await request.get('/api/onboarding');
  expect(onboarding.status()).toBe(401);
});

test('GitHub App installation and repository selection keep the auth boundary explicit', async ({
  request,
}) => {
  const install = await request.get('/api/github/install', { maxRedirects: 0 });
  expect(install.status()).toBe(302);
  expect(install.headers().location).toContain('/sign-in?next=/app/repositories');
  const repositories = await request.post('/api/github/repositories', {
    data: { repositoryIds: [] },
  });
  expect(repositories.status()).toBe(401);
});

test('CLI device authorization is separate from browser auth and sync requires its own token', async ({
  page,
  request,
}) => {
  const requestAddress = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
  const started = await request.post('/api/cli/device/start', {
    data: { label: 'Playwright terminal' },
    headers: { 'x-forwarded-for': requestAddress },
  });
  expect(started.status()).toBe(200);
  const authorization = (await started.json()) as {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
  };
  expect(authorization.deviceCode).toMatch(/^trcd_/);
  expect(authorization.userCode).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{2}$/);
  expect(authorization.verificationUri).toBe(`${appBaseUrl}/cli/authorize`);
  expect(authorization.verificationUriComplete).toContain(
    `/cli/authorize?code=${authorization.userCode}`,
  );

  const pending = await request.post('/api/cli/device/token', {
    data: { deviceCode: authorization.deviceCode },
  });
  expect(pending.status()).toBe(202);
  await expect(pending.json()).resolves.toEqual({ status: 'authorization_pending' });

  const sync = await request.post('/api/sync/negotiate', {
    data: {},
  });
  expect(sync.status()).toBe(401);
  await expect(sync.json()).resolves.toEqual({ error: 'CLI authentication required.' });

  await page.goto(`/cli/authorize?code=${authorization.userCode}`);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
});

test('signed GitHub webhook deliveries are acknowledged and deduplicated', async ({ request }) => {
  const payload = JSON.stringify({
    action: 'opened',
    repository: { id: 42 },
    pull_request: { id: 9, number: 3 },
  });
  const signature = createHmac('sha256', 'playwright-webhook-secret').update(payload).digest('hex');
  const headers = {
    'content-type': 'application/json',
    'x-github-delivery': `playwright-delivery-${Date.now()}`,
    'x-github-event': 'pull_request',
    'x-hub-signature-256': `sha256=${signature}`,
  };
  const first = await request.post('/api/github/webhooks', { data: payload, headers });
  expect(first.status()).toBe(202);
  const duplicate = await request.post('/api/github/webhooks', { data: payload, headers });
  expect(duplicate.status()).toBe(200);
  await expect(duplicate.json()).resolves.toMatchObject({ accepted: true, duplicate: true });
});

test('invalid GitHub webhook signatures are rejected before parsing', async ({ request }) => {
  const response = await request.post('/api/github/webhooks', {
    data: '{"action":"opened"}',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': 'playwright-invalid-1',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': 'sha256=invalid',
    },
  });
  expect(response.status()).toBe(401);
});

test.describe('authenticated product journey', () => {
  test('completed users skip onboarding while saving a new workspace advances automatically', async ({
    page,
  }) => {
    const completed = await seedWorkspace();
    try {
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: completed.cookie, url: appBaseUrl }]);
      await page.goto('/onboarding');
      await expect(page).toHaveURL(/\/app\/repositories/);
    } finally {
      await completed.cleanup();
    }

    const fresh = await seedWorkspace({ profileComplete: false });
    try {
      await page.context().clearCookies();
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: fresh.cookie, url: appBaseUrl }]);
      await page.goto('/onboarding');
      await page.getByRole('radio', { name: /Team/ }).check();
      await page.getByRole('button', { name: 'Continue to GitHub' }).click();
      await expect(page).toHaveURL(/\/app\/repositories/);
      await expect(page.getByRole('heading', { name: 'Connect your repositories.' })).toBeVisible();
    } finally {
      await fresh.cleanup();
    }
  });

  test('GitHub setup distinguishes disconnected, connected, and repository-available states', async ({
    page,
  }) => {
    const disconnected = await seedWorkspace();
    try {
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: disconnected.cookie, url: appBaseUrl }]);
      await page.goto('/app/repositories');
      await expect(page.getByRole('link', { name: 'Connect GitHub' })).toBeVisible();
    } finally {
      await disconnected.cleanup();
    }

    const connected = await seedWorkspace({ installation: true });
    try {
      await page.context().clearCookies();
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: connected.cookie, url: appBaseUrl }]);
      await page.goto('/app/repositories');
      await expect(
        page.getByRole('heading', { name: 'No repositories were granted' }),
      ).toBeVisible();
    } finally {
      await connected.cleanup();
    }

    const available = await seedWorkspace({ installation: true, repositoryState: 'available' });
    try {
      await page.context().clearCookies();
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: available.cookie, url: appBaseUrl }]);
      await page.goto('/app/repositories');
      await expect(
        page.getByRole('heading', { name: 'Which projects should TRACE understand?' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save repository access' })).toBeVisible();
    } finally {
      await available.cleanup();
    }
  });

  test('dashboard and repository pages render persisted project state', async ({ page }) => {
    const seeded = await seedWorkspace({
      installation: true,
      repositoryState: 'active',
      analysis: 'completed',
      finding: true,
      pullRequest: true,
    });
    try {
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: seeded.cookie, url: appBaseUrl }]);
      await page.goto('/app');
      await expect(page.getByRole('heading', { name: 'What needs your attention' })).toBeVisible();
      await expect(page.getByText('Session invalidation needs review')).toBeVisible();
      await expect(page.getByText('Refine session lifecycle')).toBeVisible();
      await page.goto(`/app/repositories/${seeded.repositoryId}`);
      await expect(page.getByRole('heading', { name: 'What TRACE knows' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Findings' })).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });

  test('a completed local sync powers overview, repository provenance, reports, findings, and mobile navigation', async ({
    page,
  }) => {
    const seeded = await seedWorkspace({
      installation: true,
      repositoryState: 'active',
      analysis: 'completed',
      finding: true,
      localSync: true,
    });
    try {
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: seeded.cookie, url: appBaseUrl }]);
      await page.goto('/app');
      await expect(page.getByText('Approved local records')).toBeVisible();
      await page.goto(`/app/repositories/${seeded.repositoryId}`);
      await expect(page.getByText('Local analysis').first()).toBeVisible();
      await expect(page.getByText('abcdef123456').first()).toBeVisible();
      await page.goto('/app/reports');
      const dailyReport = page
        .locator('article.report-row')
        .filter({ hasText: 'Daily project report' })
        .first();
      await expect(
        dailyReport.getByRole('heading', { name: 'Daily project report' }).first(),
      ).toBeVisible();
      await expect(dailyReport.locator('pre.safe-markdown')).toBeHidden();
      await dailyReport.getByText('View approved TRACE record').click();
      await expect(dailyReport.locator('pre.safe-markdown')).toBeVisible();
      const weeklyReport = page
        .locator('article.report-row')
        .filter({ hasText: 'Weekly project report' })
        .first();
      await expect(
        weeklyReport.getByRole('heading', { name: 'Weekly project report' }).first(),
      ).toBeVisible();
      await expect(weeklyReport.locator('pre.safe-markdown')).toBeHidden();
      await weeklyReport.getByText('View approved TRACE record').click();
      await expect(weeklyReport.locator('pre.safe-markdown')).toBeVisible();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/reports');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      for (const reportTitle of ['Daily project report', 'Weekly project report']) {
        const report = page.locator('article.report-row').filter({ hasText: reportTitle }).first();
        await report.getByText('View approved TRACE record').click();
        await expect(report.locator('pre.safe-markdown')).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        ).toBe(true);
      }
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const navigation = page.getByRole('navigation', { name: 'Mobile application navigation' });
      await expect(navigation.getByRole('link', { name: 'Reports' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    } finally {
      await seeded.cleanup();
    }
  });

  test('mobile navigation exposes the current route and progressive availability', async ({
    page,
  }) => {
    const seeded = await seedWorkspace({ installation: true, repositoryState: 'active' });
    try {
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: seeded.cookie, url: appBaseUrl }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/repositories');
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const navigation = page.getByRole('navigation', { name: 'Mobile application navigation' });
      await expect(navigation.getByRole('link', { name: 'Repositories' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(navigation.getByText('Reports')).toBeVisible();
      await expect(navigation.getByText('Reports').locator('..')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    } finally {
      await seeded.cleanup();
    }
  });

  test('authenticated overview remains usable at the required responsive widths', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace({ installation: true, repositoryState: 'active' });
    try {
      await page
        .context()
        .addCookies([{ name: 'trace_session', value: seeded.cookie, url: appBaseUrl }]);
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.goto('/app');
        await expect(
          page.getByRole('heading', { name: 'What needs your attention' }),
        ).toBeVisible();
        await page.waitForTimeout(250);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        ).toBe(false);
        await page.screenshot({
          path: testInfo.outputPath(`dashboard-${width}.png`),
          fullPage: true,
        });
      }
    } finally {
      await seeded.cleanup();
    }
  });
});
