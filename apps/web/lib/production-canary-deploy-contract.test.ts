import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import productionManifestJson from '../production-canary.json';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveProductionCanaryRuntimeMode,
  validateProductionCanaryDispatch,
} from '../../../scripts/production-canary-deploy-contract.js';
import {
  buildProductionCanaryRuntimeVars,
  runProductionCanaryPreflight,
  writeProductionWranglerConfig,
  type CanaryManifest,
} from '../../../scripts/production-canary-preflight.js';

const manifest = productionManifestJson as unknown as CanaryManifest;
const productionVariables = {
  TRACE_GITHUB_APP_ID: '5082884',
  TRACE_GITHUB_APP_CLIENT_ID: 'fake-app-client-id',
  TRACE_GITHUB_APP_SLUG: 'trace-production-integration',
  TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
  TRACE_GITHUB_APP_INSTALL_URL:
    'https://github.com/apps/trace-production-integration/installations/new',
  TRACE_GITHUB_OAUTH_CLIENT_ID: 'fake-oauth-client-id',
};
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryConfigPath() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'trace-fixture-canary-test-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'wrangler.json');
}

describe('production canary deployment runtime mode', () => {
  it('defaults a missing runtime mode to closed', () => {
    expect(resolveProductionCanaryRuntimeMode(undefined)).toBe('closed');
    expect(resolveProductionCanaryRuntimeMode('')).toBe('closed');
  });

  it('accepts only the explicitly supported closed and fixture modes', () => {
    expect(resolveProductionCanaryRuntimeMode('closed')).toBe('closed');
    expect(resolveProductionCanaryRuntimeMode('fixture')).toBe('fixture');
    expect(() => resolveProductionCanaryRuntimeMode('open')).toThrow(
      'Unsupported production runtime mode',
    );
  });

  it('requires action-specific confirmation and never cross-authorizes modes', () => {
    expect(
      validateProductionCanaryDispatch('deploy', 'closed', 'DEPLOY_TRACE_PRODUCTION_CANARY'),
    ).toEqual({ action: 'deploy', runtimeMode: 'closed' });
    expect(
      validateProductionCanaryDispatch(
        'deploy',
        'fixture',
        'DEPLOY_TRACE_PRODUCTION_FIXTURE_CANARY',
      ),
    ).toEqual({ action: 'deploy', runtimeMode: 'fixture' });
    expect(() =>
      validateProductionCanaryDispatch('deploy', 'fixture', 'DEPLOY_TRACE_PRODUCTION_CANARY'),
    ).toThrow('fixture deployment requires its exact confirmation');
    expect(() =>
      validateProductionCanaryDispatch(
        'deploy',
        'closed',
        'DEPLOY_TRACE_PRODUCTION_FIXTURE_CANARY',
      ),
    ).toThrow('closed deployment requires its exact confirmation');
    expect(() => validateProductionCanaryDispatch('deploy', 'open', 'anything')).toThrow(
      'Unsupported production runtime mode',
    );
    expect(() => validateProductionCanaryDispatch('publish', 'closed', '')).toThrow(
      'Unsupported production deployment action',
    );
  });

  it('keeps the checked-in manifest closed and ignores caller-supplied fixture identities', () => {
    expect(manifest.runtime.canaryMode).toBe('closed');
    expect(
      buildProductionCanaryRuntimeVars(manifest, {
        ...productionVariables,
        TRACE_CANARY_GITHUB_OWNER: 'attacker',
        TRACE_CANARY_GITHUB_REPOSITORY: 'other-repository',
        TRACE_CANARY_GITHUB_REPOSITORY_ID: '12',
      }),
    ).toMatchObject({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'closed',
    });
    expect(
      Object.keys(buildProductionCanaryRuntimeVars(manifest, productionVariables)).filter((name) =>
        name.startsWith('TRACE_CANARY_GITHUB_'),
      ),
    ).toEqual([]);
  });

  it('materializes exactly the canonical fixture allowlist only for fixture mode', () => {
    const variables = buildProductionCanaryRuntimeVars(
      manifest,
      {
        ...productionVariables,
        TRACE_CANARY_GITHUB_OWNER: 'untrusted-owner',
        TRACE_CANARY_GITHUB_REPOSITORY: 'untrusted-repository',
        TRACE_CANARY_GITHUB_REPOSITORY_ID: '42',
      },
      'fixture',
    );
    const fixtureVars = Object.fromEntries(
      Object.entries(variables).filter(([name]) => name.startsWith('TRACE_CANARY_GITHUB_')),
    );
    expect(fixtureVars).toEqual({
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
    });
    expect(Object.keys(fixtureVars).sort()).toEqual([
      'TRACE_CANARY_GITHUB_OWNER',
      'TRACE_CANARY_GITHUB_REPOSITORY',
      'TRACE_CANARY_GITHUB_REPOSITORY_ID',
    ]);
    expect(variables.TRACE_CANARY_MODE).toBe('fixture');
  });

  it('generates fixed fixture variables while preserving GitHub vars, secrets, and resource guards', () => {
    const config = writeProductionWranglerConfig(
      manifest,
      { mode: 'deploy', runtimeMode: 'fixture' },
      temporaryConfigPath(),
      '7a566f2e-da27-46e7-8c3f-271e5566f225',
      'trace-production-jobs',
      productionVariables,
    );
    const production = config.env.production;
    expect(production.vars).toMatchObject({
      TRACE_CANARY_MODE: 'fixture',
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
      GITHUB_APP_ID: '5082884',
      GITHUB_APP_CLIENT_ID: 'fake-app-client-id',
      GITHUB_APP_SLUG: 'trace-production-integration',
      GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
      GITHUB_APP_INSTALL_URL:
        'https://github.com/apps/trace-production-integration/installations/new',
      GITHUB_OAUTH_CLIENT_ID: 'fake-oauth-client-id',
    });
    expect(
      Object.fromEntries(
        Object.entries(production.vars).filter(([name]) => name.startsWith('TRACE_CANARY_GITHUB_')),
      ),
    ).toEqual({
      TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
      TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
      TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
    });
    expect(production.secrets.required).toEqual([
      'GITHUB_APP_CLIENT_SECRET',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_OAUTH_CLIENT_SECRET',
      'TRACE_AUTH_SECRET',
    ]);
    expect(production.d1_databases).toEqual([
      expect.objectContaining({
        binding: 'DB',
        database_id: '7a566f2e-da27-46e7-8c3f-271e5566f225',
      }),
    ]);
    expect(production.queues.producers).toEqual([
      { binding: 'TRACE_QUEUE', queue: 'trace-production-jobs' },
    ]);
    expect(production).not.toHaveProperty('hyperdrive');
  });

  it('rejects staging and rehearsal resource IDs for fixture materialization', () => {
    for (const databaseId of [
      'c4df63bc-8270-4500-9dab-c1c6439efa64',
      '5075dc29-954f-4f65-a38a-0d22e7c076ac',
    ]) {
      expect(() =>
        runProductionCanaryPreflight({
          mode: 'deploy',
          runtimeMode: 'fixture',
          d1Id: databaseId,
          queueName: 'trace-production-jobs',
          workerName: 'trace-production',
          accountId: manifest.accountId,
        }),
      ).toThrow();
    }
  });

  it('rejects an unknown runtime mode before generating a production config', () => {
    expect(() =>
      writeProductionWranglerConfig(
        manifest,
        { mode: 'deploy', runtimeMode: 'open' },
        temporaryConfigPath(),
        '7a566f2e-da27-46e7-8c3f-271e5566f225',
        'trace-production-jobs',
        productionVariables,
      ),
    ).toThrow('Unsupported production runtime mode');
  });
});
