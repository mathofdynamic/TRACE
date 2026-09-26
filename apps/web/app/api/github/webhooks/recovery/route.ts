import { eq } from 'drizzle-orm';
import {
  D1WebhookRecoveryError,
  d1Schema,
  isD1Database,
  listD1WebhookRecoveriesForOwner,
  requestD1WebhookReplay,
} from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import {
  createRequestDatabase,
  getRequestCloudflareEnv,
  getRequestTraceSession,
} from '../../../../../lib/request-database';
import { isTrustedBrowserMutation } from '../../../../../lib/browser-origin';
import { readBoundedJson } from '../../../../../lib/bounded-json';
import {
  canaryUserEligibility,
  canaryWebhookRecoveryEligibility,
  productionCanaryGateResponse,
  productionCanaryIntegrationEligibility,
  resolveProductionCanaryMode,
} from '../../../../../lib/production-canary';

function recoveryErrorResponse(error: D1WebhookRecoveryError) {
  const status =
    error.code === 'not-owner'
      ? 403
      : error.code === 'not-found'
        ? 404
        : error.code === 'already-processing'
          ? 409
          : error.code === 'queue-unavailable'
            ? 503
            : 409;
  return Response.json({ error: error.message, code: error.code }, { status });
}

export async function GET(request: Request) {
  const session = await getRequestTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const { db, client } = await createRequestDatabase();
  try {
    if (!isD1Database(db)) {
      return Response.json(
        { error: 'Webhook recovery is available only in the D1 runtime.' },
        { status: 501 },
      );
    }
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') ?? 25);
    const deliveries = await listD1WebhookRecoveriesForOwner(
      db as unknown as TraceD1Database,
      session.user.id,
      Number.isFinite(requestedLimit) ? requestedLimit : 25,
    );
    return Response.json({ deliveries });
  } finally {
    await client.end();
  }
}

export async function POST(request: Request) {
  const cloudflareEnv = await getRequestCloudflareEnv();
  const integrationEligibility = productionCanaryIntegrationEligibility(cloudflareEnv);
  if (!integrationEligibility.allowed) return productionCanaryGateResponse(integrationEligibility);

  const session = await getRequestTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const userEligibility = canaryUserEligibility(cloudflareEnv, session.user);
  if (!userEligibility.allowed) return productionCanaryGateResponse(userEligibility);
  if (!isTrustedBrowserMutation(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  const body = await readBoundedJson<{ deliveryId?: unknown }>(request, 2_048);
  if (typeof body.deliveryId !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(body.deliveryId)) {
    return Response.json({ error: 'Delivery ID is invalid.' }, { status: 400 });
  }

  const { db, client } = await createRequestDatabase();
  try {
    if (!isD1Database(db)) {
      return Response.json(
        { error: 'Webhook recovery is available only in the D1 runtime.' },
        { status: 501 },
      );
    }
    if (resolveProductionCanaryMode(cloudflareEnv).kind === 'fixture') {
      const d1 = db as unknown as TraceD1Database;
      const [scope] = await d1
        .select({
          deliveryOrganizationId: d1Schema.githubWebhookDeliveries.organizationId,
          deliveryRepositoryId: d1Schema.githubWebhookDeliveries.repositoryId,
          deliveryInstallationId: d1Schema.githubWebhookDeliveries.installationId,
          repositoryRecordId: d1Schema.githubRepositories.id,
          repositoryOrganizationId: d1Schema.githubRepositories.organizationId,
          repositoryInstallationId: d1Schema.githubRepositories.installationId,
          githubRepositoryId: d1Schema.githubRepositories.githubRepositoryId,
          repositoryOwner: d1Schema.githubRepositories.owner,
          repositoryName: d1Schema.githubRepositories.name,
          repositoryFullName: d1Schema.githubRepositories.fullName,
          installationRecordId: d1Schema.githubInstallations.id,
          installationOrganizationId: d1Schema.githubInstallations.organizationId,
          installationProviderId: d1Schema.githubInstallations.githubInstallationId,
          installationAccountLogin: d1Schema.githubInstallations.accountLogin,
        })
        .from(d1Schema.githubWebhookDeliveries)
        .leftJoin(
          d1Schema.githubRepositories,
          eq(d1Schema.githubWebhookDeliveries.repositoryId, d1Schema.githubRepositories.id),
        )
        .leftJoin(
          d1Schema.githubInstallations,
          eq(d1Schema.githubRepositories.installationId, d1Schema.githubInstallations.id),
        )
        .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, body.deliveryId))
        .limit(1);

      const recoveryEligibility = canaryWebhookRecoveryEligibility(cloudflareEnv, {
        deliveryOrganizationId: scope?.deliveryOrganizationId,
        deliveryRepositoryId: scope?.deliveryRepositoryId,
        deliveryInstallationId: scope?.deliveryInstallationId,
        repository: {
          recordId: scope?.repositoryRecordId,
          organizationId: scope?.repositoryOrganizationId,
          installationId: scope?.repositoryInstallationId,
          githubRepositoryId: scope?.githubRepositoryId,
          owner: scope?.repositoryOwner,
          name: scope?.repositoryName,
          fullName: scope?.repositoryFullName,
        },
        installation: {
          recordId: scope?.installationRecordId,
          organizationId: scope?.installationOrganizationId,
          providerId: scope?.installationProviderId,
          accountLogin: scope?.installationAccountLogin,
        },
      });
      if (!recoveryEligibility.allowed) return productionCanaryGateResponse(recoveryEligibility);
    }

    if (!cloudflareEnv?.TRACE_QUEUE) {
      return Response.json({ error: 'Webhook recovery queue is not configured.' }, { status: 503 });
    }
    try {
      const result = await requestD1WebhookReplay({
        db: db as unknown as TraceD1Database,
        queue: { send: (message) => cloudflareEnv.TRACE_QUEUE!.send(message) },
        deliveryId: body.deliveryId,
        actorUserId: session.user.id,
      });
      return Response.json(result, { status: 202 });
    } catch (error) {
      if (error instanceof D1WebhookRecoveryError) return recoveryErrorResponse(error);
      throw error;
    }
  } finally {
    await client.end();
  }
}
