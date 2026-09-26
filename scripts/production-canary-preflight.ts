import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProductionCanaryRuntimeVariables } from '../apps/web/lib/production-canary.js';

type CanaryManifest = {
  schemaVersion: number;
  accountId: string;
  workerName: string;
  publicUrl: string;
  runtime: {
    deploymentEnv: string;
    databaseDriver: string;
    canaryMode: 'closed' | 'fixture';
  };
  fixtureCanaryEnvironment: {
    owner: string;
    repository: string;
    repositoryId: string;
  };
  d1: {
    binding: string;
    databaseName: string;
    databaseIdEnv: string;
    stagingDatabaseId: string;
    rehearsalDatabaseId: string;
    migrationsDir: string;
  };
  queue: {
    binding: string;
    queueName: string;
    queueNameEnv: string;
    stagingQueueName: string;
    maxBatchSize: number;
    maxBatchTimeout: number;
    maxRetries: number;
    retryDelay: number;
  };
  migrations: string[];
  requiredSecretNames: string[];
};

type PreflightOptions = {
  mode: 'validate-only' | 'deploy';
  d1Id?: string;
  queueName?: string;
  workerName?: string;
  accountId?: string;
  bundleEntry?: string;
  assetsDir?: string;
  writeConfig?: string;
};

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = path.join(root, 'apps', 'web', 'production-canary.json');
const configDirectory = path.join(root, 'apps', 'web', '.trace-cache', 'production-canary');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadCanaryManifest(): CanaryManifest {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CanaryManifest;
  if (manifest.schemaVersion !== 1)
    throw new Error('Unsupported production canary manifest version.');
  return manifest;
}

export function buildProductionCanaryRuntimeVars(
  manifest: CanaryManifest,
  environment: Record<string, string | undefined> = process.env,
) {
  return buildProductionCanaryRuntimeVariables(
    {
      ...manifest.runtime,
      fixtureCanaryEnvironment: manifest.fixtureCanaryEnvironment,
    },
    environment,
  );
}

function fail(message: string): never {
  throw new Error(`Production canary preflight failed: ${message}`);
}

function requireSafeName(value: string, label: string) {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(value)) fail(`${label} has an invalid resource name.`);
}

function validateStaticManifest(manifest: CanaryManifest) {
  if (manifest.workerName !== 'trace-production') fail('Worker name is not trace-production.');
  if (manifest.runtime.deploymentEnv !== 'production')
    fail('Deployment environment is not production.');
  if (manifest.runtime.databaseDriver !== 'd1') fail('Production database driver is not d1.');
  if (manifest.runtime.canaryMode !== 'closed')
    fail('The production deployment preflight must remain in closed canary mode.');
  if (
    manifest.fixtureCanaryEnvironment.owner !== 'TRACE_CANARY_GITHUB_OWNER' ||
    manifest.fixtureCanaryEnvironment.repository !== 'TRACE_CANARY_GITHUB_REPOSITORY' ||
    manifest.fixtureCanaryEnvironment.repositoryId !== 'TRACE_CANARY_GITHUB_REPOSITORY_ID'
  ) {
    fail('Fixture canary environment variable names do not match the required allowlist contract.');
  }
  buildProductionCanaryRuntimeVars(manifest);
  if (!/^https:\/\/trace-production\.[a-z0-9-]+\.workers\.dev\/$/.test(`${manifest.publicUrl}/`)) {
    fail('Production public URL is not an account-qualified workers.dev URL.');
  }
  if (manifest.d1.binding !== 'DB') fail('Production D1 binding must be DB.');
  if (manifest.queue.binding !== 'TRACE_QUEUE')
    fail('Production Queue binding must be TRACE_QUEUE.');
  requireSafeName(manifest.d1.databaseName, 'D1 database');
  requireSafeName(manifest.queue.queueName, 'Queue');
  if (manifest.d1.databaseName === 'trace-test-staging-db')
    fail('Production D1 name is the staging D1 name.');
  if (manifest.queue.queueName === manifest.queue.stagingQueueName) {
    fail('Production Queue name is the staging Queue name.');
  }
  if (!manifest.migrations.length) fail('No migrations are declared.');
  const migrationsDirectory = path.join(root, manifest.d1.migrationsDir);
  for (const migration of manifest.migrations) {
    if (!existsSync(path.join(migrationsDirectory, migration))) {
      fail(`Expected migration is missing: ${migration}`);
    }
  }
  if (manifest.requiredSecretNames.some((name) => !/^[A-Z][A-Z0-9_]+$/.test(name))) {
    fail('A required secret name is invalid.');
  }
}

function validateResourceIdentity(manifest: CanaryManifest, options: PreflightOptions) {
  const d1Id = options.d1Id ?? process.env[manifest.d1.databaseIdEnv];
  const queueName = options.queueName ?? process.env[manifest.queue.queueNameEnv];
  const workerName = options.workerName ?? process.env.TRACE_PRODUCTION_WORKER_NAME;
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;

  if (accountId && accountId !== manifest.accountId)
    fail('Cloudflare account ID does not match the manifest.');
  if (workerName && workerName !== manifest.workerName)
    fail('Worker target does not match trace-production.');
  if (queueName && queueName !== manifest.queue.queueName)
    fail('Queue target does not match trace-production-jobs.');

  if (options.mode === 'validate-only' && !d1Id && !queueName) {
    return { d1Id: undefined, queueName: manifest.queue.queueName, resourceIdsPresent: false };
  }
  if (!d1Id || !queueName)
    fail('Both the production D1 ID and Queue name are required for deployment.');
  if (!uuidPattern.test(d1Id)) fail('Production D1 ID is not a UUID.');
  if (d1Id === manifest.d1.stagingDatabaseId) fail('Production D1 ID points to staging.');
  if (d1Id === manifest.d1.rehearsalDatabaseId)
    fail('Production D1 ID points to the retained rehearsal database.');
  if (queueName === manifest.queue.stagingQueueName) fail('Production Queue points to staging.');
  return { d1Id, queueName, resourceIdsPresent: true };
}

