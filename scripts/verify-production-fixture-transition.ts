import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProductionApplicationCountsEmpty,
  buildProductionApplicationCountsSql,
  parseProductionApplicationCountsResult,
  productionApplicationTables,
  type ProductionApplicationCounts,
} from './production-canary-d1.js';
import {
  productionGitHubRuntimeVariableSources,
  productionWorkerSecretNames,
} from './production-canary-runtime-config.js';

export const productionFixtureTransitionBaseline = {
  accountId: 'c5d6cf110905c91fc3eed1abaf8236a2',
  workerName: 'trace-production',
  workerVersionId: 'b64aec75-81c4-4146-964d-8ff456bbe726',
  sourceSha: '12c0ea321d235e621bccddde4cf575bab62aba06',
  d1Id: '7a566f2e-da27-46e7-8c3f-271e5566f225',
  queueName: 'trace-production-jobs',
  queueId: '9ef092975a554ba296a63b162b16522f',
  productionBaseUrl: 'https://trace-production.mathofdynamic2.workers.dev',
  appSlug: 'trace-production-integration',
  appId: '5082884',
} as const;

type ApiEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number }>;
};

type WorkerBinding = {
  name?: string;
  type?: string;
  database_id?: string;
  queue_name?: string;
  text?: string;
};

type WorkerVersion = {
  id?: string;
  resources?: { bindings?: WorkerBinding[] };
};

type WorkerDeployment = {
  id?: string;
  versions?: Array<{ version_id?: string; percentage?: number }>;
  annotations?: Record<string, unknown>;
};

type QueueResponse = {
  queue_id?: string;
  queue_name?: string;
  producers_total_count?: number;
  producers?: Array<{ type?: string; script?: string }>;
  consumers_total_count?: number;
  consumers?: Array<{
    type?: string;
    script_name?: string;
    queue_name?: string;
    settings?: {
      batch_size?: number;
      max_wait_time_ms?: number;
      max_retries?: number;
      retry_delay?: number;
    };
  }>;
};

type QueueMetrics = { backlog_count?: number };
type TransitionPhase = 'before' | 'after' | 'rollback';
type FetchImplementation = typeof fetch;

function fail(message: string): never {
  throw new Error(`Production fixture transition preflight failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeReviewedSourceSha(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    fail(`${label} must be an exact 40-character hexadecimal SHA.`);
  }
  return value.toLowerCase();
}

function sourceAnnotationSha(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const match = /^TRACE production canary ([0-9a-f]{40})$/i.exec(value);
  return match?.[1]?.toLowerCase();
}

function sourceAnnotationMatches(value: unknown, expectedSourceSha: string) {
  return sourceAnnotationSha(value) === expectedSourceSha.toLowerCase();
}

function assertIdentityEnvironment(environment: Record<string, string | undefined>) {
  if (environment.CLOUDFLARE_ACCOUNT_ID !== productionFixtureTransitionBaseline.accountId) {
    fail('Cloudflare account ID does not match the approved production account.');
  }
  if (environment.TRACE_PRODUCTION_WORKER_NAME !== productionFixtureTransitionBaseline.workerName) {
    fail('Worker name does not match trace-production.');
  }
  if (environment.TRACE_PRODUCTION_D1_ID !== productionFixtureTransitionBaseline.d1Id) {
    fail('D1 ID does not match the dedicated production database.');
  }
  if (environment.TRACE_PRODUCTION_QUEUE_NAME !== productionFixtureTransitionBaseline.queueName) {
    fail('Queue name does not match the dedicated production Queue.');
  }
  const token = environment.CLOUDFLARE_API_TOKEN;
  if (typeof token !== 'string' || token.length === 0) {
    fail('The production Cloudflare credential is unavailable.');
  }
  return token;
}

async function cloudflareRequest<T>(
  apiPath: string,
  token: string,
  fetchImplementation: FetchImplementation,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
) {
  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetchImplementation(`https://api.cloudflare.com/client/v4${apiPath}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail(`Cloudflare ${method} request failed for ${apiPath}.`);
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    fail(
      `Cloudflare ${method} request returned invalid JSON for ${apiPath} (HTTP ${response.status}).`,
    );
  }
  if (!response.ok || envelope.success !== true || envelope.result === undefined) {
    const codes = (envelope.errors ?? [])
      .map((entry) => entry.code)
      .filter((code): code is number => typeof code === 'number');
    fail(
      `Cloudflare ${method} request failed for ${apiPath} (HTTP ${response.status}; codes ${codes.join(',') || 'unavailable'}).`,
    );
  }
  return envelope.result;
}

