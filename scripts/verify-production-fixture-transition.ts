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
  assertExpectedProductionFixtureCounts,
  assertProductionFixtureIdentity,
  buildProductionFixtureIdentityQuery,
  parseProductionFixtureIdentityResult,
  assertProductionFixtureForeignKeys,
} from './production-fixture-d1-state.js';
import {
  productionGitHubRuntimeVariableSources,
  productionWorkerSecretNames,
} from './production-canary-runtime-config.js';

export const productionFixtureTransitionBaseline = {
  accountId: 'c5d6cf110905c91fc3eed1abaf8236a2',
  workerName: 'trace-production',
  workerVersionId: 'b64aec75-81c4-4146-964d-8ff456bbe726',
  sourceSha: '12c0ea321d235e621bccddde4cf575bab62aba06',
  fixtureVersionId: '16055223-3a33-43a3-8d09-fafddb8abe72',
  fixtureSourceSha: 'eba409078774d427b7b7b52933b9f05b25761b60',
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
type RuntimeCanaryMode = 'closed' | 'fixture' | 'owner';
type FetchImplementation = typeof fetch;
type KnownBaseline =
  | { versionId: string; mode: 'closed' }
  | { versionId: string; mode: 'fixture' | 'owner'; sourceSha: string };

function knownBaselineForVersion(versionId: string): KnownBaseline | undefined {
  // Release PR #76/canary 37428305647; independent protected inspection 37429036662.
  if (versionId === 'b7c49d29-d0c7-49a6-9228-f5e7425e2873')
    return { versionId, mode: 'owner', sourceSha: '886fe6976cdbb67192f74a4f32aa621b08be4f65' };
  // PR #63/run 37126079125; independently verified by protected run 37426388514.
  if (versionId === 'a30ba0d6-c4e6-42a7-b9fd-cf6a8eb8d08e')
    return { versionId, mode: 'owner', sourceSha: '74450fd7684b6974e6deb8bb407f1fd670e5cecf' };
  if (versionId === '550a5214-4e46-4023-a330-7d042be4ea7c')
    return { versionId, mode: 'owner', sourceSha: '22b98cf2224a31403c9ea403e34137562f7076d8' };
  if (versionId === 'a118f111-0bcb-4662-b864-c8587ca29567')
    return { versionId, mode: 'owner', sourceSha: '72f71ff4f597c0a18abaa2eaec837ff4892266d0' };
  if (versionId === '14e30410-d83b-4de6-90cc-6ba0356957ed')
    return {
      versionId,
      mode: 'fixture' as const,
      sourceSha: '1498dcd2da74d1952ba97c61e6cd0c77811784eb',
    };
  if (versionId === productionFixtureTransitionBaseline.workerVersionId) {
    return { versionId, mode: 'closed' as const };
  }
  if (versionId === productionFixtureTransitionBaseline.fixtureVersionId) {
    return {
      versionId,
      mode: 'fixture' as const,
      sourceSha: productionFixtureTransitionBaseline.fixtureSourceSha,
    };
  }
  return undefined;
}

function requireKnownBaseline(versionId: string, mode?: RuntimeCanaryMode) {
  const baseline = knownBaselineForVersion(versionId);
  if (!baseline || (mode !== undefined && baseline.mode !== mode)) {
    fail('Rollback baseline must be a previously verified production Worker version.');
  }
  return baseline;
}

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
  expectedBaselineVersionId: string = productionFixtureTransitionBaseline.workerVersionId,
  expectedBaselineMode: RuntimeCanaryMode = 'closed',
  targetRuntimeMode: RuntimeCanaryMode = 'fixture',
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
    const baseline = requireKnownBaseline(versionId);
    expectedBaselineVersionId = baseline.versionId;
    expectedBaselineMode = baseline.mode;
    if (
      baseline.mode !== 'closed' &&
      !sourceAnnotationMatches(deployment.annotations?.['workers/message'], baseline.sourceSha)
    ) {
      fail(
        'Active fixture baseline source annotation does not match the verified production release.',
      );
    }
  } else if (phase === 'rollback') {
    if (versionId !== expectedBaselineVersionId) {
      fail('Production Worker rollback did not restore the captured baseline version.');
    }
  } else {
    if (versionId === expectedBaselineVersionId) {
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
    runtimeMode: phase === 'after' ? targetRuntimeMode : expectedBaselineMode,
    sourceSha: sourceAnnotationSha(deployment.annotations?.['workers/message']) || undefined,
  };
}

