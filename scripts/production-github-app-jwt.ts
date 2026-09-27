import { createPrivateKey, sign } from 'node:crypto';
import { productionGitHubApp } from './production-canary-runtime-config.js';

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

export function createProductionGitHubAppJwt(
  appId: string | undefined,
  privateKeyPem: string | undefined,
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
  return `${unsignedToken}.${signature}`;
}