function assertExpectedDeployment(
  deployments: WorkerDeployment[] | undefined,
  phase: TransitionPhase,
  expectedSourceSha?: string,
) {
  const deployment = deployments?.[0];
  if (!deployment?.id || !Array.isArray(deployment.versions)) {
    fail('Active production Worker deployment metadata is missing.');
  }
  if (deployment.versions.length !== 1 || deployment.versions[0]?.percentage !== 100) {
    fail('Production Worker traffic is not assigned 100% to one version.');
  }
  const versionId = deployment.versions[0]?.version_id;
  if (!versionId) fail('Active production Worker version ID is missing.');

  if (phase === 'before') {
    if (versionId !== productionFixtureTransitionBaseline.workerVersionId) {
      fail('The immutable closed production Worker version is not active.');
    }
  } else if (phase === 'rollback') {
    if (versionId !== productionFixtureTransitionBaseline.workerVersionId) {
      fail('Production Worker rollback did not restore the captured version.');
    }
  } else {
    if (versionId === productionFixtureTransitionBaseline.workerVersionId) {
      fail('The fixture transition did not create a new Worker version.');
    }
    if (
      !expectedSourceSha ||
      !sourceAnnotationMatches(deployment.annotations?.['workers/message'], expectedSourceSha)
    ) {
      fail('The active production deployment source annotation does not match the reviewed SHA.');
    }
  }

  return {
    deploymentId: deployment.id,
    versionId,
    trafficPercentage: 100,
    sourceSha: sourceAnnotationSha(deployment.annotations?.['workers/message']) || undefined,
  };
}

