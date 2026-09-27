export const productionGitHubRuntimeVariableSources = {
  GITHUB_APP_ID: 'TRACE_GITHUB_APP_ID',
  GITHUB_APP_CLIENT_ID: 'TRACE_GITHUB_APP_CLIENT_ID',
  GITHUB_APP_SLUG: 'TRACE_GITHUB_APP_SLUG',
  GITHUB_APP_CALLBACK_URL: 'TRACE_GITHUB_APP_CALLBACK_URL',
  GITHUB_APP_INSTALL_URL: 'TRACE_GITHUB_APP_INSTALL_URL',
  GITHUB_OAUTH_CLIENT_ID: 'TRACE_GITHUB_OAUTH_CLIENT_ID',
} as const;

export const productionWorkerSecretSources = {
  GITHUB_APP_CLIENT_SECRET: 'TRACE_GITHUB_APP_CLIENT_SECRET',
  GITHUB_APP_PRIVATE_KEY: 'TRACE_GITHUB_APP_PRIVATE_KEY',
  GITHUB_WEBHOOK_SECRET: 'TRACE_GITHUB_WEBHOOK_SECRET',
  GITHUB_OAUTH_CLIENT_SECRET: 'TRACE_GITHUB_OAUTH_CLIENT_SECRET',
  TRACE_AUTH_SECRET: 'TRACE_AUTH_SECRET',
} as const;

export const productionWorkerSecretNames = Object.keys(productionWorkerSecretSources);

export const productionGitHubApp = {
  id: '5082884',
  name: 'TRACE Production Integration',
  slug: 'trace-production-integration',
} as const;

export type ProductionGitHubRuntimeContract = {
  expectedAppId: string;
  expectedAppName: string;
  expectedAppSlug: string;
  appCallbackPath: string;
  oauthCallbackPath: string;
};

function requireSourceValue(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) {
    throw new Error(`Required production GitHub configuration is missing or invalid: ${name}.`);
  }
  return value;
}

function requirePath(path: string, expected: string, name: string) {
  if (path !== expected || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`Production GitHub route contract is invalid: ${name}.`);
  }
}

export function buildProductionGitHubRuntimeVariables(
  contract: ProductionGitHubRuntimeContract,
  publicUrl: string,
  environment: Record<string, string | undefined>,
) {
  requirePath(contract.appCallbackPath, '/api/github/setup', 'App callback');
  requirePath(contract.oauthCallbackPath, '/api/auth/github/callback', 'OAuth callback');

  const sourceValues = Object.fromEntries(
    Object.entries(productionGitHubRuntimeVariableSources).map(([runtimeName, sourceName]) => [
      runtimeName,
      requireSourceValue(environment, sourceName),
    ]),
  ) as Record<keyof typeof productionGitHubRuntimeVariableSources, string>;

  if (sourceValues.GITHUB_APP_ID !== contract.expectedAppId) {
    throw new Error('Production GitHub App ID does not match the registered App.');
  }
  if (sourceValues.GITHUB_APP_SLUG !== contract.expectedAppSlug) {
    throw new Error('Production GitHub App slug does not match the registered App.');
  }

  let productionOrigin: string;
  try {
    const parsedPublicUrl = new URL(publicUrl);
    if (parsedPublicUrl.protocol !== 'https:' || parsedPublicUrl.pathname !== '/') {
      throw new Error();
    }
    productionOrigin = parsedPublicUrl.origin;
  } catch {
    throw new Error('Production public URL is invalid.');
  }

  const expectedAppCallbackUrl = `${productionOrigin}${contract.appCallbackPath}`;
  if (sourceValues.GITHUB_APP_CALLBACK_URL !== expectedAppCallbackUrl) {
    throw new Error('Production GitHub App callback must use the production setup route.');
  }

  const expectedAppInstallUrl = `https://github.com/apps/${contract.expectedAppSlug}/installations/new`;
  if (sourceValues.GITHUB_APP_INSTALL_URL !== expectedAppInstallUrl) {
    throw new Error('Production GitHub App install URL does not match the registered App.');
  }

  return sourceValues;
}
