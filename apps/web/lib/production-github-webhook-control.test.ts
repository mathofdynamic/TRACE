import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertWebhookConfiguration,
  assertWebhookControlRequest,
  controlProductionWebhook,
  productionWebhookUrl,
  selectSafeDeliveries,
  type WebhookOperation,
} from '../../../scripts/production-github-webhook-control.js';
const config = {
  url: productionWebhookUrl,
  content_type: 'json',
  insecure_ssl: '0',
  secret: '********',
};
const installation = {
  id: 123,
  account: { login: 'mathofdynamic' },
  suspended_at: null,
  repository_selection: 'selected',
};
const repo = {
  id: 1378441300,
  owner: { login: 'mathofdynamic' },
  name: 'trace-staging-fixture',
  full_name: 'mathofdynamic/trace-staging-fixture',
};
const app = {
  id: 5082884,
  name: 'TRACE Production Integration',
  client_id: 'test-client',
  installations_count: 1,
};
const delivery = {
  id: 12345,
  guid: '12345678-1234-1234-1234-123456789abc',
  event: 'issues',
  action: 'opened',
  installation_id: 123,
  repository_id: 1378441300,
  delivered_at: '2026-09-30T00:00:00Z',
  status_code: 200,
  redelivery: false,
};
let key: string;
beforeAll(() => {
  key = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey;
});
function fake(responses: Array<{ body?: unknown; status?: number }>) {
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = new URL(
      input instanceof URL ? input.href : typeof input === 'string' ? input : input.url,
    );
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      ...(init?.body ? { body: JSON.parse(String(init.body)) as unknown } : {}),
    });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected test request');
    return new Response(
      [202, 204, 404].includes(next.status ?? 200) ? null : JSON.stringify(next.body),
      { status: next.status ?? 200 },
    );
  };
  return { requests, fetchImplementation };
}
function prefix(
  overrides: { app?: unknown; installation?: unknown; repos?: unknown; hook?: unknown } = {},
) {
  return [
    { body: overrides.app ?? app },
    { body: overrides.installation ?? [installation] },
    { body: { token: 'synthetic-installation-token' } },
    { body: overrides.repos ?? { total_count: 1, repositories: [repo] } },
    { body: overrides.hook ?? config },
  ];
}
function run(operation: WebhookOperation, responses: ReturnType<typeof fake>, deliveryId?: string) {
  return controlProductionWebhook({
    operation,
    deliveryId,
    environment: {
      TRACE_GITHUB_APP_ID: '5082884',
      TRACE_GITHUB_APP_CLIENT_ID: 'test-client',
      TRACE_GITHUB_APP_PRIVATE_KEY: key,
      TRACE_GITHUB_WEBHOOK_SECRET: 'synthetic-protected-webhook-secret',
    },
    fetchImplementation: responses.fetchImplementation,
  });
}
describe('protected production GitHub webhook control', () => {
  it('PATCHes only the fixed production config after verifying the sole fixture installation', async () => {
    const f = fake([...prefix(), { body: config }, { body: config }]);
    const report = await run('configure', f);
    expect(f.requests.at(-2)).toEqual({
      method: 'PATCH',
      path: '/app/hook/config',
      body: {
        url: productionWebhookUrl,
        content_type: 'json',
        insecure_ssl: '0',
        secret: 'synthetic-protected-webhook-secret',
      },
    });
    expect(report).toContain('WEBHOOK_SECRET_PRESENT=YES');
    for (const secret of [
      key,
      'synthetic-protected-webhook-secret',
      'synthetic-installation-token',
      '********',
    ])
      expect(report).not.toContain(secret);
    expect(report).toContain('WEBHOOK_ACTIVE_UI_STATE=NOT_INDEPENDENTLY_VERIFIED');
  });
  it('reports endpoint-specific 404 for the Active handoff without a workaround', async () => {
    const f = fake([...prefix(), { status: 404 }]);
    expect(await run('configure', f)).toContain('ACTIVE_UI_HANDOFF_REQUIRED=YES');
    expect(f.requests.at(-1)?.method).toBe('PATCH');
  });
  it.each([
    { app: { ...app, id: 1 } },
    { app: { ...app, name: 'wrong' } },
    { app: { ...app, installations_count: 2 } },
    { installation: [] },
    { installation: [installation, installation] },
    { installation: [{ ...installation, account: { login: 'other' } }] },
    { installation: [{ ...installation, repository_selection: 'all' }] },
    { installation: [{ ...installation, suspended_at: '2026-09-30' }] },
    { repos: { total_count: 2, repositories: [repo, repo] } },
    { repos: { total_count: 1, repositories: [{ ...repo, id: 999 }] } },
    { hook: { ...config, url: 'https://other.invalid/webhook' } },
  ])(
    'fails before PATCH for an unauthorized App/installation/repository: %j',
    async (overrides) => {
      const f = fake(prefix(overrides));
      await expect(run('configure', f)).rejects.toThrow();
      expect(f.requests.some((request) => request.method === 'PATCH')).toBe(false);
    },
  );
  it('inspects bounded delivery metadata without request or response bodies', async () => {
    const f = fake([
      ...prefix(),
      { body: config },
      {
        body: [
          {
            ...delivery,
            request: { payload: { issue: { body: 'sensitive issue body' } } },
            response: { payload: 'sensitive response' },
          },
        ],
      },
    ]);
    const report = await run('inspect-deliveries', f);
    expect(report).toContain('"id":12345');
    expect(report).not.toContain('sensitive');
    expect(f.requests.at(-1)?.path).toBe('/app/hook/deliveries?per_page=100');
  });
  it('redelivers only an accepted fixture issue ID discovered and checked in this run', async () => {
    const detail = {
      ...delivery,
      request: {
        payload: {
          action: 'opened',
          installation: { id: 123 },
          repository: { id: 1378441300 },
          issue: { body: 'sensitive issue body' },
        },
      },
    };
    const f = fake([
      ...prefix(),
      { body: config },
      { body: [delivery] },
      { body: detail },
      { status: 202 },
    ]);
    const report = await run('redeliver', f, '12345');
    expect(f.requests.at(-1)).toEqual({
      method: 'POST',
      path: '/app/hook/deliveries/12345/attempts',
    });
    expect(report).not.toContain('sensitive');
  });
  it('recovers the unsigned activation ping only after protected configuration', async () => {
    const ping = {
      ...delivery,
      event: 'ping',
      action: null,
      installation_id: null,
      repository_id: null,
      status_code: 401,
    };
    const f = fake([
      ...prefix(),
      { body: config },
      { body: [ping] },
      { body: ping },
      { status: 202 },
    ]);
    expect(await run('redeliver', f, '12345')).toContain('REDELIVERY_EVENT=ping');
  });
  it.each(
    [
      [],
      [{ ...delivery, id: 23456 }],
      [{ ...delivery, redelivery: true }],
      [delivery, { ...delivery, id: 23456, redelivery: true }],
      [{ ...delivery, status_code: 500 }],
      [
        {
          ...delivery,
          event: 'ping',
          action: null,
          installation_id: null,
          repository_id: null,
          status_code: 200,
        },
      ],
    ].map((entries) => [entries]),
  )(
    'rejects undiscovered, repeated, unaccepted issue, or unnecessary ping redelivery: %j',
    async (entries: Record<string, unknown>[] = []) => {
      const f = fake([...prefix(), { body: config }, { body: entries }, { body: entries[0] }]);
      await expect(run('redeliver', f, '12345')).rejects.toThrow();
      expect(f.requests.some((request) => request.path.endsWith('/attempts'))).toBe(false);
    },
  );
  it('rejects detail payload cross-links before redelivery', async () => {
    const detail = {
      ...delivery,
      request: {
        payload: { action: 'opened', installation: { id: 999 }, repository: { id: 1378441300 } },
      },
    };
    const f = fake([...prefix(), { body: config }, { body: [delivery] }, { body: detail }]);
    await expect(run('redeliver', f, '12345')).rejects.toThrow(/payload/);
    expect(f.requests.some((request) => request.path.endsWith('/attempts'))).toBe(false);
  });
  it.each([
    { ...delivery, repository_id: 999 },
    { ...delivery, installation_id: 999 },
    { ...delivery, event: 'pull_request' },
    { ...delivery, action: 'closed' },
  ])('rejects out-of-fixture deliveries: %j', (entry) => {
    expect(() => selectSafeDeliveries([entry], 123)).toThrow();
  });
  it.each([
    ['PATCH', 'https://api.github.com/app/hook/config?url=other'],
    ['PUT', 'https://api.github.com/app/hook/config'],
    ['PATCH', 'https://other.invalid/app/hook/config'],
    ['DELETE', 'https://api.github.com/app/hook/config'],
    ['GET', 'https://api.github.com/app/hook/deliveries?per_page=100&page=2'],
    ['GET', 'https://api.github.com/app/hook/deliveries/12345'],
    ['POST', 'https://api.github.com/app/hook/deliveries/23456/attempts'],
    ['POST', 'https://api.github.com/repos/mathofdynamic/trace-staging-fixture/issues'],
  ])('rejects methods and paths outside the fixed allowlist: %s %s', (method, url) => {
    expect(() =>
      assertWebhookControlRequest(method, url, method === 'POST' ? 12345 : undefined),
    ).toThrow();
  });
  it.each([
    { ...config, url: 'https://other.invalid' },
    { ...config, content_type: 'form' },
    { ...config, insecure_ssl: '1' },
    { ...config, secret: '' },
  ])('rejects unsafe hook config: %j', (entry) =>
    expect(() => assertWebhookConfiguration(entry)).toThrow(),
  );
  it('keeps the workflow manual, feature-only, exact-SHA and protected with minimal secrets', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production-github-webhook-control.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.ref == 'refs/heads/feat/cloudflare-native-runtime'");
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('environment: production-canary');
    expect(workflow).toContain('"${EXPECTED_SHA,,}" != "${GITHUB_SHA,,}"');
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).toContain(
      'TRACE_GITHUB_APP_PRIVATE_KEY: ${{ secrets.TRACE_GITHUB_APP_PRIVATE_KEY }}',
    );
    expect(workflow).toContain(
      'TRACE_GITHUB_WEBHOOK_SECRET: ${{ secrets.TRACE_GITHUB_WEBHOOK_SECRET }}',
    );
    expect(workflow).not.toMatch(
      /CLOUDFLARE_API_TOKEN|TRACE_AUTH_SECRET|APP_CLIENT_SECRET|OAUTH_CLIENT_SECRET|wrangler deploy|push:|pull_request:/,
    );
  });
});
