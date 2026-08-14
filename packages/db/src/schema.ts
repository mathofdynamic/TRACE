import {
  boolean,
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    image: text('image'),
    emailVerified: boolean('email_verified').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.token),
    index('sessions_user_idx').on(table.userId),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    idToken: text('id_token'),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('accounts_provider_identity_unique').on(table.providerId, table.accountId),
  ],
);

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const onboardingProfiles = pgTable(
  'onboarding_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    intendedUsage: text('intended_usage'),
    executionMode: text('execution_mode'),
    completed: boolean('completed').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('onboarding_profiles_user_unique').on(table.userId)],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
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

export const systemJobs = pgTable(
  'system_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    ...timestamps,
  },
  (table) => [index('system_jobs_status_idx').on(table.status)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [index('audit_events_org_created_idx').on(table.organizationId, table.createdAt)],
);

export const githubInstallations = pgTable(
  'github_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    githubInstallationId: bigint('github_installation_id', { mode: 'number' }).notNull(),
    accountLogin: text('account_login').notNull(),
    accountType: text('account_type').notNull(),
    state: text('state').notNull().default('active'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_installations_provider_unique').on(table.githubInstallationId),
    index('github_installations_org_idx').on(table.organizationId),
  ],
);

export const githubRepositories = pgTable(
  'github_repositories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => githubInstallations.id, { onDelete: 'cascade' }),
    githubRepositoryId: bigint('github_repository_id', { mode: 'number' }).notNull(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch'),
    visibility: text('visibility'),
    state: text('state').notNull().default('active'),
    remoteHeadSha: text('remote_head_sha'),
    lastSynchronizedAt: timestamp('last_synchronized_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
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

export const githubInstallationRepositories = pgTable(
  'github_installation_repositories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => githubInstallations.id, { onDelete: 'cascade' }),
    githubRepositoryId: bigint('github_repository_id', { mode: 'number' }).notNull(),
    selected: boolean('selected').notNull().default(false),
    permissions: jsonb('permissions').$type<Record<string, string>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_installation_repositories_unique').on(
      table.installationId,
      table.githubRepositoryId,
    ),
  ],
);

export const githubPullRequests = pgTable(
  'github_pull_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    githubPullRequestId: bigint('github_pull_request_id', { mode: 'number' }).notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    state: text('state').notNull(),
    headSha: text('head_sha'),
    baseBranch: text('base_branch'),
    authorLogin: text('author_login'),
    url: text('url'),
    lastSynchronizedAt: timestamp('last_synchronized_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_pull_requests_provider_unique').on(table.githubPullRequestId),
    uniqueIndex('github_pull_requests_repo_number_unique').on(table.repositoryId, table.number),
  ],
);

export const githubIssues = pgTable(
  'github_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    githubIssueId: bigint('github_issue_id', { mode: 'number' }).notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    state: text('state').notNull(),
    url: text('url'),
    lastSynchronizedAt: timestamp('last_synchronized_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('github_issues_provider_unique').on(table.githubIssueId)],
);

export const githubWebhookDeliveries = pgTable(
  'github_webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: text('delivery_id').notNull(),
    eventName: text('event_name').notNull(),
    action: text('action'),
    installationId: bigint('installation_id', { mode: 'number' }),
    payloadSha256: text('payload_sha256').notNull(),
    status: text('status').notNull().default('received'),
    jobId: text('job_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('github_webhook_deliveries_delivery_unique').on(table.deliveryId),
    index('github_webhook_deliveries_status_idx').on(table.status),
  ],
);

export const analysisRuns = pgTable(
  'analysis_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id').references(() => githubRepositories.id, {
      onDelete: 'set null',
    }),
    pullRequestNumber: integer('pull_request_number'),
    idempotencyKey: text('idempotency_key').notNull(),
    profile: text('profile').notNull().default('default'),
    schemaVersion: text('schema_version').notNull().default('0.1'),
    headSha: text('head_sha'),
    baseSha: text('base_sha'),
    status: text('status').notNull().default('queued'),
    result: jsonb('result').$type<Record<string, unknown>>(),
    cost: jsonb('cost').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('analysis_runs_idempotency_unique').on(table.idempotencyKey),
    index('analysis_runs_org_idx').on(table.organizationId),
    index('analysis_runs_repository_idx').on(table.repositoryId),
  ],
);

export const cliDeviceAuthorizations = pgTable(
  'cli_device_authorizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceCodeHash: text('device_code_hash').notNull(),
    userCodeHash: text('user_code_hash').notNull(),
    requestKeyHash: text('request_key_hash').notNull(),
    deviceLabel: text('device_label').notNull(),
    status: text('status').notNull().default('pending'),
    approvedOrganizationId: uuid('approved_organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    approvedUserId: uuid('approved_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
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

export const cliConnections = pgTable(
  'cli_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('cli_connections_token_unique').on(table.tokenHash),
    index('cli_connections_org_idx').on(table.organizationId),
    index('cli_connections_user_idx').on(table.userId),
  ],
);

export const syncOperations = pgTable(
  'sync_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => cliConnections.id, { onDelete: 'restrict' }),
    syncId: text('sync_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('negotiating'),
    branch: text('branch'),
    headCommit: text('head_commit'),
    traceVersion: text('trace_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
    totalBytes: integer('total_bytes').notNull().default(0),
    artifactCount: integer('artifact_count').notNull().default(0),
    errorCode: text('error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sync_operations_idempotency_unique').on(table.idempotencyKey),
    uniqueIndex('sync_operations_repo_sync_unique').on(table.repositoryId, table.syncId),
    index('sync_operations_repo_created_idx').on(table.repositoryId, table.createdAt),
    index('sync_operations_connection_idx').on(table.connectionId),
  ],
);

export const syncUploads = pgTable(
  'sync_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
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
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
    projection: jsonb('projection').$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sync_uploads_operation_artifact_unique').on(table.operationId, table.artifactId),
    index('sync_uploads_operation_idx').on(table.operationId),
  ],
);

export const syncedArtifacts = pgTable(
  'synced_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    operationId: uuid('operation_id')
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
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
    projection: jsonb('projection').$type<Record<string, unknown>>().notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
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

export const analysisFindings = pgTable(
  'analysis_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisRunId: uuid('analysis_run_id')
      .notNull()
      .references(() => analysisRuns.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    severity: text('severity').notNull(),
    classification: text('classification').notNull(),
    evidence: jsonb('evidence').$type<string[]>().notNull(),
    disposition: text('disposition'),
    dispositionReason: text('disposition_reason'),
    dispositionActorUserId: uuid('disposition_actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    dispositionAt: timestamp('disposition_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('analysis_findings_run_external_unique').on(table.analysisRunId, table.externalId),
    index('analysis_findings_run_idx').on(table.analysisRunId),
  ],
);
