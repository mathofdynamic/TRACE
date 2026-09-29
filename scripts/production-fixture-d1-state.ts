import {
  parseProductionApplicationCountsResult,
  productionApplicationTables,
  type ProductionApplicationCounts,
} from './production-canary-d1.js';

export const productionFixtureD1State = {
  accountId: 'c5d6cf110905c91fc3eed1abaf8236a2',
  databaseId: '7a566f2e-da27-46e7-8c3f-271e5566f225',
  queueId: '9ef092975a554ba296a63b162b16522f',
  queueName: 'trace-production-jobs',
  healthUrl: 'https://trace-production.mathofdynamic2.workers.dev/api/health',
  githubLogin: 'mathofdynamic',
  organizationSlug: 'github-user-mathofdynamic',
  organizationName: 'mathofdynamic on GitHub',
  repositoryId: '1378441300',
  repositoryOwner: 'mathofdynamic',
  repositoryName: 'trace-staging-fixture',
  repositoryFullName: 'mathofdynamic/trace-staging-fixture',
} as const;

export type ProductionFixtureD1Stage =
  | 'before-oauth'
  | 'after-oauth'
  | 'after-onboarding'
  | 'after-installation';
export type FixtureD1Identity = {
  ok: unknown;
  oauth_identity_links?: unknown;
  active_session_links?: unknown;
  onboarding_profile_links?: unknown;
  onboarding_completed_links?: unknown;
  onboarding_intended_usage_links?: unknown;
  onboarding_execution_mode_links?: unknown;
  onboarding_audit_actor_links?: unknown;
  onboarding_audit_action_links?: unknown;
  onboarding_audit_subject_links?: unknown;
  onboarding_audit_unscoped_links?: unknown;
  onboarding_audit_event_links?: unknown;
  user_created_at?: unknown;
  account_created_at?: unknown;
  session_created_at?: unknown;
  onboarding_profile_created_at?: unknown;
  audit_event_created_at?: unknown;
  fixture_workspace_count?: unknown;
  owner_membership_links?: unknown;
  fixture_installation_links?: unknown;
  fixture_repository_links?: unknown;
  fixture_installation_repository_links?: unknown;
  fixture_audit_event_links?: unknown;
};

export const productionFixtureD1ObservationWindow = {
  start: Date.parse('2026-09-29T14:12:00.000Z'),
  end: Date.parse('2026-09-29T14:33:00.000Z'),
} as const;

export type ProductionFixtureOnboardingEvidence = {
  userCreatedAtUtc: string;
  accountCreatedAtUtc: string;
  sessionCreatedAtUtc: string;
  onboardingProfileCreatedAtUtc: string;
  auditEventCreatedAtUtc: string;
  onboardingAtOrAfterOAuthPersistence: 'YES' | 'NO';
  auditAtOrAfterOnboarding: 'YES' | 'NO';
  onboardingProfileInObservedWindow: 'YES' | 'NO';
  auditEventInObservedWindow: 'YES' | 'NO';
};

export function parseProductionFixtureD1Stage(value: string | undefined): ProductionFixtureD1Stage {
  if (
    value === 'before-oauth' ||
    value === 'after-oauth' ||
    value === 'after-onboarding' ||
    value === 'after-installation'
  ) {
    return value;
  }
  throw new Error(
    'Production fixture D1 stage must be before-oauth, after-oauth, after-onboarding, or after-installation.',
  );
}

export function expectedProductionFixtureCounts(stage: ProductionFixtureD1Stage) {
  const counts = Object.fromEntries(
    productionApplicationTables.map((table) => [table, 0]),
  ) as Record<(typeof productionApplicationTables)[number], number>;
  if (stage === 'after-oauth' || stage === 'after-onboarding' || stage === 'after-installation') {
    counts.users = 1;
    counts.accounts = 1;
    counts.sessions = 1;
  }
  if (stage === 'after-onboarding') {
    counts.onboarding_profiles = 1;
    counts.audit_events = 1;
  }
  if (stage === 'after-installation') {
    counts.organizations = 1;
    counts.memberships = 1;
    counts.github_installations = 1;
    counts.github_repositories = 1;
    counts.github_installation_repositories = 1;
    counts.audit_events = 1;
  }
  return counts;
}