function assertWorkerBindings(
  version: WorkerVersion,
  environment: Record<string, string | undefined>,
  expectedRuntimeMode: RuntimeCanaryMode,
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
    variables.get('TRACE_CANARY_MODE') !== expectedRuntimeMode
  ) {
    fail(`Production runtime mode is not ${expectedRuntimeMode} and D1-only.`);
  }

  const fixtureVariableNames = [
    'TRACE_CANARY_GITHUB_OWNER',
    'TRACE_CANARY_GITHUB_REPOSITORY',
    'TRACE_CANARY_GITHUB_REPOSITORY_ID',
  ];
  if (expectedRuntimeMode === 'closed' || expectedRuntimeMode === 'owner') {
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

  const legacyBrowserOrigin =
    version.id === 'a118f111-0bcb-4662-b864-c8587ca29567' || expectedRuntimeMode !== 'owner';
  const expectedBrowserOrigin = legacyBrowserOrigin
    ? productionFixtureTransitionBaseline.productionBaseUrl
    : 'https://trace-code.pages.dev';
  if (
    variables.get('TRACE_PUBLIC_URL') !== expectedBrowserOrigin &&
    expectedRuntimeMode === 'owner'
  )
    fail('Owner public browser origin is incorrect.');
  const runtimeNames = Object.keys(productionGitHubRuntimeVariableSources);
  if (bindings.some((binding) => binding.name?.startsWith('TRACE_GITHUB_'))) {
    fail('Production Worker must not expose TRACE_GITHUB_* source names as runtime bindings.');
  }
  if (bindings.some((binding) => binding.name === 'CLOUDFLARE_API_TOKEN')) {
    fail('CLOUDFLARE_API_TOKEN must not be a production Worker binding.');
  }
  for (const [runtimeName, sourceName] of Object.entries(productionGitHubRuntimeVariableSources)) {
    const sourceValue =
      runtimeName === 'GITHUB_APP_CALLBACK_URL' &&
      version.id === 'a118f111-0bcb-4662-b864-c8587ca29567'
        ? `${expectedBrowserOrigin}/api/github/setup`
        : environment[sourceName];
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
    variables.get('GITHUB_APP_CALLBACK_URL') !== `${expectedBrowserOrigin}/api/github/setup` ||
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

  assertExpectedProductionResourceBindings(version);

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
  baselineVersionId: string = productionFixtureTransitionBaseline.workerVersionId,
) {
  const isSingleFullTrafficVersion =
    typeof deployment?.id === 'string' &&
    deployment.id.length > 0 &&
    deployment.versions?.length === 1 &&
    deployment.versions[0]?.percentage === 100;
  const versionId = deployment?.versions?.[0]?.version_id;

  if (isSingleFullTrafficVersion && versionId === baselineVersionId) {
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
  expectedBaselineVersionId?: string;
  expectedBaselineMode?: RuntimeCanaryMode;
  environment: Record<string, string | undefined>;
  fetchImplementation?: FetchImplementation;
  runRollback?: (versionId: string) => void;
  consumerOutput?: unknown;
}) {
  const expectedSourceSha = normalizeReviewedSourceSha(
    options.expectedSourceSha,
    'Rollback inspection source SHA',
  );
  const baseline = requireKnownBaseline(
    options.expectedBaselineVersionId ?? productionFixtureTransitionBaseline.workerVersionId,
    options.expectedBaselineMode,
  );
  const token = assertIdentityEnvironment(options.environment);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const envelope = await cloudflareRequest<{ deployments?: WorkerDeployment[] }>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/workers/scripts/${productionFixtureTransitionBaseline.workerName}/deployments?per_page=100`,
    token,
    fetchImplementation,
  );
  const activeDeployment = envelope.deployments?.[0];
  const disposition = classifyFixtureDeploymentForRollback(
    activeDeployment,
    expectedSourceSha,
    baseline.versionId,
  );

  if (disposition === 'baseline-active') {
    const baselineState = await verifyProductionFixtureTransitionState({
      phase: 'rollback',
      environment: options.environment,
      expectedBaselineVersionId: baseline.versionId,
      expectedBaselineMode: baseline.mode,
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
        fail('Cloudflare Worker rollback to the captured baseline version failed.');
      }
    });
  runRollback(baseline.versionId);
  const rollbackState = await verifyProductionFixtureTransitionState({
    phase: 'rollback',
    environment: options.environment,
    expectedBaselineVersionId: baseline.versionId,
    expectedBaselineMode: baseline.mode,
    fetchImplementation,
    consumerOutput: options.consumerOutput,
  });
  console.log(`FIXTURE_ROLLBACK=COMPLETED`);
  console.log(`ROLLBACK_DEPLOYMENT_ID=${rollbackState.deploymentId}`);
  console.log(`ROLLBACK_WORKER_VERSION=${rollbackState.versionId}`);
  console.log(`ROLLBACK_RUNTIME_MODE=${rollbackState.canaryMode}`);
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

async function readApplicationCounts(
  token: string,
  fetchImplementation: FetchImplementation,
  environment: Record<string, string | undefined>,
) {
  const result = await cloudflareRequest<unknown>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/d1/database/${productionFixtureTransitionBaseline.d1Id}/query`,
    token,
    fetchImplementation,
    { method: 'POST', body: { sql: buildProductionApplicationCountsSql(), params: [] } },
  );
  const counts = parseProductionApplicationCountsResult(result);
  const stage = environment.TRACE_FIXTURE_D1_BASELINE_STAGE ?? 'before-oauth';
  if (stage === 'owner') {
    const { verifyOwnerState } = await import('./verify-production-owner-state.js');
    const ownerVerification = await verifyOwnerState(
      { ...environment, OWNER_ACCEPTANCE_STAGE: 'active' },
      fetchImplementation,
    );
    if (environment.OWNER_CATALOG_DIAGNOSTIC_PUBLIC_KEY) console.log(ownerVerification);
  } else if (stage === 'before-oauth') assertProductionApplicationCountsEmpty(counts);
  else if (stage === 'after-onboarding' || stage === 'after-live-issue') {
    assertExpectedProductionFixtureCounts(stage, counts);
    const query = buildProductionFixtureIdentityQuery(
      stage,
      stage === 'after-live-issue' ? '166179374' : undefined,
      Date.now(),
      'reconciled',
    );
    const identity = await cloudflareRequest<unknown>(
      `/accounts/${productionFixtureTransitionBaseline.accountId}/d1/database/${productionFixtureTransitionBaseline.d1Id}/query`,
      token,
      fetchImplementation,
      { method: 'POST', body: query },
    );
    assertProductionFixtureIdentity(stage, parseProductionFixtureIdentityResult(identity));
    const foreignKeys = await cloudflareRequest<unknown>(
      `/accounts/${productionFixtureTransitionBaseline.accountId}/d1/database/${productionFixtureTransitionBaseline.d1Id}/query`,
      token,
      fetchImplementation,
      { method: 'POST', body: { sql: 'PRAGMA foreign_key_check', params: [] } },
    );
    if (
      !Array.isArray(foreignKeys) ||
      foreignKeys.length !== 1 ||
      !foreignKeys[0] ||
      typeof foreignKeys[0] !== 'object' ||
      !('results' in foreignKeys[0])
    )
      fail('Foreign-key query result is invalid.');
    assertProductionFixtureForeignKeys(foreignKeys[0].results);
  } else fail('Unsupported D1 baseline stage.');
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
  expectedBaselineVersionId?: string;
  expectedBaselineMode?: RuntimeCanaryMode;
  fetchImplementation?: FetchImplementation;
  consumerOutput?: unknown;
}) {
  const token = assertIdentityEnvironment(options.environment);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const expectedSourceSha =
    options.phase === 'after'
      ? normalizeReviewedSourceSha(options.expectedSourceSha, 'Post-deployment source SHA')
      : options.expectedSourceSha;
  const expectedBaseline =
    options.phase === 'before'
      ? undefined
      : requireKnownBaseline(
          options.expectedBaselineVersionId ?? productionFixtureTransitionBaseline.workerVersionId,
          options.expectedBaselineMode,
        );

  const deploymentEnvelope = await cloudflareRequest<{ deployments?: WorkerDeployment[] }>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/workers/scripts/${productionFixtureTransitionBaseline.workerName}/deployments?per_page=100`,
    token,
    fetchImplementation,
  );
  const deployment = assertExpectedDeployment(
    deploymentEnvelope.deployments,
    options.phase,
    expectedSourceSha,
    expectedBaseline?.versionId,
    expectedBaseline?.mode,
    options.environment.RUNTIME_MODE === 'owner' ? 'owner' : 'fixture',
  );
  const version = await cloudflareRequest<WorkerVersion>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/workers/scripts/${productionFixtureTransitionBaseline.workerName}/versions/${deployment.versionId}`,
    token,
    fetchImplementation,
  );
  if (version.id !== deployment.versionId)
    fail('Active Worker version ID does not match deployment.');
  const worker = assertWorkerBindings(version, options.environment, deployment.runtimeMode);

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
    options.environment,
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
          baselineRuntimeMode: deployment.runtimeMode,
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

