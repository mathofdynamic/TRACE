import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionGitHubAppJwt } from './production-github-app-jwt.js';
import { readProductionGitHubFixtureInstallation } from './verify-production-github-fixture-installation.js';

export const productionWebhookUrl =
  'https://trace-production.mathofdynamic2.workers.dev/api/github/webhooks';
const origin = 'https://api.github.com';
const recentPath = '/app/hook/deliveries?per_page=100';
export type WebhookOperation = 'configure' | 'inspect-deliveries' | 'redeliver';
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function fail(message: string): never {
  throw new Error(`Production webhook control failed: ${message}`);
}

export function assertWebhookControlRequest(
  method: string,
  urlValue: string,
  discoveredId?: number,
) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    fail('Invalid API URL.');
  }
  if (url.origin !== origin || url.username || url.password || url.hash)
    fail('Unexpected API origin.');
  if (
    url.pathname === '/app/hook/config' &&
    !url.search &&
    (method === 'GET' || method === 'PATCH')
  )
    return;
  if (method === 'GET' && url.pathname + url.search === recentPath) return;
  if (Number.isSafeInteger(discoveredId) && discoveredId! > 0 && !url.search) {
    if (method === 'GET' && url.pathname === `/app/hook/deliveries/${discoveredId}`) return;
    if (method === 'POST' && url.pathname === `/app/hook/deliveries/${discoveredId}/attempts`)
      return;
  }
  fail('Method or endpoint is outside the fixed webhook allowlist.');
}

export function assertWebhookConfiguration(body: unknown) {
  if (
    !record(body) ||
    body.url !== productionWebhookUrl ||
    body.content_type !== 'json' ||
    String(body.insecure_ssl) !== '0' ||
    typeof body.secret !== 'string' ||
    !body.secret
  ) {
    fail(
      'Exact production URL, JSON, TLS verification, and a present redacted secret are required.',
    );
  }
}

export type SafeDelivery = {
  id: number;
  guid: string;
  event: 'ping' | 'issues';
  action: string | null;
  installationId: number | null;
  repositoryId: number | null;
  deliveredAt: string;
  statusCode: number | null;
  redelivery: boolean;
};
export function selectSafeDeliveries(body: unknown, installationId: number): SafeDelivery[] {
  if (!Array.isArray(body) || body.length > 100) fail('Recent deliveries must be a bounded list.');
  return body.map((entry) => {
    if (
      !record(entry) ||
      !Number.isSafeInteger(entry.id) ||
      (entry.id as number) <= 0 ||
      typeof entry.guid !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.guid) ||
      typeof entry.delivered_at !== 'string' ||
      !Number.isFinite(Date.parse(entry.delivered_at)) ||
      typeof entry.redelivery !== 'boolean' ||
      (entry.status_code !== null &&
        (!Number.isInteger(entry.status_code) ||
          (entry.status_code as number) < 100 ||
          (entry.status_code as number) > 599))
    )
      fail('Delivery metadata is invalid.');
    const ping =
      entry.event === 'ping' &&
      entry.action === null &&
      (entry.installation_id === null || entry.installation_id === installationId) &&
      (entry.repository_id === null || entry.repository_id === 1378441300);
    const issue =
      entry.event === 'issues' &&
      entry.action === 'opened' &&
      entry.installation_id === installationId &&
      entry.repository_id === 1378441300;
    if (!ping && !issue) fail('Unexpected event or nonfixture delivery; stop activation.');
    return {
      id: entry.id as number,
      guid: entry.guid,
      event: entry.event as 'ping' | 'issues',
      action: entry.action as string | null,
      installationId: entry.installation_id as number | null,
      repositoryId: entry.repository_id as number | null,
      deliveredAt: entry.delivered_at,
      statusCode: entry.status_code as number | null,
      redelivery: entry.redelivery,
    };
  });
}