export function assertExpectedProductionFixtureCounts(
  stage: ProductionFixtureD1Stage,
  actual: ProductionApplicationCounts,
) {
  const expected = expectedProductionFixtureCounts(stage);
  for (const table of productionApplicationTables) {
    if (actual[table] !== expected[table]) {
      throw new Error(
        `Production fixture D1 ${stage} count mismatch for ${table}: expected ${expected[table]}.`,
      );
    }
  }
}

export function buildProductionFixtureIdentityQuery(
  stage: Exclude<ProductionFixtureD1Stage, 'before-oauth'>,
  installationId?: string,
  now = Date.now(),
) {
  const oauthLink = `(SELECT COUNT(*) FROM users u JOIN accounts a ON a.user_id = u.id JOIN sessions s ON s.user_id = u.id WHERE a.provider_id = 'github' AND lower(a.account_id) = lower(?))`;
  if (stage === 'after-oauth') {
    return {
      sql: `SELECT 1 AS ok, ${oauthLink} AS oauth_identity_links`,
      params: [productionFixtureD1State.githubLogin],
    } as const;
  }
  if (stage === 'after-onboarding') {
    const accountMatch = `a.provider_id = 'github' AND lower(a.account_id) = lower(?)`;
    const sql = `SELECT 1 AS ok,
      ${oauthLink} AS oauth_identity_links,
      (SELECT COUNT(*) FROM users u JOIN accounts a ON a.user_id = u.id JOIN sessions s ON s.user_id = u.id WHERE ${accountMatch} AND s.expires_at > ?) AS active_session_links,
      (SELECT COUNT(*) FROM users u JOIN accounts a ON a.user_id = u.id JOIN onboarding_profiles p ON p.user_id = u.id WHERE ${accountMatch}) AS onboarding_profile_links,
      (SELECT COUNT(*) FROM users u JOIN accounts a ON a.user_id = u.id JOIN onboarding_profiles p ON p.user_id = u.id WHERE ${accountMatch} AND p.completed = 1) AS onboarding_completed_links,
      (SELECT COUNT(*) FROM users u JOIN accounts a ON a.user_id = u.id JOIN onboarding_profiles p ON p.user_id = u.id WHERE ${accountMatch} AND p.intended_usage IN ('individual', 'team', 'organization')) AS onboarding_intended_usage_links,
      (SELECT COUNT(*) FROM users u JOIN accounts a ON a.user_id = u.id JOIN onboarding_profiles p ON p.user_id = u.id WHERE ${accountMatch} AND p.execution_mode IN ('cloud', 'local', 'hybrid', 'undecided')) AS onboarding_execution_mode_links,
      (SELECT COUNT(*) FROM audit_events ae JOIN users u ON u.id = ae.actor_user_id JOIN accounts a ON a.user_id = u.id WHERE ${accountMatch}) AS onboarding_audit_actor_links,
      (SELECT COUNT(*) FROM audit_events ae WHERE ae.action = 'workspace.profile.completed') AS onboarding_audit_action_links,
      (SELECT COUNT(*) FROM audit_events ae WHERE ae.subject_type = 'onboarding_profile') AS onboarding_audit_subject_links,
      (SELECT COUNT(*) FROM audit_events ae WHERE ae.organization_id IS NULL) AS onboarding_audit_unscoped_links,
      (SELECT COUNT(*) FROM audit_events ae JOIN users u ON u.id = ae.actor_user_id JOIN accounts a ON a.user_id = u.id WHERE ${accountMatch} AND ae.action = 'workspace.profile.completed' AND ae.subject_type = 'onboarding_profile' AND ae.organization_id IS NULL) AS onboarding_audit_event_links,
      (SELECT MIN(u.created_at) FROM users u JOIN accounts a ON a.user_id = u.id WHERE ${accountMatch}) AS user_created_at,
      (SELECT MIN(a.created_at) FROM accounts a WHERE ${accountMatch}) AS account_created_at,
      (SELECT MIN(s.created_at) FROM users u JOIN accounts a ON a.user_id = u.id JOIN sessions s ON s.user_id = u.id WHERE ${accountMatch}) AS session_created_at,
      (SELECT MIN(p.created_at) FROM users u JOIN accounts a ON a.user_id = u.id JOIN onboarding_profiles p ON p.user_id = u.id WHERE ${accountMatch}) AS onboarding_profile_created_at,
      (SELECT MIN(ae.created_at) FROM audit_events ae JOIN users u ON u.id = ae.actor_user_id JOIN accounts a ON a.user_id = u.id WHERE ${accountMatch} AND ae.action = 'workspace.profile.completed' AND ae.subject_type = 'onboarding_profile' AND ae.organization_id IS NULL) AS audit_event_created_at`;
    return {
      sql,
      params: [
        productionFixtureD1State.githubLogin,
        productionFixtureD1State.githubLogin,
        now,
        ...Array.from({ length: 11 }, () => productionFixtureD1State.githubLogin),
      ],
    } as const;
  }
  if (!installationId || !/^\d{1,20}$/.test(installationId) || BigInt(installationId) <= 0n) {
    throw new Error(
      'A valid external installation ID is required for post-install D1 verification.',
    );
  }
  return {
    sql: `SELECT 1 AS ok,
      ${oauthLink} AS oauth_identity_links,
      (SELECT COUNT(*) FROM organizations o WHERE o.slug = ? AND o.name = ?) AS fixture_workspace_count,
      (SELECT COUNT(*) FROM memberships m JOIN organizations o ON o.id = m.organization_id JOIN accounts a ON a.user_id = m.user_id JOIN users u ON u.id = a.user_id JOIN sessions s ON s.user_id = u.id WHERE o.slug = ? AND m.role = 'owner' AND a.provider_id = 'github' AND lower(a.account_id) = lower(?)) AS owner_membership_links,
      (SELECT COUNT(*) FROM github_installations gi JOIN organizations o ON o.id = gi.organization_id WHERE gi.github_installation_id = ? AND lower(gi.account_login) = lower(?) AND gi.account_type = 'User' AND gi.state = 'active' AND gi.suspended_at IS NULL AND o.slug = ?) AS fixture_installation_links,
      (SELECT COUNT(*) FROM github_repositories r JOIN github_installations gi ON gi.id = r.installation_id JOIN organizations o ON o.id = r.organization_id WHERE r.github_repository_id = ? AND lower(r.owner) = lower(?) AND lower(r.name) = lower(?) AND lower(r.full_name) = lower(?) AND gi.github_installation_id = ? AND gi.organization_id = o.id) AS fixture_repository_links,
      (SELECT COUNT(*) FROM github_installation_repositories ir JOIN github_installations gi ON gi.id = ir.installation_id WHERE ir.github_repository_id = ? AND gi.github_installation_id = ?) AS fixture_installation_repository_links,
      (SELECT COUNT(*) FROM audit_events ae JOIN github_installations gi ON ae.subject_id = gi.id JOIN organizations o ON o.id = gi.organization_id JOIN accounts a ON a.user_id = ae.actor_user_id WHERE ae.action = 'github.connected' AND ae.subject_type = 'github_installation' AND ae.organization_id = o.id AND ae.subject_id = gi.id AND o.slug = ? AND a.provider_id = 'github' AND lower(a.account_id) = lower(?)) AS fixture_audit_event_links`,
    params: [
      productionFixtureD1State.githubLogin,
      productionFixtureD1State.organizationSlug,
      productionFixtureD1State.organizationName,
      productionFixtureD1State.organizationSlug,
      productionFixtureD1State.githubLogin,
      installationId,
      productionFixtureD1State.githubLogin,
      productionFixtureD1State.organizationSlug,
      productionFixtureD1State.repositoryId,
      productionFixtureD1State.repositoryOwner,
      productionFixtureD1State.repositoryName,
      productionFixtureD1State.repositoryFullName,
      installationId,
      productionFixtureD1State.repositoryId,
      installationId,
      productionFixtureD1State.organizationSlug,
      productionFixtureD1State.githubLogin,
    ],
  } as const;
}

