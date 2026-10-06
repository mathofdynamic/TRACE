import { expectedProductionFixtureCounts } from '../../../scripts/production-fixture-d1-state.js';
import { describe, expect, it, vi } from 'vitest';

// D1/catalog acceptance has its own suite; this suite exercises the Worker gate.
vi.mock('../../../scripts/verify-production-owner-state.js', () => ({
  verifyOwnerState: vi.fn(async () => 'OWNER_IDENTITY=VERIFIED'),
}));
import { productionApplicationTables } from '../../../scripts/production-canary-d1.js';
import {
  assertWranglerProductionConsumer,
  inspectReviewedOwnerDeployment,
  classifyFixtureDeploymentForRollback,
  formatFixtureBaselineOutputs,
  formatFixtureDeploymentOutputs,
  productionFixtureTransitionBaseline as baseline,
  rollbackFixtureDeploymentIfNeeded,
  verifyProductionFixtureTransitionState,
} from '../../../scripts/verify-production-fixture-transition.js';

const previousClosedDeploymentId = '473864fd-83b8-42ac-800d-2ea173c9649e';

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

type TestBinding = {
  type: string;
  name: string;
  text?: string;
  database_id?: string;
  queue_name?: string;
};

function bindings(mode: 'closed' | 'fixture' | 'owner'): TestBinding[] {
  return [
    { type: 'd1', name: 'DB', database_id: baseline.d1Id },
    { type: 'queue', name: 'TRACE_QUEUE', queue_name: baseline.queueName },
    { type: 'assets', name: 'ASSETS' },
    ...Object.entries({
      NEXT_PRIVATE_MINIMAL_MODE: '1',
      TRACE_FEATURE_SEMANTIC_PR_FINDINGS: 'false',
      TRACE_FEATURE_SEMANTIC_CONFLICTS: 'false',
      TRACE_FEATURE_GITHUB_COMMENTS: 'false',
      TRACE_FEATURE_HYBRID_SYNC: 'false',
      TRACE_DEPLOYMENT_ENV: 'production',
      TRACE_DATABASE_DRIVER: 'd1',
      TRACE_CANARY_MODE: mode,
      ...(mode === 'owner' ? { TRACE_PUBLIC_URL: 'https://trace-code.pages.dev' } : {}),
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
      GITHUB_APP_CALLBACK_URL:
        mode === 'owner'
          ? 'https://trace-code.pages.dev/api/github/setup'
          : sourceVariables.TRACE_GITHUB_APP_CALLBACK_URL,
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

function deployment(
  phase: 'before' | 'after',
  sourceSha: string,
  overrides: {
    deploymentId?: string;
    activeVersionId?: string;
    traffic?: number;
    versions?: Array<{ version_id: string; percentage: number }>;
    deploymentMessage?: string;
  } = {},
) {
  const before = phase === 'before';
  return {
    id:
      overrides.deploymentId ?? (before ? previousClosedDeploymentId : 'new-fixture-deployment-id'),
    versions: overrides.versions ?? [
      {
        version_id:
          overrides.activeVersionId ??
          (before ? baseline.workerVersionId : 'new-fixture-version-id'),
        percentage: overrides.traffic ?? 100,
      },
    ],
    annotations: {
      'workers/message': overrides.deploymentMessage ?? `TRACE production canary ${sourceSha}`,
    },
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
    mode?: 'closed' | 'fixture' | 'owner';
    backlog?: number;
    counts?: Record<string, number>;
    identity?: Record<string, number>;
    foreignKeys?: unknown[];
    deploymentId?: string;
    deploymentMessage?: string;
    traffic?: number;
    activeVersionId?: string;
    versions?: Array<{ version_id: string; percentage: number }>;
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
        deployments: [deployment(phase, sourceSha, overrides)],
      };
    } else if (url.pathname.includes('/versions/')) {
      result = {
        id:
          overrides.activeVersionId ??
          (phase === 'before' ? baseline.workerVersionId : 'new-fixture-version-id'),
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
      const sql = JSON.parse(String(init?.body)).sql as string;
      result = [
        {
          results:
            sql === 'PRAGMA foreign_key_check'
              ? (overrides.foreignKeys ?? [])
              : sql.includes('oauth_identity_links')
                ? [{ ok: 1, ...overrides.identity }]
                : [{ ...zeroCountRow(), ...overrides.counts }],
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

type SimulatedDeploymentState = {
  id: string;
  versionId: string;
  message: string;
  mode: 'closed' | 'fixture';
};

function simulatedRollbackCloudflare(initialDeployment: SimulatedDeploymentState) {
  let activeDeployment = initialDeployment;
  const requests: Array<{ path: string; method: string }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push({ path: url.pathname, method });
    let result: unknown;
    if (url.pathname.endsWith('/deployments')) {
      result = {
        deployments: [
          {
            id: activeDeployment.id,
            versions: [{ version_id: activeDeployment.versionId, percentage: 100 }],
            annotations: { 'workers/message': activeDeployment.message },
          },
        ],
      };
    } else if (url.pathname.includes('/versions/')) {
      result = {
        id: activeDeployment.versionId,
        resources: { bindings: bindings(activeDeployment.mode) },
      };
    } else if (url.pathname.endsWith(`/queues/${baseline.queueId}/metrics`)) {
      result = { backlog_count: 0 };
    } else if (url.pathname.endsWith(`/queues/${baseline.queueId}`)) {
      result = queueResponse();
    } else if (url.pathname.endsWith(`/d1/database/${baseline.d1Id}/query`)) {
      result = [{ results: [zeroCountRow()] }];
    } else {
      throw new Error(`Unexpected endpoint: ${url.pathname}`);
    }
    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  return {
    fetchImplementation,
    requests,
    restoreBaseline(
      deploymentId: string,
      versionId: string = baseline.workerVersionId,
      mode: 'closed' | 'fixture' = 'closed',
    ) {
      activeDeployment = {
        id: deploymentId,
        versionId,
        message: 'Rollback failed TRACE fixture-canary acceptance',
        mode,
      };
    },
  };
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
  it('inspects an exact reviewed owner deployment without registering it or mutating runtime state', async () => {
    const versionId = 'de3d59c8-4230-4d14-abfb-0b6477fd7f0c';
    const sourceSha = '74450fd7684b6974e6deb8bb407f1fd670e5cecf';
    const fake = fakeCloudflare('after', sourceSha, { activeVersionId: versionId, mode: 'owner' });
    const result = await inspectReviewedOwnerDeployment({
      expectedVersionId: versionId,
      expectedSourceSha: sourceSha,
      environment: {
        ...commonEnvironment,
        TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
      },
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });
    expect(result).toMatchObject({
      versionId,
      sourceSha,
      trafficPercentage: 100,
      canaryMode: 'owner',
      publicUrl: 'https://trace-code.pages.dev',
      githubAppId: '5082884',
      githubAppSlug: 'trace-production-integration',
    });
    expect(
      fake.requests.every(
        (request) =>
          request.method === 'GET' ||
          (request.method === 'POST' && JSON.parse(request.body!).sql.startsWith('SELECT')),
      ),
    ).toBe(true);
    // Inspection must not add a candidate to the trusted registry.
    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: fake.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow(/previously verified/);
  });
  it.each([
    ['wrong candidate version', { activeVersionId: 'a30ba0d6-c4e6-42a7-b9fd-cf6a8eb8d08f' }],
    ['wrong source', { deploymentMessage: 'TRACE production canary ' + 'f'.repeat(40) }],
    ['split traffic', { traffic: 50 }],
    [
      'missing assets',
      { workerBindings: bindings('owner').filter((binding) => binding.name !== 'ASSETS') },
    ],
    [
      'missing minimal mode',
      {
        workerBindings: bindings('owner').filter(
          (binding) => binding.name !== 'NEXT_PRIVATE_MINIMAL_MODE',
        ),
      },
    ],
    [
      'wrong minimal mode',
      {
        workerBindings: bindings('owner').map((binding) =>
          binding.name === 'NEXT_PRIVATE_MINIMAL_MODE' ? { ...binding, text: '0' } : binding,
        ),
      },
    ],
    ...[
      'TRACE_FEATURE_SEMANTIC_PR_FINDINGS',
      'TRACE_FEATURE_SEMANTIC_CONFLICTS',
      'TRACE_FEATURE_GITHUB_COMMENTS',
      'TRACE_FEATURE_HYBRID_SYNC',
    ].flatMap<[string, { workerBindings: TestBinding[] }]>((name) => [
      [
        'missing ' + name,
        { workerBindings: bindings('owner').filter((binding) => binding.name !== name) },
      ],
      [
        'enabled ' + name,
        {
          workerBindings: bindings('owner').map((binding) =>
            binding.name === name ? { ...binding, text: 'true' } : binding,
          ),
        },
      ],
    ]),

    ['wrong mode', { mode: 'fixture' as const }],
    [
      'unexpected resource',
      { workerBindings: [...bindings('owner'), { type: 'r2_bucket', name: 'UNEXPECTED' }] },
    ],
    [
      'duplicate binding',
      {
        workerBindings: [
          ...bindings('owner'),
          { type: 'd1', name: 'DB', database_id: baseline.d1Id },
        ],
      },
    ],
  ])('rejects candidate inspection with %s', async (_label, overrides) => {
    const versionId = 'a30ba0d6-c4e6-42a7-b9fd-cf6a8eb8d08e';
    const sourceSha = '74450fd7684b6974e6deb8bb407f1fd670e5cecf';
    await expect(
      inspectReviewedOwnerDeployment({
        expectedVersionId: versionId,
        expectedSourceSha: sourceSha,
        environment: {
          ...commonEnvironment,
          TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
        },
        fetchImplementation: fakeCloudflare('after', sourceSha, {
          activeVersionId: versionId,
          mode: 'owner',
          ...overrides,
        }).fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow();
  });

  it('pins the accepted owner rollback version/source while preserving its legacy Worker callback', async () => {
    const ownerVersion = 'a118f111-0bcb-4662-b864-c8587ca29567';
    const source = '72f71ff4f597c0a18abaa2eaec837ff4892266d0';
    const workerBindings = bindings('owner').map((binding) =>
      binding.name === 'TRACE_PUBLIC_URL'
        ? { ...binding, text: baseline.productionBaseUrl }
        : binding.name === 'GITHUB_APP_CALLBACK_URL'
          ? { ...binding, text: `${baseline.productionBaseUrl}/api/github/setup` }
          : binding,
    );
    const fake = fakeCloudflare('before', source, {
      activeVersionId: ownerVersion,
      mode: 'owner',
      workerBindings,
    });
    const input = {
      phase: 'before' as const,
      environment: {
        ...commonEnvironment,
        TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
      },
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    };
    expect((await verifyProductionFixtureTransitionState(input)).canaryMode).toBe('owner');
    await expect(
      verifyProductionFixtureTransitionState({
        ...input,
        fetchImplementation: fakeCloudflare('before', source, {
          activeVersionId: ownerVersion,
          deploymentMessage: 'TRACE production canary fixture ' + 'f'.repeat(40),
          mode: 'owner',
          workerBindings,
        }).fetchImplementation,
      }),
    ).rejects.toThrow(/source annotation/);
  });
  it('pins the current canonical owner rollback version and rejects a mismatched source', async () => {
    const ownerVersion = '550a5214-4e46-4023-a330-7d042be4ea7c';
    const source = '22b98cf2224a31403c9ea403e34137562f7076d8';
    const input = {
      phase: 'before' as const,
      environment: {
        ...commonEnvironment,
        TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
      },
      fetchImplementation: fakeCloudflare('before', source, {
        activeVersionId: ownerVersion,
        mode: 'owner',
        workerBindings: bindings('owner'),
      }).fetchImplementation,
      consumerOutput: consumerList,
    };
    expect((await verifyProductionFixtureTransitionState(input)).canaryMode).toBe('owner');
    await expect(
      verifyProductionFixtureTransitionState({
        ...input,
        fetchImplementation: fakeCloudflare('before', source, {
          activeVersionId: ownerVersion,
          mode: 'owner',
          workerBindings: bindings('owner'),
          deploymentMessage: 'TRACE production canary ' + 'f'.repeat(40),
        }).fetchImplementation,
      }),
    ).rejects.toThrow(/source annotation/);
  });
  it.each([
    ['a30ba0d6-c4e6-42a7-b9fd-cf6a8eb8d08e', '74450fd7684b6974e6deb8bb407f1fd670e5cecf'],
    ['b7c49d29-d0c7-49a6-9228-f5e7425e2873', '886fe6976cdbb67192f74a4f32aa621b08be4f65'],
    ['c13269d2-4850-47f8-9773-d36f68019c79', '4cdd4161e17f1862594356b357e9319fb4847199'],
  ])(
    'accepts only independently verified owner rollback version %s and exact source',
    async (versionId, source) => {
      const environment = {
        ...commonEnvironment,
        TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
      };
      const input = { phase: 'before' as const, environment, consumerOutput: consumerList };
      expect(
        await verifyProductionFixtureTransitionState({
          ...input,
          fetchImplementation: fakeCloudflare('before', source, {
            activeVersionId: versionId,
            mode: 'owner',
          }).fetchImplementation,
        }),
      ).toMatchObject({ versionId, sourceSha: source, canaryMode: 'owner' });
      await expect(
        verifyProductionFixtureTransitionState({
          ...input,
          fetchImplementation: fakeCloudflare('before', source, {
            activeVersionId: versionId,
            mode: 'owner',
            deploymentMessage: 'TRACE production canary ' + 'f'.repeat(40),
          }).fetchImplementation,
        }),
      ).rejects.toThrow(/source annotation/);
      await expect(
        verifyProductionFixtureTransitionState({
          ...input,
          fetchImplementation: fakeCloudflare('before', source, {
            activeVersionId: 'de3d59c8-4230-4d14-abfb-0b6477fd7f0d',
            mode: 'owner',
          }).fetchImplementation,
        }),
      ).rejects.toThrow(/previously verified/);
    },
  );
  it.each([
    ['wrong mode', bindings('fixture')],
    [
      'wrong D1',
      bindings('owner').map((binding) =>
        binding.type === 'd1' ? { ...binding, database_id: 'unapproved' } : binding,
      ),
    ],
    [
      'wrong Queue',
      bindings('owner').map((binding) =>
        binding.type === 'queue' ? { ...binding, queue_name: 'unapproved' } : binding,
      ),
    ],
    ['missing ASSETS', bindings('owner').filter((binding) => binding.name !== 'ASSETS')],
    [
      'enabled feature',
      bindings('owner').map((binding) =>
        binding.name === 'TRACE_FEATURE_HYBRID_SYNC' ? { ...binding, text: 'true' } : binding,
      ),
    ],
  ])('rejects the registered owner rollback version with %s', async (_label, workerBindings) => {
    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: {
          ...commonEnvironment,
          TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
        },
        consumerOutput: consumerList,
        fetchImplementation: fakeCloudflare('before', '74450fd7684b6974e6deb8bb407f1fd670e5cecf', {
          activeVersionId: 'a30ba0d6-c4e6-42a7-b9fd-cf6a8eb8d08e',
          mode: 'owner',
          workerBindings,
        }).fetchImplementation,
      }),
    ).rejects.toThrow();
  });
  it('verifies explicit owner mode without fixture variables while preserving accepted fixture state', async () => {
    const source = 'd'.repeat(40);
    const identity = Object.fromEntries(
      [
        'oauth_identity_links',
        'active_session_links',
        'onboarding_profile_links',
        'onboarding_completed_links',
        'onboarding_intended_usage_links',
        'onboarding_execution_mode_links',
        'onboarding_audit_actor_links',
        'onboarding_audit_action_links',
        'onboarding_audit_subject_links',
        'onboarding_audit_unscoped_links',
        'onboarding_audit_event_links',
        'fixture_workspace_count',
        'owner_membership_links',
        'fixture_installation_links',
        'fixture_repository_links',
        'fixture_installation_repository_links',
        'fixture_audit_event_links',
        'fixture_selection_audit_links',
        'fixture_active_repository_links',
        'fixture_selected_mapping_links',
        'fixture_issue_links',
        'fixture_processed_delivery_links',
      ].map((key) => [key, 1]),
    );
    const fake = fakeCloudflare('after', source, {
      mode: 'owner',
      counts: expectedProductionFixtureCounts('after-live-issue'),
      identity,
    });
    const input = {
      phase: 'after' as const,
      environment: {
        ...commonEnvironment,
        RUNTIME_MODE: 'owner',
        TRACE_GITHUB_APP_CALLBACK_URL: 'https://trace-code.pages.dev/api/github/setup',
        TRACE_FIXTURE_D1_BASELINE_STAGE: 'after-live-issue',
      },
      expectedSourceSha: source,
      expectedBaselineVersionId: '14e30410-d83b-4de6-90cc-6ba0356957ed',
      expectedBaselineMode: 'fixture' as const,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    };
    const result = await verifyProductionFixtureTransitionState(input);
    expect(result.canaryMode).toBe('owner');
    expect(result.fixtureOwner).toBeUndefined();
    expect(result.sourceSha).toBe(source);
    identity.fixture_processed_delivery_links = 0;
    await expect(verifyProductionFixtureTransitionState(input)).rejects.toThrow(
      /processed_delivery/,
    );
  });

  it.each(['before', 'after'] as const)(
    'preserves and verifies accepted onboarding state %s deployment',
    async (phase) => {
      const source = phase === 'before' ? baseline.fixtureSourceSha : 'c'.repeat(40);
      const identity = Object.fromEntries(
        [
          'oauth_identity_links',
          'active_session_links',
          'onboarding_profile_links',
          'onboarding_completed_links',
          'onboarding_intended_usage_links',
          'onboarding_execution_mode_links',
          'onboarding_audit_actor_links',
          'onboarding_audit_action_links',
          'onboarding_audit_subject_links',
          'onboarding_audit_unscoped_links',
          'onboarding_audit_event_links',
        ].map((key) => [key, 1]),
      );
      const fake = fakeCloudflare(phase, source, {
        mode: 'fixture',
        ...(phase === 'before' ? { activeVersionId: baseline.fixtureVersionId } : {}),
        counts: { users: 1, accounts: 1, sessions: 1, onboarding_profiles: 1, audit_events: 1 },
        identity,
      });
      const input = {
        phase,
        environment: { ...commonEnvironment, TRACE_FIXTURE_D1_BASELINE_STAGE: 'after-onboarding' },
        expectedSourceSha: source,
        expectedBaselineVersionId: baseline.fixtureVersionId,
        expectedBaselineMode: 'fixture' as const,
        fetchImplementation: fake.fetchImplementation,
        consumerOutput: consumerList,
      };
      expect((await verifyProductionFixtureTransitionState(input)).emptyApplicationTableCount).toBe(
        17,
      );
      identity.onboarding_audit_event_links = 0;
      await expect(verifyProductionFixtureTransitionState(input)).rejects.toThrow(
        /onboarding_audit/,
      );
    },
  );

  it('classifies the closed baseline by immutable version and traffic, not deployment ID', () => {
    const expectedSourceSha = 'c'.repeat(40);
    expect(baseline).not.toHaveProperty('deploymentId');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('before', baseline.sourceSha),
        expectedSourceSha,
      ),
    ).toBe('baseline-active');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('before', baseline.sourceSha, {
          deploymentId: '599ec20b-b90b-4499-af73-21024e8b5e19',
          deploymentMessage: 'Rollback failed TRACE fixture-canary acceptance',
        }),
        expectedSourceSha,
      ),
    ).toBe('baseline-active');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('before', baseline.fixtureSourceSha, {
          activeVersionId: baseline.fixtureVersionId,
        }),
        expectedSourceSha,
        baseline.fixtureVersionId,
      ),
    ).toBe('baseline-active');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('before', baseline.sourceSha, {
          activeVersionId: 'wrong-worker-version',
        }),
        expectedSourceSha,
      ),
    ).toBe('unrecognized-active-deployment');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('before', baseline.sourceSha, { traffic: 50 }),
        expectedSourceSha,
      ),
    ).toBe('unrecognized-active-deployment');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('before', baseline.sourceSha, {
          versions: [
            { version_id: baseline.workerVersionId, percentage: 50 },
            { version_id: 'other-worker-version', percentage: 50 },
          ],
        }),
        expectedSourceSha,
      ),
    ).toBe('unrecognized-active-deployment');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('after', expectedSourceSha, { deploymentId: 'failed-fixture-deployment' }),
        expectedSourceSha,
      ),
    ).toBe('fixture-deployment-active');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('after', expectedSourceSha, { deploymentId: 'failed-fixture-deployment' }),
        expectedSourceSha.toUpperCase(),
      ),
    ).toBe('fixture-deployment-active');
    expect(
      classifyFixtureDeploymentForRollback(
        deployment('after', 'd'.repeat(40), { deploymentId: 'unrelated-deployment' }),
        expectedSourceSha,
      ),
    ).toBe('unrecognized-active-deployment');
  });

  it('accepts the initial closed version with zero application data and Queue backlog', async () => {
    const fake = fakeCloudflare('before', baseline.sourceSha);
    const result = await verifyProductionFixtureTransitionState({
      phase: 'before',
      environment: commonEnvironment,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });
    expect(result).toMatchObject({
      deploymentId: previousClosedDeploymentId,
      versionId: baseline.workerVersionId,
      trafficPercentage: 100,
      baselineActiveDeploymentId: previousClosedDeploymentId,
      baselineActiveVersionId: baseline.workerVersionId,
      baselineTrafficPercent: 100,
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

  it('accepts the current 599ec rollback deployment with the same immutable baseline version', async () => {
    const fake = fakeCloudflare('before', baseline.sourceSha, {
      deploymentId: '599ec20b-b90b-4499-af73-21024e8b5e19',
      deploymentMessage: 'Rollback failed TRACE fixture-canary acceptance',
    });
    const result = await verifyProductionFixtureTransitionState({
      phase: 'before',
      environment: commonEnvironment,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });

    expect(result).toMatchObject({
      deploymentId: '599ec20b-b90b-4499-af73-21024e8b5e19',
      versionId: baseline.workerVersionId,
      baselineActiveDeploymentId: '599ec20b-b90b-4499-af73-21024e8b5e19',
      baselineActiveVersionId: baseline.workerVersionId,
      baselineTrafficPercent: 100,
      canaryMode: 'closed',
    });
    expect(result.sourceSha).toBeUndefined();
  });

  it('accepts the current verified fixture version as a dynamic rollback baseline', async () => {
    const fake = fakeCloudflare('before', baseline.fixtureSourceSha, {
      deploymentId: '226a32c7-174e-4a75-939f-7a316e34e632',
      activeVersionId: baseline.fixtureVersionId,
      mode: 'fixture',
    });

    const result = await verifyProductionFixtureTransitionState({
      phase: 'before',
      environment: commonEnvironment,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
    });

    expect(result).toMatchObject({
      deploymentId: '226a32c7-174e-4a75-939f-7a316e34e632',
      versionId: baseline.fixtureVersionId,
      trafficPercentage: 100,
      baselineActiveVersionId: baseline.fixtureVersionId,
      baselineRuntimeMode: 'fixture',
      canaryMode: 'fixture',
      fixtureOwner: 'mathofdynamic',
      fixtureRepository: 'trace-staging-fixture',
      fixtureRepositoryId: '1378441300',
      emptyApplicationTableCount: 22,
      queueBacklogCount: 0,
    });
  });

  it('rejects historical fixture versions that are not the current verified production baseline', async () => {
    const fake = fakeCloudflare('before', baseline.fixtureSourceSha, {
      activeVersionId: 'c37568b9-247e-498a-b066-7cb6e97c26bb',
      mode: 'fixture',
    });

    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: fake.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow('previously verified');
  });

  it('requires the current fixture baseline deployment annotation to match its pinned source SHA', async () => {
    const fake = fakeCloudflare('before', baseline.fixtureSourceSha, {
      activeVersionId: baseline.fixtureVersionId,
      mode: 'fixture',
      deploymentMessage: `TRACE production canary ${'f'.repeat(40)}`,
    });

    await expect(
      verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: fake.fetchImplementation,
        consumerOutput: consumerList,
      }),
    ).rejects.toThrow('source annotation');
  });

  it('verifies closed bindings and empty state before treating an active baseline version as restored', async () => {
    const fake = fakeCloudflare('before', baseline.sourceSha, {
      deploymentId: '599ec20b-b90b-4499-af73-21024e8b5e19',
      deploymentMessage: 'Rollback failed TRACE fixture-canary acceptance',
    });
    const result = await rollbackFixtureDeploymentIfNeeded({
      expectedSourceSha: 'c'.repeat(40),
      environment: commonEnvironment,
      fetchImplementation: fake.fetchImplementation,
      consumerOutput: consumerList,
      runRollback() {
        throw new Error('Already-restored baseline must not be rolled back again.');
      },
    });

    expect(result).toMatchObject({
      rollback: 'baseline-active',
      deploymentId: '599ec20b-b90b-4499-af73-21024e8b5e19',
      versionId: baseline.workerVersionId,
      canaryMode: 'closed',
      emptyApplicationTableCount: 22,
      queueBacklogCount: 0,
    });
  });

  it('verifies repeated fixture rollback deployments by baseline version, not deployment ID', async () => {
    const expectedSourceSha = 'c'.repeat(40);
    const rollbackIds = [
      '599ec20b-b90b-4499-af73-21024e8b5e19',
      'd4f4c7c5-4f91-4b3d-b08a-1671b9a7e0d2',
    ];

    for (const [index, rollbackDeploymentId] of rollbackIds.entries()) {
      const fixtureDeploymentId = `fixture-deployment-${index + 1}`;
      const simulated = simulatedRollbackCloudflare({
        id: fixtureDeploymentId,
        versionId: `fixture-version-${index + 1}`,
        message: `TRACE production canary ${expectedSourceSha}`,
        mode: 'fixture',
      });
      const rollbackVersionIds: string[] = [];

      const result = await rollbackFixtureDeploymentIfNeeded({
        expectedSourceSha,
        environment: commonEnvironment,
        fetchImplementation: simulated.fetchImplementation,
        consumerOutput: consumerList,
        runRollback(versionId) {
          rollbackVersionIds.push(versionId);
          simulated.restoreBaseline(rollbackDeploymentId);
        },
      });

      expect(result).toMatchObject({
        rollback: 'completed',
        deploymentId: rollbackDeploymentId,
        versionId: baseline.workerVersionId,
        trafficPercentage: 100,
        canaryMode: 'closed',
        emptyApplicationTableCount: 22,
        queueBacklogCount: 0,
      });
      expect(rollbackVersionIds).toEqual([baseline.workerVersionId]);
      expect(simulated.requests.filter((request) => request.method === 'POST')).toHaveLength(1);

      const baselineCheck = await verifyProductionFixtureTransitionState({
        phase: 'before',
        environment: commonEnvironment,
        fetchImplementation: simulated.fetchImplementation,
        consumerOutput: consumerList,
      });
      expect(baselineCheck).toMatchObject({
        baselineActiveDeploymentId: rollbackDeploymentId,
        baselineActiveVersionId: baseline.workerVersionId,
        baselineTrafficPercent: 100,
        canaryMode: 'closed',
        emptyApplicationTableCount: 22,
        queueBacklogCount: 0,
      });
    }
  });

  it('restores the previously active fixture version after a failed fixture update', async () => {
    const expectedSourceSha = 'e'.repeat(40);
    const fixtureRollbackDeploymentId = '6f7d8432-7f6a-4d44-a448-ccfc0ab7f016';
    const simulated = simulatedRollbackCloudflare({
      id: 'failed-fixture-deployment',
      versionId: 'failed-fixture-version',
      message: `TRACE production canary ${expectedSourceSha}`,
      mode: 'fixture',
    });
    const rollbackVersionIds: string[] = [];

    const result = await rollbackFixtureDeploymentIfNeeded({
      expectedSourceSha,
      expectedBaselineVersionId: baseline.fixtureVersionId,
      expectedBaselineMode: 'fixture',
      environment: commonEnvironment,
      fetchImplementation: simulated.fetchImplementation,
      consumerOutput: consumerList,
      runRollback(versionId) {
        rollbackVersionIds.push(versionId);
        simulated.restoreBaseline(
          fixtureRollbackDeploymentId,
          baseline.fixtureVersionId,
          'fixture',
        );
      },
    });

    expect(result).toMatchObject({
      rollback: 'completed',
      deploymentId: fixtureRollbackDeploymentId,
      versionId: baseline.fixtureVersionId,
      trafficPercentage: 100,
      canaryMode: 'fixture',
      fixtureOwner: 'mathofdynamic',
      fixtureRepository: 'trace-staging-fixture',
      fixtureRepositoryId: '1378441300',
      emptyApplicationTableCount: 22,
      queueBacklogCount: 0,
    });
    expect(rollbackVersionIds).toEqual([baseline.fixtureVersionId]);
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

  it('captures the verified immutable baseline version and runtime mode as workflow outputs', () => {
    expect(
      formatFixtureBaselineOutputs({
        versionId: baseline.fixtureVersionId,
        deploymentId: '226a32c7-174e-4a75-939f-7a316e34e632',
        trafficPercentage: 100,
        runtimeMode: 'fixture',
      }),
    ).toBe(
      [
        `baseline_worker_version_id=${baseline.fixtureVersionId}`,
        'baseline_deployment_id=226a32c7-174e-4a75-939f-7a316e34e632',
        'baseline_traffic_percent=100',
        'baseline_mode=fixture',
        '',
      ].join('\n'),
    );
    expect(() =>
      formatFixtureBaselineOutputs({
        versionId: 'unverified-worker-version',
        deploymentId: '226a32c7-174e-4a75-939f-7a316e34e632',
        trafficPercentage: 100,
        runtimeMode: 'fixture',
      }),
    ).toThrow('previously verified');
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
    [
      'historical deployment ID with wrong Worker version',
      { deploymentId: previousClosedDeploymentId, activeVersionId: 'wrong-worker-version' },
    ],
    [
      'different deployment ID with wrong Worker version',
      { activeVersionId: 'wrong-worker-version' },
    ],
    ['fixture mode before transition', { mode: 'fixture' as const }],
    [
      'fixture allowlist variable before transition',
      {
        workerBindings: [
          ...bindings('closed'),
          {
            type: 'plain_text',
            name: 'TRACE_CANARY_GITHUB_REPOSITORY',
            text: 'trace-staging-fixture',
          },
        ],
      },
    ],
    ['nonempty application table', { counts: { github_repositories: 1 } }],
    ['nonzero Queue backlog', { backlog: 1 }],
    ['wrong traffic percentage', { traffic: 50 }],
    [
      'multiple active Worker versions',
      {
        versions: [
          { version_id: baseline.workerVersionId, percentage: 50 },
          { version_id: 'other-worker-version', percentage: 50 },
        ],
      },
    ],
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
    [
      'wrong production Queue binding',
      {
        workerBindings: bindings('closed').map((binding) =>
          binding.name === 'TRACE_QUEUE'
            ? { ...binding, queue_name: 'trace-test-staging-jobs' }
            : binding,
        ),
      },
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
