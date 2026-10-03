import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionGitHubApp } from './production-canary-runtime-config.js';
import { createProductionGitHubAppJwt } from './production-github-app-jwt.js';

type GitHubAppIdentity = {
  id?: unknown;
  name?: unknown;
  client_id?: unknown;
};

export async function verifyProductionGitHubAppIdentity(
  appId: string | undefined,
  appClientId: string | undefined,
  privateKeyPem: string | undefined,
  fetchImplementation: typeof fetch = fetch,
) {
  if (appId !== productionGitHubApp.id) {
    throw new Error('Production GitHub App ID does not match the expected App.');
  }
  if (!appClientId || appClientId.trim().length === 0) {
    throw new Error('Production GitHub App client ID is missing.');
  }
  if (!privateKeyPem || privateKeyPem.trim().length === 0) {
    throw new Error('Production GitHub App private key is missing.');
  }

  const appJwt = createProductionGitHubAppJwt(appId, privateKeyPem);

  let response: Response;
  try {
    response = await fetchImplementation('https://api.github.com/app', {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${appJwt}`,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('GitHub App identity request failed before receiving a response.');
  }

  if (!response.ok) {
    throw new Error(`GitHub App identity request failed (HTTP ${response.status}).`);
  }

  let identity: GitHubAppIdentity;
  try {
    identity = (await response.json()) as GitHubAppIdentity;
  } catch {
    throw new Error('GitHub App identity response was not valid JSON.');
  }
  if (
    identity.id !== Number(productionGitHubApp.id) ||
    identity.name !== productionGitHubApp.name ||
    identity.client_id !== appClientId
  ) {
    throw new Error('GitHub App identity response does not match the registered production App.');
  }

  return { id: productionGitHubApp.id, name: productionGitHubApp.name };
}

async function main() {
  try {
    await verifyProductionGitHubAppIdentity(
      process.env.TRACE_GITHUB_APP_ID,
      process.env.TRACE_GITHUB_APP_CLIENT_ID,
      process.env.TRACE_GITHUB_APP_PRIVATE_KEY,
    );
    console.log(
      'Read-only GitHub App identity check passed: TRACE Production Integration (5082884).',
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'GitHub App identity validation failed.',
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
