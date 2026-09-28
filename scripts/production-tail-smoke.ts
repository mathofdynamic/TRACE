import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWranglerProductionConsumer } from './verify-production-fixture-transition.js';
import {
  assertProductionApplicationCountsEmpty,
  buildProductionApplicationCountsSql,
  parseProductionApplicationCountsResult,
} from './production-canary-d1.js';
import { productionGitHubRuntimeVariableSources } from './production-canary-runtime-config.js';
import { runBoundedTailSession, type TailCommandKind } from './production-tail-observability.js';

export const productionTailSmokeBaseline = {
  accountId: 'c5d6cf110905c91fc3eed1abaf8236a2',
  workerName: 'trace-production',
  deploymentId: '473864fd-83b8-42ac-800d-2ea173c9649e',
  versionId: 'b64aec75-81c4-4146-964d-8ff456bbe726',
  d1Id: '7a566f2e-da27-46e7-8c3f-271e5566f225',
  queueId: '9ef092975a554ba296a63b162b16522f',
  queueName: 'trace-production-jobs',
  publicUrl: 'https://trace-production.mathofdynamic2.workers.dev',
} as const;

type ApiEnvelope<T> = { success?: boolean; result?: T; errors?: Array<{ code?: unknown }> };
type Binding = {
  type?: string;
  name?: string;
  text?: string;
  database_id?: string;
  queue_name?: string;
};

function fail(message: string): never {
  throw new Error(`Production tail smoke preflight failed: ${message}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSmokeEnvironment(environment: Record<string, string | undefined>) {
  if (environment.CLOUDFLARE_ACCOUNT_ID !== productionTailSmokeBaseline.accountId) {
    fail('Cloudflare account ID does not match the approved production account.');
  }
  if (environment.TRACE_PRODUCTION_WORKER_NAME !== productionTailSmokeBaseline.workerName) {
    fail('Worker target does not match trace-production.');
  }
  if (environment.TRACE_PRODUCTION_D1_ID !== productionTailSmokeBaseline.d1Id) {
    fail('D1 target does not match the dedicated production database.');
  }
  if (environment.TRACE_PRODUCTION_QUEUE_NAME !== productionTailSmokeBaseline.queueName) {
    fail('Queue target does not match trace-production-jobs.');
  }
  const token = environment.CLOUDFLARE_API_TOKEN;
  if (!token) fail('The protected Cloudflare credential is unavailable.');
  return token;
}

async function cloudflareRequest<T>(
  apiPath: string,
  token: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4${apiPath}`, {
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
    fail(`Cloudflare ${method} failed for ${apiPath}.`);
  }
  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    fail(`Cloudflare ${method} returned invalid JSON for ${apiPath} (HTTP ${response.status}).`);
  }
  if (!response.ok || envelope.success !== true || envelope.result === undefined) {
    const codes = (envelope.errors ?? [])
      .map((item) => item.code)
      .filter((code): code is number => typeof code === 'number');
    fail(
      `Cloudflare ${method} failed for ${apiPath} (HTTP ${response.status}; codes ${codes.join(',') || 'unavailable'}).`,
    );
  }
  return envelope.result;
}

