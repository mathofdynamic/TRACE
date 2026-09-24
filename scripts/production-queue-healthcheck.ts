import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { parseCloudflareQueueMessage } from '../packages/trace-core/src/queue.js';

const EXPECTED_SOURCE_SHA = '221606dcd57f8191ff2263a68b74d79eb6a45688';
const ACCOUNT_ID = 'c5d6cf110905c91fc3eed1abaf8236a2';
const PRODUCTION_WORKER = 'trace-production';
const PRODUCTION_WORKER_VERSION = 'ead868f1-0f5d-4e45-939c-3e6349ed8f86';
const PRODUCTION_DEPLOYMENT_ID = '8d7306ce-a385-49cd-b095-0ebb2c3dc30d';
const PRODUCTION_D1_ID = '7a566f2e-da27-46e7-8c3f-271e5566f225';
const PRODUCTION_QUEUE = 'trace-production-jobs';
const PRODUCTION_QUEUE_ID = '9ef092975a554ba296a63b162b16522f';
const PRODUCTION_URL = 'https://trace-production.mathofdynamic2.workers.dev';
const STAGING_WORKER = 'trace-test-staging';
const STAGING_WORKER_VERSION = '5930a184-d797-4b70-9aee-d7f0647ab1fa';
const STAGING_D1_ID = 'c4df63bc-8270-4500-9dab-c1c6439efa64';
const STAGING_QUEUE = 'trace-staging-jobs';
const STAGING_URL = 'https://trace-code.pages.dev';
const API_ROOT = 'https://api.cloudflare.com/client/v4';
const APP_TABLES = [
  'accounts',
  'analysis_findings',
  'analysis_runs',
  'audit_events',
  'cli_connections',
  'cli_device_authorizations',
  'github_installation_repositories',
  'github_installations',
  'github_issues',
  'github_pull_requests',
  'github_repositories',
  'github_webhook_deliveries',
  'memberships',
  'onboarding_profiles',
  'organizations',
  'sessions',
  'sync_operations',
  'sync_uploads',
  'synced_artifacts',
  'system_jobs',
  'users',
  'verifications',
] as const;

type ApiEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number }>;
};

type Deployment = {
  id?: string;
  versions?: Array<{ version_id?: string; percentage?: number }>;
};

type WorkerBinding = {
  name?: string;
  type?: string;
  database_id?: string;
  id?: string;
  queue_name?: string;
  text?: string;
};

type WorkerVersion = {
  id?: string;
  resources?: { bindings?: WorkerBinding[] };
};

type QueueConsumer = {
  queue_name?: string;
  script_name?: string;
  type?: string;
  settings?: {
    max_batch_size?: number;
    max_batch_timeout?: number;
    max_retries?: number;
    retry_delay?: number;
  };
};

type QueueDetails = {
  queue_id?: string;
  queue_name?: string;
  producers_total_count?: number;
  producers?: Array<{ script?: string; type?: string }>;
  consumers_total_count?: number;
  consumers?: QueueConsumer[];
};

type QueueMetrics = { backlog_count?: number; backlog_bytes?: number };

export function buildApplicationCountsSql() {
  return `SELECT 1 AS ok, ${APP_TABLES.map(
    (table) => `(SELECT COUNT(*) FROM "${table}") AS "${table}"`,
  ).join(', ')}`;
}

export function createHealthcheckMessage(probeId: string, enqueuedAt: string) {
  return parseCloudflareQueueMessage({
    version: '1',
    type: 'system.healthcheck',
    idempotencyKey: `cf4.16b-${probeId}`,
    enqueuedAt,
    probeId,
  });
}

function fail(message: string): never {
  throw new Error(message);
}

