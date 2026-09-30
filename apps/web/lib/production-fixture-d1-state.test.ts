import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  assertExpectedProductionFixtureCounts,
  assertProductionFixtureForeignKeys,
  assertProductionFixtureIdentity,
  buildProductionFixtureIdentityQuery,
  buildProductionFixtureOnboardingEvidence,
  expectedProductionFixtureCounts,
  formatProductionFixtureD1State,
  parseProductionFixtureD1Stage,
  parseProductionFixtureIdentityResult,
  productionFixtureD1State,
  validateReadOnlySql,
} from '../../../scripts/production-fixture-d1-state.js';
import {
  buildProductionApplicationCountsSql,
  productionApplicationTables,
} from '../../../scripts/production-canary-d1.js';

const oauthCreatedAt = Date.parse('2026-09-29T14:23:52.000Z');

function identityRow(stage: 'after-oauth' | 'after-onboarding' | 'after-installation') {
  return {
    ok: 1,
    oauth_identity_links: 1,
    ...(stage !== 'after-oauth'
      ? {
          active_session_links: 1,
          onboarding_profile_links: 1,
          onboarding_completed_links: 1,
          onboarding_intended_usage_links: 1,
          onboarding_execution_mode_links: 1,
          onboarding_audit_actor_links: 1,
          onboarding_audit_action_links: 1,
          onboarding_audit_subject_links: 1,
          onboarding_audit_unscoped_links: 1,
          onboarding_audit_event_links: 1,
          user_created_at: oauthCreatedAt,
          account_created_at: oauthCreatedAt,
          session_created_at: oauthCreatedAt,
          onboarding_profile_created_at: oauthCreatedAt + 30_000,
          audit_event_created_at: oauthCreatedAt + 31_000,
        }
      : {}),
    ...(stage === 'after-installation'
      ? {
          fixture_workspace_count: 1,
          owner_membership_links: 1,
          fixture_installation_links: 1,
          fixture_repository_links: 1,
          fixture_installation_repository_links: 1,
          fixture_audit_event_links: 1,
        }
      : {}),
  };
}

