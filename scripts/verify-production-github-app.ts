import { createPrivateKey, sign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionGitHubApp } from './production-canary-runtime-config.js';

type GitHubAppIdentity = {
  id?: unknown;
  name?: unknown;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

export async function verifyProductionGitHubAppIdentity(
  appId: string | undefined,
  privateKeyPem: string | undefined,
  fetchImplementation: typeof fetch = fetch,
) {
  if (appId !== productionGitHubApp.id) {
    throw new Error('Production GitHub App ID does not match the expected App.');
  }
  if (!privateKeyPem || privateKeyPem.trim().length === 0) {
    throw new Error('Production GitHub App private key is missing.');
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n').replace(/\r\n/g, '\n'));
  } catch {
    throw new Error('Production GitHub App private key could not be parsed.');
  }
  if (privateKey.asymmetricKeyType !== 'rsa') {
    throw new Error('Production GitHub App private key must use RSA.');
  }

  const issuedAt = Math.floor(Date.now() / 1000) - 30;
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = encodeBase64Url(
    JSON.stringify({ iss: appId, iat: issuedAt, exp: issuedAt + 8 * 60 }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsignedToken), privateKey).toString(
    'base64url',
  );
  const appJwt = `${unsignedToken}.${signature}`;

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
    identity.name !== productionGitHubApp.name
  ) {
    throw new Error('GitHub App identity response does not match the registered production App.');
  }

  return { id: productionGitHubApp.id, name: productionGitHubApp.name };
}

async function main() {
  try {
    await verifyProductionGitHubAppIdentity(
      process.env.TRACE_GITHUB_APP_ID,
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