function validateLocalContract() {
  const db = new DatabaseSync(':memory:');
  try {
    const root = process.cwd();
    for (const migration of ['0000_cheerful_legion.sql', '0001_goofy_lester.sql']) {
      const sql = readFileSync(path.join(root, 'packages/db/drizzle-d1', migration), 'utf8');
      db.exec(sql);
    }
    const result = db.prepare(buildApplicationCountsSql()).get() as Record<string, number>;
    if (result.ok !== 1 || APP_TABLES.some((table) => result[table] !== 0)) {
      fail('Local migration-backed D1 count query did not return empty tables.');
    }
    const message = createHealthcheckMessage(
      'cf4.16b-local-validation',
      '2026-09-24T00:00:00.000Z',
    );
    if (
      message.type !== 'system.healthcheck' ||
      message.version !== '1' ||
      Object.keys(message).sort().join(',') !==
        ['enqueuedAt', 'idempotencyKey', 'probeId', 'type', 'version'].sort().join(',')
    ) {
      fail('The healthcheck message does not match the strict TRACE contract.');
    }
  } finally {
    db.close();
  }
  console.log(
    'Local migrations 0000/0001, application-count SQL, and strict healthcheck parser: PASS',
  );
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) fail(`Required GitHub environment value ${name} is absent.`);
  return value;
}

function validateReleaseContext() {
  const sourceSha = requiredEnv('RELEASE_SHA').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceSha) || sourceSha !== EXPECTED_SOURCE_SHA) {
    fail('The requested source SHA is not the verified deployed release.');
  }
  if (process.env.GITHUB_REF !== 'refs/heads/feat/cloudflare-native-runtime') {
    fail('The workflow must run from feat/cloudflare-native-runtime.');
  }
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    fail('The healthcheck workflow is manual-only.');
  }
  if (process.env.GITHUB_RUN_ATTEMPT !== '1') {
    fail('A workflow run may publish at most one message; reruns are disabled.');
  }
  if (!/^[0-9a-f]{40}$/i.test(requiredEnv('GITHUB_SHA'))) {
    fail('The workflow source commit is invalid.');
  }
  if (!requiredEnv('CLOUDFLARE_API_TOKEN')) {
    fail('The production Cloudflare environment secret is absent.');
  }
  if (requiredEnv('CLOUDFLARE_ACCOUNT_ID') !== ACCOUNT_ID) {
    fail('Cloudflare account ID does not match the production account.');
  }
  if (requiredEnv('TRACE_PRODUCTION_D1_ID') !== PRODUCTION_D1_ID) {
    fail('The production D1 ID does not match the verified resource.');
  }
  if (requiredEnv('TRACE_PRODUCTION_QUEUE_NAME') !== PRODUCTION_QUEUE) {
    fail('The production Queue name does not match the verified resource.');
  }
  if (requiredEnv('TRACE_PRODUCTION_WORKER_NAME') !== PRODUCTION_WORKER) {
    fail('The production Worker name does not match the verified resource.');
  }

  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceSha, 'HEAD'], {
      stdio: 'ignore',
    });
    execFileSync('git', ['diff', '--quiet', sourceSha, 'HEAD', '--', 'apps', 'packages'], {
      stdio: 'ignore',
    });
  } catch {
    fail('Application/package source differs from the verified deployed release.');
  }
  console.log(`Release source verified: ${sourceSha}`);
  console.log(
    `GitHub Actions run: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  );
}

function cloudflareHeaders() {
  return {
    authorization: `Bearer ${requiredEnv('CLOUDFLARE_API_TOKEN')}`,
    'content-type': 'application/json',
  };
}

async function cloudflareRequest<T>(
  apiPath: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${apiPath}`, {
      method: options.method ?? 'GET',
      headers: cloudflareHeaders(),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail(`Cloudflare API transport failed for ${options.method ?? 'GET'} ${apiPath}.`);
  }

  let payload: ApiEnvelope<T> | undefined;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    fail(
      `Cloudflare API returned a non-JSON response for ${options.method ?? 'GET'} ${apiPath} (HTTP ${response.status}).`,
    );
  }
  if (!response.ok || payload?.success !== true) {
    const codes = (payload?.errors ?? [])
      .map((error) => error.code)
      .filter((code): code is number => typeof code === 'number');
    fail(
      `Cloudflare API ${options.method ?? 'GET'} ${apiPath} failed: HTTP ${response.status}; error codes ${codes.join(',') || 'unavailable'}.`,
    );
  }
  return payload.result as T;
}