describe('production fixture D1 state verifier', () => {
  it('accepts only the bounded before-OAuth, after-OAuth, after-onboarding, and install stages', () => {
    expect(parseProductionFixtureD1Stage('before-oauth')).toBe('before-oauth');
    expect(parseProductionFixtureD1Stage('after-oauth')).toBe('after-oauth');
    expect(parseProductionFixtureD1Stage('after-onboarding')).toBe('after-onboarding');
    expect(parseProductionFixtureD1Stage('after-installation')).toBe('after-installation');
    expect(() => parseProductionFixtureD1Stage('arbitrary')).toThrow(/stage/i);
  });

  it('defines exact row counts without changing the existing stage contracts', () => {
    const before = expectedProductionFixtureCounts('before-oauth');
    const afterOAuth = expectedProductionFixtureCounts('after-oauth');
    const afterOnboarding = expectedProductionFixtureCounts('after-onboarding');
    const afterInstall = expectedProductionFixtureCounts('after-installation');

    expect(productionApplicationTables).toHaveLength(22);
    expect(Object.values(before).every((count) => count === 0)).toBe(true);
    expect(afterOAuth.users).toBe(1);
    expect(afterOAuth.accounts).toBe(1);
    expect(afterOAuth.sessions).toBe(1);
    expect(afterOAuth.onboarding_profiles).toBe(0);
    expect(afterOAuth.audit_events).toBe(0);
    expect(afterOAuth.organizations).toBe(0);
    expect(afterOAuth.github_installations).toBe(0);
    expect(afterOAuth.github_webhook_deliveries).toBe(0);
    expect(afterOnboarding.users).toBe(1);
    expect(afterOnboarding.accounts).toBe(1);
    expect(afterOnboarding.sessions).toBe(1);
    expect(afterOnboarding.onboarding_profiles).toBe(1);
    expect(afterOnboarding.audit_events).toBe(1);
    expect(afterOnboarding.organizations).toBe(0);
    expect(afterOnboarding.memberships).toBe(0);
    expect(afterOnboarding.github_installations).toBe(0);
    expect(afterOnboarding.github_repositories).toBe(0);
    expect(afterOnboarding.github_installation_repositories).toBe(0);
    expect(afterOnboarding.github_webhook_deliveries).toBe(0);
    expect(afterInstall.users).toBe(1);
    expect(afterInstall.accounts).toBe(1);
    expect(afterInstall.sessions).toBe(1);
    expect(afterInstall.organizations).toBe(1);
    expect(afterInstall.memberships).toBe(1);
    expect(afterInstall.github_installations).toBe(1);
    expect(afterInstall.github_repositories).toBe(1);
    expect(afterInstall.github_installation_repositories).toBe(1);
    expect(afterInstall.audit_events).toBe(2);
    expect(afterInstall.onboarding_profiles).toBe(1);
    expect(afterInstall.github_webhook_deliveries).toBe(0);
  });

  it('rejects missing onboarding or audit rows and any installation/business rows', () => {
    const expected = expectedProductionFixtureCounts('after-onboarding');
    expect(() => assertExpectedProductionFixtureCounts('after-onboarding', expected)).not.toThrow();
    expect(() =>
      assertExpectedProductionFixtureCounts('after-onboarding', {
        ...expected,
        audit_events: 0,
      }),
    ).toThrow(/audit_events/);
    expect(() =>
      assertExpectedProductionFixtureCounts('after-onboarding', {
        ...expected,
        onboarding_profiles: 0,
      }),
    ).toThrow(/onboarding_profiles/);

    for (const table of [
      'organizations',
      'memberships',
      'github_installations',
      'github_repositories',
      'github_installation_repositories',
      'github_webhook_deliveries',
    ] as const) {
      expect(() =>
        assertExpectedProductionFixtureCounts('after-onboarding', {
          ...expected,
          [table]: 1,
        }),
      ).toThrow(new RegExp(table));
    }
  });

  it('builds a fixed onboarding identity query with bound login/time and no sensitive columns', () => {
    const query = buildProductionFixtureIdentityQuery(
      'after-onboarding',
      undefined,
      oauthCreatedAt,
    );
    expect(query.sql).toContain("a.provider_id = 'github'");
    expect(query.sql).toContain('lower(a.account_id) = lower(?)');
    expect(query.sql).toContain("p.intended_usage IN ('individual', 'team', 'organization')");
    expect(query.sql).toContain("p.execution_mode IN ('cloud', 'local', 'hybrid', 'undecided')");
    expect(query.sql).toContain("ae.action = 'workspace.profile.completed'");
    expect(query.sql).toContain("ae.subject_type = 'onboarding_profile'");
    expect(query.sql).toContain('ae.organization_id IS NULL');
    expect(query.params).toEqual([
      productionFixtureD1State.githubLogin,
      productionFixtureD1State.githubLogin,
      oauthCreatedAt,
      ...Array.from({ length: 11 }, () => productionFixtureD1State.githubLogin),
    ]);
    expect(query.params).toHaveLength((query.sql.match(/\?/g) ?? []).length);
    expect(validateReadOnlySql(query.sql)).toBe(query.sql);
    for (const sensitiveColumn of [
      'email',
      'token',
      'access_token',
      'refresh_token',
      'id_token',
      'metadata',
    ]) {
      expect(query.sql.toLowerCase()).not.toContain(sensitiveColumn);
    }
  });

  it('accepts the expected OAuth, active-session, onboarding, and audit links', () => {
    const identity = parseProductionFixtureIdentityResult([
      { results: [identityRow('after-onboarding')] },
    ]);
    expect(() => assertProductionFixtureIdentity('after-onboarding', identity)).not.toThrow();
    const evidence = buildProductionFixtureOnboardingEvidence(identity);
    expect(evidence).toEqual({
      userCreatedAtUtc: '2026-09-29T14:23:52.000Z',
      accountCreatedAtUtc: '2026-09-29T14:23:52.000Z',
      sessionCreatedAtUtc: '2026-09-29T14:23:52.000Z',
      onboardingProfileCreatedAtUtc: '2026-09-29T14:24:22.000Z',
      auditEventCreatedAtUtc: '2026-09-29T14:24:23.000Z',
      onboardingAtOrAfterOAuthPersistence: 'YES',
      auditAtOrAfterOnboarding: 'YES',
      onboardingProfileInObservedWindow: 'YES',
      auditEventInObservedWindow: 'YES',
    });
  });

  it('executes the onboarding identity query against a private SQLite fixture', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
        CREATE TABLE users (id TEXT, created_at INTEGER);
        CREATE TABLE accounts (user_id TEXT, provider_id TEXT, account_id TEXT, created_at INTEGER);
        CREATE TABLE sessions (user_id TEXT, expires_at INTEGER, created_at INTEGER);
        CREATE TABLE onboarding_profiles (
          user_id TEXT, intended_usage TEXT, execution_mode TEXT, completed INTEGER, created_at INTEGER
        );
        CREATE TABLE audit_events (
          actor_user_id TEXT, action TEXT, subject_type TEXT, organization_id TEXT, created_at INTEGER
        );
      `);
      const userId = 'internal-user-only';
      const timestamp = oauthCreatedAt;
      database.prepare('INSERT INTO users VALUES (?, ?)').run(userId, timestamp);
      database
        .prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)')
        .run(userId, 'github', 'MathofDynamic', timestamp);
      database
        .prepare('INSERT INTO sessions VALUES (?, ?, ?)')
        .run(userId, timestamp + 86_400_000, timestamp);
      database
        .prepare('INSERT INTO onboarding_profiles VALUES (?, ?, ?, ?, ?)')
        .run(userId, 'individual', 'local', 1, timestamp + 30_000);
      database
        .prepare('INSERT INTO audit_events VALUES (?, ?, ?, ?, ?)')
        .run(userId, 'workspace.profile.completed', 'onboarding_profile', null, timestamp + 31_000);

      const query = buildProductionFixtureIdentityQuery('after-onboarding', undefined, timestamp);
      const row = database.prepare(query.sql).get(...query.params) as Record<string, unknown>;
      const identity = parseProductionFixtureIdentityResult([{ results: [row] }]);
      assertProductionFixtureIdentity('after-onboarding', identity);
      const evidence = buildProductionFixtureOnboardingEvidence(identity);

      expect(row.ok).toBe(1);
      expect(row.onboarding_audit_event_links).toBe(1);
      expect(evidence.onboardingAtOrAfterOAuthPersistence).toBe('YES');
      expect(evidence.auditAtOrAfterOnboarding).toBe('YES');
      expect(Object.keys(row)).not.toContain('id');
      expect(JSON.stringify(row)).not.toContain(userId);
    } finally {
      database.close();
    }
  });

  it('rejects a profile linked to another user or an incomplete profile', () => {
    const identity = identityRow('after-onboarding');
    expect(() =>
      assertProductionFixtureIdentity('after-onboarding', {
        ...identity,
        onboarding_profile_links: 0,
      }),
    ).toThrow(/onboarding_profile_links/);
    expect(() =>
      assertProductionFixtureIdentity('after-onboarding', {
        ...identity,
        onboarding_completed_links: 0,
      }),
    ).toThrow(/onboarding_completed_links/);
    expect(() =>
      assertProductionFixtureIdentity('after-onboarding', {
        ...identity,
        onboarding_intended_usage_links: 0,
      }),
    ).toThrow(/onboarding_intended_usage_links/);
    expect(() =>
      assertProductionFixtureIdentity('after-onboarding', {
        ...identity,
        onboarding_execution_mode_links: 0,
      }),
    ).toThrow(/onboarding_execution_mode_links/);
  });

  it('rejects an audit event with the wrong action, actor, subject, or organization scope', () => {
    const identity = identityRow('after-onboarding');
    for (const field of [
      'onboarding_audit_action_links',
      'onboarding_audit_actor_links',
      'onboarding_audit_subject_links',
      'onboarding_audit_unscoped_links',
      'onboarding_audit_event_links',
    ] as const) {
      expect(() =>
        assertProductionFixtureIdentity('after-onboarding', {
          ...identity,
          [field]: 0,
        }),
      ).toThrow(new RegExp(field));
    }
  });

  it('preserves onboarding links along with independent installation audit identity', () => {
    const install = parseProductionFixtureIdentityResult([
      { results: [identityRow('after-installation')] },
    ]);
    expect(() => assertProductionFixtureIdentity('after-installation', install)).not.toThrow();
    expect(() =>
      assertProductionFixtureIdentity('after-oauth', {
        ...identityRow('after-oauth'),
        oauth_identity_links: 0,
      }),
    ).toThrow(/oauth_identity_links/);
  });

  it('reports safe onboarding evidence without printing personal or credential fields', () => {
    const sensitive = {
      ...identityRow('after-onboarding'),
      email: 'private@example.invalid',
      session_token: 'session-secret-value',
      access_token: 'oauth-access-secret',
      id_token: 'oauth-id-secret',
    };
    const identity = parseProductionFixtureIdentityResult([{ results: [sensitive] }]);
    const report = formatProductionFixtureD1State({
      stage: 'after-onboarding',
      counts: expectedProductionFixtureCounts('after-onboarding'),
      foreignKeyViolations: 0,
      queueBacklogCount: 0,
      onboardingEvidence: buildProductionFixtureOnboardingEvidence(identity),
    });
    expect(report).toContain('ONBOARDING_PROFILE_LINK=VERIFIED');
    expect(report).toContain('ONBOARDING_AUDIT_ACTION=workspace.profile.completed');
    expect(report).toContain('ONBOARDING_AUDIT_ACTOR=VERIFIED');
    expect(report).toContain('ONBOARDING_AUDIT_ORGANIZATION=NULL');
    expect(report).not.toContain('private@example.invalid');
    expect(report).not.toContain('session-secret-value');
    expect(report).not.toContain('oauth-access-secret');
    expect(report).not.toContain('oauth-id-secret');
  });

  it('requires zero foreign-key violations and rejects non-read-only SQL', () => {
    expect(() => assertProductionFixtureForeignKeys([])).not.toThrow();
    expect(() => assertProductionFixtureForeignKeys([{ table: 'x' }])).toThrow(/violation/);
    expect(validateReadOnlySql(buildProductionApplicationCountsSql())).toBe(
      buildProductionApplicationCountsSql(),
    );
    expect(validateReadOnlySql('PRAGMA foreign_key_check')).toBe('PRAGMA foreign_key_check');
    expect(() => validateReadOnlySql('UPDATE users SET name = ?')).toThrow(/read-only/i);
    expect(() => validateReadOnlySql('SELECT 1; DELETE FROM users')).toThrow(/read-only/i);
  });
});
