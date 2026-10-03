import { PRODUCTION_BROWSER_ORIGIN, PRODUCTION_BACKEND_ORIGIN } from '../apps/web/lib/origins.js';
async function main() {
  if (
    process.env.CLOUDFLARE_ACCOUNT_ID !== 'c5d6cf110905c91fc3eed1abaf8236a2' ||
    !process.env.CLOUDFLARE_API_TOKEN
  )
    throw new Error('Protected Pages identity unavailable.');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/trace-code`,
    { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, redirect: 'error' },
  );
  const body = (await response.json()) as {
    success: boolean;
    errors?: { code?: number }[];
    result: {
      name: string;
      subdomain: string;
      production_branch?: string;
      source?: { type?: string; config?: { production_branch?: string } };
      canonical_deployment?: {
        id: string;
        url: string;
        deployment_trigger?: { metadata?: { commit_hash?: string } };
      };
    };
  };
  console.log(
    `PAGES_INSPECTION=${JSON.stringify({ httpStatus: response.status, success: body.success, errorCodes: body.errors?.map((e) => e.code), name: body.result?.name, subdomain: body.result?.subdomain, productionBranch: body.result?.production_branch, sourceType: body.result?.source?.type, sourceProductionBranch: body.result?.source?.config?.production_branch })}`,
  );
  if (
    !response.ok ||
    !body.success ||
    body.result.name !== 'trace-code' ||
    body.result.subdomain !== 'trace-code.pages.dev' ||
    (body.result.production_branch ?? body.result.source?.config?.production_branch) !== 'main'
  )
    throw new Error('Existing fixed Pages project is inaccessible or mismatched.');
  const deployed = body.result.canonical_deployment;
  if (!deployed?.id) throw new Error('Pages baseline deployment identity missing.');
  console.log(
    `PAGES_PROJECT=trace-code\nPAGES_DEPLOYMENT_ID=${deployed.id}\nPAGES_DEPLOYMENT_URL=${deployed.url}\nPAGES_SOURCE=${deployed.deployment_trigger?.metadata?.commit_hash ?? 'unknown'}`,
  );
  if (!process.env.VERIFY_PAGES_SOURCE) return;
  if (deployed.deployment_trigger?.metadata?.commit_hash !== process.env.VERIFY_PAGES_SOURCE)
    throw new Error('Pages production deployment does not match reviewed source.');
  for (const [route, expected] of [
    ['/api/health', 200],
    ['/sign-in', 200],
    ['/app', 307],
  ] as const) {
    const result = await fetch(`${PRODUCTION_BROWSER_ORIGIN}${route}`, { redirect: 'manual' });
    if (
      route === '/app' ? ![302, 303, 307, 308].includes(result.status) : result.status !== expected
    )
      throw new Error(`Pages ${route} status failed: ${result.status}`);
    if (result.headers.get('x-trace-proxy-upstream') !== PRODUCTION_BACKEND_ORIGIN)
      throw new Error('Pages is not serving the fixed production proxy.');
    if (route === '/app') {
      const location = new URL(result.headers.get('location') ?? '', PRODUCTION_BROWSER_ORIGIN);
      if (
        ![PRODUCTION_BROWSER_ORIGIN, PRODUCTION_BACKEND_ORIGIN].includes(location.origin) ||
        location.pathname !== '/sign-in'
      )
        throw new Error('Unexpected anonymous app redirect.');
    }
    console.log(`PAGES_ROUTE_${route}=${result.status}`);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Pages inspection failed');
  process.exitCode = 1;
});