function assertWorkerBindings(
  version: WorkerVersion,
  phase: TransitionPhase,
  environment: Record<string, string | undefined>,
) {
  if (!Array.isArray(version.resources?.bindings)) {
    fail('Active production Worker binding metadata is unavailable.');
  }
  if (!version.id) fail('Active production Worker version identity is unavailable.');
  const bindings = version.resources.bindings;
  const d1 = bindings.filter((binding) => binding.type === 'd1');
  const queueProducers = bindings.filter((binding) => binding.type === 'queue');
  if (
    d1.length !== 1 ||
    d1[0]?.name !== 'DB' ||
    d1[0]?.database_id !== productionFixtureTransitionBaseline.d1Id
  ) {
    fail('Production DB binding does not point only to the dedicated production D1.');
  }
  if (
    queueProducers.length !== 1 ||
    queueProducers[0]?.name !== 'TRACE_QUEUE' ||
    queueProducers[0]?.queue_name !== productionFixtureTransitionBaseline.queueName
  ) {
    fail('Production TRACE_QUEUE binding does not point only to trace-production-jobs.');
  }
  if (bindings.some((binding) => binding.type === 'hyperdrive')) {
    fail('Production Worker must not have a Hyperdrive binding.');
  }

  const variables = new Map(
    bindings
      .filter((binding) => binding.type === 'plain_text')
      .map((binding) => [binding.name, binding.text]),
  );
  if (
    variables.get('TRACE_DEPLOYMENT_ENV') !== 'production' ||
    variables.get('TRACE_DATABASE_DRIVER') !== 'd1' ||
    variables.get('TRACE_CANARY_MODE') !== (phase === 'after' ? 'fixture' : 'closed')
  ) {
    fail(`Production runtime mode is not ${phase === 'after' ? 'fixture' : 'closed'} and D1-only.`);
  }

  const fixtureVariableNames = [
    'TRACE_CANARY_GITHUB_OWNER',
    'TRACE_CANARY_GITHUB_REPOSITORY',
    'TRACE_CANARY_GITHUB_REPOSITORY_ID',
  ];
  if (phase !== 'after') {
    if (fixtureVariableNames.some((name) => variables.has(name))) {
      fail('Fixture allowlist variables must be absent before the transition.');
    }
  } else {
    const expectedFixtureValues = [
      ['TRACE_CANARY_GITHUB_OWNER', 'mathofdynamic'],
      ['TRACE_CANARY_GITHUB_REPOSITORY', 'trace-staging-fixture'],
      ['TRACE_CANARY_GITHUB_REPOSITORY_ID', '1378441300'],
    ] as const;
    for (const [name, expected] of expectedFixtureValues) {
      if (variables.get(name) !== expected) fail(`Fixture runtime binding ${name} is incorrect.`);
    }
    if (fixtureVariableNames.some((name) => !variables.has(name))) {
      fail('Fixture runtime must contain exactly the three authorized allowlist variables.');
    }
  }

  const runtimeNames = Object.keys(productionGitHubRuntimeVariableSources);
  if (bindings.some((binding) => binding.name?.startsWith('TRACE_GITHUB_'))) {
    fail('Production Worker must not expose TRACE_GITHUB_* source names as runtime bindings.');
  }
  if (bindings.some((binding) => binding.name === 'CLOUDFLARE_API_TOKEN')) {
    fail('CLOUDFLARE_API_TOKEN must not be a production Worker binding.');
  }
  for (const [runtimeName, sourceName] of Object.entries(productionGitHubRuntimeVariableSources)) {
    const sourceValue = environment[sourceName];
    if (typeof sourceValue !== 'string' || sourceValue.length === 0) {
      fail(`Required production GitHub source variable is unavailable: ${sourceName}.`);
    }
    if (variables.get(runtimeName) !== sourceValue) {
      fail(`Production GitHub runtime mapping does not match its source: ${runtimeName}.`);
    }
  }
  if (
    variables.get('GITHUB_APP_ID') !== '5082884' ||
    variables.get('GITHUB_APP_SLUG') !== 'trace-production-integration' ||
    variables.get('GITHUB_APP_CALLBACK_URL') !==
      `${productionFixtureTransitionBaseline.productionBaseUrl}/api/github/setup` ||
    variables.get('GITHUB_APP_INSTALL_URL') !==
      `https://github.com/apps/${productionFixtureTransitionBaseline.appSlug}/installations/new`
  ) {
    fail('Production GitHub runtime variable identity does not match the production App.');
  }
  for (const name of ['GITHUB_APP_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_ID']) {
    const value = variables.get(name);
    if (typeof value !== 'string' || value.length === 0 || value.includes('trace-code.pages.dev')) {
      fail(`Production GitHub runtime variable is missing or points to staging: ${name}.`);
    }
  }

  const secretNames = new Set(
    bindings.filter((binding) => binding.type === 'secret_text').map((binding) => binding.name),
  );
  if (
    secretNames.size !== productionWorkerSecretNames.length ||
    productionWorkerSecretNames.some((name) => !secretNames.has(name))
  ) {
    fail('Production Worker secret bindings do not match the exact approved set.');
  }
  for (const name of productionWorkerSecretNames) {
    if (!secretNames.has(name))
      fail(`Required production Worker secret binding is absent: ${name}.`);
  }
  if (secretNames.has('CLOUDFLARE_API_TOKEN')) {
    fail('CLOUDFLARE_API_TOKEN must not be a Worker runtime secret.');
  }

  return {
    canaryMode: variables.get('TRACE_CANARY_MODE')!,
    fixtureOwner: variables.get('TRACE_CANARY_GITHUB_OWNER'),
    fixtureRepository: variables.get('TRACE_CANARY_GITHUB_REPOSITORY'),
    fixtureRepositoryId: variables.get('TRACE_CANARY_GITHUB_REPOSITORY_ID'),
    runtimeVariableNames: runtimeNames,
    workerSecretNames: [...secretNames].sort(),
  };
}