function activeDeployment(
  deployments: Deployment[] | undefined,
  expectedVersion: string,
  expectedId?: string,
) {
  const deployment = deployments?.[0];
  const versions = deployment?.versions ?? [];
  if (
    !deployment?.id ||
    versions.length !== 1 ||
    versions[0]?.version_id !== expectedVersion ||
    versions[0]?.percentage !== 100 ||
    (expectedId && deployment.id !== expectedId)
  ) {
    fail('Worker deployment/version/traffic does not match the verified baseline.');
  }
  return { deploymentId: deployment.id, versionId: expectedVersion };
}

function getBinding(bindings: WorkerBinding[], type: string, name: string) {
  const matches = bindings.filter((binding) => binding.type === type && binding.name === name);
  if (matches.length !== 1) fail(`Worker binding ${name} (${type}) is missing or ambiguous.`);
  return matches[0]!;
}

async function verifyWorker(
  workerName: string,
  expectedVersion: string,
  options: {
    expectedDeploymentId?: string;
    environment: 'production' | 'staging';
  },
) {
  const deployments = await cloudflareRequest<{ deployments?: Deployment[] }>(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${workerName}/deployments`,
  );
  const deployment = activeDeployment(
    deployments.deployments,
    expectedVersion,
    options.expectedDeploymentId,
  );
  const version = await cloudflareRequest<WorkerVersion>(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${workerName}/versions/${deployment.versionId}`,
  );
  if (version.id !== deployment.versionId || !Array.isArray(version.resources?.bindings)) {
    fail(`Worker ${workerName} version metadata is incomplete.`);
  }
  const bindings = version.resources.bindings;
  const d1Bindings = bindings.filter((binding) => binding.type === 'd1');
  const queueBindings = bindings.filter((binding) => binding.type === 'queue');
  const expectedD1 = options.environment === 'production' ? PRODUCTION_D1_ID : STAGING_D1_ID;
  const expectedQueue = options.environment === 'production' ? PRODUCTION_QUEUE : STAGING_QUEUE;
  if (d1Bindings.length !== 1) fail(`Worker ${workerName} must have exactly one D1 binding.`);
  const database = getBinding(bindings, 'd1', 'DB');
  if ((database.database_id ?? database.id) !== expectedD1) {
    fail(`Worker ${workerName} DB binding is not the expected ${options.environment} D1.`);
  }
  if (queueBindings.length !== 1)
    fail(`Worker ${workerName} must have exactly one Queue producer binding.`);
  const queue = getBinding(bindings, 'queue', 'TRACE_QUEUE');
  if (queue.queue_name !== expectedQueue) {
    fail(
      `Worker ${workerName} Queue producer binding is not the expected ${options.environment} Queue.`,
    );
  }
  if (bindings.some((binding) => binding.type === 'hyperdrive')) {
    fail(`Worker ${workerName} unexpectedly has a Hyperdrive binding.`);
  }

  if (options.environment === 'production') {
    const vars = new Map(
      bindings
        .filter((binding) => binding.type === 'plain_text')
        .map((binding) => [binding.name, binding.text]),
    );
    if (
      vars.get('TRACE_DEPLOYMENT_ENV') !== 'production' ||
      vars.get('TRACE_DATABASE_DRIVER') !== 'd1' ||
      vars.get('TRACE_CANARY_MODE') !== 'closed'
    ) {
      fail('Production runtime variables are not D1-only closed-canary values.');
    }
  }
  return deployment;
}

