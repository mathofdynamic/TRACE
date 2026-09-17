import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { JsonObject, StringList, StringMap } from '../domain-types';

const id = (name = 'id') =>
  text(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const referenceId = (name: string) => text(name);
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const jsonObject = (name: string) => text(name, { mode: 'json' }).$type<JsonObject>();

const timestamps = {
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const users = sqliteTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name'),
    image: text('image'),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: referenceId('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.token),
    index('sessions_user_idx').on(table.userId),
  ],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: id(),
    userId: referenceId('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    idToken: text('id_token'),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('accounts_provider_identity_unique').on(table.providerId, table.accountId),
  ],
);

export const verifications = sqliteTable(
  'verifications',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ...timestamps,
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const onboardingProfiles = sqliteTable(
  'onboarding_profiles',
  {
    id: id(),
    userId: referenceId('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    intendedUsage: text('intended_usage'),
    executionMode: text('execution_mode'),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('onboarding_profiles_user_unique').on(table.userId)],
);

export const organizations = sqliteTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
);

export const memberships = sqliteTable(
  'memberships',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: referenceId('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('memberships_org_user_unique').on(table.organizationId, table.userId),
    index('memberships_user_idx').on(table.userId),
  ],
);

export const systemJobs = sqliteTable(
  'system_jobs',
  {
    id: id(),
    name: text('name').notNull(),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    ...timestamps,
  },
  (table) => [index('system_jobs_status_idx').on(table.status)],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: id(),
    organizationId: referenceId('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorUserId: referenceId('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: referenceId('subject_id'),
    metadata: jsonObject('metadata'),
    ...timestamps,
  },
  (table) => [index('audit_events_org_created_idx').on(table.organizationId, table.createdAt)],
);

export const githubInstallations = sqliteTable(
  'github_installations',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    githubInstallationId: text('github_installation_id').notNull(),
    accountLogin: text('account_login').notNull(),
    accountType: text('account_type').notNull(),
    state: text('state').notNull().default('active'),
    suspendedAt: timestamp('suspended_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_installations_provider_unique').on(table.githubInstallationId),
    index('github_installations_org_idx').on(table.organizationId),
  ],
);

export const githubRepositories = sqliteTable(
  'github_repositories',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    installationId: referenceId('installation_id')
      .notNull()
      .references(() => githubInstallations.id, { onDelete: 'cascade' }),
    githubRepositoryId: text('github_repository_id').notNull(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch'),
    visibility: text('visibility'),
    state: text('state').notNull().default('active'),
    remoteHeadSha: text('remote_head_sha'),
    lastSynchronizedAt: timestamp('last_synchronized_at'),
    disconnectedAt: timestamp('disconnected_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_repositories_provider_unique').on(table.githubRepositoryId),
    uniqueIndex('github_repositories_org_full_name_unique').on(
      table.organizationId,
      table.fullName,
    ),
    index('github_repositories_installation_idx').on(table.installationId),
  ],
);

export const githubInstallationRepositories = sqliteTable(
  'github_installation_repositories',
  {
    id: id(),
    installationId: referenceId('installation_id')
      .notNull()
      .references(() => githubInstallations.id, { onDelete: 'cascade' }),
    githubRepositoryId: text('github_repository_id').notNull(),
    selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
    permissions: text('permissions', { mode: 'json' }).$type<StringMap>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_installation_repositories_unique').on(
      table.installationId,
      table.githubRepositoryId,
    ),
  ],
);

export const githubPullRequests = sqliteTable(
  'github_pull_requests',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: referenceId('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    githubPullRequestId: text('github_pull_request_id').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    state: text('state').notNull(),
    headSha: text('head_sha'),
    baseBranch: text('base_branch'),
    authorLogin: text('author_login'),
    url: text('url'),
    lastSynchronizedAt: timestamp('last_synchronized_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_pull_requests_provider_unique').on(table.githubPullRequestId),
    uniqueIndex('github_pull_requests_repo_number_unique').on(table.repositoryId, table.number),
  ],
);

export const githubIssues = sqliteTable(
  'github_issues',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: referenceId('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    githubIssueId: text('github_issue_id').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    state: text('state').notNull(),
    url: text('url'),
    lastSynchronizedAt: timestamp('last_synchronized_at'),
    ...timestamps,
  },
  (table) => [uniqueIndex('github_issues_provider_unique').on(table.githubIssueId)],
);

