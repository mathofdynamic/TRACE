import { validateProductionCanaryDispatch } from '../../../scripts/production-canary-deploy-contract.js';
import { describe, expect, it } from 'vitest';
import {
  canaryUserEligibility,
  canaryInstallationSnapshotEligibility,
  canaryRepositorySelectionEligibility,
  canaryWebhookPayloadEligibility,
  canaryWebhookRecoveryEligibility,
  resolveProductionCanaryMode,
  scopeCanaryInstallationSnapshot,
  buildProductionCanaryRuntimeVariables,
} from './production-canary';
const env = { TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'owner' };
const repo = {
  id: 9,
  owner: 'mathofdynamic',
  name: 'TRACE',
  fullName: 'mathofdynamic/TRACE',
  defaultBranch: 'main',
  visibility: 'private',
  permissions: {},
};
const snapshot = {
  installation: {
    id: 166179374,
    accountLogin: 'mathofdynamic',
    accountType: 'User',
    repositorySelection: 'all' as const,
    suspendedAt: null,
    permissions: {},
  },
  repositories: [repo],
};
const record = {
  githubRepositoryId: '9',
  owner: repo.owner,
  name: repo.name,
  fullName: repo.fullName,
  githubInstallationId: '166179374',
  installationState: 'active',
  organizationId: 'workspace',
  installationOrganizationId: 'workspace',
  installationAccountLogin: 'mathofdynamic',
};
const payload = {
  installation: { id: 166179374 },
  repository: { id: 9, owner: { login: repo.owner }, name: repo.name, full_name: repo.fullName },
};
describe('explicit owner production boundaries', () => {
  it('requires an owner-specific deployment confirmation', () => {
    expect(() =>
      validateProductionCanaryDispatch('deploy', 'owner', 'DEPLOY_TRACE_PRODUCTION_OWNER'),
    ).not.toThrow();
    expect(() =>
      validateProductionCanaryDispatch('deploy', 'owner', 'DEPLOY_TRACE_PRODUCTION_FIXTURE_CANARY'),
    ).toThrow();
    expect(() =>
      validateProductionCanaryDispatch('deploy', 'invalid', 'DEPLOY_TRACE_PRODUCTION_OWNER'),
    ).toThrow();
  });
  it('resolves owner without fixture configuration and leaves closed/unknown modes closed', () => {
    expect(resolveProductionCanaryMode(env).kind).toBe('owner');
    for (const mode of ['closed', 'unknown', '', 'OWNER', 'owner '])
      expect(resolveProductionCanaryMode({ ...env, TRACE_CANARY_MODE: mode }).kind).toBe('closed');
    expect(resolveProductionCanaryMode({ ...env, TRACE_CANARY_MODE: 'fixture' }).kind).toBe(
      'closed',
    );
  });
  it.each(['mathofdynamic', 'MathOfDynamic'])('permits only normalized owner %s', (login) =>
    expect(canaryUserEligibility(env, { githubLogin: login }).allowed).toBe(true),
  );
  it.each(['customer', ' mathofdynamic', 'mathofdynamic ', null])(
    'rejects other/malformed users',
    (login) => expect(canaryUserEligibility(env, { githubLogin: login }).allowed).toBe(false),
  );
  it('catalogues trusted installation repositories without requiring the fixture', () => {
    expect(canaryInstallationSnapshotEligibility(env, snapshot).allowed).toBe(true);
    expect(scopeCanaryInstallationSnapshot(env, snapshot).repositories).toEqual([repo]);
  });
  it.each([
    { id: 9 },
    { accountLogin: 'other' },
    { suspendedAt: '2026-10-03' },
    { repositorySelection: 'invalid' },
    { accountType: 'Organization' },
  ])('rejects unauthorized installation metadata', (overrides) =>
    expect(
      canaryInstallationSnapshotEligibility(env, {
        ...snapshot,
        installation: { ...snapshot.installation, ...overrides },
      }).allowed,
    ).toBe(false),
  );
  it('rejects forged repository metadata and duplicate IDs', () => {
    expect(
      canaryInstallationSnapshotEligibility(env, {
        ...snapshot,
        repositories: [{ ...repo, id: '9' }],
      }).allowed,
    ).toBe(false);
    expect(
      canaryInstallationSnapshotEligibility(env, {
        ...snapshot,
        repositories: [repo, { ...repo, id: '9' }],
      }).allowed,
    ).toBe(false);
    expect(
      canaryWebhookPayloadEligibility(env, 'issues', {
        ...payload,
        repository: { ...payload.repository, id: '9' },
      }).allowed,
    ).toBe(false);
    expect(
      canaryInstallationSnapshotEligibility(env, {
        ...snapshot,
        repositories: [{ ...repo, owner: 'other' }],
      }).allowed,
    ).toBe(false);
    expect(
      canaryInstallationSnapshotEligibility(env, { ...snapshot, repositories: [repo, repo] })
        .allowed,
    ).toBe(false);
  });
  it('permits trusted owner catalog selection and rejects foreign installation/account records', () => {
    expect(canaryRepositorySelectionEligibility(env, [record]).allowed).toBe(true);
    expect(canaryRepositorySelectionEligibility(env, []).allowed).toBe(true);
    for (const overrides of [
      { githubInstallationId: '9' },
      { installationAccountLogin: 'other' },
      { owner: 'other' },
      { organizationId: 'other-workspace' },
      { installationState: 'suspended' },
      { fullName: 'other/TRACE' },
    ])
      expect(canaryRepositorySelectionEligibility(env, [{ ...record, ...overrides }]).allowed).toBe(
        false,
      );
  });
  it('requires pinned installation and coherent owner repository identity before selection lookup', () => {
    expect(canaryWebhookPayloadEligibility(env, 'issues', payload).allowed).toBe(true);
    expect(
      canaryWebhookPayloadEligibility(env, 'issues', { ...payload, installation: { id: 9 } })
        .allowed,
    ).toBe(false);
    expect(
      canaryWebhookPayloadEligibility(env, 'issues', {
        ...payload,
        installation: { id: 166179374, account: { login: 'other' } },
      }).allowed,
    ).toBe(false);
    expect(
      canaryWebhookPayloadEligibility(env, 'issues', {
        ...payload,
        repository: { ...payload.repository, full_name: 'other/TRACE' },
      }).allowed,
    ).toBe(false);
  });
  it('allows verified installation notifications without treating them as business eligibility', () => {
    expect(
      canaryWebhookPayloadEligibility(env, 'installation_repositories', {
        installation: { id: 166179374, account: { login: 'mathofdynamic' } },
      }).allowed,
    ).toBe(true);
    expect(
      canaryWebhookPayloadEligibility(env, 'installation', {
        installation: { id: 9, account: { login: 'mathofdynamic' } },
      }).allowed,
    ).toBe(false);
  });
  it('recovery requires owner installation, selected active repository and matching tenant links', () => {
    const scope = {
      deliveryOrganizationId: 'w',
      deliveryRepositoryId: 'r',
      deliveryInstallationId: '166179374',
      repository: {
        ...record,
        recordId: 'r',
        organizationId: 'w',
        installationId: 'i',
        state: 'active',
        selected: true,
      },
      installation: {
        recordId: 'i',
        organizationId: 'w',
        providerId: '166179374',
        accountLogin: 'mathofdynamic',
      },
    };
    expect(canaryWebhookRecoveryEligibility(env, scope).allowed).toBe(true);
    for (const repository of [
      { ...scope.repository, selected: false },
      { ...scope.repository, state: 'available' },
      { ...scope.repository, organizationId: 'other' },
    ])
      expect(canaryWebhookRecoveryEligibility(env, { ...scope, repository }).allowed).toBe(false);
    expect(
      canaryWebhookRecoveryEligibility(env, {
        ...scope,
        installation: { ...scope.installation, providerId: '9' },
      }).allowed,
    ).toBe(false);
  });
  it('builds owner vars without fixture identity requirements', () => {
    expect(
      buildProductionCanaryRuntimeVariables(
        {
          deploymentEnv: 'production',
          databaseDriver: 'd1',
          canaryMode: 'owner',
          fixtureCanaryEnvironment: {
            owner: 'TRACE_CANARY_GITHUB_OWNER',
            repository: 'TRACE_CANARY_GITHUB_REPOSITORY',
            repositoryId: 'TRACE_CANARY_GITHUB_REPOSITORY_ID',
          },
        },
        {},
      ),
    ).toEqual({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: 'owner',
    });
  });
});