async function verifyQueueConfiguration() {
  const queue = await cloudflareRequest<QueueDetails>(
    `/accounts/${ACCOUNT_ID}/queues/${PRODUCTION_QUEUE_ID}`,
  );
  if (queue.queue_id !== PRODUCTION_QUEUE_ID || queue.queue_name !== PRODUCTION_QUEUE) {
    fail('Production Queue ID/name does not match the requested target.');
  }
  const producers = queue.producers ?? [];
  const consumers = queue.consumers ?? [];
  if (
    queue.producers_total_count !== 1 ||
    producers.length !== 1 ||
    producers[0]?.type !== 'worker' ||
    producers[0]?.script !== PRODUCTION_WORKER ||
    queue.consumers_total_count !== 1 ||
    consumers.length !== 1 ||
    consumers[0]?.type !== 'worker' ||
    consumers[0]?.script_name !== PRODUCTION_WORKER ||
    consumers[0]?.queue_name !== PRODUCTION_QUEUE
  ) {
    fail('Production Queue must have trace-production as its sole producer and consumer.');
  }
  const settings = consumers[0].settings;
  if (
    settings?.max_batch_size !== 10 ||
    settings.max_batch_timeout !== 5 ||
    settings.max_retries !== 3 ||
    settings.retry_delay !== 60
  ) {
    fail('Production Queue consumer retry/batch settings differ from the verified baseline.');
  }
  return queue;
}

async function getQueueMetrics() {
  const result = await cloudflareRequest<QueueMetrics>(
    `/accounts/${ACCOUNT_ID}/queues/${PRODUCTION_QUEUE_ID}/metrics`,
  );
  if (typeof result.backlog_count !== 'number') {
    fail('Production Queue backlog metric is unavailable.');
  }
  return result;
}

async function getApplicationCounts() {
  const result = await cloudflareRequest<Array<{ results?: Array<Record<string, number>> }>>(
    `/accounts/${ACCOUNT_ID}/d1/database/${PRODUCTION_D1_ID}/query`,
    { method: 'POST', body: { sql: buildApplicationCountsSql(), params: [] } },
  );
  const row = result[0]?.results?.[0];
  if (!row || row.ok !== 1 || APP_TABLES.some((table) => Number(row[table]) !== 0)) {
    fail('Production application tables are not all empty or D1 count results are incomplete.');
  }
  return row;
}

