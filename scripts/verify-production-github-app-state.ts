import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionGitHubAppJwt } from './production-github-app-jwt.js';
import { productionGitHubApp } from './production-canary-runtime-config.js';

const apiOrigin = 'https://api.github.com';
const installationsPath = '/app/installations';
const installationsPageSize = 100;
const maxInstallationsPages = 100;

type AppIdentityResponse = {
  id?: unknown;
  name?: unknown;
  client_id?: unknown;
  installations_count?: unknown;
};

type WebhookConfigResponse = {
  url?: unknown;
  content_type?: unknown;
  insecure_ssl?: unknown;
  secret?: unknown;
};

export type ProductionGitHubAppState = {
  appId: string;
  appName: string;
  installationsCount: number;
  installationListCount: number;
  webhookConfigState: 'ABSENT_NOT_FOUND' | 'PRESENT_EMPTY' | 'CONFIGURED';
  webhookUrlConfigured: boolean;
  webhookUrl: string;
  webhookContentType: string;
  webhookInsecureSsl: string;
  webhookSecretPresent: 'YES' | 'NO' | 'NOT_AVAILABLE';
  webhookActiveUiState: 'NOT_INDEPENDENTLY_VERIFIED';
};

type GitHubResponse = {
  response: Response;
  body: unknown;
};

export function assertGitHubAppStateMethod(method: string): asserts method is 'GET' {
  if (method !== 'GET') {
    throw new Error('GitHub App state check allows GET requests only.');
  }
}

function assertAllowedEndpoint(urlValue: string, expectedPage: number) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error('GitHub App state check rejected a non-allowlisted endpoint.');
  }

  if (
    url.origin !== apiOrigin ||
    url.pathname !== installationsPath ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.searchParams.get('per_page') !== String(installationsPageSize) ||
    (url.searchParams.get('page') ?? (expectedPage === 1 ? '1' : undefined)) !==
      String(expectedPage) ||
    [...url.searchParams.keys()].some((key) => key !== 'per_page' && key !== 'page') ||
    url.searchParams.getAll('per_page').length !== 1 ||
    url.searchParams.getAll('page').length > 1
  ) {
    throw new Error('GitHub App state check rejected a non-allowlisted endpoint.');
  }
  return url;
}

function assertAllowedRequestUrl(url: URL) {
  if (url.origin !== apiOrigin || url.username !== '' || url.password !== '' || url.hash !== '') {
    throw new Error('GitHub App state check rejected a non-allowlisted endpoint.');
  }

  if ((url.pathname === '/app' || url.pathname === '/app/hook/config') && url.search === '') {
    return;
  }

  if (url.pathname === installationsPath) {
    const pageValue = url.searchParams.get('page');
    const page = pageValue === null ? 1 : Number(pageValue);
    if (Number.isSafeInteger(page) && page > 0) {
      assertAllowedEndpoint(url.href, page);
      return;
    }
  }

  throw new Error('GitHub App state check rejected a non-allowlisted endpoint.');
}

function safeEndpointName(url: URL) {
  return url.pathname === installationsPath ? 'GET /app/installations' : `GET ${url.pathname}`;
}

