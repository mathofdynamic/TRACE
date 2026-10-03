import {
  cookieAttributes,
  getTracePublicUrl,
  oauthNextCookieName,
  oauthStateCookieName,
  startGitHubOAuth,
  isSecurePublicUrl,
} from '@trace/auth';
import { getRequestCloudflareEnv } from '../../../../lib/request-database';
import {
  productionCanaryGateResponse,
  productionCanaryIntegrationEligibility,
} from '../../../../lib/production-canary';

export async function GET(request: Request) {
  const integrationEligibility = productionCanaryIntegrationEligibility(
    await getRequestCloudflareEnv(),
  );
  if (!integrationEligibility.allowed) return productionCanaryGateResponse(integrationEligibility);

  try {
    const url = new URL(request.url);
    const { authorizationUrl, state, next } = await startGitHubOAuth(url.searchParams.get('next'));
    const attributes = cookieAttributes(600, isSecurePublicUrl());
    const response = new Response(null, { status: 302, headers: { location: authorizationUrl } });
    response.headers.append('set-cookie', `${oauthStateCookieName()}=${state}; ${attributes}`);
    response.headers.append(
      'set-cookie',
      `${oauthNextCookieName()}=${encodeURIComponent(next)}; ${attributes}`,
    );
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch {
    return Response.redirect(new URL('/auth/error?reason=github-config', getTracePublicUrl()), 302);
  }
}