async function verifyClosedRoutes(label: string) {
  const health = await fetch(`${PRODUCTION_URL}/api/health`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (health.status !== 200) fail(`Production health ${label} returned HTTP ${health.status}.`);

  const webhook = await fetch(`${PRODUCTION_URL}/api/github/webhooks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (webhook.status !== 503 || !webhook.headers.get('cache-control')?.includes('no-store')) {
    fail(`Production GitHub webhook route ${label} did not fail closed with cache disabled.`);
  }
  const recovery = await fetch(`${PRODUCTION_URL}/api/github/webhooks/recovery`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (recovery.status !== 401) {
    fail(`Unauthenticated recovery access ${label} returned HTTP ${recovery.status}.`);
  }
  return { health: health.status, webhook: webhook.status, recovery: recovery.status };
}

function startTail(probeId: string) {
  const configPath = path.join(os.tmpdir(), `trace-production-tail-${randomUUID()}.json`);
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        name: PRODUCTION_WORKER,
        account_id: ACCOUNT_ID,
        main: path.resolve('apps/web/custom-worker.ts'),
        compatibility_date: '2026-08-08',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const child = spawn(
    'pnpm',
    ['exec', 'wrangler', 'tail', PRODUCTION_WORKER, '--config', configPath, '--format', 'pretty'],
    {
      cwd: process.cwd(),
      env: { ...process.env, CI: 'true', NO_COLOR: '1' },
      stdio: 'pipe',
    },
  ) as ChildProcessWithoutNullStreams;
  let output = '';
  let connected = false;
  let spawnFailed = false;
  const tailText = () => output.split(String.fromCharCode(27)).join('');
  const collect = (chunk: Buffer) => {
    output = `${output}${chunk.toString('utf8')}`.slice(-500_000);
    if (output.includes(`Connected to ${PRODUCTION_WORKER}, waiting for logs`)) connected = true;
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', () => {
    spawnFailed = true;
  });
  return {
    child,
    configPath,
    get connected() {
      return connected;
    },
    get spawnFailed() {
      return spawnFailed;
    },
    get correlatedQueueEvent() {
      const clean = tailText();
      const queueEvent = new RegExp(`Queue ${PRODUCTION_QUEUE} \\(1 message\\) - Ok @`);
      return queueEvent.test(clean);
    },
    get completionLog() {
      const clean = tailText();
      return clean.includes('D1 healthcheck completed') && clean.includes(probeId);
    },
    get correlatedError() {
      const clean = tailText();
      return new RegExp(
        `Queue ${PRODUCTION_QUEUE} \\(1 message\\) - (Error|Exception|Canceled) @`,
      ).test(clean);
    },
  };
}

async function waitFor(predicate: () => boolean, milliseconds: number) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline && !predicate()) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return predicate();
}

async function stopTail(child: ChildProcessWithoutNullStreams, configPath: string) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGINT');
    await Promise.race([
      new Promise<void>((resolve) => child.once('close', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  try {
    unlinkSync(configPath);
  } catch {
    // The temporary tail configuration is best-effort cleanup only.
  }
}

async function publishOneHealthcheck() {
  validateReleaseContext();
  const productionBaseline = await verifyWorker(PRODUCTION_WORKER, PRODUCTION_WORKER_VERSION, {
    expectedDeploymentId: PRODUCTION_DEPLOYMENT_ID,
    environment: 'production',
  });
  const stagingBaseline = await verifyWorker(STAGING_WORKER, STAGING_WORKER_VERSION, {
    environment: 'staging',
  });
  const queue = await verifyQueueConfiguration();
  const beforeMetrics = await getQueueMetrics();
  if (beforeMetrics.backlog_count !== 0) {
    fail(
      `Production Queue backlog must be zero before the one-shot probe; observed ${beforeMetrics.backlog_count}.`,
    );
  }
  const beforeCounts = await getApplicationCounts();
  const beforeRoutes = await verifyClosedRoutes('before send');

  const probeId = `trace-cf416b-${randomUUID()}`;
  const enqueuedAt = new Date().toISOString();
  const message = createHealthcheckMessage(probeId, enqueuedAt);
  const tail = startTail(probeId);
  await waitFor(() => tail.connected || tail.spawnFailed || tail.child.exitCode !== null, 15_000);
  console.log(`Worker log tail connected before send: ${tail.connected ? 'yes' : 'no'}`);

  const submittedAt = new Date().toISOString();
  console.log(`Probe ID: ${probeId}`);
  console.log(`Queue submission UTC: ${submittedAt}`);
  let publish: {
    outcome: 'accepted' | 'rejected' | 'ambiguous';
    httpStatus?: number;
    errorCodes?: number[];
  } = { outcome: 'ambiguous' };
  try {
    const response = await fetch(
      `${API_ROOT}/accounts/${ACCOUNT_ID}/queues/${PRODUCTION_QUEUE_ID}/messages`,
      {
        method: 'POST',
        headers: cloudflareHeaders(),
        body: JSON.stringify({ body: message, content_type: 'json' }),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      },
    );
    let payload: ApiEnvelope<unknown> | undefined;
    try {
      payload = (await response.json()) as ApiEnvelope<unknown>;
    } catch {
      publish = { outcome: 'ambiguous', httpStatus: response.status };
      console.log(
        `HTTP Queue publish: ambiguous response (HTTP ${response.status}; non-JSON body). No retry.`,
      );
      payload = undefined;
    }
    if (payload) {
      if (response.ok && payload.success === true) {
        publish = { outcome: 'accepted', httpStatus: response.status };
        console.log(`HTTP Queue publish: accepted (HTTP ${response.status}; success=true).`);
      } else {
        const errorCodes = (payload.errors ?? [])
          .map((error) => error.code)
          .filter((code): code is number => typeof code === 'number');
        publish = { outcome: 'rejected', httpStatus: response.status, errorCodes };
        console.log(
          `HTTP Queue publish: rejected (HTTP ${response.status}; Cloudflare error codes ${errorCodes.join(',') || 'unavailable'}). No retry.`,
        );
      }
    }
  } catch {
    publish = { outcome: 'ambiguous' };
    console.log('HTTP Queue publish: transport outcome ambiguous. No retry.');
  }

  await waitFor(
    () => (tail.correlatedQueueEvent && tail.completionLog) || tail.correlatedError,
    60_000,
  );
  await stopTail(tail.child, tail.configPath);
  console.log(`Worker log tail stream was established: ${tail.connected ? 'yes' : 'no'}`);
  console.log(
    `Queue invocation outcome Ok correlated: ${tail.correlatedQueueEvent ? 'yes' : 'no'}`,
  );
  console.log(`D1 healthcheck completion log matched probe: ${tail.completionLog ? 'yes' : 'no'}`);
  console.log(`Queue invocation error correlated: ${tail.correlatedError ? 'yes' : 'no'}`);

  let afterCountsUnchanged = false;
  let afterMetrics: QueueMetrics | undefined;
  let afterRoutes: { health: number; webhook: number; recovery: number } | undefined;
  let productionAfter = false;
  let stagingAfter = false;
  try {
    const afterCounts = await getApplicationCounts();
    afterCountsUnchanged = APP_TABLES.every((table) => beforeCounts[table] === afterCounts[table]);
    afterMetrics = await getQueueMetrics();
    afterRoutes = await verifyClosedRoutes('after send');
    productionAfter =
      JSON.stringify(
        await verifyWorker(PRODUCTION_WORKER, PRODUCTION_WORKER_VERSION, {
          expectedDeploymentId: PRODUCTION_DEPLOYMENT_ID,
          environment: 'production',
        }),
      ) === JSON.stringify(productionBaseline);
    stagingAfter =
      JSON.stringify(
        await verifyWorker(STAGING_WORKER, STAGING_WORKER_VERSION, { environment: 'staging' }),
      ) === JSON.stringify(stagingBaseline);
  } catch (error) {
    console.log(
      `Post-send read-only verification: incomplete (${error instanceof Error ? error.message : 'unknown read failure'}).`,
    );
  }
  console.log(
    `Production application tables unchanged and empty: ${afterCountsUnchanged ? 'yes (22/22)' : 'no/unverified'}`,
  );
  console.log(
    `Queue backlog before/after: ${beforeMetrics.backlog_count}/${typeof afterMetrics?.backlog_count === 'number' ? afterMetrics.backlog_count : 'unknown'}`,
  );
  console.log(
    `Production health/webhook/recovery after: ${afterRoutes ? `${afterRoutes.health}/${afterRoutes.webhook}/${afterRoutes.recovery}` : 'unverified'}`,
  );
  console.log(
    `Production Worker version/deployment unchanged: ${productionAfter ? 'yes' : 'no/unverified'}`,
  );
  console.log(
    `Staging Worker version/bindings unchanged: ${stagingAfter ? 'yes' : 'no/unverified'}`,
  );

  let stagingHealth: string;
  try {
    const response = await fetch(`${STAGING_URL}/api/health`, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    stagingHealth = `HTTP ${response.status}`;
  } catch {
    stagingHealth = 'timeout/transport failure';
  }
  console.log(`Staging health (one bounded request): ${stagingHealth}`);
  console.log(
    `Queue producer/consumer: ${queue.producers?.[0]?.script}/${queue.consumers?.[0]?.script_name}; retries=3`,
  );
  console.log(
    'Acknowledgment evidence: individual ack is not exposed by the metrics API; Worker code calls ack() only after successful healthcheck handling.',
  );

  if (
    publish.outcome !== 'accepted' ||
    !tail.correlatedQueueEvent ||
    !tail.completionLog ||
    tail.correlatedError ||
    !afterCountsUnchanged ||
    afterMetrics?.backlog_count !== 0 ||
    !afterRoutes ||
    !productionAfter ||
    !stagingAfter
  ) {
    process.exitCode = 1;
  }
}

async function main() {
  if (process.argv.includes('--validate-contract')) {
    validateLocalContract();
    return;
  }
  validateLocalContract();
  await publishOneHealthcheck();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Production Queue healthcheck failed.');
  process.exitCode = 1;
});