function assertQueue(queue: Record<string, unknown>) {
  if (queue.queue_id !== productionTailSmokeBaseline.queueId) fail('Queue ID mismatch.');
  if (queue.queue_name !== productionTailSmokeBaseline.queueName) fail('Queue name mismatch.');
  if (queue.producers_total_count !== undefined && queue.producers_total_count !== 1) {
    fail('Queue producer count is not one.');
  }
  if (!Array.isArray(queue.producers) || queue.producers.length !== 1) {
    fail('Queue must report exactly one producer.');
  }
  const producer = queue.producers[0];
  if (
    !record(producer) ||
    producer.type !== 'worker' ||
    producer.script !== productionTailSmokeBaseline.workerName
  ) {
    fail('Queue producer is not trace-production.');
  }
  if (queue.consumers_total_count !== undefined && queue.consumers_total_count !== 1) {
    fail('Queue consumer count is not one.');
  }
  if (!Array.isArray(queue.consumers) || queue.consumers.length !== 1) {
    fail('Queue must report exactly one consumer.');
  }
  const consumer = queue.consumers[0];
  if (
    !record(consumer) ||
    (consumer.type !== undefined && consumer.type !== 'worker') ||
    (consumer.script_name !== undefined &&
      consumer.script_name !== productionTailSmokeBaseline.workerName) ||
    (consumer.queue_name !== undefined &&
      consumer.queue_name !== productionTailSmokeBaseline.queueName)
  ) {
    fail('Queue API consumer metadata conflicts with trace-production.');
  }
  const settings = consumer.settings;
  if (
    !record(settings) ||
    settings.batch_size !== 10 ||
    settings.max_wait_time_ms !== 5000 ||
    settings.max_retries !== 3 ||
    settings.retry_delay !== 60
  ) {
    fail('Queue batch/retry settings do not match the approved configuration.');
  }
}

function assertBindings(bindings: Binding[]) {
  const d1 = bindings.filter((binding) => binding.type === 'd1');
  const queues = bindings.filter((binding) => binding.type === 'queue');
  if (
    d1.length !== 1 ||
    d1[0]?.name !== 'DB' ||
    d1[0].database_id !== productionTailSmokeBaseline.d1Id
  ) {
    fail('Active Worker D1 binding is not the dedicated production database.');
  }
  if (
    queues.length !== 1 ||
    queues[0]?.name !== 'TRACE_QUEUE' ||
    queues[0].queue_name !== productionTailSmokeBaseline.queueName
  ) {
    fail('Active Worker Queue producer binding is not trace-production-jobs.');
  }
  if (bindings.some((binding) => binding.type === 'hyperdrive'))
    fail('Production Hyperdrive must be absent.');
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
    fail('Production Worker is not in closed D1-only mode.');
  }
  const fixtureNames = [
    'TRACE_CANARY_GITHUB_OWNER',
    'TRACE_CANARY_GITHUB_REPOSITORY',
    'TRACE_CANARY_GITHUB_REPOSITORY_ID',
  ];
  if (fixtureNames.some((name) => vars.has(name)))
    fail('Fixture allowlist variables must be absent.');
  return vars;
}

