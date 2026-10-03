import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  assertExpectedProductionFixtureCounts,
  assertProductionFixtureIdentity,
  buildProductionFixtureIdentityQuery,
  parseProductionFixtureD1Stage,
  parseProductionFixtureIdentityResult,
  validateReadOnlySql,
  type ProductionFixtureD1Stage,
} from '../../../scripts/production-fixture-d1-state.js';
import {
  buildProductionApplicationCountsSql,
  parseProductionApplicationCountsResult,
} from '../../../scripts/production-canary-d1.js';
const postStages = ['after-installation', 'after-selection', 'after-live-issue'] as const;
const now = Date.now();
function fixture(stage: ProductionFixtureD1Stage) {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('../../../packages/db/drizzle-d1/', import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  db.exec(`
    INSERT INTO users (id,email) VALUES ('u','synthetic@example.invalid');
    INSERT INTO accounts (id,user_id,account_id,provider_id) VALUES ('a','u','mathofdynamic','github');
    INSERT INTO sessions (id,user_id,token,expires_at) VALUES ('s','u','synthetic',${now + 86400000});
    INSERT INTO onboarding_profiles (id,user_id,intended_usage,execution_mode,completed) VALUES ('p','u','individual','local',1);
    INSERT INTO audit_events (id,actor_user_id,action,subject_type) VALUES ('onboarding','u','workspace.profile.completed','onboarding_profile');
    INSERT INTO organizations (id,slug,name) VALUES ('o','github-user-mathofdynamic','mathofdynamic on GitHub');
    INSERT INTO memberships (id,user_id,organization_id,role) VALUES ('m','u','o','owner');
    INSERT INTO github_installations (id,organization_id,github_installation_id,account_login,account_type) VALUES ('gi','o','166179374','mathofdynamic','User');
    INSERT INTO github_repositories (id,organization_id,installation_id,github_repository_id,owner,name,full_name,state) VALUES ('r','o','gi','1378441300','mathofdynamic','trace-staging-fixture','mathofdynamic/trace-staging-fixture','available');
    INSERT INTO github_installation_repositories (id,installation_id,github_repository_id,selected) VALUES ('ir','gi','1378441300',0);
    INSERT INTO audit_events (id,organization_id,actor_user_id,action,subject_type,subject_id) VALUES ('connected','o','u','github.connected','github_installation','gi');
  `);
  if (stage !== 'after-installation')
    db.exec(`
    UPDATE github_repositories SET state='active';
    UPDATE github_installation_repositories SET selected=1;
    INSERT INTO audit_events (id,organization_id,actor_user_id,action,subject_type) VALUES ('selection','o','u','repositories.selection.updated','github_repository');
  `);
  if (stage === 'after-live-issue')
    db.exec(`
    INSERT INTO github_issues (id,organization_id,repository_id,github_issue_id,number,title,state) VALUES ('i','o','r','456',1,'Synthetic issue','open');
    INSERT INTO github_webhook_deliveries (id,delivery_id,event_name,action,installation_id,organization_id,repository_id,payload_sha256,status,attempts,processed_at) VALUES ('d','synthetic-guid','issues','opened','166179374','o','r','synthetic-checksum','processed',1,${now});
  `);
  return db;
}
function assertState(db: DatabaseSync, stage: (typeof postStages)[number]) {
  const counts = parseProductionApplicationCountsResult([
    { results: [db.prepare(buildProductionApplicationCountsSql()).get()] },
  ]);
  assertExpectedProductionFixtureCounts(stage, counts);
  const query = buildProductionFixtureIdentityQuery(stage, '166179374', now);
  validateReadOnlySql(query.sql);
  expect(query.params).toHaveLength((query.sql.match(/\?/g) ?? []).length);
  const identity = parseProductionFixtureIdentityResult([
    { results: [db.prepare(query.sql).get(...query.params)] },
  ]);
  assertProductionFixtureIdentity(stage, identity);
  expect(query.sql).not.toMatch(/\b(email|token|title|body|normalized_event)\b/);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
}
describe('production fixture activation acceptance SQL', () => {
  it('requires explicit reconciled provenance and rejects connected evidence for that path', () => {
    const db = fixture('after-installation');
    try {
      const query = buildProductionFixtureIdentityQuery(
        'after-installation',
        '166179374',
        now,
        'reconciled',
      );
      const read = () =>
        parseProductionFixtureIdentityResult([
          { results: [db.prepare(query.sql).get(...query.params)] },
        ]);
      expect(() => assertProductionFixtureIdentity('after-installation', read())).toThrow(
        /fixture_audit/,
      );
      db.exec("UPDATE audit_events SET action='github.reconciled' WHERE id='connected'");
      expect(() => assertProductionFixtureIdentity('after-installation', read())).not.toThrow();
      expect(() => assertState(db, 'after-installation')).toThrow(/fixture_audit/);
    } finally {
      db.close();
    }
  });

  it.each(postStages)(
    'accepts exact %s state with independent audits and null remote head',
    (stage) => {
      const db = fixture(stage);
      try {
        expect(parseProductionFixtureD1Stage(stage)).toBe(stage);
        assertState(db, stage);
      } finally {
        db.close();
      }
    },
  );
  it.each([
    ["UPDATE audit_events SET action='wrong' WHERE id='onboarding'", 'onboarding_audit'],
    ["UPDATE audit_events SET actor_user_id=NULL WHERE id='onboarding'", 'onboarding_audit'],
    ["UPDATE audit_events SET organization_id='o' WHERE id='onboarding'", 'onboarding_audit'],
    ["UPDATE audit_events SET subject_type='wrong' WHERE id='connected'", 'fixture_audit'],
    ["UPDATE audit_events SET actor_user_id=NULL WHERE id='connected'", 'fixture_audit'],
    ["UPDATE audit_events SET action='wrong' WHERE id='selection'", 'fixture_selection_audit'],
    [
      "UPDATE audit_events SET organization_id=NULL WHERE id='selection'",
      'fixture_selection_audit',
    ],
    ["UPDATE github_repositories SET github_repository_id='999'", 'fixture_repository'],
    ["UPDATE github_repositories SET owner='other'", 'fixture_repository'],
    ["UPDATE github_installations SET github_installation_id='999'", 'fixture_installation'],
    ["UPDATE github_repositories SET state='available'", 'fixture_active_repository'],
    ['UPDATE github_installation_repositories SET selected=0', 'fixture_selected_mapping'],
    ["UPDATE github_issues SET organization_id='wrong'", 'fixture_issue'],
    ['UPDATE github_webhook_deliveries SET organization_id=NULL', 'fixture_processed_delivery'],
    ["UPDATE github_webhook_deliveries SET status='queued'", 'fixture_processed_delivery'],
    ['UPDATE github_webhook_deliveries SET attempts=0', 'fixture_processed_delivery'],
    ["UPDATE github_webhook_deliveries SET last_error='synthetic'", 'fixture_processed_delivery'],
    ['UPDATE github_webhook_deliveries SET processed_at=NULL', 'fixture_processed_delivery'],
    ["UPDATE github_webhook_deliveries SET installation_id='999'", 'fixture_processed_delivery'],
    ['UPDATE sessions SET expires_at=0', 'active_session'],
    ['UPDATE onboarding_profiles SET completed=0', 'onboarding_completed'],
  ])('rejects broken identity: %s', (mutation, field) => {
    const db = fixture('after-live-issue');
    try {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec(mutation);
      expect(() => assertState(db, 'after-live-issue')).toThrow(new RegExp(field));
    } finally {
      db.close();
    }
  });
  it.each([
    "INSERT INTO github_repositories (id,organization_id,installation_id,github_repository_id,owner,name,full_name) VALUES ('extra','o','gi','999','other','other','other/other')",
    "INSERT INTO audit_events (id,action,subject_type) VALUES ('extra','extra','extra')",
    "INSERT INTO system_jobs (id,name) VALUES ('extra','extra')",
  ])('rejects extra business rows: %s', (mutation) => {
    const db = fixture('after-live-issue');
    try {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec(mutation);
      expect(() => assertState(db, 'after-live-issue')).toThrow(/count mismatch/);
    } finally {
      db.close();
    }
  });
});
