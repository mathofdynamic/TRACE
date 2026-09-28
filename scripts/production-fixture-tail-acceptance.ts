import {
  runBoundedTailSession,
  normalizeWranglerVersionOutput,
  sanitizeTailDiagnostic,
  type BoundedTailSessionOptions,
} from './production-tail-observability.js';
import {
  verifyProductionFixtureRoutes,
  type FixtureRouteCheck,
} from './verify-production-fixture-routes.js';

const productionTailTarget = {
  accountId: 'c5d6cf110905c91fc3eed1abaf8236a2',
  workerName: 'trace-production',
} as const;

type TailRunner = (options: BoundedTailSessionOptions) => Promise<unknown>;
type RouteVerifier = (oauthClientId: string) => Promise<FixtureRouteCheck[]>;

export async function runProductionFixtureTailAcceptance(options: {
  accountId: string;
  token: string;
  workerVersionId: string;
  oauthClientId: string;
  runTailSession?: TailRunner;
  verifyRoutes?: RouteVerifier;
}) {
  if (options.accountId !== productionTailTarget.accountId) {
    throw new Error('Fixture tail account ID does not match the dedicated production account.');
  }
  if (!options.token) throw new Error('Fixture tail credential is unavailable.');
  if (!options.oauthClientId) throw new Error('Production OAuth client ID is unavailable.');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.workerVersionId)
  ) {
    throw new Error('Fixture tail version ID is invalid.');
  }

  let routeMatrixRan = false;
  const runTail = options.runTailSession ?? runBoundedTailSession;
  const verifyRoutes = options.verifyRoutes ?? verifyProductionFixtureRoutes;
  const result = await runTail({
    kind: 'simple',
    workerName: productionTailTarget.workerName,
    versionId: options.workerVersionId,
    accountId: productionTailTarget.accountId,
    token: options.token,
    sessionDurationMs: 30_000,
    onReady: async () => {
      const checks = await verifyRoutes(options.oauthClientId);
      routeMatrixRan = true;
      for (const check of checks) {
        console.log(`FIXTURE_ROUTE_${check.name}=${check.status} ${check.result}`);
      }
      console.log('GITHUB_REDIRECTS_FOLLOWED=NO');
      console.log('VALID_WEBHOOK_SENT=NO');
      console.log('QUEUE_OR_D1_MUTATION_REQUESTED=NO');
    },
  });
  if (!routeMatrixRan) throw new Error('Tail route matrix was not run after readiness.');
  console.log(`FIXTURE_TAIL_VERSION=${options.workerVersionId}`);
  console.log('FIXTURE_ROUTE_MATRIX=PASS');
  return result;
}

async function main() {
  if (process.argv[2] === 'normalize-version') {
    try {
      let raw = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (raw.length + text.length > 4_096) {
          throw new Error('Wrangler version output exceeds the diagnostic size limit.');
        }
        raw += text;
      }
      process.stdout.write(`${normalizeWranglerVersionOutput(raw)}\n`);
    } catch {
      console.error('Wrangler version diagnostic could not be normalized.');
      process.exitCode = 1;
    }
    return;
  }

  const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
  try {
    await runProductionFixtureTailAcceptance({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      token,
      workerVersionId: process.env.WORKER_VERSION_ID ?? '',
      oauthClientId: process.env.TRACE_GITHUB_OAUTH_CLIENT_ID ?? '',
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Fixture tail acceptance failed.';
    const safeReason = sanitizeTailDiagnostic(reason, token);
    console.error('FIXTURE_TAIL_ACCEPTANCE=FAIL');
    console.error(`FIXTURE_TAIL_ACCEPTANCE_REASON=${safeReason}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/production-fixture-tail-acceptance.ts')) {
  main();
}