/** Read-only candidate verification. This never registers a rollback target. */
export async function inspectReviewedOwnerDeployment(options: {
  expectedVersionId: string;
  expectedSourceSha: string;
  environment: Record<string, string | undefined>;
  fetchImplementation?: FetchImplementation;
  consumerOutput?: unknown;
}) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      options.expectedVersionId,
    )
  )
    fail('Reviewed Worker version must be an exact UUID.');
  const expectedSourceSha = normalizeReviewedSourceSha(
    options.expectedSourceSha,
    'Reviewed owner source',
  );
  const result = await verifyProductionFixtureTransitionState({
    phase: 'after',
    expectedSourceSha,
    // Previously verified predecessor captured by the original owner deployment.
    expectedBaselineVersionId: '550a5214-4e46-4023-a330-7d042be4ea7c',
    expectedBaselineMode: 'owner',
    environment: {
      ...options.environment,
      RUNTIME_MODE: 'owner',
      TRACE_FIXTURE_D1_BASELINE_STAGE: 'owner',
    },
    fetchImplementation: options.fetchImplementation,
    consumerOutput: options.consumerOutput,
  });
  if (result.versionId !== options.expectedVersionId)
    fail('Active Worker version does not match the reviewed candidate.');
  const version = await cloudflareRequest<WorkerVersion>(
    `/accounts/${productionFixtureTransitionBaseline.accountId}/workers/scripts/${productionFixtureTransitionBaseline.workerName}/versions/${result.versionId}`,
    assertIdentityEnvironment(options.environment),
    options.fetchImplementation ?? fetch,
  );
  if (version.id !== result.versionId) fail('Inspected Worker version identity does not match.');
  assertExpectedProductionResourceBindings(version);
  const variables = new Map(
    version
      .resources!.bindings!.filter((binding) => binding.type === 'plain_text')
      .map((binding) => [binding.name, binding.text]),
  );
  return {
    ...result,
    sourceAnnotation: `TRACE production canary ${result.sourceSha}`,
    publicUrl: variables.get('TRACE_PUBLIC_URL'),
    githubAppId: variables.get('GITHUB_APP_ID'),
    githubAppSlug: variables.get('GITHUB_APP_SLUG'),
    githubCallbackUrl: variables.get('GITHUB_APP_CALLBACK_URL'),
    bindings: version.resources!.bindings!.map((binding) => ({
      name: binding.name,
      type: binding.type,
    })),
  };
}

