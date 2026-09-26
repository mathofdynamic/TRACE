export const AUTHORIZED_FIXTURE_REPOSITORY = {
  owner: 'mathofdynamic',
  repository: 'trace-staging-fixture',
  repositoryId: 1_378_441_300,
  fullName: 'mathofdynamic/trace-staging-fixture',
} as const;

export type ProductionCanaryRuntime = {
  TRACE_DEPLOYMENT_ENV?: string;
  TRACE_CANARY_MODE?: string;
  TRACE_CANARY_GITHUB_OWNER?: string;
  TRACE_CANARY_GITHUB_REPOSITORY?: string;
  TRACE_CANARY_GITHUB_REPOSITORY_ID?: string;
};

export type ProductionCanaryVariableConfiguration = {
  deploymentEnv: string;
  databaseDriver: string;
  canaryMode: 'closed' | 'fixture';
  fixtureCanaryEnvironment: {
    owner: string;
    repository: string;
    repositoryId: string;
  };
};

export type ProductionCanaryMode =
  | { kind: 'non-production' }
  | { kind: 'closed' }
  | {
      kind: 'fixture';
      fixture: typeof AUTHORIZED_FIXTURE_REPOSITORY;
    };

export type CanaryEligibility =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'closed'
        | 'fixture-user'
        | 'fixture-repository'
        | 'fixture-recovery'
        | 'fixture-installation'
        | 'fixture-webhook';
    };

type GitHubUserIdentity = { githubLogin?: unknown } | null | undefined;

type GitHubInstallationSnapshot = {
  installation?: {
    accountLogin?: unknown;
  };
  repositories?: unknown;
};

const githubLoginPattern = /^[a-z0-9](?:[a-z0-9-]{0,37})$/i;
const repositoryNamePattern = /^[a-z0-9_.-]{1,100}$/i;

function normalizeGitHubIdentity(value: unknown, pattern: RegExp) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return null;
  if (value === '.' || value === '..' || !pattern.test(value)) return null;
  return value.toLowerCase();
}

function configuredFixture(env: ProductionCanaryRuntime) {
  const owner = normalizeGitHubIdentity(env.TRACE_CANARY_GITHUB_OWNER, githubLoginPattern);
  const repository = normalizeGitHubIdentity(
    env.TRACE_CANARY_GITHUB_REPOSITORY,
    repositoryNamePattern,
  );
  const repositoryIdValue = env.TRACE_CANARY_GITHUB_REPOSITORY_ID;
  if (!owner || !repository || !repositoryIdValue || !/^[1-9]\d{0,15}$/.test(repositoryIdValue)) {
    return null;
  }
  const repositoryId = Number(repositoryIdValue);
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return null;

  if (
    owner !== AUTHORIZED_FIXTURE_REPOSITORY.owner ||
    repository !== AUTHORIZED_FIXTURE_REPOSITORY.repository ||
    repositoryId !== AUTHORIZED_FIXTURE_REPOSITORY.repositoryId
  ) {
    return null;
  }

  return AUTHORIZED_FIXTURE_REPOSITORY;
}

export function resolveProductionCanaryMode(
  env: ProductionCanaryRuntime | null | undefined,
): ProductionCanaryMode {
  if (env?.TRACE_DEPLOYMENT_ENV !== 'production') return { kind: 'non-production' };
  if (env.TRACE_CANARY_MODE === 'closed') return { kind: 'closed' };
  if (env.TRACE_CANARY_MODE !== 'fixture') return { kind: 'closed' };

  const fixture = configuredFixture(env);
  return fixture ? { kind: 'fixture', fixture } : { kind: 'closed' };
}