async function getJson(
  url: URL,
  appJwt: string,
  fetchImplementation: typeof fetch,
  allowAbsentHookConfig = false,
): Promise<GitHubResponse> {
  assertAllowedRequestUrl(url);
  const method = 'GET';
  assertGitHubAppStateMethod(method);
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method,
      redirect: 'error',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${appJwt}`,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${safeEndpointName(url)} request failed before receiving a response.`);
  }

  if (allowAbsentHookConfig && url.pathname === '/app/hook/config' && response.status === 404) {
    return { response, body: undefined };
  }

  if (!response.ok) {
    throw new Error(`${safeEndpointName(url)} failed (HTTP ${response.status}).`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${safeEndpointName(url)} response was not valid JSON.`);
  }
  return { response, body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeMetadataString(value: unknown, fallback = 'UNKNOWN') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._-]{1,40}$/.test(value)) return fallback;
  return value;
}

function safeWebhookUrl(value: string) {
  if (value.length === 0) return '';
  return '[configured; URL redacted]';
}

function nextInstallationPage(linkHeader: string | null, currentPage: number) {
  if (!linkHeader) return undefined;
  const nextMatch = [...linkHeader.matchAll(/<([^>]+)>\s*;\s*rel="?next"?/gi)][0];
  if (!nextMatch || typeof nextMatch[1] !== 'string') return undefined;

  const nextPage = currentPage + 1;
  const nextUrl = assertAllowedEndpoint(nextMatch[1], nextPage);
  return nextUrl;
}

function parseInstallations(body: unknown) {
  if (!Array.isArray(body) || body.some((entry) => !isRecord(entry))) {
    throw new Error('GET /app/installations response was not an installation list.');
  }
  return body.length;
}

function parseSafeWebhookUrl(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('GET /app/hook/config response omitted the webhook URL field.');
  }
  return value;
}

function assertNoInstallations(installationsCount: number, installationListCount: number) {
  if (installationsCount !== installationListCount) {
    throw new Error('GitHub App installation count does not match the installation list.');
  }
  if (installationsCount !== 0) {
    throw new Error('GitHub App has existing installations; expected none.');
  }
}

export async function readProductionGitHubAppState(
  appId: string | undefined,
  appClientId: string | undefined,
  privateKeyPem: string | undefined,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProductionGitHubAppState> {
  if (appId !== productionGitHubApp.id) {
    throw new Error('Production GitHub App ID does not match the expected App.');
  }
  if (typeof appClientId !== 'string' || appClientId.trim().length === 0) {
    throw new Error('Production GitHub App client ID is missing.');
  }
  if (typeof privateKeyPem !== 'string' || privateKeyPem.trim().length === 0) {
    throw new Error('Production GitHub App private key is missing.');
  }

  let appJwt: string;
  try {
    appJwt = createProductionGitHubAppJwt(appId, privateKeyPem);
  } catch {
    throw new Error('Production GitHub App JWT could not be created.');
  }

  const appResponse = await getJson(new URL(`${apiOrigin}/app`), appJwt, fetchImplementation);
  if (!isRecord(appResponse.body)) {
    throw new Error('GET /app response was not a GitHub App identity.');
  }
  const app = appResponse.body as AppIdentityResponse;
  if (app.id !== Number(productionGitHubApp.id)) {
    throw new Error('GitHub App identity id does not match the expected App.');
  }
  if (app.name !== productionGitHubApp.name) {
    throw new Error('GitHub App identity name does not match the expected App.');
  }
  if (app.client_id !== appClientId) {
    throw new Error('GitHub App identity client_id does not match the configured client ID.');
  }
  if (!Number.isSafeInteger(app.installations_count) || (app.installations_count as number) < 0) {
    throw new Error('GitHub App identity installations_count is missing or invalid.');
  }

  let installationListCount = 0;
  let currentPage = 1;
  let installationsUrl = assertAllowedEndpoint(
    `${apiOrigin}${installationsPath}?per_page=${installationsPageSize}`,
    currentPage,
  );
  for (let pageCount = 0; ; pageCount += 1) {
    if (pageCount >= maxInstallationsPages) {
      throw new Error('GET /app/installations exceeded the bounded pagination limit.');
    }
    const page = await getJson(installationsUrl, appJwt, fetchImplementation);
    installationListCount += parseInstallations(page.body);
    const next = nextInstallationPage(page.response.headers.get('link'), currentPage);
    if (!next) break;
    currentPage += 1;
    installationsUrl = next;
  }

  const installationsCount = app.installations_count as number;
  assertNoInstallations(installationsCount, installationListCount);

  const webhookResponse = await getJson(
    new URL(`${apiOrigin}/app/hook/config`),
    appJwt,
    fetchImplementation,
    true,
  );
  if (webhookResponse.response.status === 404) {
    return {
      appId: productionGitHubApp.id,
      appName: productionGitHubApp.name,
      installationsCount,
      installationListCount,
      webhookConfigState: 'ABSENT_NOT_FOUND',
      webhookUrlConfigured: false,
      webhookUrl: '<absent>',
      webhookContentType: 'NOT_AVAILABLE',
      webhookInsecureSsl: 'NOT_AVAILABLE',
      webhookSecretPresent: 'NOT_AVAILABLE',
      webhookActiveUiState: 'NOT_INDEPENDENTLY_VERIFIED',
    };
  }
  if (!isRecord(webhookResponse.body)) {
    throw new Error('GET /app/hook/config response was not a webhook configuration.');
  }
  const webhook = webhookResponse.body as WebhookConfigResponse;
  const rawWebhookUrl = parseSafeWebhookUrl(webhook.url);
  const webhookUrlConfigured = rawWebhookUrl.length > 0;

  return {
    appId: productionGitHubApp.id,
    appName: productionGitHubApp.name,
    installationsCount,
    installationListCount,
    webhookConfigState: webhookUrlConfigured ? 'CONFIGURED' : 'PRESENT_EMPTY',
    webhookUrlConfigured,
    webhookUrl: rawWebhookUrl.length === 0 ? '<empty>' : safeWebhookUrl(rawWebhookUrl),
    webhookContentType: safeMetadataString(webhook.content_type),
    webhookInsecureSsl: safeMetadataString(webhook.insecure_ssl),
    webhookSecretPresent:
      typeof webhook.secret === 'string' && webhook.secret.length > 0 ? 'YES' : 'NO',
    webhookActiveUiState: 'NOT_INDEPENDENTLY_VERIFIED',
  };
}

export function assertProductionGitHubAppStateSafe(state: ProductionGitHubAppState) {
  assertNoInstallations(state.installationsCount, state.installationListCount);
  if (state.webhookUrlConfigured) {
    throw new Error('GitHub App webhook URL is configured; expected none.');
  }
}

export function formatProductionGitHubAppState(state: ProductionGitHubAppState) {
  return [
    `APP_ID=${state.appId}`,
    `APP_NAME=${state.appName}`,
    `INSTALLATIONS_COUNT=${state.installationsCount}`,
    `INSTALLATION_LIST_COUNT=${state.installationListCount}`,
    `WEBHOOK_CONFIG_STATE=${state.webhookConfigState}`,
    `WEBHOOK_URL_CONFIGURED=${state.webhookUrlConfigured ? 'YES' : 'NO'}`,
    `WEBHOOK_URL=${state.webhookUrl}`,
    `WEBHOOK_CONTENT_TYPE=${state.webhookContentType}`,
    `WEBHOOK_INSECURE_SSL=${state.webhookInsecureSsl}`,
    `WEBHOOK_SECRET_PRESENT=${state.webhookSecretPresent}`,
    `WEBHOOK_ACTIVE_UI_STATE=${state.webhookActiveUiState}`,
  ].join('\n');
}

async function main() {
  try {
    const state = await readProductionGitHubAppState(
      process.env.TRACE_GITHUB_APP_ID,
      process.env.TRACE_GITHUB_APP_CLIENT_ID,
      process.env.TRACE_GITHUB_APP_PRIVATE_KEY,
    );
    console.log(formatProductionGitHubAppState(state));
    assertProductionGitHubAppStateSafe(state);
    console.log('GITHUB_APP_STATE=SAFE');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'GitHub App state check failed.');
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