function assertQueueConfiguration(queue: QueueResponse) {
  if (queue.queue_id !== productionFixtureTransitionBaseline.queueId) {
    fail('Production Queue ID does not match trace-production-jobs.');
  }
  if (queue.queue_name !== productionFixtureTransitionBaseline.queueName) {
    fail('Production Queue name does not match trace-production-jobs.');
  }
  if (queue.producers_total_count !== undefined && queue.producers_total_count !== 1) {
    fail('Production Queue API reports an unexpected producer count.');
  }
  if (!Array.isArray(queue.producers) || queue.producers.length !== 1) {
    fail('Production Queue must report exactly one producer.');
  }
  const producer = queue.producers[0];
  if (
    producer?.type !== 'worker' ||
    producer.script !== productionFixtureTransitionBaseline.workerName
  ) {
    fail('Production Queue producer identity is not trace-production.');
  }
  if (queue.consumers_total_count !== undefined && queue.consumers_total_count !== 1) {
    fail('Production Queue API reports an unexpected consumer count.');
  }
  if (!Array.isArray(queue.consumers) || queue.consumers.length !== 1) {
    fail('Production Queue must have exactly one consumer.');
  }
  const consumer = queue.consumers[0]!;
  if (
    (consumer.type !== undefined && consumer.type !== 'worker') ||
    (consumer.script_name !== undefined &&
      consumer.script_name !== productionFixtureTransitionBaseline.workerName) ||
    (consumer.queue_name !== undefined &&
      consumer.queue_name !== productionFixtureTransitionBaseline.queueName)
  ) {
    fail('Production Queue API consumer identity does not match trace-production.');
  }
  const settings = consumer.settings;
  if (
    settings?.batch_size !== 10 ||
    settings.max_wait_time_ms !== 5000 ||
    settings.max_retries !== 3 ||
    settings.retry_delay !== 60
  ) {
    fail('Production Queue batch/retry settings do not match the approved configuration.');
  }
}

export function assertWranglerProductionConsumer(output: unknown) {
  if (!Array.isArray(output) || output.length !== 1 || !isRecord(output[0])) {
    fail('Wrangler Queue consumer JSON must contain exactly one Worker consumer.');
  }
  const consumer = output[0];
  if (
    consumer.type !== 'worker' ||
    consumer.script !== productionFixtureTransitionBaseline.workerName
  ) {
    fail('Wrangler Queue consumer identity is not trace-production.');
  }
  if (
    consumer.queue_name !== undefined &&
    consumer.queue_name !== productionFixtureTransitionBaseline.queueName
  ) {
    fail('Wrangler Queue consumer is associated with a different Queue.');
  }
}

export function classifyFixtureDeploymentForRollback(
  deployment: WorkerDeployment | undefined,
  expectedSourceSha: string,
) {
  const isSingleFullTrafficVersion =
    typeof deployment?.id === 'string' &&
    deployment.id.length > 0 &&
    deployment.versions?.length === 1 &&
    deployment.versions[0]?.percentage === 100;
  const versionId = deployment?.versions?.[0]?.version_id;

  if (
    isSingleFullTrafficVersion &&
    versionId === productionFixtureTransitionBaseline.workerVersionId
  ) {
    return 'baseline-active' as const;
  }
  if (
    isSingleFullTrafficVersion &&
    versionId !== productionFixtureTransitionBaseline.workerVersionId &&
    sourceAnnotationMatches(deployment?.annotations?.['workers/message'], expectedSourceSha)
  ) {
    return 'fixture-deployment-active' as const;
  }
  return 'unrecognized-active-deployment' as const;
}