export async function verifyRestoredClosedBaseline(
  environment: Record<string, string | undefined>,
  fetchImplementation: typeof fetch = fetch,
) {
  const token = assertSmokeEnvironment(environment);
  const deploymentResult = await cloudflareRequest<{
    deployments?: Array<{
      id?: string;
      versions?: Array<{ version_id?: string; percentage?: number }>;
    }>;
  }>(
    `/accounts/${productionTailSmokeBaseline.accountId}/workers/scripts/${productionTailSmokeBaseline.workerName}/deployments?per_page=100`,
    token,
  );
  const deployment = deploymentResult.deployments?.[0];
  if (deployment?.id !== productionTailSmokeBaseline.deploymentId) {
    fail('Current production deployment is not the recorded rollback deployment.');
  }
  if (
    deployment.versions?.length !== 1 ||
    deployment.versions[0]?.version_id !== productionTailSmokeBaseline.versionId ||
    deployment.versions[0]?.percentage !== 100
  ) {
    fail(
      'Current production Worker version or traffic does not match the restored closed baseline.',
    );
  }
  const version = await cloudflareRequest<{ id?: string; resources?: { bindings?: Binding[] } }>(
    `/accounts/${productionTailSmokeBaseline.accountId}/workers/scripts/${productionTailSmokeBaseline.workerName}/versions/${productionTailSmokeBaseline.versionId}`,
    token,
  );
  if (
    version.id !== productionTailSmokeBaseline.versionId ||
    !Array.isArray(version.resources?.bindings)
  ) {
    fail('Current production Worker version metadata is unavailable.');
  }
  const variables = assertBindings(version.resources.bindings);

  const queue = await cloudflareRequest<Record<string, unknown>>(
    `/accounts/${productionTailSmokeBaseline.accountId}/queues/${productionTailSmokeBaseline.queueId}`,
    token,
  );
  assertQueue(queue);
  const queueConsumers = execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'wrangler',
      'queues',
      'consumer',
      'worker',
      'list',
      productionTailSmokeBaseline.queueName,
      '--json',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: token,
        CLOUDFLARE_ACCOUNT_ID: productionTailSmokeBaseline.accountId,
      },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
      windowsHide: true,
    },
  );
  try {
    assertWranglerProductionConsumer(JSON.parse(queueConsumers) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) fail('Wrangler Queue consumer output was not valid JSON.');
    throw error;
  }

  const query = await cloudflareRequest<unknown>(
    `/accounts/${productionTailSmokeBaseline.accountId}/d1/database/${productionTailSmokeBaseline.d1Id}/query`,
    token,
    { method: 'POST', body: { sql: buildProductionApplicationCountsSql(), params: [] } },
  );
  const counts = parseProductionApplicationCountsResult(query);
  assertProductionApplicationCountsEmpty(counts);
  const metrics = await cloudflareRequest<{ backlog_count?: unknown }>(
    `/accounts/${productionTailSmokeBaseline.accountId}/queues/${productionTailSmokeBaseline.queueId}/metrics`,
    token,
  );
  if (metrics.backlog_count !== 0) fail('Current production Queue backlog is not zero.');

  const health = await fetchImplementation(`${productionTailSmokeBaseline.publicUrl}/api/health`, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (health.status !== 200)
    fail(`Production health returned HTTP ${health.status}, expected 200.`);
  const oauth = await fetchImplementation(
    `${productionTailSmokeBaseline.publicUrl}/api/auth/github`,
    {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (oauth.status !== 503 || oauth.headers.get('cache-control')?.toLowerCase() !== 'no-store') {
    fail('Production OAuth start is not closed with cache-control no-store.');
  }

  console.log(`CURRENT_DEPLOYMENT_ID=${deployment.id}`);
  console.log(`CURRENT_WORKER_VERSION=${productionTailSmokeBaseline.versionId}`);
  console.log('CURRENT_TRAFFIC_PERCENT=100');
  console.log('TRACE_CANARY_MODE=closed');
  console.log(`D1_BINDING=${productionTailSmokeBaseline.d1Id}`);
  console.log(`QUEUE_BINDING=${productionTailSmokeBaseline.queueName}`);
  console.log('HYPERDRIVE=ABSENT');
  console.log('FIXTURE_ALLOWLIST_VARS=ABSENT');
  console.log('APPLICATION_TABLES_EMPTY=22/22');
  console.log('QUEUE_BACKLOG_COUNT=0');
  console.log('HEALTH=200');
  console.log('OAUTH_START=503 no-store');
  return {
    deploymentId: deployment.id!,
    versionId: productionTailSmokeBaseline.versionId,
    variables,
  };
}

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function readTextVariables(bindings: Binding[]) {
  return new Map(
    bindings
      .filter((binding) => binding.type === 'plain_text' && typeof binding.name === 'string')
      .map((binding) => [binding.name!, binding.text]),
  );
}

function materializeGeneratedClosedConfig(variables: Map<string | undefined, string | undefined>) {
  const sourceNames = Object.entries(productionGitHubRuntimeVariableSources);
  const sourceEnvironment: NodeJS.ProcessEnv = { ...process.env };
  delete sourceEnvironment.CLOUDFLARE_API_TOKEN;
  for (const [runtimeName, sourceName] of sourceNames) {
    const value = variables.get(runtimeName);
    if (typeof value !== 'string' || value.length === 0) {
      fail(`Deployed nonsecret Worker variable is unavailable for ${runtimeName}.`);
    }
    sourceEnvironment[sourceName] = value;
  }
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const args = [
    'exec',
    'tsx',
    'scripts/production-canary-preflight.ts',
    '--mode',
    'deploy',
    '--runtime-mode',
    'closed',
    '--production-d1-id',
    productionTailSmokeBaseline.d1Id,
    '--production-queue-name',
    productionTailSmokeBaseline.queueName,
    '--production-worker-name',
    productionTailSmokeBaseline.workerName,
    '--account-id',
    productionTailSmokeBaseline.accountId,
    '--write-config',
    'apps/web/.trace-cache/production-canary/wrangler.json',
  ];
  execFileSync(executable, args, {
    cwd: repositoryRoot,
    env: sourceEnvironment,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: 30_000,
    windowsHide: true,
  });
  return path.join(
    repositoryRoot,
    'apps',
    'web',
    '.trace-cache',
    'production-canary',
    'wrangler.json',
  );
}

function runLocalCloudflareBuild() {
  const buildEnvironment: NodeJS.ProcessEnv = { ...process.env };
  delete buildEnvironment.CLOUDFLARE_API_TOKEN;
  execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['cf:build'], {
    cwd: repositoryRoot,
    env: buildEnvironment,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: 12 * 60_000,
    windowsHide: true,
  });
}

export async function runTailSmoke(options: {
  token: string;
  accountId: string;
  versionId: string;
  configPath: string;
  kind: TailCommandKind;
  fetchImplementation?: typeof fetch;
}) {
  return runBoundedTailSession({
    kind: options.kind,
    workerName: productionTailSmokeBaseline.workerName,
    versionId: options.versionId,
    ...(options.kind === 'config' ? { configPath: options.configPath } : {}),
    accountId: options.accountId,
    token: options.token,
    fetchImplementation: options.fetchImplementation,
    onReady: async () => {
      const response = await (options.fetchImplementation ?? fetch)(
        `${productionTailSmokeBaseline.publicUrl}/api/health`,
        { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) },
      );
      if (response.status !== 200)
        throw new Error(`Health request during tail returned HTTP ${response.status}.`);
      console.log(`HEALTH_DURING_${options.kind.toUpperCase()}_TAIL=${response.status}`);
    },
  });
}