export function buildProductionCanaryRuntimeVariables(
  configuration: ProductionCanaryVariableConfiguration,
  environment: Record<string, string | undefined>,
) {
  if (
    configuration.fixtureCanaryEnvironment.owner !== 'TRACE_CANARY_GITHUB_OWNER' ||
    configuration.fixtureCanaryEnvironment.repository !== 'TRACE_CANARY_GITHUB_REPOSITORY' ||
    configuration.fixtureCanaryEnvironment.repositoryId !== 'TRACE_CANARY_GITHUB_REPOSITORY_ID'
  ) {
    throw new Error('Fixture deployment variable names do not match the allowlist contract.');
  }

  const variables = {
    TRACE_DEPLOYMENT_ENV: configuration.deploymentEnv,
    TRACE_DATABASE_DRIVER: configuration.databaseDriver,
    TRACE_CANARY_MODE: configuration.canaryMode,
  };
  if (configuration.canaryMode === 'closed') return variables;

  const owner = environment[configuration.fixtureCanaryEnvironment.owner];
  const repository = environment[configuration.fixtureCanaryEnvironment.repository];
  const repositoryId = environment[configuration.fixtureCanaryEnvironment.repositoryId];
  if (!owner || !repository || !repositoryId) {
    throw new Error(
      'Fixture deployment requires the exact authorized owner, repository, and repository ID.',
    );
  }

  const mode = resolveProductionCanaryMode({
    ...variables,
    TRACE_CANARY_GITHUB_OWNER: owner,
    TRACE_CANARY_GITHUB_REPOSITORY: repository,
    TRACE_CANARY_GITHUB_REPOSITORY_ID: repositoryId,
  });
  if (mode.kind !== 'fixture') {
    throw new Error(
      'Fixture deployment requires the exact authorized owner, repository, and repository ID.',
    );
  }

  return {
    ...variables,
    TRACE_CANARY_GITHUB_OWNER: owner,
    TRACE_CANARY_GITHUB_REPOSITORY: repository,
    TRACE_CANARY_GITHUB_REPOSITORY_ID: repositoryId,
  };
}

export function isClosedProductionCanary(env: ProductionCanaryRuntime | null | undefined) {
  return resolveProductionCanaryMode(env).kind === 'closed';
}

function eligibilityForMode(mode: ProductionCanaryMode): CanaryEligibility {
  return mode.kind === 'closed' ? { allowed: false, reason: 'closed' } : { allowed: true };
}

export function productionCanaryIntegrationEligibility(
  env: ProductionCanaryRuntime | null | undefined,
): CanaryEligibility {
  return eligibilityForMode(resolveProductionCanaryMode(env));
}

export function canaryUserEligibility(
  env: ProductionCanaryRuntime | null | undefined,
  user: GitHubUserIdentity,
): CanaryEligibility {
  const mode = resolveProductionCanaryMode(env);
  if (mode.kind !== 'fixture') return eligibilityForMode(mode);
  const login = normalizeGitHubIdentity(user?.githubLogin, githubLoginPattern);
  return login === mode.fixture.owner
    ? { allowed: true }
    : { allowed: false, reason: 'fixture-user' };
}

function repositoryIdMatches(value: unknown, expected: number) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value === expected;
  return typeof value === 'string' && value === String(expected);
}

function fixtureRepositoryRecordMatches(
  value: unknown,
  fixture: typeof AUTHORIZED_FIXTURE_REPOSITORY,
) {
  if (!isRecord(value)) return false;
  return (
    repositoryIdMatches(value.githubRepositoryId, fixture.repositoryId) &&
    matchesExact(value.owner, fixture.owner, githubLoginPattern) &&
    matchesExact(value.name, fixture.repository, repositoryNamePattern) &&
    matchesExact(value.fullName, fixture.fullName, /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i)
  );
}

export function canaryRepositorySelectionEligibility(
  env: ProductionCanaryRuntime | null | undefined,
  value: unknown,
): CanaryEligibility {
  const mode = resolveProductionCanaryMode(env);
  if (mode.kind !== 'fixture') return eligibilityForMode(mode);
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !fixtureRepositoryRecordMatches(value[0], mode.fixture) ||
    !isRecord(value[0]) ||
    !matchesExact(value[0].installationAccountLogin, mode.fixture.owner, githubLoginPattern)
  ) {
    return { allowed: false, reason: 'fixture-repository' };
  }
  return { allowed: true };
}