export function assertExpectedProductionResourceBindings(version: WorkerVersion) {
  const bindings = version.resources?.bindings;
  if (!Array.isArray(bindings)) fail('Worker binding inventory is missing.');
  const names = new Set<string>();
  const allowedVariables = new Set([
    'TRACE_DEPLOYMENT_ENV',
    'TRACE_DATABASE_DRIVER',
    'TRACE_CANARY_MODE',
    'TRACE_PUBLIC_URL',
    'TRACE_CANARY_GITHUB_OWNER',
    'TRACE_CANARY_GITHUB_REPOSITORY',
    'TRACE_CANARY_GITHUB_REPOSITORY_ID',
    'NEXT_PRIVATE_MINIMAL_MODE',
    'TRACE_FEATURE_SEMANTIC_PR_FINDINGS',
    'TRACE_FEATURE_SEMANTIC_CONFLICTS',
    'TRACE_FEATURE_GITHUB_COMMENTS',
    'TRACE_FEATURE_HYBRID_SYNC',
    ...Object.keys(productionGitHubRuntimeVariableSources),
  ]);
  for (const binding of bindings) {
    if (!binding.name || names.has(binding.name)) fail('Production binding names must be unique.');
    names.add(binding.name);
    const allowed =
      binding.type === 'd1'
        ? binding.name === 'DB'
        : binding.type === 'queue'
          ? binding.name === 'TRACE_QUEUE'
          : binding.type === 'assets'
            ? binding.name === 'ASSETS'
            : binding.type === 'plain_text'
              ? allowedVariables.has(binding.name)
              : binding.type === 'secret_text'
                ? (productionWorkerSecretNames as readonly string[]).includes(binding.name)
                : false;
    if (!allowed) fail('Unexpected production resource binding.');
  }
  const requiredNames = [
    'DB',
    'TRACE_QUEUE',
    'ASSETS',
    'TRACE_DEPLOYMENT_ENV',
    'TRACE_DATABASE_DRIVER',
    'TRACE_CANARY_MODE',
    'NEXT_PRIVATE_MINIMAL_MODE',
    'TRACE_FEATURE_SEMANTIC_PR_FINDINGS',
    'TRACE_FEATURE_SEMANTIC_CONFLICTS',
    'TRACE_FEATURE_GITHUB_COMMENTS',
    'TRACE_FEATURE_HYBRID_SYNC',
    ...Object.keys(productionGitHubRuntimeVariableSources),
    ...productionWorkerSecretNames,
  ];
  if (requiredNames.some((name) => !names.has(name)))
    fail('Required production binding is missing.');
  const variables = new Map(
    bindings
      .filter((binding) => binding.type === 'plain_text')
      .map((binding) => [binding.name, binding.text]),
  );
  if (variables.get('NEXT_PRIVATE_MINIMAL_MODE') !== '1')
    fail('OpenNext minimal mode must remain enabled.');
  for (const name of [
    'TRACE_FEATURE_SEMANTIC_PR_FINDINGS',
    'TRACE_FEATURE_SEMANTIC_CONFLICTS',
    'TRACE_FEATURE_GITHUB_COMMENTS',
    'TRACE_FEATURE_HYBRID_SYNC',
  ]) {
    if (variables.get(name) !== 'false')
      fail('Production safety feature flags must remain disabled.');
  }
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

export function formatFixtureBaselineOutputs(result: {
  versionId: string;
  deploymentId: string;
  trafficPercentage: number;
  runtimeMode: RuntimeCanaryMode;
}) {
  requireKnownBaseline(result.versionId, result.runtimeMode);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.deploymentId)
  ) {
    fail('Baseline deployment output is not a valid deployment ID.');
  }
  if (result.trafficPercentage !== 100) fail('Baseline Worker traffic output must be 100 percent.');
  return [
    `baseline_worker_version_id=${result.versionId}`,
    `baseline_deployment_id=${result.deploymentId}`,
    `baseline_traffic_percent=${result.trafficPercentage}`,
    `baseline_mode=${result.runtimeMode}`,
    '',
  ].join('\n');
}

