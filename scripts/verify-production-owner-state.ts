import path from 'node:path';
import { createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto';
import { createProductionGitHubAppJwt } from './production-github-app-jwt.js';
import { PRODUCTION_BACKEND_ORIGIN } from '../apps/web/lib/origins.js';
import { fileURLToPath } from 'node:url';
import { readProductionGitHubFixtureInstallation } from './verify-production-github-fixture-installation.js';
import { productionFixtureTransitionBaseline as target } from './verify-production-fixture-transition.js';

type CatalogEntry = { id: number; fullName: string };
type CatalogRow = {
  provider_id: string;
  full_name: string;
  state: string;
  selected: number;
  tenant_matches: number;
  installation_id: string;
  account_login: string;
  installation_state: string;
  suspended_at: unknown;
  disconnected?: number;
  synchronized_at?: number | null;
};
export function assertDirectProductionWebhook(config: {
  url?: string;
  content_type?: string;
  insecure_ssl?: string;
}) {
  if (
    config.url !== `${PRODUCTION_BACKEND_ORIGIN}/api/github/webhooks` ||
    config.content_type !== 'json' ||
    config.insecure_ssl !== '0'
  )
    throw new Error('Production webhook must remain direct Worker JSON with TLS verification.');
}
export type OwnerLoginState = {
  users_count: number;
  unexpected_accounts: number;
  completed_onboarding: number;
  active_sessions: number;
};
export function assertOwnerLoginState(state: OwnerLoginState) {
  if (
    state.users_count !== 1 ||
    state.unexpected_accounts !== 0 ||
    state.completed_onboarding !== 1 ||
    !Number.isSafeInteger(state.active_sessions) ||
    state.active_sessions < 1
  )
    throw new Error('Owner identity, onboarding or active sessions are invalid.');
}
export const ownerCatalogSql = `SELECT r.github_repository_id AS provider_id, r.full_name, r.state, ir.selected, (r.organization_id = gi.organization_id) AS tenant_matches, gi.github_installation_id AS installation_id, gi.account_login, gi.state AS installation_state, gi.suspended_at, (r.disconnected_at IS NOT NULL) AS disconnected, r.last_synchronized_at AS synchronized_at FROM github_repositories r JOIN github_installations gi ON gi.id = r.installation_id LEFT JOIN github_installation_repositories ir ON ir.installation_id = gi.id AND ir.github_repository_id = r.github_repository_id ORDER BY r.github_repository_id`;
export const ownerIdentitySql = `SELECT (SELECT COUNT(*) FROM github_installations WHERE github_installation_id = '166179374' AND account_login = 'mathofdynamic' AND state = 'active' AND suspended_at IS NULL) AS installation_count, (SELECT COUNT(*) FROM memberships m JOIN accounts a ON a.user_id = m.user_id JOIN github_installations gi ON gi.organization_id = m.organization_id WHERE m.role = 'owner' AND a.provider_id = 'github' AND a.account_id = 'mathofdynamic' AND gi.github_installation_id = '166179374') AS owner_links, (SELECT COUNT(*) FROM github_webhook_deliveries d JOIN github_repositories r ON r.id = d.repository_id WHERE r.state <> 'active' AND r.github_repository_id <> '1378441300') AS inactive_deliveries`;
export function encryptCatalogDiagnostic(ids: string[], publicKeyDer: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKeyDer) || publicKeyDer.length > 4096)
    throw new Error('Invalid catalog diagnostic public key.');
  const publicKey = createPublicKey({
    key: Buffer.from(publicKeyDer, 'base64'),
    format: 'der',
    type: 'spki',
  });
  if (
    publicKey.asymmetricKeyType !== 'rsa' ||
    (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  )
    throw new Error('Catalog diagnostic encryption requires an RSA key of at least 2048 bits.');
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(ids), 'utf8'), cipher.final()]);
  return {
    algorithm: 'RSA-OAEP-SHA256/AES-256-GCM',
    encryptedKey: publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, key).toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function assertOwnerCatalog(
  catalog: CatalogEntry[],
  rows: CatalogRow[],
  requireActive: boolean,
  diagnosticPublicKey?: string,
) {
  if (!catalog.length || rows.length !== catalog.length) {
    const trustedNames = new Map(
      catalog.map((repository) => [String(repository.id), repository.fullName]),
    );
    const trustedIds = new Set(trustedNames.keys());
    const storedIds = new Set(rows.map((row) => row.provider_id));
    const historical = rows.filter((row) => !trustedIds.has(row.provider_id));
    const identityInvalid = (row: CatalogRow) =>
      row.tenant_matches !== 1 ||
      row.installation_id !== '166179374' ||
      row.account_login !== 'mathofdynamic' ||
      row.installation_state !== 'active' ||
      row.suspended_at !== null ||
      !row.full_name.startsWith('mathofdynamic/');
    const diagnostic = {
      github: catalog.length,
      stored: rows.length,
      missingCurrent: [...trustedIds].filter((id) => !storedIds.has(id)).length,
      duplicateStored: rows.length - storedIds.size,
      historical: historical.length,
      historicalInactive: historical.filter(
        (row) => row.selected === 0 && row.state === 'available',
      ).length,
      historicalDisconnected: historical.filter((row) => row.disconnected === 1).length,
      historicalIdentityInvalid: historical.filter(identityInvalid).length,
      currentIdentityInvalid: rows.filter(
        (row) =>
          trustedIds.has(row.provider_id) &&
          (identityInvalid(row) ||
            trustedNames.get(row.provider_id) !== row.full_name ||
            ![0, 1].includes(row.selected) ||
            (row.selected === 1 ? row.state !== 'active' : row.state !== 'available') ||
            (row.selected === 1 &&
              !['mathofdynamic/TRACE', 'mathofdynamic/trace-staging-fixture'].includes(
                row.full_name,
              ))),
      ).length,
    };
    const missingIds = [...trustedIds].filter((id) => !storedIds.has(id));
    const synchronizedAt = rows
      .map((row) => row.synchronized_at)
      .filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value));
    // IDs are encrypted to a caller-owned public key; no names, raw IDs or keys are logged.
    const evidence = {
      encryptedMissingIds: diagnosticPublicKey
        ? encryptCatalogDiagnostic(missingIds, diagnosticPublicKey)
        : null,
      oldestSynchronization: synchronizedAt.length ? Math.min(...synchronizedAt) : null,
      newestSynchronization: synchronizedAt.length ? Math.max(...synchronizedAt) : null,
    };
    throw new Error(
      `Owner catalog count differs from trusted GitHub snapshot. Diagnostic=${JSON.stringify(diagnostic)} Evidence=${JSON.stringify(evidence)}`,
    );
  }
  const trusted = new Map(catalog.map((r) => [String(r.id), r.fullName]));
  const ids = new Set<string>();
  for (const row of rows) {
    if (
      ids.has(row.provider_id) ||
      trusted.get(row.provider_id) !== row.full_name ||
      row.tenant_matches !== 1 ||
      row.installation_id !== '166179374' ||
      row.account_login !== 'mathofdynamic' ||
      row.installation_state !== 'active' ||
      row.suspended_at !== null ||
      ![0, 1].includes(row.selected) ||
      (row.selected === 1 ? row.state !== 'active' : row.state !== 'available')
    )
      throw new Error('Owner catalog, selection or tenant identity is invalid.');
    ids.add(row.provider_id);
    if (
      row.selected === 1 &&
      !['mathofdynamic/TRACE', 'mathofdynamic/trace-staging-fixture'].includes(row.full_name)
    )
      throw new Error('An unrelated repository is active during owner acceptance.');
  }
  const trace = rows.find((r) => r.full_name === 'mathofdynamic/TRACE');
  if (!trace || (requireActive && (trace.state !== 'active' || trace.selected !== 1)))
    throw new Error('Trusted TRACE repository is missing or not active.');
  return {
    available: rows.filter((r) => r.selected === 0).length,
    active: rows.filter((r) => r.selected === 1).map((r) => r.full_name),
    traceId: trace.provider_id,
  };
}
export async function verifyOwnerState(
  environment: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
) {
  if (!['catalog', 'active'].includes(environment.OWNER_ACCEPTANCE_STAGE ?? ''))
    throw new Error('Unsupported owner acceptance stage.');
  if (
    environment.CLOUDFLARE_ACCOUNT_ID !== target.accountId ||
    environment.TRACE_PRODUCTION_D1_ID !== target.d1Id ||
    !environment.CLOUDFLARE_API_TOKEN
  )
    throw new Error('Protected owner verification identity is invalid.');
  const installation = await readProductionGitHubFixtureInstallation(
    environment.TRACE_GITHUB_APP_ID,
    environment.TRACE_GITHUB_APP_CLIENT_ID,
    environment.TRACE_GITHUB_APP_PRIVATE_KEY,
    fetcher,
    true,
    undefined,
    'owner',
  );
  const hook = await fetcher('https://api.github.com/app/hook/config', {
    redirect: 'error',
    headers: {
      authorization: `Bearer ${createProductionGitHubAppJwt(environment.TRACE_GITHUB_APP_ID, environment.TRACE_GITHUB_APP_PRIVATE_KEY)}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!hook.ok)
    throw new Error(
      `Protected read-only webhook configuration request failed (HTTP ${hook.status}).`,
    );
  assertDirectProductionWebhook(await hook.json());
  async function api(endpoint: string, sql?: string) {
    const response = await fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/${endpoint}`,
      {
        method: sql ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}`,
          ...(sql ? { 'content-type': 'application/json' } : {}),
        },
        ...(sql ? { body: JSON.stringify({ sql, params: [] }) } : {}),
        signal: AbortSignal.timeout(15000),
      },
    );
    const body = (await response.json()) as { success?: boolean; result?: unknown };
    if (!response.ok || body.success !== true || body.result === undefined)
      throw new Error('Protected read-only owner API request failed.');
    return body.result;
  }
  async function query(sql: string) {
    const result = (await api(`d1/database/${target.d1Id}/query`, sql)) as {
      results?: unknown[];
    }[];
    if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0]?.results))
      throw new Error('Owner query result is invalid.');
    return result[0].results;
  }
  const catalog = assertOwnerCatalog(
    installation.catalog!,
    (await query(ownerCatalogSql)) as CatalogRow[],
    environment.OWNER_ACCEPTANCE_STAGE === 'active',
    environment.OWNER_CATALOG_DIAGNOSTIC_PUBLIC_KEY,
  );
  const identity = (await query(ownerIdentitySql))[0] as {
    installation_count: number;
    owner_links: number;
    inactive_deliveries: number;
  };
  if (
    identity.installation_count !== 1 ||
    identity.owner_links !== 1 ||
    identity.inactive_deliveries !== 0
  )
    throw new Error('Owner identity or nonselected repository delivery boundary is invalid.');
  const loginAfter = environment.PAGES_LOGIN_AFTER_MS;
  if (loginAfter && (!/^[0-9]{13}$/.test(loginAfter) || !Number.isSafeInteger(Number(loginAfter))))
    throw new Error('Invalid Pages session acceptance timestamp.');
  const login = (
    await query(
      `SELECT (SELECT COUNT(*) FROM users) AS users_count, (SELECT COUNT(*) FROM accounts WHERE provider_id <> 'github' OR account_id <> 'mathofdynamic') AS unexpected_accounts, (SELECT COUNT(*) FROM onboarding_profiles o JOIN accounts a ON a.user_id = o.user_id WHERE a.provider_id = 'github' AND a.account_id = 'mathofdynamic' AND o.completed = 1) AS completed_onboarding, (SELECT COUNT(*) FROM sessions s JOIN accounts a ON a.user_id = s.user_id WHERE a.provider_id = 'github' AND a.account_id = 'mathofdynamic' AND s.expires_at > ${Date.now()}) AS active_sessions, (SELECT COUNT(*) FROM sessions s JOIN accounts a ON a.user_id = s.user_id WHERE a.provider_id = 'github' AND a.account_id = 'mathofdynamic' AND s.expires_at > ${Date.now()} AND s.created_at >= ${loginAfter ? Number(loginAfter) : 0}) AS fresh_sessions`,
    )
  )[0] as OwnerLoginState & { fresh_sessions: number };
  assertOwnerLoginState(login);
  if (loginAfter && login.fresh_sessions < 1)
    throw new Error('Fresh owner Pages login session is missing.');
  const fixture = (
    await query(
      "SELECT (SELECT COUNT(*) FROM github_issues i JOIN github_repositories r ON r.id = i.repository_id WHERE r.github_repository_id = '1378441300' AND i.github_issue_id = '5686722719') AS fixture_issue, (SELECT COUNT(*) FROM github_webhook_deliveries d JOIN github_repositories r ON r.id = d.repository_id WHERE r.github_repository_id = '1378441300' AND d.delivery_id = '81b8a02c-bee7-11f1-89b0-776168eff2c6' AND d.status = 'processed' AND d.last_error IS NULL AND d.processed_at IS NOT NULL) AS fixture_delivery",
    )
  )[0] as { fixture_issue: number; fixture_delivery: number };
  if (fixture.fixture_issue !== 1 || fixture.fixture_delivery !== 1)
    throw new Error('Preserved fixture proof is missing.');
  if ((await query('PRAGMA foreign_key_check')).length)
    throw new Error('Owner D1 foreign-key violations detected.');
  const metrics = (await api(`queues/${target.queueId}/metrics`)) as { backlog_count: number };
  if (metrics.backlog_count !== 0)
    throw new Error('Owner Queue backlog is unavailable or nonzero.');
  const health = await fetcher(`${target.productionBaseUrl}/api/health`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (health.status !== 200) throw new Error('Production owner health failed.');
  return `OWNER_INSTALLATION=166179374 VERIFIED\nEXTERNAL_REPOSITORIES=${installation.repositoryCount}\nAVAILABLE_REPOSITORIES=${catalog.available}\nACTIVE_REPOSITORIES=${catalog.active.join(',')}\nTRACE_REPOSITORY_ID=${catalog.traceId}\nTRACE_REPOSITORY=${environment.OWNER_ACCEPTANCE_STAGE === 'active' ? 'ACTIVE' : 'CATALOGUED'}\nOWNER_IDENTITY=VERIFIED\nACTIVE_OWNER_SESSIONS=${login.active_sessions}\nFRESH_OWNER_SESSIONS=${login.fresh_sessions}\nFIXTURE_PROOF=PRESERVED\nWEBHOOK=WORKER_DIRECT_VERIFIED\nUNSELECTED_DELIVERIES=0\nFOREIGN_KEY_VIOLATIONS=0\nQUEUE_BACKLOG=0\nHEALTH=200`;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
  verifyOwnerState(process.env)
    .then(console.log)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Owner verification failed');
      process.exitCode = 1;
    });
