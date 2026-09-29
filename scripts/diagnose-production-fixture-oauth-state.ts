import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProductionApplicationCountsSql,
  parseProductionApplicationCountsResult,
} from './production-canary-d1.js';
import { productionFixtureD1State, validateReadOnlySql } from './production-fixture-d1-state.js';
import {
  buildProductionFixtureOAuthAccountSummarySql,
  buildProductionFixtureOAuthLinksParams,
  buildProductionFixtureOAuthLinksSql,
  formatProductionFixtureOAuthDiagnostic,
  parseProductionFixtureForeignKeyViolations,
  parseProductionFixtureOAuthAccountSummary,
  parseProductionFixtureOAuthLinks,
  parseProductionFixtureQueueBacklog,
  productionFixtureOAuthDiagnosticEndpoints,
  type ProductionFixtureOAuthDiagnostic,
} from './production-fixture-oauth-diagnostic.js';

const productionQueueMetricsPath = `/client/v4/accounts/${productionFixtureD1State.accountId}/queues/${productionFixtureD1State.queueId}/metrics`;
const productionD1QueryPath = `/client/v4/accounts/${productionFixtureD1State.accountId}/d1/database/${productionFixtureD1State.databaseId}/query`;
const cloudflareApiOrigin = productionFixtureOAuthDiagnosticEndpoints.cloudflareOrigin;

type CloudflareEnvelope<T> = { success?: unknown; result?: T };
type DiagnosticEnvironment = Record<string, string | undefined>;

function fail(message: string): never {
  throw new Error(`Production fixture OAuth diagnostic failed: ${message}`);
}

function assertEnvironment(environment: DiagnosticEnvironment) {
  if (environment.CLOUDFLARE_ACCOUNT_ID !== productionFixtureD1State.accountId) {
    fail('Cloudflare account ID does not match the approved production account.');
  }
  if (environment.TRACE_PRODUCTION_D1_ID !== productionFixtureD1State.databaseId) {
    fail('D1 ID does not match the approved production database.');
  }
  const token = environment.CLOUDFLARE_API_TOKEN;
  if (typeof token !== 'string' || token.length === 0) {
    fail('The protected Cloudflare credential is unavailable.');
  }
  return token;
}

function assertAllowedCloudflareRequest(method: string, urlValue: string, sql?: string) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    fail('A Cloudflare request URL was invalid.');
  }
  if (
    url.origin !== cloudflareApiOrigin ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    fail('A Cloudflare request URL was outside the approved API origin.');
  }
  if (method === 'POST' && url.pathname === productionD1QueryPath && sql !== undefined) {
    validateReadOnlySql(sql);
    return;
  }
  if (method === 'GET' && url.pathname === productionQueueMetricsPath) return;
  fail('A Cloudflare method or endpoint was outside the read-only D1/Queue allowlist.');
}

async function cloudflareRequest<T>(input: {
  token: string;
  method: 'GET' | 'POST';
  path: string;
  sql?: string;
  params?: readonly unknown[];
  fetchImplementation: typeof fetch;
}): Promise<T> {
  const url = new URL(input.path, cloudflareApiOrigin);
  assertAllowedCloudflareRequest(input.method, url.href, input.sql);
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

async function readD1(
  token: string,
  fetchImplementation: typeof fetch,
  sql: string,
  params: readonly unknown[] = [],
) {
  validateReadOnlySql(sql);
  return cloudflareRequest<unknown>({
    token,
    method: 'POST',
    path: productionD1QueryPath,
    sql,
    params,
    fetchImplementation,
  });
}

export async function diagnoseProductionFixtureOAuthState(input: {
  environment: DiagnosticEnvironment;
  fetchImplementation?: typeof fetch;
  now?: number;
  observedAtUtc?: string;
  onCounts?: (counts: ProductionFixtureOAuthDiagnostic['counts']) => void;
}) {
  const token = assertEnvironment(input.environment);
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const now = input.now ?? Date.now();

  const countsResult = await readD1(
    token,
    fetchImplementation,
    buildProductionApplicationCountsSql(),
  );
  const counts = parseProductionApplicationCountsResult(countsResult);
  input.onCounts?.(counts);

  const accountSummaryResult = await readD1(
    token,
    fetchImplementation,
    buildProductionFixtureOAuthAccountSummarySql(),
    [productionFixtureD1State.githubLogin, productionFixtureD1State.githubLogin],
  );
  const accountSummary = parseProductionFixtureOAuthAccountSummary(accountSummaryResult);

  const linksResult = await readD1(
    token,
    fetchImplementation,
    buildProductionFixtureOAuthLinksSql(),
    buildProductionFixtureOAuthLinksParams(now),
  );
  const links = parseProductionFixtureOAuthLinks(linksResult);

  const foreignKeyResult = await readD1(token, fetchImplementation, 'PRAGMA foreign_key_check');
  const foreignKeyViolations = parseProductionFixtureForeignKeyViolations(foreignKeyResult);

  let queueBacklogCount: number | null = null;
  try {
    const queueResult = await cloudflareRequest<unknown>({
      token,
      method: 'GET',
      path: productionQueueMetricsPath,
      fetchImplementation,
    });
    queueBacklogCount = parseProductionFixtureQueueBacklog(queueResult);
  } catch {
    queueBacklogCount = null;
  }

  let healthStatus: number | null = null;
  try {
    const health = await fetchImplementation(productionFixtureOAuthDiagnosticEndpoints.healthUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    healthStatus = health.status;
  } catch {
    healthStatus = null;
  }

  return {
    observedAtUtc: input.observedAtUtc ?? new Date().toISOString(),
    counts,
    ...accountSummary,
    ...links,
    foreignKeyViolations,
    queueBacklogCount,
    healthStatus,
  } satisfies ProductionFixtureOAuthDiagnostic;
}

async function main() {
  try {
    const diagnostic = await diagnoseProductionFixtureOAuthState({
      environment: process.env,
      onCounts: (counts) => {
        console.log(`APPLICATION_TABLES=${Object.keys(counts).length}`);
        for (const [table, count] of Object.entries(counts)) {
          console.log(`${table.toUpperCase()}=${count}`);
        }
      },
    });
    console.log(
      formatProductionFixtureOAuthDiagnostic(diagnostic, { includeApplicationCounts: false }),
    );
    if (diagnostic.queueBacklogCount === null || diagnostic.healthStatus === null) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Production fixture OAuth diagnostic failed.',
    );
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