export async function rollbackFixtureDeploymentIfNeeded(options: {
  expectedSourceSha: string;
  environment: Record<string, string | undefined>;
  fetchImplementation?: FetchImplementation;
  runRollback?: (versionId: string) => void;
  consumerOutput?: unknown;
}) {
  const expectedSourceSha = normalizeReviewedSourceSha(
    options.expectedSourceSha,
    'Rollback inspection source SHA',
  );
  const token = assertIdentityEnvironment(options.environment);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const envelope = await cloudflareRequest<{ deployments?: WorkerDeployment[] }>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/workers/scripts/${productionFixtureTransitionBaseline.workerName}/deployments?per_page=100`,
    token,
    fetchImplementation,
  );
  const activeDeployment = envelope.deployments?.[0];
  const disposition = classifyFixtureDeploymentForRollback(activeDeployment, expectedSourceSha);

  if (disposition === 'baseline-active') {
    const baselineState = await verifyProductionFixtureTransitionState({
      phase: 'rollback',
      environment: options.environment,
      fetchImplementation,
      consumerOutput: options.consumerOutput,
    });
    console.log('FIXTURE_ROLLBACK=NOT_REQUIRED_BASELINE_VERSION_ACTIVE');
    console.log(`ROLLBACK_DEPLOYMENT_ID=${baselineState.deploymentId}`);
    return { rollback: disposition, ...baselineState } as const;
  }
  if (disposition !== 'fixture-deployment-active') {
    fail(
      'Active production deployment is not the reviewed fixture release; refusing automatic rollback.',
    );
  }

  const runRollback =
    options.runRollback ??
    ((versionId: string) => {
      try {
        execFileSync(
          process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
          [
            'exec',
            'wrangler',
            'rollback',
            versionId,
            '--name',
            productionFixtureTransitionBaseline.workerName,
            '--message',
            'Rollback failed TRACE fixture-canary acceptance',
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              CLOUDFLARE_ACCOUNT_ID: productionFixtureTransitionBaseline.accountId,
            },
            shell: process.platform === 'win32',
            stdio: ['ignore', 'ignore', 'ignore'],
            timeout: 120_000,
            windowsHide: true,
          },
        );
      } catch {
        fail('Cloudflare Worker rollback to the captured closed version failed.');
      }
    });
  runRollback(productionFixtureTransitionBaseline.workerVersionId);
  const rollbackState = await verifyProductionFixtureTransitionState({
    phase: 'rollback',
    environment: options.environment,
    fetchImplementation,
    consumerOutput: options.consumerOutput,
  });
  console.log(`FIXTURE_ROLLBACK=COMPLETED`);
  console.log(`ROLLBACK_DEPLOYMENT_ID=${rollbackState.deploymentId}`);
  console.log(`ROLLBACK_WORKER_VERSION=${rollbackState.versionId}`);
  return { rollback: 'completed', ...rollbackState } as const;
}

function readWranglerConsumerList() {
  let stdout: string;
  try {
    stdout = execFileSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [
        'exec',
        'wrangler',
        'queues',
        'consumer',
        'worker',
        'list',
        'trace-production-jobs',
        '--json',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: productionFixtureTransitionBaseline.accountId,
        },
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 30_000,
        windowsHide: true,
      },
    );
  } catch {
    fail('Wrangler could not read the production Worker consumer list.');
  }
  try {
    assertWranglerProductionConsumer(JSON.parse(stdout) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) fail('Wrangler Queue consumer output is not valid JSON.');
    throw error;
  }
}

async function readApplicationCounts(token: string, fetchImplementation: FetchImplementation) {
  const result = await cloudflareRequest<unknown>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/d1/database/${productionFixtureTransitionBaseline.d1Id}/query`,
    token,
    fetchImplementation,
    { method: 'POST', body: { sql: buildProductionApplicationCountsSql(), params: [] } },
  );
  const counts = parseProductionApplicationCountsResult(result);
  assertProductionApplicationCountsEmpty(counts);
  return counts;
}

