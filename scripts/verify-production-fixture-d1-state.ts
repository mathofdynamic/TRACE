import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertExpectedProductionFixtureCounts,
  isPostInstallationStage,
  assertProductionFixtureForeignKeys,
  assertProductionFixtureIdentity,
  buildProductionFixtureOnboardingEvidence,
  buildProductionFixtureIdentityQuery,
  formatProductionFixtureD1State,
  parseProductionApplicationCountsResult,
  parseProductionFixtureD1Stage,
  parseProductionFixtureIdentityResult,
  productionFixtureD1State,
  validateReadOnlySql,
  type FixtureD1Identity,
  type ProductionFixtureD1Stage,
} from './production-fixture-d1-state.js';
import { buildProductionApplicationCountsSql } from './production-canary-d1.js';

const cloudflareApiOrigin = 'https://api.cloudflare.com';
type CloudflareEnvelope<T> = { success?: unknown; result?: T; errors?: unknown };

function fail(message: string): never {
  throw new Error(`Production fixture D1 state verification failed: ${message}`);
}

function assertEnvironment(environment: Record<string, string | undefined>) {
  if (environment.CLOUDFLARE_ACCOUNT_ID !== productionFixtureD1State.accountId) {
    fail('Cloudflare account ID does not match the approved production account.');
  }
  if (environment.TRACE_PRODUCTION_D1_ID !== productionFixtureD1State.databaseId) {
    fail('D1 ID does not match the approved production database.');
  }
  if (typeof environment.CLOUDFLARE_API_TOKEN !== 'string' || !environment.CLOUDFLARE_API_TOKEN) {
    fail('The protected Cloudflare credential is unavailable.');
  }
  return environment.CLOUDFLARE_API_TOKEN;
}

function assertCloudflareRequest(method: string, urlValue: string, sql?: string) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    fail('A Cloudflare request URL was invalid.');
  }
  const expectedQueryPath = `/client/v4/accounts/${productionFixtureD1State.accountId}/d1/database/${productionFixtureD1State.databaseId}/query`;
  const expectedMetricsPath = `/client/v4/accounts/${productionFixtureD1State.accountId}/queues/${productionFixtureD1State.queueId}/metrics`;
  if (
    url.origin !== cloudflareApiOrigin ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    fail('A Cloudflare request URL was outside the approved API origin.');
  }
  if (method === 'POST' && url.pathname === expectedQueryPath && sql !== undefined) {
    validateReadOnlySql(sql);
    return;
  }
  if (method === 'GET' && url.pathname === expectedMetricsPath) return;
  fail('A Cloudflare method or endpoint was outside the read-only D1/Queue allowlist.');
}

