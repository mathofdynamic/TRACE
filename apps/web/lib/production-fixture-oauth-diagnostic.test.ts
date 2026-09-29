import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { diagnoseProductionFixtureOAuthState } from '../../../scripts/diagnose-production-fixture-oauth-state.js';
import {
  buildProductionFixtureOAuthAccountSummarySql,
  buildProductionFixtureOAuthLinksParams,
  buildProductionFixtureOAuthLinksSql,
  classifyProductionFixtureOAuthWindow,
  formatProductionFixtureOAuthDiagnostic,
  productionFixtureOAuthDiagnosticWindow,
} from '../../../scripts/production-fixture-oauth-diagnostic.js';
import {
  buildProductionApplicationCountsSql,
  productionApplicationTables,
} from '../../../scripts/production-canary-d1.js';
import {
  productionFixtureD1State,
  validateReadOnlySql,
} from '../../../scripts/production-fixture-d1-state.js';

const environment = {
  CLOUDFLARE_API_TOKEN: 'fake-cloudflare-token-never-output',
  CLOUDFLARE_ACCOUNT_ID: productionFixtureD1State.accountId,
  TRACE_PRODUCTION_D1_ID: productionFixtureD1State.databaseId,
};
const diagnosticWorkflow = readFileSync(
  new URL('../../../.github/workflows/production-fixture-oauth-diagnostic.yml', import.meta.url),
  'utf8',
);

function cloudflareResponse(result: unknown) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function buildDiagnosticFetch() {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const counts = Object.fromEntries(
    productionApplicationTables.map((table) => [table, 0]),
  ) as Record<(typeof productionApplicationTables)[number], number>;
  counts.accounts = 1;
  counts.users = 1;
  counts.sessions = 1;

  const fetchImplementation = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, method, body });

    if (
      url ===
      'https://api.cloudflare.com' +
        `/client/v4/accounts/${productionFixtureD1State.accountId}/d1/database/${productionFixtureD1State.databaseId}/query`
    ) {
      const parsedBody = JSON.parse(body ?? '{}') as { sql?: string };
      const sql = parsedBody.sql ?? '';
      if (sql === buildProductionApplicationCountsSql()) {
        return cloudflareResponse([{ results: [{ ok: 1, ...counts }] }]);
      }
      if (sql === buildProductionFixtureOAuthAccountSummarySql()) {
        return cloudflareResponse([
          {
            results: [
              {
                ok: 1,
                total_account_rows: 1,
                github_account_rows: 1,
                expected_github_login_rows: 1,
                unexpected_github_account_rows: 0,
              },
            ],
          },
        ]);
      }
      if (sql === buildProductionFixtureOAuthLinksSql()) {
        const createdAt = Date.parse('2026-09-29T14:20:00.000Z');
        return cloudflareResponse([
          {
            results: [
              {
                ok: 1,
                expected_account_rows: 1,
                expected_account_user_links: 1,
                expected_account_session_links: 1,
                expected_active_session_links: 1,
                expected_expired_session_links: 0,
                expected_user_rows: 1,
                expected_session_rows: 1,
                account_created_min: createdAt,
                account_created_max: createdAt,
                account_updated_min: createdAt,
                account_updated_max: createdAt,
                user_created_min: createdAt + 1_000,
                user_created_max: createdAt + 1_000,
                session_created_min: createdAt + 2_000,
                session_created_max: createdAt + 2_000,
              },
            ],
          },
        ]);
      }
      if (sql === 'PRAGMA foreign_key_check') return cloudflareResponse([{ results: [] }]);
      throw new Error('Unexpected SQL fixture.');
    }

    if (
      url ===
        'https://api.cloudflare.com' +
          `/client/v4/accounts/${productionFixtureD1State.accountId}/queues/${productionFixtureD1State.queueId}/metrics` &&
      method === 'GET'
    ) {
      return cloudflareResponse({ backlog_count: 0, backlog_bytes: 0 });
    }
    if (url === productionFixtureD1State.healthUrl && method === 'GET') {
      return new Response(null, { status: 200 });
    }
    throw new Error('Unexpected diagnostic request.');
  }) as typeof fetch;

  return { fetchImplementation, calls, counts };
}