async function readQueueMetrics(token: string, fetchImplementation: FetchImplementation) {
  const metrics = await cloudflareRequest<QueueMetrics>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/queues/${productionFixtureTransitionBaseline.queueId}/metrics`,
    token,
    fetchImplementation,
  );
  if (!Number.isSafeInteger(metrics.backlog_count) || metrics.backlog_count !== 0) {
    fail('Production Queue backlog is unavailable or nonzero.');
  }
  return metrics;
}

export async function verifyProductionFixtureTransitionState(options: {
  phase: TransitionPhase;
  environment: Record<string, string | undefined>;
  expectedSourceSha?: string;
  fetchImplementation?: FetchImplementation;
  consumerOutput?: unknown;
}) {
  const token = assertIdentityEnvironment(options.environment);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const expectedSourceSha =
    options.phase === 'after'
      ? normalizeReviewedSourceSha(options.expectedSourceSha, 'Post-deployment source SHA')
      : options.expectedSourceSha;

  const deploymentEnvelope = await cloudflareRequest<{ deployments?: WorkerDeployment[] }>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/workers/scripts/${productionFixtureTransitionBaseline.workerName}/deployments?per_page=100`,
    token,
    fetchImplementation,
  );
  const deployment = assertExpectedDeployment(
    deploymentEnvelope.deployments,
    options.phase,
    expectedSourceSha,
  );
  const version = await cloudflareRequest<WorkerVersion>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/workers/scripts/${productionFixtureTransitionBaseline.workerName}/versions/${deployment.versionId}`,
    token,
    fetchImplementation,
  );
  if (version.id !== deployment.versionId)
    fail('Active Worker version ID does not match deployment.');
  const worker = assertWorkerBindings(version, options.phase, options.environment);

  const queue = await cloudflareRequest<QueueResponse>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/queues/${productionFixtureTransitionBaseline.queueId}`,
    token,
    fetchImplementation,
  );
  assertQueueConfiguration(queue);
  if (options.consumerOutput === undefined) readWranglerConsumerList();
  else assertWranglerProductionConsumer(options.consumerOutput);

  const counts: ProductionApplicationCounts = await readApplicationCounts(
    token,
    fetchImplementation,
  );
  const metrics = await readQueueMetrics(token, fetchImplementation);

  return {
    phase: options.phase,
    deploymentId: deployment.deploymentId,
    versionId: deployment.versionId,
    trafficPercentage: deployment.trafficPercentage,
    ...(options.phase === 'before'
      ? {
          baselineActiveDeploymentId: deployment.deploymentId,
          baselineActiveVersionId: deployment.versionId,
          baselineTrafficPercent: deployment.trafficPercentage,
        }
      : {}),
    sourceSha: deployment.sourceSha,
    d1Id: productionFixtureTransitionBaseline.d1Id,
    applicationTableCount: productionApplicationTables.length,
    emptyApplicationTableCount: Object.values(counts).filter((count) => count === 0).length,
    queueId: productionFixtureTransitionBaseline.queueId,
    queueName: productionFixtureTransitionBaseline.queueName,
    queueBacklogCount: metrics.backlog_count!,
    ...worker,
  };
}

type TransitionCommand = TransitionPhase | 'rollback-if-needed';

export function formatFixtureDeploymentOutputs(result: {
  versionId: string;
  deploymentId: string;
  trafficPercentage: number;
  sourceSha: string | undefined;
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.versionId)) {
    fail('Worker version output is not a valid version ID.');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.deploymentId)
  ) {
    fail('Deployment output is not a valid deployment ID.');
  }
  if (result.trafficPercentage !== 100) fail('Worker traffic output must be 100 percent.');
  if (!result.sourceSha) fail('Worker source output SHA is missing.');
  const sourceSha = normalizeReviewedSourceSha(result.sourceSha, 'Worker source output SHA');
  return [
    `worker_version_id=${result.versionId}`,
    `deployment_id=${result.deploymentId}`,
    `traffic_percent=${result.trafficPercentage}`,
    `source_sha=${sourceSha}`,
    '',
  ].join('\n');
}