export function parseProductionFixtureIdentityResult(result: unknown): FixtureD1Identity {
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error('Production fixture identity query returned an invalid result set.');
  }
  const query = result[0];
  if (
    typeof query !== 'object' ||
    query === null ||
    !Array.isArray((query as { results?: unknown }).results) ||
    (query as { results: unknown[] }).results.length !== 1
  ) {
    throw new Error('Production fixture identity query did not return one row.');
  }
  const row = (query as { results: unknown[] }).results[0];
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new Error('Production fixture identity query row was invalid.');
  }
  const identity = row as FixtureD1Identity;
  if (identity.ok !== 1)
    throw new Error('Production fixture identity query did not confirm SELECT 1.');
  return identity;
}

function requireOne(identity: FixtureD1Identity, field: keyof FixtureD1Identity) {
  if (identity[field] !== 1) {
    throw new Error(`Production fixture D1 cross-link verification failed: ${field}.`);
  }
}

export function assertProductionFixtureIdentity(
  stage: Exclude<ProductionFixtureD1Stage, 'before-oauth'>,
  identity: FixtureD1Identity,
) {
  requireOne(identity, 'oauth_identity_links');
  if (stage === 'after-onboarding') {
    requireOne(identity, 'active_session_links');
    requireOne(identity, 'onboarding_profile_links');
    requireOne(identity, 'onboarding_completed_links');
    requireOne(identity, 'onboarding_intended_usage_links');
    requireOne(identity, 'onboarding_execution_mode_links');
    requireOne(identity, 'onboarding_audit_actor_links');
    requireOne(identity, 'onboarding_audit_action_links');
    requireOne(identity, 'onboarding_audit_subject_links');
    requireOne(identity, 'onboarding_audit_unscoped_links');
    requireOne(identity, 'onboarding_audit_event_links');
  }
  if (stage === 'after-installation') {
    requireOne(identity, 'fixture_workspace_count');
    requireOne(identity, 'owner_membership_links');
    requireOne(identity, 'fixture_installation_links');
    requireOne(identity, 'fixture_repository_links');
    requireOne(identity, 'fixture_installation_repository_links');
    requireOne(identity, 'fixture_audit_event_links');
  }
}