function validateBundle(options: PreflightOptions) {
  if (!options.bundleEntry) return;
  if (!existsSync(options.bundleEntry))
    fail(`Bundled Worker entry is missing: ${options.bundleEntry}`);
  const bytes = statSync(options.bundleEntry).size;
  const maxBytes = 64 * 1024 * 1024;
  if (bytes > maxBytes) fail(`Bundled Worker is ${bytes} bytes; the 64 MiB limit is exceeded.`);
  if (options.assetsDir) {
    if (!existsSync(options.assetsDir)) fail(`Asset directory is missing: ${options.assetsDir}`);
    const assets = readdirSync(options.assetsDir, { recursive: true });
    if (
      !assets.some(
        (entry) => typeof entry === 'string' && existsSync(path.join(options.assetsDir!, entry)),
      )
    ) {
      fail('The Worker asset directory is empty.');
    }
    console.log(`Bundle: ${bytes} bytes; assets: ${assets.length}`);
  } else {
    console.log(`Bundle: ${bytes} bytes`);
  }
}

function relativeConfigPath(configPath: string, target: string) {
  return path.relative(path.dirname(configPath), target).replaceAll(path.sep, '/');
}

export function writeProductionWranglerConfig(
  manifest: CanaryManifest,
  options: PreflightOptions,
  destination: string,
  d1Id: string,
  queueName: string,
) {
  const webDirectory = path.join(root, 'apps', 'web');
  const config = {
    $schema: '../../node_modules/wrangler/config-schema.json',
    account_id: manifest.accountId,
    compatibility_date: '2026-08-08',
    compatibility_flags: ['nodejs_compat'],
    preview_urls: false,
    observability: { enabled: true, head_sampling_rate: 1 },
    env: {
      production: {
        name: manifest.workerName,
        main: relativeConfigPath(destination, path.join(webDirectory, 'custom-worker.ts')),
        workers_dev: true,
        vars: {
          ...buildProductionCanaryRuntimeVars(manifest),
          TRACE_PUBLIC_URL: manifest.publicUrl,
          NEXT_PRIVATE_MINIMAL_MODE: '1',
          TRACE_FEATURE_SEMANTIC_PR_FINDINGS: 'false',
          TRACE_FEATURE_SEMANTIC_CONFLICTS: 'false',
          TRACE_FEATURE_GITHUB_COMMENTS: 'false',
          TRACE_FEATURE_HYBRID_SYNC: 'false',
        },
        assets: {
          directory: relativeConfigPath(
            destination,
            path.join(webDirectory, '.open-next', 'assets'),
          ),
          binding: 'ASSETS',
        },
        d1_databases: [
          {
            binding: manifest.d1.binding,
            database_name: manifest.d1.databaseName,
            database_id: d1Id,
            migrations_dir: relativeConfigPath(
              destination,
              path.join(root, manifest.d1.migrationsDir),
            ),
          },
        ],
        queues: {
          producers: [{ binding: manifest.queue.binding, queue: queueName }],
          consumers: [
            {
              queue: queueName,
              max_batch_size: manifest.queue.maxBatchSize,
              max_batch_timeout: manifest.queue.maxBatchTimeout,
              max_retries: manifest.queue.maxRetries,
              retry_delay: manifest.queue.retryDelay,
            },
          ],
        },
      },
    },
  };
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

function parseArgs(argv: string[]): PreflightOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}.`);
    values.set(key, value);
    index += 1;
  }
  const mode = values.get('mode') ?? 'validate-only';
  if (mode !== 'validate-only' && mode !== 'deploy') fail('Mode must be validate-only or deploy.');
  return {
    mode,
    d1Id: values.get('production-d1-id'),
    queueName: values.get('production-queue-name'),
    workerName: values.get('production-worker-name'),
    accountId: values.get('account-id'),
    bundleEntry: values.get('bundle-entry'),
    assetsDir: values.get('assets-dir'),
    writeConfig: values.get('write-config'),
  };
}

export function runProductionCanaryPreflight(options: PreflightOptions) {
  const manifest = loadCanaryManifest();
  validateStaticManifest(manifest);
  const resources = validateResourceIdentity(manifest, options);
  validateBundle(options);
  if (options.mode === 'deploy') {
    if (!resources.d1Id || !resources.queueName)
      fail('Deployment resource identity is incomplete.');
    const destination = options.writeConfig ?? path.join(configDirectory, 'wrangler.json');
    const config = writeProductionWranglerConfig(
      manifest,
      options,
      destination,
      resources.d1Id,
      resources.queueName,
    );
    if ('hyperdrive' in config.env.production)
      fail('Generated production config contains Hyperdrive.');
    console.log(`Generated production Wrangler config: ${destination}`);
  } else if (options.writeConfig) {
    fail('Validate-only mode must not write a deployable production config.');
  }
  console.log(`Production canary preflight: ${options.mode}`);
  console.log(`Worker: ${manifest.workerName}`);
  console.log(
    `D1: ${manifest.d1.databaseName}${resources.resourceIdsPresent ? ` (${resources.d1Id})` : ' (ID not provisioned)'}`,
  );
  console.log(`Queue: ${resources.queueName}`);
  console.log(`Canary mode: ${manifest.runtime.canaryMode}`);
  console.log(`Required secrets: ${manifest.requiredSecretNames.join(', ')}`);
  return { manifest, resources };
}

function main() {
  try {
    runProductionCanaryPreflight(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) main();