describe('production fixture OAuth persistence diagnostic', () => {
  it('prints all 22 application counts even when accounts is nonzero', async () => {
    const fixture = buildDiagnosticFetch();
    const emittedCounts: unknown[] = [];
    const diagnostic = await diagnoseProductionFixtureOAuthState({
      environment,
      fetchImplementation: fixture.fetchImplementation,
      now: Date.parse('2026-09-29T14:40:00.000Z'),
      observedAtUtc: '2026-09-29T14:41:00.000Z',
      onCounts: (counts) => emittedCounts.push(counts),
    });

    expect(emittedCounts).toHaveLength(1);
    expect(fixture.counts.accounts).toBe(1);
    const output = formatProductionFixtureOAuthDiagnostic(diagnostic);
    expect(output).toContain('APPLICATION_TABLES=22');
    for (const table of productionApplicationTables) {
      expect(output).toContain(`${table.toUpperCase()}=${fixture.counts[table]}`);
    }
    expect(output).toContain('EXPECTED_GITHUB_LOGIN_ROWS=1');
    expect(output).toContain('EXPECTED_LOGIN_MATCH=YES');
    expect(output).toContain('OAUTH_ROWS_CREATED_IN_OBSERVED_WINDOW=YES');
  });

  it('limits account and relationship queries to expected identity fields and aggregates', () => {
    const summarySql = buildProductionFixtureOAuthAccountSummarySql().toLowerCase();
    const linksSql = buildProductionFixtureOAuthLinksSql().toLowerCase();
    expect(summarySql).toContain('lower(account_id) = lower(?)');
    expect(summarySql).not.toMatch(
      /select\s+(?:id|account_id|email|name|access_token|refresh_token|id_token)/,
    );
    expect(linksSql).not.toContain('email');
    expect(linksSql).not.toContain('token');
    expect(linksSql).not.toContain('access_token');
    expect(linksSql).not.toContain('refresh_token');
    expect(linksSql).not.toContain('id_token');
    expect(linksSql).not.toContain('select *');
    expect((linksSql.match(/\?/g) ?? []).length).toBe(
      buildProductionFixtureOAuthLinksParams(Date.now()).length,
    );
  });

  it('executes the fixed identity aggregates against an isolated SQLite fixture', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
        CREATE TABLE accounts (
          user_id TEXT, provider_id TEXT, account_id TEXT,
          access_token TEXT, refresh_token TEXT, id_token TEXT,
          created_at INTEGER, updated_at INTEGER
        );
        CREATE TABLE users (
          id TEXT, email TEXT, name TEXT, image TEXT,
          created_at INTEGER, updated_at INTEGER
        );
        CREATE TABLE sessions (
          id TEXT, user_id TEXT, token TEXT, expires_at INTEGER,
          created_at INTEGER, updated_at INTEGER
        );
      `);
      const timestamp = Date.parse('2026-09-29T14:20:00.000Z');
      database
        .prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)')
        .run(
          'internal-user',
          'private@example.invalid',
          'private-name',
          null,
          timestamp,
          timestamp,
        );
      database
        .prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          'internal-user',
          'github',
          'MathofDynamic',
          'private-access-token',
          'private-refresh-token',
          'private-id-token',
          timestamp,
          timestamp,
        );
      database
        .prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)')
        .run(
          'internal-session',
          'internal-user',
          'private-session-token',
          timestamp + 86_400_000,
          timestamp,
          timestamp,
        );

      const summary = database
        .prepare(buildProductionFixtureOAuthAccountSummarySql())
        .get('mathofdynamic', 'mathofdynamic') as Record<string, number>;
      const linksSql = buildProductionFixtureOAuthLinksSql();
      const links = database
        .prepare(linksSql)
        .get(...buildProductionFixtureOAuthLinksParams(timestamp + 1_000)) as Record<
        string,
        number
      >;

      expect(summary).toMatchObject({
        total_account_rows: 1,
        github_account_rows: 1,
        expected_github_login_rows: 1,
        unexpected_github_account_rows: 0,
      });
      expect(links).toMatchObject({
        expected_account_rows: 1,
        expected_account_user_links: 1,
        expected_account_session_links: 1,
        expected_active_session_links: 1,
        expected_expired_session_links: 0,
        expected_user_rows: 1,
        expected_session_rows: 1,
        account_created_min: timestamp,
        user_created_min: timestamp,
        session_created_min: timestamp,
      });
      expect(Object.keys(links)).not.toContain('email');
      expect(JSON.stringify({ summary, links })).not.toContain('private-');
    } finally {
      database.close();
    }
  });

  it('keeps personal, session, OAuth, and Cloudflare credential material out of output', async () => {
    const fixture = buildDiagnosticFetch();
    const diagnostic = await diagnoseProductionFixtureOAuthState({
      environment,
      fetchImplementation: fixture.fetchImplementation,
      now: Date.parse('2026-09-29T14:40:00.000Z'),
    });
    const output = formatProductionFixtureOAuthDiagnostic(diagnostic);

    expect(output).not.toContain('email');
    expect(output).not.toContain('session-token-secret');
    expect(output).not.toContain('oauth-access-token-secret');
    expect(output).not.toContain('unexpected-login-name');
    expect(output).not.toContain(environment.CLOUDFLARE_API_TOKEN);
    expect(output).toContain('EMAIL_EXPOSED=NO');
    expect(output).toContain('SESSION_TOKEN_EXPOSED=NO');
    expect(output).toContain('OAUTH_TOKEN_EXPOSED=NO');
    expect(output).toContain('SECRET_EXPOSED=NO');
  });

  it('uses only fixed read-only D1 SQL, Queue metrics GET, and production health GET', async () => {
    const fixture = buildDiagnosticFetch();
    await diagnoseProductionFixtureOAuthState({
      environment,
      fetchImplementation: fixture.fetchImplementation,
      now: Date.parse('2026-09-29T14:40:00.000Z'),
    });

    expect(fixture.calls).toHaveLength(6);
    expect(fixture.calls.slice(0, 4).every((call) => call.method === 'POST')).toBe(true);
    expect(fixture.calls[4]).toMatchObject({
      method: 'GET',
      url: expect.stringMatching(/\/queues\/9ef092975a554ba296a63b162b16522f\/metrics$/),
    });
    expect(fixture.calls[5]).toEqual({
      url: productionFixtureD1State.healthUrl,
      method: 'GET',
      body: undefined,
    });
    for (const call of fixture.calls.slice(0, 4)) {
      expect(call.url).toContain(`/d1/database/${productionFixtureD1State.databaseId}/query`);
      const sql = (JSON.parse(call.body ?? '{}') as { sql: string }).sql;
      expect(validateReadOnlySql(sql)).toBe(sql);
    }
    expect(fixture.calls[4]?.body).toBeUndefined();
  });

  it('reports safe UTC timestamps and classifies only the observed interval', async () => {
    const fixture = buildDiagnosticFetch();
    const diagnostic = await diagnoseProductionFixtureOAuthState({
      environment,
      fetchImplementation: fixture.fetchImplementation,
      now: Date.parse('2026-09-29T14:40:00.000Z'),
    });
    const output = formatProductionFixtureOAuthDiagnostic(diagnostic);

    expect(output).toContain('ACCOUNT_CREATED_AT=2026-09-29T14:20:00.000Z');
    expect(output).toContain('ACCOUNT_CREATED_AFTER_LAST_CLEAN=YES');
    expect(output).toContain('ACCOUNT_CREATED_BEFORE_FAILED_CHECK=YES');
    expect(output).toContain('USER_CREATED_AFTER_LAST_CLEAN=YES');
    expect(output).toContain('SESSION_CREATED_AFTER_LAST_CLEAN=YES');
    expect(productionFixtureOAuthDiagnosticWindow.start).toBe(
      Date.parse('2026-09-29T14:12:00.000Z'),
    );
  });

  it('classifies absent, partial, complete, and unresolved timestamp windows conservatively', () => {
    const inside = {
      count: 1,
      min: Date.parse('2026-09-29T14:20:00.000Z'),
      max: Date.parse('2026-09-29T14:20:00.000Z'),
    };
    const outside = {
      count: 1,
      min: Date.parse('2026-09-29T14:00:00.000Z'),
      max: Date.parse('2026-09-29T14:00:00.000Z'),
    };
    const absent = { count: 0, min: null, max: null };

    expect(
      classifyProductionFixtureOAuthWindow({
        accountTimestamps: inside,
        userTimestamps: inside,
        sessionTimestamps: inside,
      }),
    ).toBe('YES');
    expect(
      classifyProductionFixtureOAuthWindow({
        accountTimestamps: absent,
        userTimestamps: absent,
        sessionTimestamps: absent,
      }),
    ).toBe('NO');
    expect(
      classifyProductionFixtureOAuthWindow({
        accountTimestamps: inside,
        userTimestamps: absent,
        sessionTimestamps: absent,
      }),
    ).toBe('PARTIAL');
    expect(
      classifyProductionFixtureOAuthWindow({
        accountTimestamps: outside,
        userTimestamps: { count: 1, min: null, max: null },
        sessionTimestamps: outside,
      }),
    ).toBe('UNKNOWN');
  });

  it('keeps the read-only SQL validator strict', () => {
    expect(() => validateReadOnlySql('DELETE FROM accounts')).toThrow(/read-only/i);
    expect(() => validateReadOnlySql('SELECT 1; UPDATE accounts SET account_id = ?')).toThrow(
      /read-only/i,
    );
    expect(() => validateReadOnlySql('ATTACH DATABASE ? AS other')).toThrow(/read-only/i);
  });

  it('keeps the protected workflow manual, exact-SHA, feature-ref scoped, and Cloudflare-read-only', () => {
    expect(diagnosticWorkflow).toContain('on:\n  workflow_dispatch:');
    expect(diagnosticWorkflow).toContain(
      "github.ref == 'refs/heads/feat/cloudflare-native-runtime'",
    );
    expect(diagnosticWorkflow).toContain('permissions:\n  contents: read');
    expect(diagnosticWorkflow).toContain('environment: production-canary');
    expect(diagnosticWorkflow).toContain('timeout-minutes: 8');
    expect(diagnosticWorkflow).toContain(
      'TRACE_PRODUCTION_D1_ID: ${{ vars.TRACE_PRODUCTION_D1_ID }}',
    );
    expect(diagnosticWorkflow).toContain(
      'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}',
    );
    expect(diagnosticWorkflow).not.toContain('GITHUB_APP_PRIVATE_KEY');
    expect(diagnosticWorkflow).not.toContain('TRACE_GITHUB_WEBHOOK_SECRET');
    expect(diagnosticWorkflow).not.toContain('TRACE_AUTH_SECRET');
    expect(diagnosticWorkflow).not.toContain('wrangler deploy');
    expect(diagnosticWorkflow).not.toContain('upload-artifact');
    expect(diagnosticWorkflow).not.toContain('Queue Push');
  });
});