function parseArguments(arguments_: string[]): {
  command: TransitionCommand;
  captureDeploymentOutputs: boolean;
} {
  const phase = arguments_[0];
  if (
    (arguments_.length !== 1 && arguments_.length !== 2) ||
    (phase !== 'before' && phase !== 'after' && phase !== 'rollback-if-needed')
  ) {
    fail('Usage: verify-production-fixture-transition.ts before|after|rollback-if-needed.');
  }
  const captureDeploymentOutputs = arguments_[1] === '--capture-deployment-outputs';
  if (arguments_.length === 2 && (phase !== 'after' || !captureDeploymentOutputs)) {
    fail('Only the after phase may capture deployment outputs.');
  }
  return { command: phase, captureDeploymentOutputs };
}

async function main() {
  try {
    const { command: phase, captureDeploymentOutputs } = parseArguments(process.argv.slice(2));
    if (phase === 'rollback-if-needed') {
      await rollbackFixtureDeploymentIfNeeded({
        expectedSourceSha: process.env.DEPLOY_SHA ?? '',
        environment: process.env,
      });
      return;
    }
    const result = await verifyProductionFixtureTransitionState({
      phase,
      environment: process.env,
      expectedSourceSha: process.env.DEPLOY_SHA,
    });
    if (captureDeploymentOutputs) {
      const outputPath = process.env.GITHUB_OUTPUT;
      if (!outputPath) fail('GitHub Actions output file is unavailable.');
      appendFileSync(outputPath, formatFixtureDeploymentOutputs(result), { encoding: 'utf8' });
    }
    console.log(`TRANSITION_PHASE=${result.phase}`);
    if (result.phase === 'before') {
      console.log(`BASELINE_ACTIVE_DEPLOYMENT_ID=${result.deploymentId}`);
      console.log(`BASELINE_ACTIVE_VERSION_ID=${result.versionId}`);
      console.log(`BASELINE_TRAFFIC_PERCENT=${result.trafficPercentage}`);
    }
    console.log(`WORKER_DEPLOYMENT_ID=${result.deploymentId}`);
    console.log(`WORKER_VERSION_ID=${result.versionId}`);
    console.log(`WORKER_TRAFFIC_PERCENT=${result.trafficPercentage}`);
    console.log(`WORKER_SOURCE_SHA=${result.sourceSha ?? 'NOT_ASSERTED_FOR_BASELINE'}`);
    console.log(`TRACE_CANARY_MODE=${result.canaryMode}`);
    console.log(
      `FIXTURE_ALLOWLIST=${result.fixtureOwner ?? 'ABSENT'}/${result.fixtureRepository ?? 'ABSENT'}/${result.fixtureRepositoryId ?? 'ABSENT'}`,
    );
    console.log(`D1_ID=${result.d1Id}`);
    console.log(
      `D1_APPLICATION_TABLES_EMPTY=${result.emptyApplicationTableCount}/${result.applicationTableCount}`,
    );
    console.log(`QUEUE_NAME=${result.queueName}`);
    console.log(`QUEUE_ID=${result.queueId}`);
    console.log(`QUEUE_BACKLOG_COUNT=${result.queueBacklogCount}`);
    console.log(`GITHUB_RUNTIME_VARIABLE_NAMES=${result.runtimeVariableNames.join(',')}`);
    console.log(`WORKER_SECRET_NAMES=${result.workerSecretNames.join(',')}`);
    console.log('HYPERDRIVE=ABSENT');
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Production fixture transition verification failed.',
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
