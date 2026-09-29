import { describe, expect, it } from 'vitest';
import {
  assertExpectedProductionFixtureCounts,
  assertProductionFixtureForeignKeys,
  assertProductionFixtureIdentity,
  buildProductionFixtureIdentityQuery,
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

function identityRow(stage: 'after-oauth' | 'after-installation') {
  return {
    ok: 1,
    oauth_identity_links: 1,
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
  it('accepts only the bounded pre-OAuth, post-OAuth, and post-install stages', () => {
    expect(parseProductionFixtureD1Stage('before-oauth')).toBe('before-oauth');
    expect(parseProductionFixtureD1Stage('after-oauth')).toBe('after-oauth');
    expect(parseProductionFixtureD1Stage('after-installation')).toBe('after-installation');
    expect(() => parseProductionFixtureD1Stage('arbitrary')).toThrow(/stage/i);
  });

  it('defines exactly the intended row-count progression across 22 app tables', () => {
    const before = expectedProductionFixtureCounts('before-oauth');
    const afterOAuth = expectedProductionFixtureCounts('after-oauth');
    const afterInstall = expectedProductionFixtureCounts('after-installation');

    expect(productionApplicationTables).toHaveLength(22);
    expect(Object.values(before).every((count) => count === 0)).toBe(true);
    expect(afterOAuth.users).toBe(1);
    expect(afterOAuth.accounts).toBe(1);
    expect(afterOAuth.sessions).toBe(1);
    expect(afterOAuth.organizations).toBe(0);
    expect(afterOAuth.github_installations).toBe(0);
    expect(afterOAuth.github_webhook_deliveries).toBe(0);
    expect(afterInstall.users).toBe(1);
    expect(afterInstall.accounts).toBe(1);
    expect(afterInstall.sessions).toBe(1);
    expect(afterInstall.organizations).toBe(1);
    expect(afterInstall.memberships).toBe(1);
    expect(afterInstall.github_installations).toBe(1);
    expect(afterInstall.github_repositories).toBe(1);
    expect(afterInstall.github_installation_repositories).toBe(1);
    expect(afterInstall.audit_events).toBe(1);
    expect(afterInstall.github_webhook_deliveries).toBe(0);
  });

  it('rejects unexpected application data at each checkpoint', () => {
    const afterOAuth = expectedProductionFixtureCounts('after-oauth');
    expect(() => assertExpectedProductionFixtureCounts('after-oauth', afterOAuth)).not.toThrow();
    expect(() =>
      assertExpectedProductionFixtureCounts('after-oauth', { ...afterOAuth, organizations: 1 }),
    ).toThrow(/organizations/);
    expect(() =>
      assertExpectedProductionFixtureCounts('after-installation', {
        ...expectedProductionFixtureCounts('after-installation'),
        github_webhook_deliveries: 1,
      }),
    ).toThrow(/github_webhook_deliveries/);
  });

  it('builds fixed identity SQL with bound installation IDs and no user secrets', () => {
    const oauth = buildProductionFixtureIdentityQuery('after-oauth');
    expect(oauth.sql).toContain("a.provider_id = 'github'");
    expect(oauth.sql).toContain('sessions');
    expect(oauth.params).toEqual(['mathofdynamic']);
    expect(oauth.sql.toLowerCase()).not.toContain('email');
    expect(oauth.sql.toLowerCase()).not.toContain('token');

    const install = buildProductionFixtureIdentityQuery('after-installation', '123456789');
    expect(install.params).toContain('123456789');
    expect(install.params).toContain(productionFixtureD1State.repositoryId);
    expect(install.sql).toContain('github.connected');
    expect(() => buildProductionFixtureIdentityQuery('after-installation', 'invalid')).toThrow(
      /installation ID/i,
    );
  });

  it('accepts correctly linked OAuth and fixture installation identities', () => {
    const oauth = parseProductionFixtureIdentityResult([{ results: [identityRow('after-oauth')] }]);
    expect(() => assertProductionFixtureIdentity('after-oauth', oauth)).not.toThrow();

    const install = parseProductionFixtureIdentityResult([
      { results: [identityRow('after-installation')] },
    ]);
    expect(() => assertProductionFixtureIdentity('after-installation', install)).not.toThrow();
  });

  it('rejects missing user/session link or any installation/repository/audit cross-link', () => {
    expect(() =>
      assertProductionFixtureIdentity('after-oauth', {
        ...identityRow('after-oauth'),
        oauth_identity_links: 0,
      }),
    ).toThrow(/oauth_identity_links/);

    for (const field of [
      'fixture_workspace_count',
      'owner_membership_links',
      'fixture_installation_links',
      'fixture_repository_links',
      'fixture_installation_repository_links',
      'fixture_audit_event_links',
    ] as const) {
      expect(() =>
        assertProductionFixtureIdentity('after-installation', {
          ...identityRow('after-installation'),
          [field]: 0,
        }),
      ).toThrow(new RegExp(field));
    }
  });

  it('requires zero foreign-key violations and only read-only SQL', () => {
    expect(() => assertProductionFixtureForeignKeys([])).not.toThrow();
    expect(() => assertProductionFixtureForeignKeys([{ table: 'x' }])).toThrow(/violation/);
    expect(validateReadOnlySql(buildProductionApplicationCountsSql())).toBe(
      buildProductionApplicationCountsSql(),
    );
    expect(validateReadOnlySql('PRAGMA foreign_key_check')).toBe('PRAGMA foreign_key_check');
    expect(() => validateReadOnlySql('UPDATE users SET name = ?')).toThrow(/read-only/i);
    expect(() => validateReadOnlySql('SELECT 1; DELETE FROM users')).toThrow(/read-only/i);
  });

  it('formats only nonsecret counts and verification state', () => {
    const counts = expectedProductionFixtureCounts('after-installation');
    const report = formatProductionFixtureD1State({
      stage: 'after-installation',
      counts,
      foreignKeyViolations: 0,
      queueBacklogCount: 0,
    });
    expect(report).toContain('USERS=1');
    expect(report).toContain('SESSIONS=1');
    expect(report).toContain('GITHUB_WEBHOOK_DELIVERIES=0');
    expect(report).not.toContain('email');
    expect(report).not.toContain('token');
  });
});