function parseArguments(arguments_: string[]): {
  command: TransitionCommand;
  captureDeploymentOutputs: boolean;
  captureBaselineOutputs: boolean;
} {
  const phase = arguments_[0];
  if (
    (arguments_.length !== 1 && arguments_.length !== 2) ||
    (phase !== 'before' && phase !== 'after' && phase !== 'rollback-if-needed')
  ) {
    fail('Usage: verify-production-fixture-transition.ts before|after|rollback-if-needed.');
  }
  const captureDeploymentOutputs = arguments_[1] === '--capture-deployment-outputs';
  const captureBaselineOutputs = arguments_[1] === '--capture-baseline-outputs';
  if (
    arguments_.length === 2 &&
    !(
      (phase === 'after' && captureDeploymentOutputs) ||
      (phase === 'before' && captureBaselineOutputs)
    )
  ) {
    fail('Only the before/after phases may capture their corresponding deployment outputs.');
  }
  return { command: phase, captureDeploymentOutputs, captureBaselineOutputs };
}

async function main() {
  try {
    if (process.argv.slice(2).join(' ') === 'inspect-reviewed-owner') {
      const result = await inspectReviewedOwnerDeployment({
        expectedVersionId: process.env.REVIEWED_WORKER_VERSION_ID ?? '',
        expectedSourceSha: process.env.REVIEWED_WORKER_SOURCE_SHA ?? '',
        environment: process.env,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const {
      command: phase,
      captureDeploymentOutputs,
      captureBaselineOutputs,
    } = parseArguments(process.argv.slice(2));
    if (phase === 'rollback-if-needed') {
      await rollbackFixtureDeploymentIfNeeded({
        expectedSourceSha: process.env.DEPLOY_SHA ?? '',
        expectedBaselineVersionId: process.env.TRACE_BASELINE_WORKER_VERSION_ID,
        expectedBaselineMode: process.env.TRACE_BASELINE_RUNTIME_MODE as
          | RuntimeCanaryMode
          | undefined,
        environment: process.env,
      });
      return;
    }
    const result = await verifyProductionFixtureTransitionState({
      phase,
      environment: process.env,
      expectedSourceSha: process.env.DEPLOY_SHA,
      expectedBaselineVersionId: process.env.TRACE_BASELINE_WORKER_VERSION_ID,
      expectedBaselineMode: process.env.TRACE_BASELINE_RUNTIME_MODE as
        | RuntimeCanaryMode
        | undefined,
    });
    if (captureDeploymentOutputs) {
      const outputPath = process.env.GITHUB_OUTPUT;
      if (!outputPath) fail('GitHub Actions output file is unavailable.');
      appendFileSync(outputPath, formatFixtureDeploymentOutputs(result), { encoding: 'utf8' });
    }
    if (captureBaselineOutputs) {
      const outputPath = process.env.GITHUB_OUTPUT;
      if (!outputPath) fail('GitHub Actions output file is unavailable.');
      appendFileSync(
        outputPath,
        formatFixtureBaselineOutputs({
          versionId: result.versionId,
          deploymentId: result.deploymentId,
          trafficPercentage: result.trafficPercentage,
          runtimeMode: result.canaryMode as RuntimeCanaryMode,
        }),
        { encoding: 'utf8' },
      );
    }
    console.log(`TRANSITION_PHASE=${result.phase}`);
    if (result.phase === 'before') {
      console.log(`BASELINE_ACTIVE_DEPLOYMENT_ID=${result.deploymentId}`);
      console.log(`BASELINE_ACTIVE_VERSION_ID=${result.versionId}`);
      console.log(`BASELINE_TRAFFIC_PERCENT=${result.trafficPercentage}`);
      console.log(`BASELINE_RUNTIME_MODE=${result.canaryMode}`);
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
