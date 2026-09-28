import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import productionManifestJson from '../production-canary.json';
import { afterEach, describe, expect, it } from 'vitest';
import {
  writeProductionWranglerConfig,
  type CanaryManifest,
} from '../../../scripts/production-canary-preflight.js';
import {
  buildProductionGitHubRuntimeVariables,
  productionGitHubRuntimeVariableSources,
  productionWorkerSecretNames,
  productionWorkerSecretSources,
} from '../../../scripts/production-canary-runtime-config.js';
import {
  buildProductionWorkerSecrets,
  writeProductionWorkerSecretsFile,
} from '../../../scripts/production-canary-secrets.js';
import { assertProductionWorkerSecretNames } from '../../../scripts/verify-production-worker-secrets.js';
import { verifyProductionGitHubAppIdentity } from '../../../scripts/verify-production-github-app.js';

const productionManifest = productionManifestJson as unknown as CanaryManifest;

const productionVariableEnvironment = {
  TRACE_GITHUB_APP_ID: '5082884',
  TRACE_GITHUB_APP_CLIENT_ID: 'app-client-id-fake',
  TRACE_GITHUB_APP_SLUG: 'trace-production-integration',
  TRACE_GITHUB_APP_CALLBACK_URL:
    'https://trace-production.mathofdynamic2.workers.dev/api/github/setup',
  TRACE_GITHUB_APP_INSTALL_URL:
    'https://github.com/apps/trace-production-integration/installations/new',
  TRACE_GITHUB_OAUTH_CLIENT_ID: 'oauth-client-id-fake',
};

const productionSecretEnvironment = Object.fromEntries(
  Object.entries(productionWorkerSecretSources).map(([runtimeName, sourceName]) => [
    sourceName,
    `fake-secret-for-${runtimeName}`,
  ]),
);

const temporaryDirectories: string[] = [];

function createTemporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'trace-production-canary-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe('production GitHub runtime variable mapping', () => {
  it('maps all six TRACE_GITHUB_* sources to the exact runtime GITHUB_* names', () => {
    expect(
      buildProductionGitHubRuntimeVariables(
        productionManifest.githubRuntime,
        productionManifest.publicUrl,
        productionVariableEnvironment,
      ),
    ).toEqual({
      GITHUB_APP_ID: '5082884',
      GITHUB_APP_CLIENT_ID: 'app-client-id-fake',
      GITHUB_APP_SLUG: 'trace-production-integration',
      GITHUB_APP_CALLBACK_URL:
        'https://trace-production.mathofdynamic2.workers.dev/api/github/setup',
      GITHUB_APP_INSTALL_URL:
        'https://github.com/apps/trace-production-integration/installations/new',
      GITHUB_OAUTH_CLIENT_ID: 'oauth-client-id-fake',
    });
    expect(Object.keys(productionGitHubRuntimeVariableSources)).toHaveLength(6);
  });

  it.each(Object.values(productionGitHubRuntimeVariableSources))(
    'rejects a missing nonsecret source without leaking other values: %s',
    (sourceName) => {
      const environment = { ...productionVariableEnvironment, [sourceName]: undefined };
      expect(() =>
        buildProductionGitHubRuntimeVariables(
          productionManifest.githubRuntime,
          productionManifest.publicUrl,
          environment,
        ),
      ).toThrow(sourceName);
    },
  );

  it.each([
    [
      'a staging callback',
      { TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup' },
    ],
    [
      'a staging App install URL',
      {
        TRACE_GITHUB_APP_INSTALL_URL:
          'https://github.com/apps/trace-test-staging/installations/new',
      },
    ],
    ['an incorrect App ID', { TRACE_GITHUB_APP_ID: '1234' }],
    ['an incorrect App slug', { TRACE_GITHUB_APP_SLUG: 'trace-test-staging' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() =>
      buildProductionGitHubRuntimeVariables(
        productionManifest.githubRuntime,
        productionManifest.publicUrl,
        { ...productionVariableEnvironment, ...overrides },
      ),
    ).toThrow();
  });
});