export function canaryWebhookRecoveryEligibility(
  env: ProductionCanaryRuntime | null | undefined,
  value: unknown,
): CanaryEligibility {
  const mode = resolveProductionCanaryMode(env);
  if (mode.kind !== 'fixture') return eligibilityForMode(mode);
  const repository = isRecord(value) ? value.repository : null;
  const installation = isRecord(value) ? value.installation : null;
  if (
    !isRecord(value) ||
    !isRecord(repository) ||
    !isRecord(installation) ||
    ![
      value.deliveryOrganizationId,
      value.deliveryRepositoryId,
      value.deliveryInstallationId,
      repository.recordId,
      repository.organizationId,
      repository.installationId,
      installation.recordId,
      installation.organizationId,
      installation.providerId,
    ].every((reference) => typeof reference === 'string' && reference.length > 0)
  ) {
    return { allowed: false, reason: 'fixture-recovery' };
  }

  if (
    value.deliveryRepositoryId !== repository.recordId ||
    value.deliveryOrganizationId !== repository.organizationId ||
    value.deliveryOrganizationId !== installation.organizationId ||
    repository.installationId !== installation.recordId ||
    value.deliveryInstallationId !== installation.providerId ||
    !matchesExact(installation.accountLogin, mode.fixture.owner, githubLoginPattern) ||
    !fixtureRepositoryRecordMatches(repository, mode.fixture)
  ) {
    return { allowed: false, reason: 'fixture-recovery' };
  }
  return { allowed: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesExact(value: unknown, expected: string, pattern: RegExp) {
  const normalized = normalizeGitHubIdentity(value, pattern);
  return normalized !== null && normalized === expected;
}

function rawRepositoryMatches(value: unknown, fixture: typeof AUTHORIZED_FIXTURE_REPOSITORY) {
  if (!isRecord(value) || value.id !== fixture.repositoryId) return false;

  if (Object.hasOwn(value, 'owner')) {
    const owner = value.owner;
    if (!isRecord(owner) || !matchesExact(owner.login, fixture.owner, githubLoginPattern)) {
      return false;
    }
  }
  if (
    Object.hasOwn(value, 'name') &&
    !matchesExact(value.name, fixture.repository, repositoryNamePattern)
  ) {
    return false;
  }
  if (
    Object.hasOwn(value, 'full_name') &&
    !matchesExact(value.full_name, fixture.fullName, /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i)
  ) {
    return false;
  }
  return true;
}

function installationAccountMatches(value: unknown, owner: string) {
  if (!isRecord(value) || !isRecord(value.account)) return false;
  if (!Number.isSafeInteger(value.id) || (value.id as number) <= 0) return false;
  return matchesExact(value.account.login, owner, githubLoginPattern);
}

function repositoryCollectionMatches(
  payload: Record<string, unknown>,
  key: string,
  fixture: typeof AUTHORIZED_FIXTURE_REPOSITORY,
  required = false,
) {
  if (!Object.hasOwn(payload, key)) return !required;
  const collection = payload[key];
  return (
    Array.isArray(collection) &&
    collection.every((repository) => rawRepositoryMatches(repository, fixture))
  );
}

function referencedPullRequestRepositoriesMatch(
  payload: Record<string, unknown>,
  fixture: typeof AUTHORIZED_FIXTURE_REPOSITORY,
) {
  if (!Object.hasOwn(payload, 'pull_request')) return true;
  if (!isRecord(payload.pull_request)) return false;

  for (const side of ['head', 'base']) {
    const reference = payload.pull_request[side];
    if (!isRecord(reference) || !rawRepositoryMatches(reference.repo, fixture)) return false;
  }
  return true;
}

function allPresentRepositoryReferencesMatch(
  payload: Record<string, unknown>,
  fixture: typeof AUTHORIZED_FIXTURE_REPOSITORY,
) {
  if (Object.hasOwn(payload, 'repository') && !rawRepositoryMatches(payload.repository, fixture)) {
    return false;
  }

  for (const key of ['repositories', 'repositories_added', 'repositories_removed']) {
    if (!repositoryCollectionMatches(payload, key, fixture)) return false;
  }
  return referencedPullRequestRepositoriesMatch(payload, fixture);
}

export function canaryInstallationSnapshotEligibility(
  env: ProductionCanaryRuntime | null | undefined,
  value: unknown,
): CanaryEligibility {
  const mode = resolveProductionCanaryMode(env);
  if (mode.kind !== 'fixture') return eligibilityForMode(mode);

  if (!isRecord(value) || !isRecord(value.installation) || !Array.isArray(value.repositories)) {
    return { allowed: false, reason: 'fixture-installation' };
  }
  const repositories = value.repositories;
  if (
    !Number.isSafeInteger(value.installation.id) ||
    (value.installation.id as number) <= 0 ||
    (value.installation.accountType !== 'User' &&
      value.installation.accountType !== 'Organization') ||
    !matchesExact(value.installation.accountLogin, mode.fixture.owner, githubLoginPattern) ||
    repositories.length !== 1
  ) {
    return { allowed: false, reason: 'fixture-installation' };
  }

  const [repository] = repositories;
  if (
    !isRecord(repository) ||
    repository.id !== mode.fixture.repositoryId ||
    !matchesExact(repository.owner, mode.fixture.owner, githubLoginPattern) ||
    !matchesExact(repository.name, mode.fixture.repository, repositoryNamePattern) ||
    !matchesExact(repository.fullName, mode.fixture.fullName, /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i)
  ) {
    return { allowed: false, reason: 'fixture-installation' };
  }
  return { allowed: true };
}

const repositoryBoundEvents = new Set(['repository', 'pull_request', 'push', 'issues']);

export function canaryWebhookPayloadEligibility(
  env: ProductionCanaryRuntime | null | undefined,
  eventName: string,
  value: unknown,
): CanaryEligibility {
  const mode = resolveProductionCanaryMode(env);
  if (mode.kind !== 'fixture') return eligibilityForMode(mode);
  if (!isRecord(value)) return { allowed: false, reason: 'fixture-webhook' };

  const installation = value.installation;
  if (installation !== undefined && !installationAccountMatches(installation, mode.fixture.owner)) {
    return { allowed: false, reason: 'fixture-webhook' };
  }

  if (repositoryBoundEvents.has(eventName)) {
    if (
      !rawRepositoryMatches(value.repository, mode.fixture) ||
      (eventName === 'pull_request' &&
        !referencedPullRequestRepositoriesMatch(value, mode.fixture)) ||
      !allPresentRepositoryReferencesMatch(value, mode.fixture)
    ) {
      return { allowed: false, reason: 'fixture-webhook' };
    }
    return { allowed: true };
  }

  if (eventName === 'installation') {
    if (
      !installationAccountMatches(installation, mode.fixture.owner) ||
      !isRecord(installation) ||
      (installation.repository_selection !== undefined &&
        installation.repository_selection !== 'selected') ||
      !Array.isArray(value.repositories) ||
      value.repositories.length !== 1 ||
      !value.repositories.every((repository) => rawRepositoryMatches(repository, mode.fixture)) ||
      !allPresentRepositoryReferencesMatch(value, mode.fixture)
    ) {
      return { allowed: false, reason: 'fixture-webhook' };
    }
    return { allowed: true };
  }

  if (eventName === 'installation_repositories') {
    if (
      !installationAccountMatches(installation, mode.fixture.owner) ||
      value.repository_selection !== 'selected' ||
      !Array.isArray(value.repositories_added) ||
      !Array.isArray(value.repositories_removed) ||
      value.repositories_added.length + value.repositories_removed.length === 0 ||
      !allPresentRepositoryReferencesMatch(value, mode.fixture)
    ) {
      return { allowed: false, reason: 'fixture-webhook' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'fixture-webhook' };
}

export function productionCanaryGateResponse(eligibility: CanaryEligibility) {
  if (eligibility.allowed) throw new Error('An allowed canary decision has no denial response.');
  if (eligibility.reason === 'closed') return productionCanaryClosedResponse();
  return Response.json(
    { error: 'This activity is not allowed during the production fixture canary.' },
    { status: 403, headers: { 'cache-control': 'no-store' } },
  );
}

export function productionCanaryClosedResponse() {
  return Response.json(
    { error: 'GitHub integration is disabled during the closed production canary.' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}
