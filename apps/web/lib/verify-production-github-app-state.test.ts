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

function makeFetch(responses: Array<{ body: unknown; link?: string }>) {
  const requests: Array<{ url: string; method?: string; redirect?: RequestRedirect }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, method: init?.method, redirect: init?.redirect });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected test request.');
    const headers = next.link ? { link: next.link } : undefined;
    return new Response(JSON.stringify(next.body), { status: 200, headers });
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
      webhookUrlConfigured: state.webhookUrlConfigured,
      webhookUrl: state.webhookUrl,
      webhookContentType: state.webhookContentType,
      webhookInsecureSsl: state.webhookInsecureSsl,
      webhookSecretPresent: state.webhookSecretPresent,
    }).toEqual({
      appId: '5082884',
      appName: 'TRACE Production Integration',
      installationsCount: 0,
      installationListCount: 0,
      webhookUrlConfigured: false,
      webhookUrl: '',
      webhookContentType: 'json',
      webhookInsecureSsl: '0',
      webhookSecretPresent: true,
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

  it('rejects an installations_count/list mismatch', async () => {
    const fake = stateFetch({ ...expectedApp, installations_count: 1 }, []);
    const state = await readState(fake.fetchImplementation);

    expect(() => assertProductionGitHubAppStateSafe(state)).toThrow(
      'GitHub App installation count does not match the installation list.',
    );
  });

  it('rejects a nonzero installations_count even when the list agrees', async () => {
    const fake = stateFetch({ ...expectedApp, installations_count: 1 }, [{ id: 45 }]);
    const state = await readState(fake.fetchImplementation);

    expect(() => assertProductionGitHubAppStateSafe(state)).toThrow(
      'GitHub App has existing installations; expected none.',
    );
  });

  it('rejects a nonempty installation list', async () => {
    const fake = stateFetch({ ...expectedApp, installations_count: 1 }, [{ id: 45 }]);
    const state = await readState(fake.fetchImplementation);

    expect(() => assertProductionGitHubAppStateSafe(state)).toThrow(
      'GitHub App has existing installations; expected none.',
    );
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
    const state = await readState(fake.fetchImplementation);

    expect(state.installationsCount).toBe(101);
    expect(state.installationListCount).toBe(101);
    expect(fake.requests.map((request) => request.url)).toEqual([
      'https://api.github.com/app',
      'https://api.github.com/app/installations?per_page=100',
      'https://api.github.com/app/installations?per_page=100&page=2',
      'https://api.github.com/app/hook/config',
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

    expect(state.webhookUrlConfigured).toBe(true);
    expect(() => assertProductionGitHubAppStateSafe(state)).toThrow(
      'GitHub App webhook URL is configured; expected none.',
    );
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
