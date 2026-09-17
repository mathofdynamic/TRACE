import { eq } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { d1Schema, createDatabase, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { enqueueTraceMessage, type TraceQueueMessage } from '@trace/core';
import { parseGitHubWebhookEnv } from '@trace/env';
import { hashWebhookPayload, normalizeGitHubEvent, verifyGitHubSignature } from '@trace/github';
import {
  createRequestDatabase,
  getRequestCloudflareEnv,
  getRequestDatabaseUrl,
} from '../../../../lib/request-database';

const MAX_BODY_BYTES = 1_048_576;

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return Response.json({ error: 'application/json is required.' }, { status: 415 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES)
    return Response.json({ error: 'Payload too large.' }, { status: 413 });

  let githubEnv;
  try {
    githubEnv = parseGitHubWebhookEnv();
  } catch {
    return Response.json(
      { error: 'GitHub webhook integration is not configured.' },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES)
    return Response.json({ error: 'Payload too large.' }, { status: 413 });
  if (
    !verifyGitHubSignature(
      rawBody,
      githubEnv.GITHUB_WEBHOOK_SECRET,
      request.headers.get('x-hub-signature-256'),
    )
  ) {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  const deliveryId = request.headers.get('x-github-delivery');
  const eventName = request.headers.get('x-github-event');
  if (!deliveryId || !eventName)
    return Response.json({ error: 'Required GitHub headers are missing.' }, { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
  const root =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const action = typeof root.action === 'string' ? root.action : undefined;
  const normalized = normalizeGitHubEvent(eventName, action, payload);
  const cloudflareEnv = await getRequestCloudflareEnv();
  if (cloudflareEnv?.DB) {
    const { db, client } = await createRequestDatabase();
    const d1 = db as unknown as TraceD1Database;
    try {
      const [inserted] = await d1
        .insert(d1Schema.githubWebhookDeliveries)
        .values({
          deliveryId,
          eventName,
          action,
          installationId:
            normalized && 'installationId' in normalized ? String(normalized.installationId) : null,
          payloadSha256: hashWebhookPayload(rawBody),
        })
        .onConflictDoNothing({ target: d1Schema.githubWebhookDeliveries.deliveryId })
        .returning({ id: d1Schema.githubWebhookDeliveries.id });
      const existing = inserted
        ? null
        : (
            await d1
              .select({
                id: d1Schema.githubWebhookDeliveries.id,
                status: d1Schema.githubWebhookDeliveries.status,
              })
              .from(d1Schema.githubWebhookDeliveries)
              .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, deliveryId))
              .limit(1)
          )[0];
      const delivery = inserted ?? existing;
      if (!delivery) {
        return Response.json({ error: 'Webhook delivery could not be recorded.' }, { status: 503 });
      }
      if (!inserted && existing?.status !== 'received') {
        return Response.json({ accepted: true, duplicate: true });
      }

      const queue = cloudflareEnv.TRACE_QUEUE;
      if (!queue) {
        return Response.json({ error: 'Webhook queue is not configured.' }, { status: 503 });
      }
      await enqueueTraceMessage(
        { send: (message: TraceQueueMessage) => queue.send(message) },
        {
          version: '1',
          type: 'github.webhook.process',
          idempotencyKey: deliveryId,
          enqueuedAt: new Date().toISOString(),
          deliveryId,
          eventName,
          event: normalized,
        },
      );
      await d1
        .update(d1Schema.githubWebhookDeliveries)
        .set({ status: normalized ? 'queued' : 'ignored' })
        .where(eq(d1Schema.githubWebhookDeliveries.id, delivery.id));
      return Response.json(
        { accepted: true, queued: Boolean(normalized), normalized: Boolean(normalized) },
        { status: 202 },
      );
    } catch {
      return Response.json({ error: 'Webhook delivery could not be queued.' }, { status: 503 });
    } finally {
      await client.end();
    }
  }

  const databaseUrl = await getRequestDatabaseUrl();
  const { db, pool } = createDatabase(databaseUrl);
  try {
    const [delivery] = await db
      .insert(schema.githubWebhookDeliveries)
      .values({ deliveryId, eventName, action, payloadSha256: hashWebhookPayload(rawBody) })
      .onConflictDoNothing({ target: schema.githubWebhookDeliveries.deliveryId })
      .returning({ id: schema.githubWebhookDeliveries.id });
    if (!delivery) return Response.json({ accepted: true, duplicate: true });

    const boss = new PgBoss({ connectionString: databaseUrl });
    await boss.start();
    await boss.createQueue('github.webhook.process');
    const jobId = await boss.send(
      'github.webhook.process',
      { deliveryId, eventName, action, normalized },
      { singletonKey: deliveryId },
    );
    await boss.stop();
    await db
      .update(schema.githubWebhookDeliveries)
      .set({ status: normalized ? 'queued' : 'ignored', jobId: jobId ?? null })
      .where(eq(schema.githubWebhookDeliveries.id, delivery.id));
    return Response.json(
      { accepted: true, queued: Boolean(jobId), normalized: Boolean(normalized) },
      { status: 202 },
    );
  } catch {
    return Response.json({ error: 'Webhook delivery could not be queued.' }, { status: 503 });
  } finally {
    await pool.end();
  }
}
