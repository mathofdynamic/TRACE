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
const STAGING_HYPERDRIVE_ID = '2d1e4821c1484d6299d88e29f2884310';
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
  type?: string;
  script_name?: string;
  queue_name?: string;
  settings?: {
    batch_size?: number;
    max_wait_time_ms?: number;
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

type WranglerWorkerConsumer = {
  type?: unknown;
  script?: unknown;
  queue_name?: unknown;
};

type QueueMetrics = { backlog_count?: number; backlog_bytes?: number };

function queueValue(value: unknown) {
  return value === undefined ? 'missing' : JSON.stringify(value);
}

function assertQueueField(field: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    fail(
      `Production Queue ${field} must be ${queueValue(expected)}; received ${queueValue(actual)}.`,
    );
  }
}

function assertOptionalQueueField(field: string, actual: unknown, expected: unknown) {
  if (actual !== undefined) assertQueueField(field, actual, expected);
}

function exactlyOne<T>(field: string, values: T[] | undefined) {
  if (!Array.isArray(values) || values.length !== 1) {
    fail(
      `Production Queue ${field} must contain exactly one entry; received ${Array.isArray(values) ? values.length : 'missing'}.`,
    );
  }
  return values[0]!;
}

function assertProductionQueueConfiguration(queue: QueueDetails) {
  assertQueueField('queue_id', queue.queue_id, PRODUCTION_QUEUE_ID);
  assertQueueField('queue_name', queue.queue_name, PRODUCTION_QUEUE);
  assertOptionalQueueField('producers_total_count', queue.producers_total_count, 1);
  assertOptionalQueueField('consumers_total_count', queue.consumers_total_count, 1);

  if (queue.producers !== undefined) {
    const producer = exactlyOne('producers', queue.producers);
    assertOptionalQueueField('producers[0].type', producer.type, 'worker');
    assertOptionalQueueField('producers[0].script', producer.script, PRODUCTION_WORKER);
  }

  const consumer = exactlyOne('consumers', queue.consumers);
  assertOptionalQueueField('consumers[0].type', consumer.type, 'worker');
  assertOptionalQueueField('consumers[0].script_name', consumer.script_name, PRODUCTION_WORKER);
  assertOptionalQueueField('consumers[0].queue_name', consumer.queue_name, PRODUCTION_QUEUE);
  assertQueueField('consumers[0].settings.batch_size', consumer.settings?.batch_size, 10);
  assertQueueField(
    'consumers[0].settings.max_wait_time_ms',
    consumer.settings?.max_wait_time_ms,
    5000,
  );
  assertQueueField('consumers[0].settings.max_retries', consumer.settings?.max_retries, 3);
  assertQueueField('consumers[0].settings.retry_delay', consumer.settings?.retry_delay, 60);
  return queue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertWranglerConsumerIdentity(output: unknown) {
  if (!Array.isArray(output)) {
    fail('Wrangler worker consumer JSON root must be an array.');
  }
  if (output.length !== 1) {
    fail(
      `Wrangler worker consumer list must contain exactly one entry; received ${output.length}.`,
    );
  }
  const consumer = output[0] as WranglerWorkerConsumer;
  if (!isRecord(consumer)) {
    fail('Wrangler worker consumers[0] must be a JSON object.');
  }
  assertQueueField('Wrangler consumers[0].type', consumer.type, 'worker');
  assertQueueField('Wrangler consumers[0].script', consumer.script, PRODUCTION_WORKER);
  assertOptionalQueueField(
    'Wrangler consumers[0].queue_name',
    consumer.queue_name,
    PRODUCTION_QUEUE,
  );
  return { script: PRODUCTION_WORKER, queueName: PRODUCTION_QUEUE };
}

function parseWranglerConsumerJson(stdout: string) {
  let output: unknown;
  try {
    output = JSON.parse(stdout) as unknown;
  } catch {
    fail('Wrangler worker consumer output is not valid JSON.');
  }
  return assertWranglerConsumerIdentity(output);
}

function validProductionQueueResponse(): QueueDetails {
  return {
    queue_id: PRODUCTION_QUEUE_ID,
    queue_name: PRODUCTION_QUEUE,
    producers_total_count: 1,
    producers: [{ type: 'worker', script: PRODUCTION_WORKER }],
    consumers_total_count: 1,
    consumers: [
      {
        type: 'worker',
        script_name: PRODUCTION_WORKER,
        queue_name: PRODUCTION_QUEUE,
        settings: {
          batch_size: 10,
          max_wait_time_ms: 5000,
          max_retries: 3,
          retry_delay: 60,
        },
      },
    ],
  };
}

function validWranglerConsumerOutput(): unknown {
  return [
    {
      script: PRODUCTION_WORKER,
      settings: {
        batch_size: 10,
        max_retries: 3,
        max_wait_time_ms: 5000,
        retry_delay: 60,
      },
      consumer_id: 'local-fixture-only',
      type: 'worker',
    },
  ];
}

function expectQueueConfigurationFailure(
  label: string,
  response: QueueDetails,
  expectedMessage: string,
) {
  try {
    assertProductionQueueConfiguration(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    fail(
      `${label} returned an unexpected error: ${error instanceof Error ? error.message : 'unknown error'}.`,
    );
  }
  fail(`${label} unexpectedly passed Queue configuration validation.`);
}

function expectWranglerConsumerFailure(label: string, output: unknown, expectedMessage: string) {
  try {
    assertWranglerConsumerIdentity(output);
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    fail(
      `${label} returned an unexpected error: ${error instanceof Error ? error.message : 'unknown error'}.`,
    );
  }
  fail(`${label} unexpectedly passed Wrangler consumer validation.`);
}

function validateQueueResponseContract() {
  assertProductionQueueConfiguration(validProductionQueueResponse());

  const withoutTotalCounts = validProductionQueueResponse();
  delete withoutTotalCounts.producers_total_count;
  delete withoutTotalCounts.consumers_total_count;
  assertProductionQueueConfiguration(withoutTotalCounts);

  const withoutConsumerQueueName = validProductionQueueResponse();
  delete withoutConsumerQueueName.consumers![0]!.queue_name;
  assertProductionQueueConfiguration(withoutConsumerQueueName);

  const withoutConsumerScriptName = validProductionQueueResponse();
  delete withoutConsumerScriptName.consumers![0]!.script_name;
  assertProductionQueueConfiguration(withoutConsumerScriptName);
  parseWranglerConsumerJson(JSON.stringify(validWranglerConsumerOutput()));

  const withWranglerAgreed = validProductionQueueResponse();
  assertProductionQueueConfiguration(withWranglerAgreed);
  parseWranglerConsumerJson(JSON.stringify(validWranglerConsumerOutput()));

  const withoutConsumerType = validProductionQueueResponse();
  delete withoutConsumerType.consumers![0]!.type;
  assertProductionQueueConfiguration(withoutConsumerType);

  const wrongProducer = validProductionQueueResponse();
  wrongProducer.producers![0]!.script = 'another-worker';
  expectQueueConfigurationFailure(
    'Invalid producer script',
    wrongProducer,
    'producers[0].script must be',
  );

  const wrongConsumer = validProductionQueueResponse();
  wrongConsumer.consumers![0]!.script_name = 'another-worker';
  expectQueueConfigurationFailure(
    'Invalid consumer script',
    wrongConsumer,
    'consumers[0].script_name must be',
  );

  const wrongWranglerConsumer = validProductionQueueResponse();
  delete wrongWranglerConsumer.consumers![0]!.script_name;
  assertProductionQueueConfiguration(wrongWranglerConsumer);
  const wrongWranglerIdentity = validWranglerConsumerOutput() as Array<Record<string, unknown>>;
  wrongWranglerIdentity[0]!.script = 'another-worker';
  expectWranglerConsumerFailure(
    'Wrangler reports the wrong consumer script',
    wrongWranglerIdentity,
    'Wrangler consumers[0].script must be',
  );

  expectWranglerConsumerFailure(
    'Wrangler reports multiple Worker consumers',
    [
      ...(validWranglerConsumerOutput() as unknown[]),
      ...(validWranglerConsumerOutput() as unknown[]),
    ],
    'exactly one entry',
  );

  const wrongWranglerQueue = validWranglerConsumerOutput() as Array<Record<string, unknown>>;
  wrongWranglerQueue[0]!.queue_name = 'another-queue';
  expectWranglerConsumerFailure(
    'Wrangler consumer belongs to the wrong Queue',
    wrongWranglerQueue,
    'Wrangler consumers[0].queue_name must be',
  );

  const wrongWranglerType = validWranglerConsumerOutput() as Array<Record<string, unknown>>;
  wrongWranglerType[0]!.type = 'http_pull';
  expectWranglerConsumerFailure(
    'Wrangler consumer is not a Worker',
    wrongWranglerType,
    'Wrangler consumers[0].type must be',
  );

  const wrongQueueId = validProductionQueueResponse();
  wrongQueueId.queue_id = 'wrong-id';
  expectQueueConfigurationFailure('Wrong Queue ID', wrongQueueId, 'queue_id must be');

  const wrongQueueName = validProductionQueueResponse();
  wrongQueueName.queue_name = 'another-queue';
  expectQueueConfigurationFailure('Wrong Queue name', wrongQueueName, 'queue_name must be');

  const withoutProducerScript = validProductionQueueResponse();
  delete withoutProducerScript.producers![0]!.script;
  assertProductionQueueConfiguration(withoutProducerScript);

  const wrongOptionalProducerScript = validProductionQueueResponse();
  wrongOptionalProducerScript.producers![0]!.script = 'another-worker';
  expectQueueConfigurationFailure(
    'Invalid optional producer script',
    wrongOptionalProducerScript,
    'producers[0].script must be',
  );

  const wrongBatchSize = validProductionQueueResponse();
  wrongBatchSize.consumers![0]!.settings!.batch_size = 9;
  expectQueueConfigurationFailure(
    'Invalid consumer batch size',
    wrongBatchSize,
    'settings.batch_size must be 10',
  );

  const wrongRetrySetting = validProductionQueueResponse();
  wrongRetrySetting.consumers![0]!.settings!.max_retries = 4;
  expectQueueConfigurationFailure(
    'Invalid consumer retry count',
    wrongRetrySetting,
    'settings.max_retries must be 3',
  );

  const wrongWaitTime = validProductionQueueResponse();
  wrongWaitTime.consumers![0]!.settings!.max_wait_time_ms = 5;
  expectQueueConfigurationFailure(
    'Consumer wait time must be represented in milliseconds',
    wrongWaitTime,
    'settings.max_wait_time_ms must be 5000',
  );

  const wrongProducerCount = validProductionQueueResponse();
  wrongProducerCount.producers = [
    ...wrongProducerCount.producers!,
    { type: 'worker', script: PRODUCTION_WORKER },
  ];
  expectQueueConfigurationFailure(
    'Multiple producers',
    wrongProducerCount,
    'producers must contain exactly one entry',
  );

  const wrongConsumerCount = validProductionQueueResponse();
  wrongConsumerCount.consumers = [
    ...wrongConsumerCount.consumers!,
    wrongConsumerCount.consumers![0]!,
  ];
  expectQueueConfigurationFailure(
    'Multiple consumers',
    wrongConsumerCount,
    'consumers must contain exactly one entry',
  );

  const wrongOptionalCount = validProductionQueueResponse();
  wrongOptionalCount.producers_total_count = 2;
  expectQueueConfigurationFailure(
    'Invalid optional producer count',
    wrongOptionalCount,
    'producers_total_count must be 1',
  );

  const wrongOptionalQueueName = validProductionQueueResponse();
  wrongOptionalQueueName.consumers![0]!.queue_name = 'another-queue';
  expectQueueConfigurationFailure(
    'Invalid optional consumer Queue name',
    wrongOptionalQueueName,
    'consumers[0].queue_name must be',
  );
}

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

function hasExpectedHyperdriveBindings(
  bindings: WorkerBinding[],
  environment: 'production' | 'staging',
) {
  const hyperdriveBindings = bindings.filter((binding) => binding.type === 'hyperdrive');
  if (environment === 'production') return hyperdriveBindings.length === 0;
  return (
    hyperdriveBindings.length === 1 &&
    hyperdriveBindings[0]?.name === 'HYPERDRIVE' &&
    hyperdriveBindings[0]?.id === STAGING_HYPERDRIVE_ID
  );
}

function fail(message: string): never {
  throw new Error(message);
}

function validateLocalContract() {
  validateQueueResponseContract();

  const stagingHyperdrive = [{ type: 'hyperdrive', name: 'HYPERDRIVE', id: STAGING_HYPERDRIVE_ID }];
  if (
    !hasExpectedHyperdriveBindings([], 'production') ||
    hasExpectedHyperdriveBindings(stagingHyperdrive, 'production') ||
    !hasExpectedHyperdriveBindings(stagingHyperdrive, 'staging') ||
    hasExpectedHyperdriveBindings(
      [{ type: 'hyperdrive', name: 'HYPERDRIVE', id: 'unexpected-staging-binding' }],
      'staging',
    ) ||
    hasExpectedHyperdriveBindings([...stagingHyperdrive, ...stagingHyperdrive], 'staging')
  ) {
    fail(
      'Production/staging Hyperdrive isolation checks did not match their expected configurations.',
    );
  }

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
    'Local Queue API optional-field/identity contract, Wrangler JSON consumer identity, migrations 0000/0001, application-count SQL, and strict healthcheck parser: PASS',
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
  if (!hasExpectedHyperdriveBindings(bindings, options.environment)) {
    fail(
      options.environment === 'production'
        ? `Production Worker ${workerName} must not have a Hyperdrive binding.`
        : `Staging Worker ${workerName} does not have its expected legacy Hyperdrive binding.`,
    );
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
  return assertProductionQueueConfiguration(queue);
}

async function verifyWranglerWorkerConsumer() {
  let stdout: string;
  try {
    stdout = execFileSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'wrangler', 'queues', 'consumer', 'worker', 'list', PRODUCTION_QUEUE, '--json'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 30_000,
        windowsHide: true,
      },
    );
  } catch {
    fail(
      `Wrangler could not read Worker consumers for ${PRODUCTION_QUEUE}; command diagnostics were suppressed.`,
    );
  }
  return parseWranglerConsumerJson(stdout);
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
  const queueConsumer = await verifyWranglerWorkerConsumer();
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
    `Production Queue producer binding: ${PRODUCTION_WORKER} TRACE_QUEUE -> ${PRODUCTION_QUEUE}; Queue API producer script metadata: ${queue.producers?.[0]?.script ?? 'omitted'}.`,
  );
  console.log(
    `Production Queue consumer (Wrangler JSON): ${queueConsumer.script} -> ${queueConsumer.queueName}; retries=${queue.consumers?.[0]?.settings?.max_retries}.`,
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
