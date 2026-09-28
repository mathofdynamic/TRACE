import { describe, expect, it } from 'vitest';
import { productionApplicationTables } from '../../../scripts/production-canary-d1.js';
import {
  assertWranglerProductionConsumer,
  classifyFixtureDeploymentForRollback,
  formatFixtureDeploymentOutputs,
  productionFixtureTransitionBaseline as baseline,
  verifyProductionFixtureTransitionState,
} from '../../../scripts/verify-production-fixture-transition.js';

const sourceVariables = {
  TRACE_GITHUB_APP_ID: '5082884',
  TRACE_GITHUB_APP_CLIENT_ID: 'production-app-client-id',
  TRACE_GITHUB_APP_SLUG: 'trace-production-integration',
  TRACE_GITHUB_APP_CALLBACK_URL:
    'https://trace-production.mathofdynamic2.workers.dev/api/github/setup',
  TRACE_GITHUB_APP_INSTALL_URL:
    'https://github.com/apps/trace-production-integration/installations/new',
  TRACE_GITHUB_OAUTH_CLIENT_ID: 'production-oauth-client-id',
};

const consumerList = [
  {
    type: 'worker',
    script: 'trace-production',
    queue_name: 'trace-production-jobs',
  },
];

function bindings(mode: 'closed' | 'fixture') {
  return [
    { type: 'd1', name: 'DB', database_id: baseline.d1Id },
    { type: 'queue', name: 'TRACE_QUEUE', queue_name: baseline.queueName },
    ...Object.entries({
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: mode,
      ...(mode === 'fixture'
        ? {
            TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
            TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
            TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
          }
        : {}),
      GITHUB_APP_ID: sourceVariables.TRACE_GITHUB_APP_ID,
      GITHUB_APP_CLIENT_ID: sourceVariables.TRACE_GITHUB_APP_CLIENT_ID,
      GITHUB_APP_SLUG: sourceVariables.TRACE_GITHUB_APP_SLUG,
      GITHUB_APP_CALLBACK_URL: sourceVariables.TRACE_GITHUB_APP_CALLBACK_URL,
      GITHUB_APP_INSTALL_URL: sourceVariables.TRACE_GITHUB_APP_INSTALL_URL,
      GITHUB_OAUTH_CLIENT_ID: sourceVariables.TRACE_GITHUB_OAUTH_CLIENT_ID,
    }).map(([name, text]) => ({ type: 'plain_text', name, text })),
    ...[
      'GITHUB_APP_CLIENT_SECRET',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_OAUTH_CLIENT_SECRET',
      'TRACE_AUTH_SECRET',
    ].map((name) => ({ type: 'secret_text', name })),
  ];
}