function parseTimestampMilliseconds(value: unknown, field: string) {
  const timestamp =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    Number.isNaN(new Date(timestamp).getTime())
  ) {
    throw new Error(`Production fixture D1 returned an invalid ${field} timestamp.`);
  }
  return timestamp;
}

export function buildProductionFixtureOnboardingEvidence(
  identity: FixtureD1Identity,
): ProductionFixtureOnboardingEvidence {
  const userCreatedAt = parseTimestampMilliseconds(identity.user_created_at, 'user-created-at');
  const accountCreatedAt = parseTimestampMilliseconds(
    identity.account_created_at,
    'account-created-at',
  );
  const sessionCreatedAt = parseTimestampMilliseconds(
    identity.session_created_at,
    'session-created-at',
  );
  const onboardingProfileCreatedAt = parseTimestampMilliseconds(
    identity.onboarding_profile_created_at,
    'onboarding-profile-created-at',
  );
  const auditEventCreatedAt = parseTimestampMilliseconds(
    identity.audit_event_created_at,
    'audit-event-created-at',
  );
  const { start, end } = productionFixtureD1ObservationWindow;
  const inObservedWindow = (timestamp: number) => timestamp >= start && timestamp <= end;
  return {
    userCreatedAtUtc: new Date(userCreatedAt).toISOString(),
    accountCreatedAtUtc: new Date(accountCreatedAt).toISOString(),
    sessionCreatedAtUtc: new Date(sessionCreatedAt).toISOString(),
    onboardingProfileCreatedAtUtc: new Date(onboardingProfileCreatedAt).toISOString(),
    auditEventCreatedAtUtc: new Date(auditEventCreatedAt).toISOString(),
    onboardingAtOrAfterOAuthPersistence:
      onboardingProfileCreatedAt >= Math.max(userCreatedAt, accountCreatedAt, sessionCreatedAt)
        ? 'YES'
        : 'NO',
    auditAtOrAfterOnboarding: auditEventCreatedAt >= onboardingProfileCreatedAt ? 'YES' : 'NO',
    onboardingProfileInObservedWindow: inObservedWindow(onboardingProfileCreatedAt) ? 'YES' : 'NO',
    auditEventInObservedWindow: inObservedWindow(auditEventCreatedAt) ? 'YES' : 'NO',
  };
}

export function assertProductionFixtureForeignKeys(violations: unknown) {
  if (!Array.isArray(violations)) {
    throw new Error('Production D1 foreign-key check did not return a result list.');
  }
  if (violations.length !== 0) {
    throw new Error(`Production D1 foreign-key check found ${violations.length} violation(s).`);
  }
}