export async function controlProductionWebhook(input: {
  operation: WebhookOperation;
  deliveryId?: string;
  environment: Record<string, string | undefined>;
  fetchImplementation?: typeof fetch;
}) {
  if (!['configure', 'inspect-deliveries', 'redeliver'].includes(input.operation))
    fail('Unsupported operation.');
  if (input.operation !== 'redeliver' && input.deliveryId)
    fail('Only redeliver accepts a delivery ID.');
  const fetcher = input.fetchImplementation ?? fetch;
  const environment = input.environment;
  const fixture = await readProductionGitHubFixtureInstallation(
    environment.TRACE_GITHUB_APP_ID,
    environment.TRACE_GITHUB_APP_CLIENT_ID,
    environment.TRACE_GITHUB_APP_PRIVATE_KEY,
    fetcher,
    true,
  );
  const jwt = createProductionGitHubAppJwt(
    environment.TRACE_GITHUB_APP_ID,
    environment.TRACE_GITHUB_APP_PRIVATE_KEY,
  );
  async function request(method: string, endpoint: string, body?: unknown, discoveredId?: number) {
    const url = new URL(endpoint, origin);
    assertWebhookControlRequest(method, url.href, discoveredId);
    let response: Response;
    try {
      response = await fetcher(url, {
        method,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${jwt}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail('GitHub request failed before a response.');
    }
    if (response.status === 404 && endpoint === '/app/hook/config')
      return { absent: true as const, body: undefined };
    if (!response.ok) fail(`GitHub ${method} request failed (HTTP ${response.status}).`);
    if (response.status === 202 || response.status === 204)
      return { absent: false as const, body: undefined };
    try {
      return { absent: false as const, body: (await response.json()) as unknown };
    } catch {
      fail('GitHub returned invalid JSON.');
    }
  }
  const lines = [
    'APP_ID=5082884',
    'APP_NAME=TRACE Production Integration',
    `INSTALLATION_ID=${fixture.installationId}`,
    'INSTALLATION_ACCOUNT=mathofdynamic',
    'REPOSITORY_SELECTION=selected',
    'EXTERNAL_REPOSITORY_COUNT=1',
    'EXTERNAL_REPOSITORY_ID=1378441300',
    'EXTERNAL_REPOSITORY=mathofdynamic/trace-staging-fixture',
    'WEBHOOK_ACTIVE_UI_STATE=NOT_INDEPENDENTLY_VERIFIED',
  ];
  if (input.operation === 'configure') {
    const secret = environment.TRACE_GITHUB_WEBHOOK_SECRET;
    if (!secret) fail('Protected webhook secret is unavailable.');
    const patched = await request('PATCH', '/app/hook/config', {
      url: productionWebhookUrl,
      content_type: 'json',
      insecure_ssl: '0',
      secret,
    });
    if (patched.absent)
      return [
        ...lines,
        'WEBHOOK_CONFIG_STATE=ABSENT_NOT_FOUND',
        'ACTIVE_UI_HANDOFF_REQUIRED=YES',
      ].join('\n');
    const config = await request('GET', '/app/hook/config');
    if (config.absent) fail('Configuration disappeared after PATCH.');
    assertWebhookConfiguration(config.body);
    return [
      ...lines,
      `WEBHOOK_URL=${productionWebhookUrl}`,
      'WEBHOOK_CONTENT_TYPE=json',
      'WEBHOOK_INSECURE_SSL=0',
      'WEBHOOK_SECRET_PRESENT=YES',
      'WEBHOOK_CONFIG=VERIFIED',
    ].join('\n');
  }
  const config = await request('GET', '/app/hook/config');
  if (config.absent) fail('Webhook configuration is absent.');
  assertWebhookConfiguration(config.body);
  lines.push(
    `WEBHOOK_URL=${productionWebhookUrl}`,
    'WEBHOOK_CONTENT_TYPE=json',
    'WEBHOOK_INSECURE_SSL=0',
    'WEBHOOK_SECRET_PRESENT=YES',
  );
  const recent = selectSafeDeliveries(
    (await request('GET', recentPath)).body,
    fixture.installationId,
  );
  if (input.operation === 'redeliver') {
    if (!input.deliveryId || !/^[1-9][0-9]{0,15}$/.test(input.deliveryId))
      fail('A valid discovered delivery ID is required.');
    const id = Number(input.deliveryId);
    const delivery = recent.find((entry) => entry.id === id);
    if (!delivery) fail('Delivery ID was not discovered in this protected bounded read.');
    if (delivery.redelivery) fail('Do not redeliver a redelivery attempt.');
    if (recent.some((entry) => entry.guid === delivery.guid && entry.redelivery))
      fail('This delivery already has a redelivery attempt.');
    const detail = (await request('GET', `/app/hook/deliveries/${id}`, undefined, id)).body;
    if (!record(detail)) fail('Delivery detail is invalid.');
    const checked = selectSafeDeliveries([detail], fixture.installationId)[0]!;
    if (
      checked.id !== delivery.id ||
      checked.guid !== delivery.guid ||
      checked.event !== delivery.event
    )
      fail('Delivery identity changed.');
    if (delivery.event === 'issues') {
      const payload = record(detail.request) ? detail.request.payload : undefined;
      if (
        !record(payload) ||
        payload.action !== 'opened' ||
        !record(payload.installation) ||
        payload.installation.id !== fixture.installationId ||
        !record(payload.repository) ||
        payload.repository.id !== 1378441300
      )
        fail('Issue payload does not belong to the authorized fixture.');
      if (!delivery.statusCode || delivery.statusCode < 200 || delivery.statusCode >= 300)
        fail('Only an already accepted issue delivery can be redelivered.');
    } else if (delivery.statusCode !== 401) {
      fail('Redeliver ping only to recover the pre-secret 401 activation attempt.');
    }
    await request('POST', `/app/hook/deliveries/${id}/attempts`, undefined, id);
    lines.push(
      `REDELIVERY_REQUESTED_ID=${id}`,
      `REDELIVERY_REQUESTED_GUID=${delivery.guid}`,
      `REDELIVERY_EVENT=${delivery.event}`,
    );
  }
  for (const delivery of recent) lines.push(`DELIVERY=${JSON.stringify(delivery)}`);
  return lines.join('\n');
}

async function main() {
  try {
    console.log(
      await controlProductionWebhook({
        operation: process.env.WEBHOOK_OPERATION as WebhookOperation,
        deliveryId: process.env.WEBHOOK_DELIVERY_ID || undefined,
        environment: process.env,
      }),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Production webhook control failed.');
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
  void main();
