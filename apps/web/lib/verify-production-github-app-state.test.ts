import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertGitHubAppStateMethod,
  assertProductionGitHubAppStateSafe,
  formatProductionGitHubAppState,
  readProductionGitHubAppState,
} from '../../../scripts/verify-production-github-app-state.js';

const expectedApp = {
  id: 5082884,
  name: 'TRACE Production Integration',
  client_id: 'production-client-id',
  installations_count: 0,
};

const emptyInstallations: unknown[] = [];
const unconfiguredWebhook = {
  url: '',
  content_type: 'json',
  insecure_ssl: '0',
  secret: '********',
};

let privateKeyPem: string;

beforeAll(() => {
  ({ privateKey: privateKeyPem } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }));
});

function makeFetch(responses: Array<{ body?: unknown; link?: string; status?: number }>) {
  const requests: Array<{ url: string; method?: string; redirect?: RequestRedirect }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, method: init?.method, redirect: init?.redirect });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected test request.');
    const headers = next.link ? { link: next.link } : undefined;
    if (next.status === 404) return new Response(null, { status: 404, headers });
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers });
  };
  return { fetchImplementation, requests };
}

function stateFetch(app: unknown = expectedApp, installations: unknown = emptyInstallations) {
  return makeFetch([{ body: app }, { body: installations }, { body: unconfiguredWebhook }]);
}

async function readState(fetchImplementation: typeof fetch) {
  return readProductionGitHubAppState(
    '5082884',
    'production-client-id',
    privateKeyPem,
    fetchImplementation,
  );
}