function queueResponse() {
  return {
    queue_id: baseline.queueId,
    queue_name: baseline.queueName,
    producers_total_count: 1,
    producers: [{ type: 'worker', script: 'trace-production' }],
    consumers_total_count: 1,
    consumers: [
      {
        type: 'worker',
        script_name: 'trace-production',
        queue_name: baseline.queueName,
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

function deployment(phase: 'before' | 'after', sourceSha: string) {
  const before = phase === 'before';
  return {
    id: before ? baseline.deploymentId : 'new-fixture-deployment-id',
    versions: [
      {
        version_id: before ? baseline.workerVersionId : 'new-fixture-version-id',
        percentage: 100,
      },
    ],
    annotations: { 'workers/message': `TRACE production canary ${sourceSha}` },
  };
}

function zeroCountRow() {
  return {
    ok: 1,
    ...Object.fromEntries(productionApplicationTables.map((table) => [table, 0])),
  };
}

function fakeCloudflare(
  phase: 'before' | 'after',
  sourceSha: string,
  overrides: {
    queue?: Record<string, unknown>;
    mode?: 'closed' | 'fixture';
    backlog?: number;
    counts?: Record<string, number>;
    deploymentId?: string;
    deploymentMessage?: string;
    traffic?: number;
    workerBindings?: ReturnType<typeof bindings>;
  } = {},
) {
  const requests: Array<{ path: string; method: string; body?: string }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push({
      path: url.pathname,
      method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    let result: unknown;
    if (url.pathname.endsWith('/deployments')) {
      result = {
        deployments: [
          {
            ...deployment(phase, sourceSha),
            ...(overrides.deploymentMessage
              ? { annotations: { 'workers/message': overrides.deploymentMessage } }
              : {}),
            ...(overrides.traffic === undefined
              ? {}
              : {
                  versions: [
                    {
                      version_id:
                        phase === 'before' ? baseline.workerVersionId : 'new-fixture-version-id',
                      percentage: overrides.traffic,
                    },
                  ],
                }),
            ...(overrides.deploymentId ? { id: overrides.deploymentId } : {}),
          },
        ],
      };
    } else if (url.pathname.includes('/versions/')) {
      result = {
        id: phase === 'before' ? baseline.workerVersionId : 'new-fixture-version-id',
        resources: {
          bindings:
            overrides.workerBindings ??
            bindings(overrides.mode ?? (phase === 'before' ? 'closed' : 'fixture')),
        },
      };
    } else if (url.pathname.endsWith(`/queues/${baseline.queueId}/metrics`)) {
      result = { backlog_count: overrides.backlog ?? 0 };
    } else if (url.pathname.endsWith(`/queues/${baseline.queueId}`)) {
      result = { ...queueResponse(), ...overrides.queue };
    } else if (url.pathname.endsWith(`/d1/database/${baseline.d1Id}/query`)) {
      result = [
        {
          results: [{ ...zeroCountRow(), ...overrides.counts }],
        },
      ];
    } else {
      throw new Error(`Unexpected endpoint: ${url.pathname}`);
    }
    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImplementation, requests };
}

const commonEnvironment = {
  CLOUDFLARE_API_TOKEN: 'fake-cloudflare-token',
  CLOUDFLARE_ACCOUNT_ID: baseline.accountId,
  TRACE_PRODUCTION_WORKER_NAME: baseline.workerName,
  TRACE_PRODUCTION_D1_ID: baseline.d1Id,
  TRACE_PRODUCTION_QUEUE_NAME: baseline.queueName,
  ...sourceVariables,
};

describe('production fixture transition state gate', () => {
  it('classifies only the captured baseline or exact attempted fixture release for rollback', () => {
    const expectedSourceSha = 'c'.repeat(40);
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('before', baseline.sourceSha),
        expectedSourceSha,
      ),
    ).toBe('baseline-active');
    expect(
      classifyFixtureDeploymentForRollback(
        {
          ...deployment('after', expectedSourceSha),
          id: 'failed-fixture-deployment',
        },
        expectedSourceSha,
      ),
    ).toBe('fixture-deployment-active');
    expect(
      classifyFixtureDeploymentForRollback(
        {
          ...deployment('after', expectedSourceSha),
          id: 'failed-fixture-deployment',
        },
        expectedSourceSha.toUpperCase(),
      ),
    ).toBe('fixture-deployment-active');
    expect(
      classifyFixtureDeploymentForRollback(
        {
          ...deployment('after', 'd'.repeat(40)),
          id: 'unrelated-deployment',
        },
        expectedSourceSha,
      ),
    ).toBe('unrecognized-active-deployment');
  });

  it('accepts the exact closed deployment with zero application data and Queue backlog', async () => {
    const fake = fakeCloudflare('before', baseline.sourceSha);
    const result = await verifyProductionFixtureTransitionState({
      phase: 'before',
      environment: commonEnvironment,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });
    expect(result).toMatchObject({
      deploymentId: baseline.deploymentId,
      versionId: baseline.workerVersionId,
      trafficPercentage: 100,
      canaryMode: 'closed',
      applicationTableCount: 22,
      emptyApplicationTableCount: 22,
      queueBacklogCount: 0,
    });
    expect(fake.requests.map((request) => request.method)).toEqual([
      'GET',
      'GET',
      'GET',
      'POST',
      'GET',
    ]);
    const queryRequest = fake.requests.find((request) => request.method === 'POST');
    const queryBody = JSON.parse(queryRequest!.body!) as { sql: string; params: unknown[] };
    expect(queryBody.sql).toMatch(/^SELECT 1 AS ok,/);
    expect(queryBody.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\b/i);
    expect(queryBody.params).toEqual([]);
  });

  it('accepts the rollback-created closed deployment without assuming its original source annotation', async () => {
    const fake = fakeCloudflare('before', baseline.sourceSha, {
      deploymentMessage: 'Rollback failed TRACE fixture-canary acceptance',
    });
    const result = await verifyProductionFixtureTransitionState({
      phase: 'before',
      environment: commonEnvironment,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });

    expect(result).toMatchObject({
      deploymentId: '473864fd-83b8-42ac-800d-2ea173c9649e',
      versionId: baseline.workerVersionId,
      canaryMode: 'closed',
    });
  });

  it('formats exact deployed identity outputs and rejects non-100% traffic', () => {
    expect(
      formatFixtureDeploymentOutputs({
        versionId: 'fc4be1e1-699b-4a3b-bd18-8c1757aab277',
        deploymentId: 'f3d80c42-337b-49e6-b36c-40b8bd0b0165',
        trafficPercentage: 100,
        sourceSha: 'a'.repeat(40),
      }),
    ).toBe(
      [
        'worker_version_id=fc4be1e1-699b-4a3b-bd18-8c1757aab277',
        'deployment_id=f3d80c42-337b-49e6-b36c-40b8bd0b0165',
        'traffic_percent=100',
        `source_sha=${'a'.repeat(40)}`,
        '',
      ].join('\n'),
    );
    expect(() =>
      formatFixtureDeploymentOutputs({
        versionId: 'fc4be1e1-699b-4a3b-bd18-8c1757aab277',
        deploymentId: 'f3d80c42-337b-49e6-b36c-40b8bd0b0165',
        trafficPercentage: 50,
        sourceSha: 'a'.repeat(40),
      }),
    ).toThrow('100 percent');
  });

  it('normalizes uppercase reviewed SHAs for post-deployment evidence', async () => {
    const sourceSha = 'abcdef0123456789abcdef0123456789abcdef01';
    const fake = fakeCloudflare('after', sourceSha);
    const result = await verifyProductionFixtureTransitionState({
      phase: 'after',
      environment: commonEnvironment,
      expectedSourceSha: sourceSha.toUpperCase(),
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });
    expect(result.sourceSha).toBe(sourceSha);
    expect(result.canaryMode).toBe('fixture');
  });

  it('accepts the exact fixture deployment annotation and fixed allowlist', async () => {
    const sourceSha = 'a'.repeat(40);
    const fake = fakeCloudflare('after', sourceSha);
    const result = await verifyProductionFixtureTransitionState({
      phase: 'after',
      environment: commonEnvironment,
      expectedSourceSha: sourceSha,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });
    expect(result).toMatchObject({
      canaryMode: 'fixture',
      fixtureOwner: 'mathofdynamic',
      fixtureRepository: 'trace-staging-fixture',
      fixtureRepositoryId: '1378441300',
      applicationTableCount: 22,
      emptyApplicationTableCount: 22,
      queueBacklogCount: 0,
    });
  });

  it.each([
    ['wrong active deployment', { deploymentId: 'unexpected-deployment' }],
    ['fixture mode before transition', { mode: 'fixture' as const }],
    ['nonempty application table', { counts: { github_repositories: 1 } }],
    ['nonzero Queue backlog', { backlog: 1 }],
    ['wrong traffic percentage', { traffic: 50 }],
    [
      'wrong production D1 binding',
      {
        workerBindings: bindings('closed').map((binding) =>
          binding.name === 'DB' ? { ...binding, database_id: 'wrong-d1' } : binding,
        ),
      },
    ],
    [
      'unexpected Hyperdrive binding',
      { workerBindings: [...bindings('closed'), { type: 'hyperdrive', name: 'HYPERDRIVE' }] },
    ],
  ])('fails before transition on %s', async (_label, overrides) => {
    const fake = fakeCloudflare('before', baseline.sourceSha, overrides);
    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: fake.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow();
  });

  it('rejects incorrect Queue, D1, consumer, traffic, and runtime identities', async () => {
    const wrongQueue = fakeCloudflare('before', baseline.sourceSha, {
      queue: { queue_id: 'wrong-queue' },
    });
    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: wrongQueue.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow('Queue ID');

    expect(() =>
      assertWranglerProductionConsumer([{ type: 'worker', script: 'another-worker' }]),
    ).toThrow('trace-production');
    expect(() => assertWranglerProductionConsumer([...consumerList, ...consumerList])).toThrow(
      'exactly one',
    );

    const wrongSettings = fakeCloudflare('before', baseline.sourceSha, {
      queue: {
        consumers: [
          {
            ...queueResponse().consumers[0],
            settings: { batch_size: 10, max_wait_time_ms: 5000, max_retries: 2, retry_delay: 60 },
          },
        ],
      },
    });
    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: wrongSettings.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow('Queue batch/retry settings');

    const wrongProducer = fakeCloudflare('before', baseline.sourceSha, {
      queue: { producers: [{ type: 'worker', script: 'trace-test-staging' }] },
    });
    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: wrongProducer.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow('producer identity');

    const wrongFixture = fakeCloudflare('after', 'a'.repeat(40), {
      workerBindings: bindings('fixture').map((binding) =>
        binding.name === 'TRACE_CANARY_GITHUB_OWNER'
          ? { ...binding, text: 'another-owner' }
          : binding,
      ),
    });
    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'after',
        environment: commonEnvironment,
        expectedSourceSha: 'a'.repeat(40),
        fetchImplementation: wrongFixture.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow('TRACE_CANARY_GITHUB_OWNER');

    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'after',
        environment: commonEnvironment,
        expectedSourceSha: 'b'.repeat(40),
        fetchImplementation: fakeCloudflare('after', 'a'.repeat(40)).fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow('source annotation');
  });

  it('does not include the Cloudflare credential in errors or results', async () => {
    const secret = 'fake-cloudflare-token-never-print';
    const environment = { ...commonEnvironment, CLOUDFLARE_API_TOKEN: secret };
    const badIdentity = { ...environment, CLOUDFLARE_ACCOUNT_ID: 'wrong-account' };
    const failure = await verifyProductionFixtureTransitionState({
      phase: 'before',
      environment: badIdentity,
      fetchImplementation: fakeCloudflare('before', baseline.sourceSha).fetchImplementation,
      consumerOutput: consumerList,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(secret);

    const result = await verifyProductionFixtureTransitionState({
      phase: 'before',
      environment,
      fetchImplementation: fakeCloudflare('before', baseline.sourceSha).fetchImplementation,
      consumerOutput: consumerList,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
