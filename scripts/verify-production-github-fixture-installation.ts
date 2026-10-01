import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionGitHubAppJwt } from './production-github-app-jwt.js';
import { productionGitHubApp } from './production-canary-runtime-config.js';

const apiOrigin = 'https://api.github.com';
const expectedInstallationLogin = 'mathofdynamic';
const expectedRepository = {
  id: 1378441300,
  owner: 'mathofdynamic',
  name: 'trace-staging-fixture',
  fullName: 'mathofdynamic/trace-staging-fixture',
} as const;
const pageSize = 100;
const maxPages = 100;

type AppIdentity = {
  id?: unknown;
  name?: unknown;
  client_id?: unknown;
  installations_count?: unknown;
};
type AppInstallation = {
  id?: unknown;
  account?: { login?: unknown } | null;
  suspended_at?: unknown;
  repository_selection?: unknown;
};
type GitHubRepository = {
  id?: unknown;
  name?: unknown;
  full_name?: unknown;
  owner?: { login?: unknown } | null;
};
type ResponseBody = {
  total_count?: unknown;
  repositories?: unknown;
  token?: unknown;
};

export type ProductionGitHubFixtureInstallationState = {
  appId: string;
  appName: string;
  installationId: number;
  installationAccount: string;
  installationSuspended: false;
  repositorySelection: 'selected' | 'all';
  repositoryCount: number;
  repositoryId: number;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFullName: string;
  webhookConfigState: 'ABSENT_NOT_FOUND' | 'PRESENT_EMPTY' | 'CONFIGURED';
  webhookUrlConfigured: boolean;
};

type GitHubResponse = { response: Response; body: unknown };