async function cloudflareRequest<T>(input: {
  path: string;
  token: string;
  method: 'GET' | 'POST';
  sql?: string;
  params?: readonly unknown[];
  fetchImplementation: typeof fetch;
}): Promise<T> {
  const url = new URL(`/client/v4${input.path}`, cloudflareApiOrigin);
  assertCloudflareRequest(input.method, url.href, input.sql);
  let response: Response;
  try {
    response = await input.fetchImplementation(url, {
      method: input.method,
      redirect: 'error',
      headers: {
        authorization: `Bearer ${input.token}`,
        ...(input.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(input.method === 'POST'
        ? { body: JSON.stringify({ sql: input.sql, params: input.params ?? [] }) }
        : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail(`Cloudflare ${input.method} ${url.pathname} failed before a response.`);
  }

  let envelope: CloudflareEnvelope<T>;
  try {
    envelope = (await response.json()) as CloudflareEnvelope<T>;
  } catch {
    fail(
      `Cloudflare ${input.method} ${url.pathname} returned invalid JSON (HTTP ${response.status}).`,
    );
  }
  if (!response.ok || envelope.success !== true || envelope.result === undefined) {
    fail(`Cloudflare ${input.method} ${url.pathname} failed (HTTP ${response.status}).`);
  }
  return envelope.result;
}

function parseForeignKeyRows(result: unknown) {
  if (
    !Array.isArray(result) ||
    result.length !== 1 ||
    typeof result[0] !== 'object' ||
    result[0] === null ||
    !Array.isArray((result[0] as { results?: unknown }).results)
  ) {
    fail('Production D1 foreign-key check returned an invalid result set.');
  }
  return (result[0] as { results: unknown[] }).results;
}

function parseQueueBacklog(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Number.isSafeInteger((value as { backlog_count?: unknown }).backlog_count) ||
    (value as { backlog_count: number }).backlog_count !== 0
  ) {
    fail('Production Queue backlog is unavailable or nonzero.');
  }
  return (value as { backlog_count: number }).backlog_count;
}

export async function verifyProductionFixtureD1State(input: {
  stage: ProductionFixtureD1Stage;
  installationId?: string;
  environment: Record<string, string | undefined>;
  fetchImplementation?: typeof fetch;
}) {
  const token = assertEnvironment(input.environment);
  const fetchImplementation = input.fetchImplementation ?? fetch;
  if (isPostInstallationStage(input.stage) && !input.installationId) {
    fail('The external installation ID is required for post-install verification.');
  }

  const countsResult = await cloudflareRequest<unknown>({
    path: `/accounts/${productionFixtureD1State.accountId}/d1/database/${productionFixtureD1State.databaseId}/query`,
    token,
    method: 'POST',
    sql: buildProductionApplicationCountsSql(),
    fetchImplementation,
  });
  const counts = parseProductionApplicationCountsResult(countsResult);
  assertExpectedProductionFixtureCounts(input.stage, counts);

  let identity: FixtureD1Identity | undefined;
  if (input.stage !== 'before-oauth') {
    const identityQuery = buildProductionFixtureIdentityQuery(input.stage, input.installationId);
    const identityResult = await cloudflareRequest<unknown>({
      path: `/accounts/${productionFixtureD1State.accountId}/d1/database/${productionFixtureD1State.databaseId}/query`,
      token,
      method: 'POST',
      sql: identityQuery.sql,
      params: identityQuery.params,
      fetchImplementation,
    });
    identity = parseProductionFixtureIdentityResult(identityResult);
    assertProductionFixtureIdentity(input.stage, identity);
  }

  const foreignKeyResult = await cloudflareRequest<unknown>({
    path: `/accounts/${productionFixtureD1State.accountId}/d1/database/${productionFixtureD1State.databaseId}/query`,
    token,
    method: 'POST',
    sql: 'PRAGMA foreign_key_check',
    fetchImplementation,
  });
  const foreignKeyViolations = parseForeignKeyRows(foreignKeyResult);
  assertProductionFixtureForeignKeys(foreignKeyViolations);

  const queueResult = await cloudflareRequest<unknown>({
    path: `/accounts/${productionFixtureD1State.accountId}/queues/${productionFixtureD1State.queueId}/metrics`,
    token,
    method: 'GET',
    fetchImplementation,
  });
  const queueBacklogCount = parseQueueBacklog(queueResult);

  let health: Response;
  try {
    health = await fetchImplementation(productionFixtureD1State.healthUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail('Production health check failed before receiving a response.');
  }
  if (health.status !== 200)
    fail(`Production health returned HTTP ${health.status}, expected 200.`);

  let onboardingEvidence: ReturnType<typeof buildProductionFixtureOnboardingEvidence> | undefined;
  if (input.stage === 'after-onboarding') {
    if (!identity) fail('Production fixture onboarding identity was not checked.');
    onboardingEvidence = buildProductionFixtureOnboardingEvidence(identity);
  }

  return {
    stage: input.stage,
    counts,
    foreignKeyViolations: 0,
    queueBacklogCount,
    healthStatus: health.status,
    onboardingEvidence,
  } as const;
}

async function main() {
  try {
    const stage = parseProductionFixtureD1Stage(process.env.FIXTURE_D1_STAGE);
    const installationId = process.env.FIXTURE_INSTALLATION_ID || undefined;
    const result = await verifyProductionFixtureD1State({
      stage,
      installationId,
      environment: process.env,
    });
    console.log(
      formatProductionFixtureD1State({
        stage: result.stage,
        counts: result.counts,
        foreignKeyViolations: result.foreignKeyViolations,
        queueBacklogCount: result.queueBacklogCount,
        onboardingEvidence: result.onboardingEvidence,
      }),
    );
    console.log(`PRODUCTION_HEALTH=${result.healthStatus}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Production fixture D1 check failed.');
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