export function formatProductionFixtureD1State(input: {
  stage: ProductionFixtureD1Stage;
  counts: ProductionApplicationCounts;
  foreignKeyViolations: number;
  queueBacklogCount: number;
  onboardingEvidence?: ProductionFixtureOnboardingEvidence;
}) {
  if (input.stage === 'after-onboarding' && !input.onboardingEvidence) {
    throw new Error('Production fixture D1 onboarding evidence is required for report formatting.');
  }
  const lines = [
    `D1_STAGE=${input.stage}`,
    `APPLICATION_TABLES=${productionApplicationTables.length}`,
    ...productionApplicationTables.map((table) => `${table.toUpperCase()}=${input.counts[table]}`),
    ...(input.stage === 'before-oauth' ? [] : ['OAUTH_GITHUB_ACCOUNT_MAPPING=VERIFIED']),
    ...(input.stage === 'after-onboarding'
      ? [
          'OAUTH_STATE=EXPECTED',
          'ACTIVE_SESSION_LINK=VERIFIED',
          'ONBOARDING_STATE=EXPECTED',
          'ONBOARDING_PROFILE_LINK=VERIFIED',
          'ONBOARDING_COMPLETED=YES',
          'ONBOARDING_INTENDED_USAGE=VALID',
          'ONBOARDING_EXECUTION_MODE=VALID',
          'ONBOARDING_AUDIT_EVENT=VERIFIED',
          'ONBOARDING_AUDIT_ACTION=workspace.profile.completed',
          'ONBOARDING_AUDIT_SUBJECT_TYPE=onboarding_profile',
          'ONBOARDING_AUDIT_ACTOR=VERIFIED',
          'ONBOARDING_AUDIT_ORGANIZATION=NULL',
          `USER_CREATED_AT_UTC=${input.onboardingEvidence?.userCreatedAtUtc}`,
          `ACCOUNT_CREATED_AT_UTC=${input.onboardingEvidence?.accountCreatedAtUtc}`,
          `SESSION_CREATED_AT_UTC=${input.onboardingEvidence?.sessionCreatedAtUtc}`,
          `ONBOARDING_PROFILE_CREATED_AT_UTC=${input.onboardingEvidence?.onboardingProfileCreatedAtUtc}`,
          `AUDIT_EVENT_CREATED_AT_UTC=${input.onboardingEvidence?.auditEventCreatedAtUtc}`,
          `ONBOARDING_AT_OR_AFTER_OAUTH_PERSISTENCE=${input.onboardingEvidence?.onboardingAtOrAfterOAuthPersistence}`,
          `AUDIT_AT_OR_AFTER_ONBOARDING=${input.onboardingEvidence?.auditAtOrAfterOnboarding}`,
          `ONBOARDING_PROFILE_IN_OBSERVED_WINDOW=${input.onboardingEvidence?.onboardingProfileInObservedWindow}`,
          `AUDIT_EVENT_IN_OBSERVED_WINDOW=${input.onboardingEvidence?.auditEventInObservedWindow}`,
          'EXISTING_OAUTH_SESSION_SHOULD_BE_PRESERVED=YES',
          'OAUTH_RETRY_REQUIRED=NO',
          'INSTALLATION_STATE=NOT_STARTED',
        ]
      : []),
    ...(input.stage === 'after-installation'
      ? [
          'FIXTURE_WORKSPACE=VERIFIED',
          'OWNER_MEMBERSHIP=VERIFIED',
          'GITHUB_INSTALLATION=VERIFIED',
          'FIXTURE_REPOSITORY=VERIFIED',
          'INSTALLATION_REPOSITORY_MAPPING=VERIFIED',
          'GITHUB_CONNECTED_AUDIT_EVENT=VERIFIED',
        ]
      : []),
    `FOREIGN_KEY_VIOLATIONS=${input.foreignKeyViolations}`,
    `QUEUE_BACKLOG_COUNT=${input.queueBacklogCount}`,
  ];
  return lines.join('\n');
}

export function validateReadOnlySql(sql: string) {
  const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
  if (
    normalized.includes(';') ||
    !(normalized.startsWith('SELECT ') || normalized === 'PRAGMA FOREIGN_KEY_CHECK') ||
    /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH)\b/.test(normalized)
  ) {
    throw new Error('Production fixture D1 verifier rejected a non-read-only SQL statement.');
  }
  return sql;
}

export { parseProductionApplicationCountsResult };