function fail(message: string): never {
  throw new Error(`Production fixture installation verification failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeEndpoint(url: URL) {
  if (url.pathname.endsWith('/access_tokens')) return '/app/installations/:id/access_tokens';
  return url.pathname;
}

function assertCollectionUrl(url: URL, pathname: string, page: number) {
  if (
    url.origin !== apiOrigin ||
    url.pathname !== pathname ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.searchParams.get('per_page') !== String(pageSize) ||
    (url.searchParams.get('page') ?? (page === 1 ? '1' : undefined)) !== String(page) ||
    [...url.searchParams.keys()].some((key) => key !== 'per_page' && key !== 'page') ||
    url.searchParams.getAll('per_page').length !== 1 ||
    url.searchParams.getAll('page').length > 1
  ) {
    fail('A request URL was outside the narrowly allowed App-state endpoints.');
  }
}

export function assertProductionFixtureVerificationRequest(method: string, urlValue: string) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    fail('A request URL was invalid.');
  }
  if (url.origin !== apiOrigin || url.username !== '' || url.password !== '' || url.hash !== '') {
    fail('A request URL was outside the narrowly allowed GitHub API origin.');
  }

  if (method === 'GET' && (url.pathname === '/app' || url.pathname === '/app/hook/config')) {
    if (url.search !== '') fail('A request URL had unexpected query parameters.');
    return;
  }
  if (method === 'GET' && url.pathname === '/app/installations') {
    const page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isSafeInteger(page) || page < 1) fail('Installation pagination was invalid.');
    assertCollectionUrl(url, '/app/installations', page);
    return;
  }
  const tokenMatch = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(url.pathname);
  if (method === 'POST' && tokenMatch && url.search === '') {
    const id = Number(tokenMatch[1]);
    if (!Number.isSafeInteger(id) || id <= 0) fail('Installation identity was invalid.');
    return;
  }
  if (method === 'GET' && url.pathname === '/installation/repositories') {
    const page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isSafeInteger(page) || page < 1) fail('Repository pagination was invalid.');
    assertCollectionUrl(url, '/installation/repositories', page);
    return;
  }
  fail('A request method or URL was outside the read-only installation verification allowlist.');
}

function nextPage(linkHeader: string | null, currentPage: number, pathname: string) {
  if (!linkHeader) return undefined;
  const match = [...linkHeader.matchAll(/<([^>]+)>\s*;\s*rel="?next"?/gi)][0];
  if (!match?.[1]) return undefined;
  const next = currentPage + 1;
  const url = new URL(match[1]);
  assertCollectionUrl(url, pathname, next);
  return url;
}

async function requestJson(
  url: URL,
  method: 'GET' | 'POST',
  bearer: string,
  fetchImplementation: typeof fetch,
  allowAbsentWebhook = false,
): Promise<GitHubResponse> {
  assertProductionFixtureVerificationRequest(method, url.href);
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method,
      redirect: 'error',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${bearer}`,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${method} ${url.pathname} failed before receiving a response.`);
  }
  if (allowAbsentWebhook && url.pathname === '/app/hook/config' && response.status === 404) {
    return { response, body: undefined };
  }
  if (!response.ok)
    throw new Error(`${method} ${safeEndpoint(url)} failed (HTTP ${response.status}).`);
  if (response.status === 204) return { response, body: undefined };
  try {
    return { response, body: await response.json() };
  } catch {
    throw new Error(`${method} ${safeEndpoint(url)} response was not valid JSON.`);
  }
}

function requireInstallationList(value: unknown): AppInstallation[] {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    fail('GET /app/installations did not return a valid installation list.');
  }
  return value as AppInstallation[];
}

function validateInstallation(installation: AppInstallation) {
  const id = installation.id;
  if (id !== 166179374) {
    fail('The App installation ID is missing or invalid.');
  }
  if (
    typeof installation.account?.login !== 'string' ||
    installation.account.login.toLowerCase() !== expectedInstallationLogin
  ) {
    fail('The App installation account is not the authorized fixture owner.');
  }
  if (installation.suspended_at !== null) {
    fail('The App installation is suspended or suspension state is unavailable.');
  }
  if (
    installation.repository_selection !== 'selected' &&
    installation.repository_selection !== 'all'
  ) {
    fail('The App installation repository selection is unavailable or invalid.');
  }
  return id;
}

function validateRepository(value: unknown) {
  if (!isRecord(value)) fail('Installation repository metadata is invalid.');
  const repository = value as GitHubRepository;
  if (repository.id !== expectedRepository.id) {
    fail('The installation repository ID does not match the authorized fixture.');
  }
  if (
    typeof repository.owner?.login !== 'string' ||
    repository.owner.login.toLowerCase() !== expectedRepository.owner
  ) {
    fail('The installation repository owner does not match the authorized fixture.');
  }
  if (
    typeof repository.name !== 'string' ||
    repository.name.toLowerCase() !== expectedRepository.name
  ) {
    fail('The installation repository name does not match the authorized fixture.');
  }
  if (
    typeof repository.full_name !== 'string' ||
    repository.full_name.toLowerCase() !== expectedRepository.fullName
  ) {
    fail('The installation repository full name does not match the authorized fixture.');
  }
}

function assertNoWebhookUrl(body: unknown) {
  if (!isRecord(body) || typeof body.url !== 'string') {
    fail('GET /app/hook/config omitted the URL state.');
  }
  if (body.url.length > 0) fail('The GitHub App webhook URL is configured.');
}

export function formatProductionFixtureInstallationEvidence(
  reportedCount: number,
  installations: AppInstallation[],
) {
  const lines = [
    `APP_ID=${productionGitHubApp.id}`,
    `APP_NAME=${productionGitHubApp.name}`,
    `INSTALLATIONS_COUNT=${reportedCount}`,
    `INSTALLATION_LIST_COUNT=${installations.length}`,
  ];
  for (const [index, installation] of installations.entries()) {
    const prefix = `INSTALLATION_${index + 1}`;
    const validId =
      typeof installation.id === 'number' &&
      Number.isSafeInteger(installation.id) &&
      installation.id > 0;
    const accountMatch =
      typeof installation.account?.login === 'string'
        ? installation.account.login.toLowerCase() === expectedInstallationLogin
          ? 'YES'
          : 'NO'
        : 'UNAVAILABLE';
    const selection =
      installation.repository_selection === 'all' ||
      installation.repository_selection === 'selected'
        ? installation.repository_selection
        : 'UNAVAILABLE';
    const suspended =
      installation.suspended_at === null
        ? 'NO'
        : typeof installation.suspended_at === 'string' && installation.suspended_at.length > 0
          ? 'YES'
          : 'UNAVAILABLE';
    lines.push(
      `${prefix}_ID=${validId ? installation.id : 'UNAVAILABLE'}`,
      `${prefix}_ACCOUNT_MATCH=${accountMatch}`,
      `${prefix}_REPOSITORY_SELECTION=${selection}`,
      `${prefix}_SUSPENDED=${suspended}`,
    );
  }
  return lines.join('\n');
}

export async function readProductionGitHubFixtureInstallation(
  appId: string | undefined,
  appClientId: string | undefined,
  privateKeyPem: string | undefined,
  fetchImplementation: typeof fetch = fetch,
  allowProductionWebhook = false,
  reportEvidence?: (evidence: string) => void,
): Promise<ProductionGitHubFixtureInstallationState> {
  if (appId !== productionGitHubApp.id) fail('The configured App ID is not the production App.');
  if (typeof appClientId !== 'string' || appClientId.trim().length === 0) {
    fail('The production App client ID is missing.');
  }
  if (typeof privateKeyPem !== 'string' || privateKeyPem.trim().length === 0) {
    fail('The production App private key is missing.');
  }

  let appJwt: string;
  try {
    appJwt = createProductionGitHubAppJwt(appId, privateKeyPem);
  } catch {
    fail('The production App JWT could not be created.');
  }

  const appResponse = await requestJson(
    new URL(`${apiOrigin}/app`),
    'GET',
    appJwt,
    fetchImplementation,
  );
  if (!isRecord(appResponse.body)) fail('GET /app did not return the App identity.');
  const app = appResponse.body as AppIdentity;
  if (app.id !== Number(productionGitHubApp.id))
    fail('The App ID does not match the production App.');
  if (app.name !== productionGitHubApp.name)
    fail('The App name does not match the production App.');
  if (app.client_id !== appClientId) fail('The App client ID does not match production metadata.');
  if (
    typeof app.installations_count !== 'number' ||
    !Number.isSafeInteger(app.installations_count) ||
    app.installations_count < 0
  ) {
    fail('GET /app omitted a valid installations_count.');
  }

  const installations: AppInstallation[] = [];
  let page = 1;
  let url = new URL(`${apiOrigin}/app/installations?per_page=${pageSize}`);
  for (let pageCount = 0; ; pageCount += 1) {
    if (pageCount >= maxPages) fail('App installation pagination exceeded its bounded limit.');
    const response = await requestJson(url, 'GET', appJwt, fetchImplementation);
    installations.push(...requireInstallationList(response.body));
    const next = nextPage(response.response.headers.get('link'), page, '/app/installations');
    if (!next) break;
    page += 1;
    url = next;
  }
  reportEvidence?.(
    formatProductionFixtureInstallationEvidence(app.installations_count, installations),
  );
  if (app.installations_count !== installations.length) {
    fail('App installations_count does not match the paginated installation list.');
  }
  if (app.installations_count !== 1 || installations.length !== 1) {
    fail('Expected exactly one production App installation.');
  }
  const installation = installations[0]!;
  const installationId = validateInstallation(installation);

  const tokenUrl = new URL(`${apiOrigin}/app/installations/${installationId}/access_tokens`);
  const tokenResponse = await requestJson(tokenUrl, 'POST', appJwt, fetchImplementation);
  if (
    !isRecord(tokenResponse.body) ||
    typeof tokenResponse.body.token !== 'string' ||
    !tokenResponse.body.token
  ) {
    fail('GitHub did not issue a temporary installation read token.');
  }
  const repositories: unknown[] = [];
  let installationToken = tokenResponse.body.token;
  try {
    page = 1;
    url = new URL(`${apiOrigin}/installation/repositories?per_page=${pageSize}`);
    let reportedRepositoryCount: number | undefined;
    for (let pageCount = 0; ; pageCount += 1) {
      if (pageCount >= maxPages)
        fail('Installation repository pagination exceeded its bounded limit.');
      const response = await requestJson(url, 'GET', installationToken, fetchImplementation);
      if (!isRecord(response.body) || !Array.isArray(response.body.repositories)) {
        fail('GET /installation/repositories did not return a valid repository list.');
      }
      if (pageCount === 0 && response.body.total_count !== undefined) {
        if (
          typeof response.body.total_count !== 'number' ||
          !Number.isSafeInteger(response.body.total_count) ||
          response.body.total_count < 0
        ) {
          fail('GitHub installation repository total_count is invalid.');
        }
        reportedRepositoryCount = response.body.total_count;
      }
      repositories.push(...response.body.repositories);
      const next = nextPage(
        response.response.headers.get('link'),
        page,
        '/installation/repositories',
      );
      if (!next) break;
      page += 1;
      url = next;
    }
    if (reportedRepositoryCount !== undefined && reportedRepositoryCount !== repositories.length) {
      fail('GitHub installation repository count does not match the paginated list.');
    }
    if (installation.repository_selection === 'selected' && repositories.length !== 1)
      fail('The App installation must have access to exactly one repository.');
    const fixtures = repositories.filter(
      (repository) => isRecord(repository) && repository.id === expectedRepository.id,
    );
    if (fixtures.length !== 1)
      fail('The installation must contain exactly one authorized fixture repository.');
    validateRepository(fixtures[0]);
  } finally {
    installationToken = '';
  }

  const hookResponse = await requestJson(
    new URL(`${apiOrigin}/app/hook/config`),
    'GET',
    appJwt,
    fetchImplementation,
    true,
  );
  let webhookConfigState: ProductionGitHubFixtureInstallationState['webhookConfigState'];
  if (hookResponse.response.status === 404) {
    webhookConfigState = 'ABSENT_NOT_FOUND';
  } else {
    if (
      allowProductionWebhook &&
      isRecord(hookResponse.body) &&
      hookResponse.body.url ===
        'https://trace-production.mathofdynamic2.workers.dev/api/github/webhooks'
    ) {
      webhookConfigState = 'CONFIGURED';
    } else {
      assertNoWebhookUrl(hookResponse.body);
      webhookConfigState = 'PRESENT_EMPTY';
    }
  }

  return {
    appId: productionGitHubApp.id,
    appName: productionGitHubApp.name,
    installationId,
    installationAccount: expectedInstallationLogin,
    installationSuspended: false,
    repositorySelection: installation.repository_selection as 'selected' | 'all',
    repositoryCount: repositories.length,
    repositoryId: expectedRepository.id,
    repositoryOwner: expectedRepository.owner,
    repositoryName: expectedRepository.name,
    repositoryFullName: expectedRepository.fullName,
    webhookConfigState,
    webhookUrlConfigured: webhookConfigState === 'CONFIGURED',
  };
}

export function formatProductionGitHubFixtureInstallation(
  state: ProductionGitHubFixtureInstallationState,
) {
  return [
    `APP_ID=${state.appId}`,
    `APP_NAME=${state.appName}`,
    `INSTALLATION_ID=${state.installationId}`,
    `INSTALLATION_ACCOUNT=${state.installationAccount}`,
    'INSTALLATION_SUSPENDED=NO',
    `REPOSITORY_SELECTION=${state.repositorySelection}`,
    `EXTERNAL_REPOSITORY_COUNT=${state.repositoryCount}`,
    `EXTERNAL_REPOSITORY_ID=${state.repositoryId}`,
    `EXTERNAL_REPOSITORY=${state.repositoryFullName}`,
    `WEBHOOK_CONFIG_STATE=${state.webhookConfigState}`,
    `WEBHOOK_URL_CONFIGURED=${state.webhookUrlConfigured ? 'YES' : 'NO'}`,
    'WEBHOOK_ACTIVE_UI_STATE=NOT_INDEPENDENTLY_VERIFIED',
  ].join('\n');
}

async function main() {
  try {
    const state = await readProductionGitHubFixtureInstallation(
      process.env.TRACE_GITHUB_APP_ID,
      process.env.TRACE_GITHUB_APP_CLIENT_ID,
      process.env.TRACE_GITHUB_APP_PRIVATE_KEY,
      fetch,
      false,
      (evidence) => console.log(evidence),
    );
    console.log(formatProductionGitHubFixtureInstallation(state));
    console.log('PRODUCTION_FIXTURE_INSTALLATION=VERIFIED');
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Fixture installation verification failed.',
    );
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