describe('production GitHub App state check', () => {
  it('accepts the expected App identity, no installations, and an unconfigured webhook', async () => {
    const fake = stateFetch();
    const state = await readState(fake.fetchImplementation);

    expect({
      appId: state.appId,
      appName: state.appName,
      installationsCount: state.installationsCount,
      installationListCount: state.installationListCount,
      webhookConfigState: state.webhookConfigState,
      webhookUrlConfigured: state.webhookUrlConfigured,
      webhookUrl: state.webhookUrl,
      webhookContentType: state.webhookContentType,
      webhookInsecureSsl: state.webhookInsecureSsl,
      webhookSecretPresent: state.webhookSecretPresent,
      webhookActiveUiState: state.webhookActiveUiState,
    }).toEqual({
      appId: '5082884',
      appName: 'TRACE Production Integration',
      installationsCount: 0,
      installationListCount: 0,
      webhookConfigState: 'PRESENT_EMPTY',
      webhookUrlConfigured: false,
      webhookUrl: '<empty>',
      webhookContentType: 'json',
      webhookInsecureSsl: '0',
      webhookSecretPresent: 'YES',
      webhookActiveUiState: 'NOT_INDEPENDENTLY_VERIFIED',
    });
    expect(JSON.stringify(state).includes(privateKeyPem)).toBe(false);
    expect(() => assertProductionGitHubAppStateSafe(state)).not.toThrow();
    for (const request of fake.requests) {
      expect(request.method).toBe('GET');
      expect(request.redirect).toBe('error');
      expect(request.url).toMatch(
        /^https:\/\/api\.github\.com\/(app|app\/hook\/config|app\/installations\?per_page=100(?:&page=\d+)?)$/,
      );
    }
  });

  it.each([
    ['id', { ...expectedApp, id: 7 }, /id/i],
    ['name', { ...expectedApp, name: 'Different App' }, /name/i],
    ['client id', { ...expectedApp, client_id: 'different-client' }, /client.?id/i],
  ])('rejects an unexpected App %s', async (_field, app, message) => {
    const fake = stateFetch(app);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(message);
    expect(fake.requests).toHaveLength(1);
  });

  it('rejects an installations_count/list mismatch before reading webhook config', async () => {
    const fake = stateFetch({ ...expectedApp, installations_count: 1 }, []);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GitHub App installation count does not match the installation list.',
    );
    expect(fake.requests).toHaveLength(2);
  });

  it('rejects a nonempty installation list that conflicts with zero count before webhook config', async () => {
    const fake = stateFetch(expectedApp, [{ id: 45 }]);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GitHub App installation count does not match the installation list.',
    );
    expect(fake.requests).toHaveLength(2);
  });

  it('rejects a nonzero installations_count even when the list agrees before webhook config', async () => {
    const fake = stateFetch({ ...expectedApp, installations_count: 1 }, [{ id: 45 }]);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GitHub App has existing installations; expected none.',
    );
    expect(fake.requests).toHaveLength(2);
  });

  it('rejects a nonempty installation list', async () => {
    const fake = stateFetch({ ...expectedApp, installations_count: 1 }, [{ id: 45 }]);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GitHub App has existing installations; expected none.',
    );
    expect(fake.requests).toHaveLength(2);
  });

  it('follows only the GitHub installations next-page URL', async () => {
    const fake = makeFetch([
      { body: { ...expectedApp, installations_count: 101 } },
      {
        body: Array.from({ length: 100 }, (_, id) => ({ id })),
        link: '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"',
      },
      { body: [{ id: 101 }] },
      { body: { ...unconfiguredWebhook, secret: '' } },
    ]);
    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GitHub App has existing installations; expected none.',
    );
    expect(fake.requests.map((request) => request.url)).toEqual([
      'https://api.github.com/app',
      'https://api.github.com/app/installations?per_page=100',
      'https://api.github.com/app/installations?per_page=100&page=2',
    ]);
  });

  it('rejects a pagination link outside the allowlisted installations endpoint', async () => {
    const fake = makeFetch([
      { body: { ...expectedApp, installations_count: 101 } },
      {
        body: Array.from({ length: 100 }, (_, id) => ({ id })),
        link: '<https://api.github.com/repos/mathofdynamic/TRACE>; rel="next"',
      },
    ]);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GitHub App state check rejected a non-allowlisted endpoint.',
    );
    expect(fake.requests).toHaveLength(2);
  });

  it('rejects a configured webhook URL', async () => {
    const fake = makeFetch([
      { body: expectedApp },
      { body: emptyInstallations },
      { body: { ...unconfiguredWebhook, url: 'https://hooks.example.test/app' } },
    ]);
    const state = await readState(fake.fetchImplementation);

    expect(state.webhookConfigState).toBe('CONFIGURED');
    expect(state.webhookUrlConfigured).toBe(true);
    expect(formatProductionGitHubAppState(state)).toContain(
      'WEBHOOK_URL=[configured; URL redacted]',
    );
    expect(() => assertProductionGitHubAppStateSafe(state)).toThrow(
      'GitHub App webhook URL is configured; expected none.',
    );
  });

  it('accepts hook-config 404 as absent after proving zero installations', async () => {
    const fake = makeFetch([{ body: expectedApp }, { body: emptyInstallations }, { status: 404 }]);
    const state = await readState(fake.fetchImplementation);
    const report = formatProductionGitHubAppState(state);

    expect(report).toContain('APP_ID=5082884');
    expect(report).toContain('APP_NAME=TRACE Production Integration');
    expect(report).toContain('INSTALLATIONS_COUNT=0');
    expect(report).toContain('INSTALLATION_LIST_COUNT=0');
    expect(report).toContain('WEBHOOK_CONFIG_STATE=ABSENT_NOT_FOUND');
    expect(report).toContain('WEBHOOK_URL_CONFIGURED=NO');
    expect(report).toContain('WEBHOOK_URL=<absent>');
    expect(report).toContain('WEBHOOK_CONTENT_TYPE=NOT_AVAILABLE');
    expect(report).toContain('WEBHOOK_INSECURE_SSL=NOT_AVAILABLE');
    expect(report).toContain('WEBHOOK_SECRET_PRESENT=NOT_AVAILABLE');
    expect(report).toContain('WEBHOOK_ACTIVE_UI_STATE=NOT_INDEPENDENTLY_VERIFIED');
    expect(report).not.toContain('WEBHOOK_ACTIVE=NO');
    expect(() => assertProductionGitHubAppStateSafe(state)).not.toThrow();
    expect(fake.requests.map((request) => request.url)).toEqual([
      'https://api.github.com/app',
      'https://api.github.com/app/installations?per_page=100',
      'https://api.github.com/app/hook/config',
    ]);
    expect(fake.requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it.each([401, 403, 500])('rejects hook-config HTTP %i', async (status) => {
    const fake = makeFetch([
      { body: expectedApp },
      { body: emptyInstallations },
      { status, body: { secret: 'must-not-leak' } },
    ]);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      `GET /app/hook/config failed (HTTP ${status}).`,
    );
    expect(fake.requests).toHaveLength(3);
  });

  it('does not expose hook-config response data in errors', async () => {
    const privateResponseValue = 'private-hook-config-response-value';
    const fake = makeFetch([
      { body: expectedApp },
      { body: emptyInstallations },
      { status: 500, body: { secret: privateResponseValue } },
    ]);

    let message = '';
    try {
      await readState(fake.fetchImplementation);
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toBe('GET /app/hook/config failed (HTTP 500).');
    expect(message.includes(privateResponseValue)).toBe(false);
  });

  it('does not interpret a 404 from GET /app as an absent webhook config', async () => {
    const fake = makeFetch([{ status: 404 }]);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GET /app failed (HTTP 404).',
    );
    expect(fake.requests).toHaveLength(1);
  });

  it('does not interpret a 404 from GET /app/installations as an absent webhook config', async () => {
    const fake = makeFetch([{ body: expectedApp }, { status: 404 }]);

    await expect(readState(fake.fetchImplementation)).rejects.toThrow(
      'GET /app/installations failed (HTTP 404).',
    );
    expect(fake.requests).toHaveLength(2);
  });

  it('never prints a webhook secret, JWT, or private key', async () => {
    const webhookSecret = 'synthetic-webhook-secret-never-output';
    let capturedJwt = '';
    const responses = [
      { body: expectedApp },
      { body: emptyInstallations },
      { body: { ...unconfiguredWebhook, secret: webhookSecret } },
    ];
    const fetchImplementation: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      capturedJwt = (headers.get('authorization') ?? '').replace(/^Bearer /, '');
      const next = responses.shift();
      if (!next) throw new Error('Unexpected test request.');
      return new Response(JSON.stringify(next.body), { status: 200 });
    };
    const state = await readState(fetchImplementation);
    const report = formatProductionGitHubAppState(state);

    expect(report).toContain('WEBHOOK_SECRET_PRESENT=YES');
    expect(report.includes(webhookSecret)).toBe(false);
    expect(report.includes(privateKeyPem)).toBe(false);
    expect(report.includes(capturedJwt)).toBe(false);
    expect(report.includes('Bearer ')).toBe(false);
  });

  it('never includes credentials or response bodies in HTTP errors', async () => {
    let capturedJwt = '';
    const fakeFetch: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      capturedJwt = (headers.get('authorization') ?? '').replace(/^Bearer /, '');
      throw new Error(`${capturedJwt}\n${privateKeyPem}`);
    };

    let message = '';
    try {
      await readState(fakeFetch);
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toBe('GET /app request failed before receiving a response.');
    expect(message.includes(privateKeyPem)).toBe(false);
    expect(message.includes(capturedJwt)).toBe(false);
    expect(message.includes('Bearer ')).toBe(false);
  });

  it('rejects any non-GET request method before fetch', () => {
    expect(() => assertGitHubAppStateMethod('POST')).toThrow(
      'GitHub App state check allows GET requests only.',
    );
  });

  it('reports unexpected authorization failures using only endpoint and status', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response('private response content', { status: 403 });

    await expect(readState(fakeFetch)).rejects.toThrow('GET /app failed (HTTP 403).');
    await expect(readState(fakeFetch)).rejects.not.toThrow('private response content');
  });
});