async function main() {
  const token = assertSmokeEnvironment(process.env);
  let configPath: string | undefined;
  try {
    const state = await verifyRestoredClosedBaseline(process.env);
    const versionOutput = execFileSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'wrangler', '--version'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: process.env,
        shell: process.platform === 'win32',
        windowsHide: true,
      },
    ).trim();
    console.log(`WRANGLER_VERSION=${versionOutput}`);
    console.log('TAIL_COMMAND_SHAPE=simple explicit Worker/version; no generated config; no --env');
    await runTailSmoke({
      token,
      accountId: productionTailSmokeBaseline.accountId,
      versionId: state.versionId,
      configPath: '',
      kind: 'simple',
    });
    console.log('TAIL_SMOKE_SIMPLE=PASS');

    runLocalCloudflareBuild();
    const versionResult = await cloudflareRequest<{ resources?: { bindings?: Binding[] } }>(
      `/accounts/${productionTailSmokeBaseline.accountId}/workers/scripts/${productionTailSmokeBaseline.workerName}/versions/${state.versionId}`,
      token,
    );
    const workerVariables = readTextVariables(versionResult.resources?.bindings ?? []);
    configPath = materializeGeneratedClosedConfig(workerVariables);
    if (!existsSync(configPath)) fail('Generated closed production Wrangler config is missing.');
    console.log('TAIL_COMMAND_SHAPE=config + --env production; exact explicit Worker version');
    await runTailSmoke({
      token,
      accountId: productionTailSmokeBaseline.accountId,
      versionId: state.versionId,
      configPath,
      kind: 'config',
    });
    console.log('TAIL_SMOKE_CONFIG=PASS');
    console.log('TAIL_SMOKE=PASS');
  } catch (error) {
    console.error('TAIL_SMOKE=FAILED');
    console.error(error instanceof Error ? error.message : 'Production tail smoke failed.');
    process.exitCode = 1;
  } finally {
    if (configPath) {
      rmSync(configPath, { force: true });
      if (existsSync(configPath)) {
        console.error('Generated temporary closed Wrangler config cleanup failed.');
        process.exitCode = 1;
      }
    }
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/production-tail-smoke.ts')) {
  void main();
}