export const githubWebhookDeliveries = sqliteTable(
  'github_webhook_deliveries',
  {
    id: id(),
    deliveryId: text('delivery_id').notNull(),
    eventName: text('event_name').notNull(),
    action: text('action'),
    installationId: text('installation_id'),
    payloadSha256: text('payload_sha256').notNull(),
    status: text('status').notNull().default('received'),
    jobId: text('job_id'),
    receivedAt: timestamp('received_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    processedAt: timestamp('processed_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_webhook_deliveries_delivery_unique').on(table.deliveryId),
    index('github_webhook_deliveries_status_idx').on(table.status),
  ],
);

export const analysisRuns = sqliteTable(
  'analysis_runs',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: referenceId('repository_id').references(() => githubRepositories.id, {
      onDelete: 'set null',
    }),
    pullRequestNumber: integer('pull_request_number'),
    idempotencyKey: text('idempotency_key').notNull(),
    profile: text('profile').notNull().default('default'),
    schemaVersion: text('schema_version').notNull().default('0.1'),
    headSha: text('head_sha'),
    baseSha: text('base_sha'),
    status: text('status').notNull().default('queued'),
    result: jsonObject('result'),
    cost: jsonObject('cost'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('analysis_runs_idempotency_unique').on(table.idempotencyKey),
    index('analysis_runs_org_idx').on(table.organizationId),
    index('analysis_runs_repository_idx').on(table.repositoryId),
  ],
);

export const cliDeviceAuthorizations = sqliteTable(
  'cli_device_authorizations',
  {
    id: id(),
    deviceCodeHash: text('device_code_hash').notNull(),
    userCodeHash: text('user_code_hash').notNull(),
    requestKeyHash: text('request_key_hash').notNull(),
    deviceLabel: text('device_label').notNull(),
    status: text('status').notNull().default('pending'),
    approvedOrganizationId: referenceId('approved_organization_id').references(
      () => organizations.id,
      { onDelete: 'cascade' },
    ),
    approvedUserId: referenceId('approved_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('cli_device_authorizations_device_code_unique').on(table.deviceCodeHash),
    uniqueIndex('cli_device_authorizations_user_code_unique').on(table.userCodeHash),
    index('cli_device_authorizations_expiry_idx').on(table.expiresAt),
    index('cli_device_authorizations_request_created_idx').on(
      table.requestKeyHash,
      table.createdAt,
    ),
  ],
);

export const cliConnections = sqliteTable(
  'cli_connections',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: referenceId('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: text('scopes', { mode: 'json' }).$type<StringList>().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('cli_connections_token_unique').on(table.tokenHash),
    index('cli_connections_org_idx').on(table.organizationId),
    index('cli_connections_user_idx').on(table.userId),
  ],
);

export const syncOperations = sqliteTable(
  'sync_operations',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: referenceId('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    connectionId: referenceId('connection_id')
      .notNull()
      .references(() => cliConnections.id, { onDelete: 'restrict' }),
    syncId: text('sync_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('negotiating'),
    branch: text('branch'),
    headCommit: text('head_commit'),
    traceVersion: text('trace_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    manifest: jsonObject('manifest').notNull(),
    totalBytes: integer('total_bytes').notNull().default(0),
    artifactCount: integer('artifact_count').notNull().default(0),
    errorCode: text('error_code'),
    completedAt: timestamp('completed_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sync_operations_idempotency_unique').on(table.idempotencyKey),
    uniqueIndex('sync_operations_repo_sync_unique').on(table.repositoryId, table.syncId),
    index('sync_operations_repo_created_idx').on(table.repositoryId, table.createdAt),
    index('sync_operations_connection_idx').on(table.connectionId),
  ],
);

export const syncUploads = sqliteTable(
  'sync_uploads',
  {
    id: id(),
    operationId: referenceId('operation_id')
      .notNull()
      .references(() => syncOperations.id, { onDelete: 'cascade' }),
    artifactId: text('artifact_id').notNull(),
    artifactType: text('artifact_type').notNull(),
    path: text('path').notNull(),
    checksum: text('checksum').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sensitivity: text('sensitivity').notNull(),
    schemaVersion: text('schema_version').notNull(),
    content: text('content').notNull(),
    metadata: jsonObject('metadata').notNull(),
    projection: jsonObject('projection').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sync_uploads_operation_artifact_unique').on(table.operationId, table.artifactId),
    index('sync_uploads_operation_idx').on(table.operationId),
  ],
);

export const syncedArtifacts = sqliteTable(
  'synced_artifacts',
  {
    id: id(),
    organizationId: referenceId('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: referenceId('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    operationId: referenceId('operation_id')
      .notNull()
      .references(() => syncOperations.id, { onDelete: 'restrict' }),
    artifactId: text('artifact_id').notNull(),
    artifactType: text('artifact_type').notNull(),
    path: text('path').notNull(),
    checksum: text('checksum').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sensitivity: text('sensitivity').notNull(),
    schemaVersion: text('schema_version').notNull(),
    executionOrigin: text('execution_origin').notNull().default('local'),
    content: text('content').notNull(),
    metadata: jsonObject('metadata').notNull(),
    projection: jsonObject('projection').notNull(),
    generatedAt: timestamp('generated_at').notNull(),
    syncedAt: timestamp('synced_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    supersededAt: timestamp('superseded_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('synced_artifacts_operation_artifact_unique').on(
      table.operationId,
      table.artifactId,
    ),
    uniqueIndex('synced_artifacts_operation_path_unique').on(table.operationId, table.path),
    index('synced_artifacts_repo_type_idx').on(table.repositoryId, table.artifactType),
  ],
);

export const analysisFindings = sqliteTable(
  'analysis_findings',
  {
    id: id(),
    analysisRunId: referenceId('analysis_run_id')
      .notNull()
      .references(() => analysisRuns.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    severity: text('severity').notNull(),
    classification: text('classification').notNull(),
    evidence: text('evidence', { mode: 'json' }).$type<StringList>().notNull(),
    disposition: text('disposition'),
    dispositionReason: text('disposition_reason'),
    dispositionActorUserId: referenceId('disposition_actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    dispositionAt: timestamp('disposition_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('analysis_findings_run_external_unique').on(table.analysisRunId, table.externalId),
    index('analysis_findings_run_idx').on(table.analysisRunId),
  ],
);