describe('production Worker secrets file', () => {
  it('creates exactly five runtime secret keys and excludes the deploy token', () => {
    const secrets = buildProductionWorkerSecrets({
      ...productionSecretEnvironment,
      CLOUDFLARE_API_TOKEN: 'must-not-be-in-runtime-secrets',
    });
    expect(Object.keys(secrets)).toEqual([
      'GITHUB_APP_CLIENT_SECRET',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_OAUTH_CLIENT_SECRET',
      'TRACE_AUTH_SECRET',
    ]);
    expect(Object.keys(secrets)).toEqual(productionWorkerSecretNames);
    expect(JSON.stringify(secrets)).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(Object.keys(secrets)).not.toContain('CLOUDFLARE_API_TOKEN');
  });

  it.each(Object.values(productionWorkerSecretSources))(
    'rejects a missing source secret without including the supplied value: %s',
    (sourceName) => {
      const fakeSecret = 'fake-secret-never-in-error-output';
      const environment = { ...productionSecretEnvironment, [sourceName]: '' };
      let message = '';
      try {
        buildProductionWorkerSecrets(environment);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain(sourceName);
      expect(message).not.toContain(fakeSecret);
      expect(message).not.toContain('must-not-be-in-runtime-secrets');
    },
  );

  it('writes only under RUNNER_TEMP with restrictive permissions and an exact key set', () => {
    const runnerTemp = createTemporaryDirectory();
    const secretDirectory = path.join(runnerTemp, 'secrets');
    mkdirSync(secretDirectory);
    const outputPath = path.join(secretDirectory, 'worker-secrets.json');
    const names = writeProductionWorkerSecretsFile(outputPath, {
      ...productionSecretEnvironment,
      RUNNER_TEMP: runnerTemp,
      CLOUDFLARE_API_TOKEN: 'must-not-be-in-runtime-secrets',
    });
    const content = readFileSync(outputPath, 'utf8');
    expect(names).toEqual(productionWorkerSecretNames);
    expect(Object.keys(JSON.parse(content) as Record<string, unknown>)).toEqual(
      productionWorkerSecretNames,
    );
    expect(content).not.toContain('must-not-be-in-runtime-secrets');
    if (process.platform !== 'win32') {
      expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    }
  });

  it('rejects secret-file destinations outside RUNNER_TEMP', () => {
    const runnerTemp = createTemporaryDirectory();
    const outsidePath = path.join(os.tmpdir(), `trace-outside-${Date.now()}.json`);
    expect(() =>
      writeProductionWorkerSecretsFile(outsidePath, {
        ...productionSecretEnvironment,
        RUNNER_TEMP: runnerTemp,
      }),
    ).toThrow('inside RUNNER_TEMP');
  });
});

describe('production Worker secret metadata', () => {
  const requiredNames = productionWorkerSecretNames.map((name) => ({ name, type: 'secret_text' }));

  it('requires the five deployed names and rejects Cloudflare/source secrets', () => {
    expect(assertProductionWorkerSecretNames([], 'before')).toEqual([]);
    expect(assertProductionWorkerSecretNames(requiredNames, 'after')).toEqual(
      requiredNames.map(({ name }) => name).sort(),
    );
    expect(() =>
      assertProductionWorkerSecretNames(
        [...requiredNames, { name: 'CLOUDFLARE_API_TOKEN', type: 'secret_text' }],
        'after',
      ),
    ).toThrow('CLOUDFLARE_API_TOKEN');
    expect(() =>
      assertProductionWorkerSecretNames(
        [...requiredNames, { name: 'TRACE_GITHUB_APP_PRIVATE_KEY', type: 'secret_text' }],
        'after',
      ),
    ).toThrow('TRACE_GITHUB_APP_PRIVATE_KEY');
  });
});

describe('production Wrangler configuration', () => {
  it('declares only the five secrets and keeps the generated runtime closed and isolated', () => {
    const runnerTemp = createTemporaryDirectory();
    const destination = path.join(runnerTemp, 'wrangler.json');
    const config = writeProductionWranglerConfig(
      productionManifest,
      { mode: 'deploy' },
      destination,
      '8b79e87d-2aa5-48bc-8857-0e2b5cd755fa',
      'trace-production-jobs',
      productionVariableEnvironment,
    );
    const production = config.env.production;
    expect(production.secrets.required).toEqual([
      'GITHUB_APP_CLIENT_SECRET',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_OAUTH_CLIENT_SECRET',
      'TRACE_AUTH_SECRET',
    ]);
    expect(production.vars).toMatchObject({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'closed',
      GITHUB_APP_ID: '5082884',
      GITHUB_APP_CALLBACK_URL:
        'https://trace-production.mathofdynamic2.workers.dev/api/github/setup',
      GITHUB_APP_INSTALL_URL:
        'https://github.com/apps/trace-production-integration/installations/new',
    });
    expect(production.vars).not.toHaveProperty('TRACE_GITHUB_APP_ID');
    expect(production.vars).not.toHaveProperty('TRACE_CANARY_GITHUB_OWNER');
    expect(production.vars).not.toHaveProperty('TRACE_CANARY_GITHUB_REPOSITORY');
    expect(production.vars).not.toHaveProperty('TRACE_CANARY_GITHUB_REPOSITORY_ID');
    expect(production.vars).not.toHaveProperty('CLOUDFLARE_API_TOKEN');
    expect(production).not.toHaveProperty('hyperdrive');
    expect(production.d1_databases).toEqual([
      expect.objectContaining({ database_id: '8b79e87d-2aa5-48bc-8857-0e2b5cd755fa' }),
    ]);
    expect(production.queues.producers).toEqual([
      { binding: 'TRACE_QUEUE', queue: 'trace-production-jobs' },
    ]);
  });
});

describe('production GitHub App identity proof', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  it('signs a short-lived JWT and performs only GET /app for identity proof', async () => {
    const fetchImplementation: typeof fetch = async (input, init) => {
      expect(String(input)).toBe('https://api.github.com/app');
      expect(init?.method).toBe('GET');
      const authorization = new Headers(init?.headers).get('authorization');
      expect(authorization?.startsWith('Bearer ')).toBe(true);
      const token = authorization!.slice('Bearer '.length);
      const [header, payload, signature] = token.split('.');
      if (!header || !payload || !signature) throw new Error('App JWT did not have three parts.');
      expect(JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))).toEqual({
        alg: 'RS256',
        typ: 'JWT',
      });
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        iss: string;
        iat: number;
        exp: number;
      };
      expect(claims.iss).toBe('5082884');
      expect(claims.exp - claims.iat).toBe(8 * 60);
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(`${header}.${payload}`),
          publicKey,
          Buffer.from(signature, 'base64url'),
        ),
      ).toBe(true);
      return new Response(
        JSON.stringify({
          id: 5082884,
          name: 'TRACE Production Integration',
          client_id: 'fake-production-app-client-id',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };

    await expect(
      verifyProductionGitHubAppIdentity(
        '5082884',
        'fake-production-app-client-id',
        pem,
        fetchImplementation,
      ),
    ).resolves.toEqual({ id: '5082884', name: 'TRACE Production Integration' });
  });

  it('rejects a different App identity without exposing the private key', async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(JSON.stringify({ id: 123, name: 'other' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    let message = '';
    try {
      await verifyProductionGitHubAppIdentity(
        '5082884',
        'fake-production-app-client-id',
        pem,
        fetchImplementation,
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('does not match the registered production App');
    expect(message).not.toContain(pem);
  });

  it('rejects a client ID that differs from the authenticated App response', async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: 5082884,
          name: 'TRACE Production Integration',
          client_id: 'actual-production-client-id',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    await expect(
      verifyProductionGitHubAppIdentity(
        '5082884',
        'different-production-client-id',
        pem,
        fetchImplementation,
      ),
    ).rejects.toThrow('does not match the registered production App');
  });
});

describe('production canary deployment workflow', () => {
  it('keeps deployment manual, exact-SHA, closed-by-default, and binds secrets atomically', () => {
    const workflowPath = fileURLToPath(
      new URL('../../../.github/workflows/validate-production-canary.yml', import.meta.url),
    );
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^\s*(push|pull_request):/m);
    expect(workflow).toContain('environment: production-canary');
    expect(workflow).toMatch(
      /runtime_mode:[\s\S]*?default: closed[\s\S]*?- closed[\s\S]*?- fixture/,
    );
    expect(workflow).toContain('scripts/production-canary-deploy-contract.ts');
    const deploymentContract = readFileSync(
      fileURLToPath(
        new URL('../../../scripts/production-canary-deploy-contract.ts', import.meta.url),
      ),
      'utf8',
    );
    expect(deploymentContract).toContain('DEPLOY_TRACE_PRODUCTION_CANARY');
    expect(deploymentContract).toContain('DEPLOY_TRACE_PRODUCTION_FIXTURE_CANARY');
    expect(workflow).toContain('--runtime-mode "$RUNTIME_MODE"');
    expect(workflow).toContain('scripts/verify-production-fixture-transition.ts before');
    expect(workflow).toContain('scripts/verify-production-fixture-transition.ts after');
    expect(workflow).toContain('scripts/production-fixture-tail-acceptance.ts');
    expect(workflow).toContain('scripts/verify-production-github-app-state.ts');
    expect(workflow).toContain('scripts/verify-production-fixture-transition.ts rollback');
    expect(workflow).toContain(
      'scripts/verify-production-fixture-transition.ts rollback-if-needed',
    );
    const transitionScript = readFileSync(
      fileURLToPath(
        new URL('../../../scripts/verify-production-fixture-transition.ts', import.meta.url),
      ),
      'utf8',
    );
    expect(transitionScript).toContain("'wrangler'");
    expect(transitionScript).toContain('productionFixtureTransitionBaseline.workerVersionId');
    expect(transitionScript).toContain('formatFixtureDeploymentOutputs(result)');
    expect(transitionScript).toContain('appendFileSync(outputPath');
    expect(workflow).not.toMatch(/^ {6}CLOUDFLARE_API_TOKEN:/m);
    expect(workflow).toContain('scripts/verify-production-github-app.ts');
    expect(workflow).toContain('scripts/production-canary-secrets.ts --output "$secrets_file"');
    expect(workflow.match(/--secrets-file "\$secrets_file"/g)).toHaveLength(2);
    expect(workflow).not.toMatch(/wrangler\s+secret\s+(put|bulk)/);
    expect(workflow).toContain(
      'TRACE_GITHUB_APP_PRIVATE_KEY: ${{ secrets.TRACE_GITHUB_APP_PRIVATE_KEY }}',
    );
    expect(workflow).toContain(
      'TRACE_GITHUB_APP_CLIENT_ID: ${{ vars.TRACE_GITHUB_APP_CLIENT_ID }}',
    );
    expect(workflow).toContain(
      'TRACE_GITHUB_OAUTH_CLIENT_SECRET: ${{ secrets.TRACE_GITHUB_OAUTH_CLIENT_SECRET }}',
    );
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(workflow).toContain(
      "- name: Validate provisioned production identity\n        if: ${{ inputs.mode == 'deploy' }}\n        shell: bash\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
    );
    const deployStep = workflow
      .split('- name: Deploy production canary\n')[1]
      ?.split('\n      - name: ')[0];
    expect(deployStep).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(productionManifest.runtime.canaryMode).toBe('closed');
  });

  it('captures exact fixture deployment identity before secrets/routes and pins a ready simple tail', () => {
    const workflowPath = fileURLToPath(
      new URL('../../../.github/workflows/validate-production-canary.yml', import.meta.url),
    );
    const workflow = readFileSync(workflowPath, 'utf8');
    const deploy = workflow.indexOf('- name: Deploy production canary');
    const capture = workflow.indexOf(
      '- name: Capture deployed fixture identity before acceptance probes',
    );
    const secrets = workflow.indexOf('- name: Verify deployed production Worker secret names');
    const wranglerVersion = workflow.indexOf(
      '- name: Record Wrangler version for bounded tail diagnostics',
    );
    const tail = workflow.indexOf(
      '- name: Verify fixture routes and bounded production error tail',
    );
    const postProbes = workflow.indexOf(
      '- name: Verify fixture transition side effects after acceptance probes',
    );

    expect(deploy).toBeGreaterThanOrEqual(0);
    expect(capture).toBeGreaterThan(deploy);
    expect(secrets).toBeGreaterThan(capture);
    expect(wranglerVersion).toBeGreaterThan(secrets);
    expect(tail).toBeGreaterThan(secrets);
    expect(tail).toBeGreaterThan(wranglerVersion);
    expect(postProbes).toBeGreaterThan(tail);
    expect(workflow).toContain('after --capture-deployment-outputs');
    expect(workflow).toContain(
      'WORKER_VERSION_ID: ${{ steps.capture_fixture_identity.outputs.worker_version_id }}',
    );
    expect(workflow).toContain(
      'WRANGLER_VERSION: ${{ steps.tail_wrangler_version.outputs.version }}',
    );
    expect(workflow).toContain('pnpm exec wrangler --version');
    expect(workflow).toContain('run: pnpm exec tsx scripts/production-fixture-tail-acceptance.ts');
    const obsoleteConfigTail = ['wrangler tail trace-production \\', '--config'].join('\n');
    expect(workflow).not.toContain(obsoleteConfigTail);

    const tailScript = readFileSync(
      fileURLToPath(
        new URL('../../../scripts/production-fixture-tail-acceptance.ts', import.meta.url),
      ),
      'utf8',
    );
    expect(tailScript).toContain("kind: 'simple'");
    expect(tailScript).toContain('workerName: productionTailTarget.workerName');
    expect(tailScript).toContain('versionId: options.workerVersionId');
    expect(tailScript).toContain('onReady: async () =>');
    expect(tailScript).toContain('verifyRoutes(options.oauthClientId)');
    expect(tailScript).not.toContain('--config');
    expect(tailScript).not.toContain('--env');
  });
});
