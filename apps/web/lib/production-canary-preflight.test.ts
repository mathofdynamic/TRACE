import productionManifest from '../production-canary.json';
import { describe, expect, it } from 'vitest';
import { buildProductionCanaryRuntimeVariables } from './production-canary';

const fixtureCanaryEnvironment = {
  owner: 'TRACE_CANARY_GITHUB_OWNER',
  repository: 'TRACE_CANARY_GITHUB_REPOSITORY',
  repositoryId: 'TRACE_CANARY_GITHUB_REPOSITORY_ID',
};

const runtimeConfiguration = {
  deploymentEnv: 'production',
  databaseDriver: 'd1',
  fixtureCanaryEnvironment,
};

const allowedEnvironment = {
  TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
  TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
  TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
};

describe('production canary deployment configuration', () => {
  it('keeps the checked-in production manifest closed and emits no fixture values', () => {
    expect(productionManifest.runtime.canaryMode).toBe('closed');
    expect(
      buildProductionCanaryRuntimeVariables(
        { ...runtimeConfiguration, canaryMode: 'closed' },
        allowedEnvironment,
      ),
    ).toEqual({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'closed',
    });
  });

  it('will materialize fixture vars only with all exact authorized values', () => {
    expect(
      buildProductionCanaryRuntimeVariables(
        { ...runtimeConfiguration, canaryMode: 'fixture' },
        allowedEnvironment,
      ),
    ).toEqual({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'fixture',
      ...allowedEnvironment,
    });
  });

  it.each([
    [
      'owner',
      {
        TRACE_CANARY_GITHUB_REPOSITORY: allowedEnvironment.TRACE_CANARY_GITHUB_REPOSITORY,
        TRACE_CANARY_GITHUB_REPOSITORY_ID: allowedEnvironment.TRACE_CANARY_GITHUB_REPOSITORY_ID,
      },
    ],
    [
      'repository',
      {
        TRACE_CANARY_GITHUB_OWNER: allowedEnvironment.TRACE_CANARY_GITHUB_OWNER,
        TRACE_CANARY_GITHUB_REPOSITORY_ID: allowedEnvironment.TRACE_CANARY_GITHUB_REPOSITORY_ID,
      },
    ],
    [
      'repository ID',
      {
        TRACE_CANARY_GITHUB_OWNER: allowedEnvironment.TRACE_CANARY_GITHUB_OWNER,
        TRACE_CANARY_GITHUB_REPOSITORY: allowedEnvironment.TRACE_CANARY_GITHUB_REPOSITORY,
      },
    ],
  ])('rejects fixture vars when %s is missing', (_label, environment) => {
    expect(() =>
      buildProductionCanaryRuntimeVariables(
        { ...runtimeConfiguration, canaryMode: 'fixture' },
        environment,
      ),
    ).toThrow(
      'Fixture deployment requires the exact authorized owner, repository, and repository ID.',
    );
  });

  it.each([
    ['owner', { ...allowedEnvironment, TRACE_CANARY_GITHUB_OWNER: 'other' }],
    ['repository', { ...allowedEnvironment, TRACE_CANARY_GITHUB_REPOSITORY: 'other' }],
    ['repository ID', { ...allowedEnvironment, TRACE_CANARY_GITHUB_REPOSITORY_ID: '7' }],
  ])('rejects a non-authorized fixture %s', (_label, environment) => {
    expect(() =>
      buildProductionCanaryRuntimeVariables(
        { ...runtimeConfiguration, canaryMode: 'fixture' },
        environment,
      ),
    ).toThrow(
      'Fixture deployment requires the exact authorized owner, repository, and repository ID.',
    );
  });

  it('rejects fixture values mapped from unexpected variable names', () => {
    expect(() =>
      buildProductionCanaryRuntimeVariables(
        {
          ...runtimeConfiguration,
          canaryMode: 'fixture',
          fixtureCanaryEnvironment: {
            ...fixtureCanaryEnvironment,
            owner: 'OTHER_GITHUB_OWNER',
          },
        },
        { ...allowedEnvironment, OTHER_GITHUB_OWNER: 'mathofdynamic' },
      ),
    ).toThrow('Fixture deployment variable names do not match the allowlist contract.');
  });
});
