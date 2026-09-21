import { eq } from 'drizzle-orm';
import {
  d1Schema,
  resolveD1WebhookScope,
  sanitizeWebhookError,
  type TraceD1Database,
} from '@trace/db';
import {
  enqueueCloudflareTraceMessage,
  type TraceGitHubEvent,
  type TraceQueueMessage,
  type TraceQueueSender,
} from '@trace/core';

export type D1WebhookQueueInput = {
  db: TraceD1Database;
  queue: TraceQueueSender;
  deliveryId: string;
  eventName: string;
  action?: string;
  normalized: TraceGitHubEvent | null;
  payloadSha256: string;
};

export type D1WebhookQueueResult =
  | { accepted: true; duplicate: true; queued: false; normalized: boolean }
  | { accepted: true; duplicate: false; queued: boolean; normalized: boolean };

/**
 * Persist a verified webhook before publishing its bounded Queue reference.
 * Queue publication failures become explicitly recoverable rather than being
 * left as an ambiguous `received` row that blocks operator recovery.
 */
export async function enqueueD1Webhook(input: D1WebhookQueueInput): Promise<D1WebhookQueueResult> {
  const scope = await resolveD1WebhookScope(
    input.db,
    input.normalized,
    input.normalized &&
      'installationId' in input.normalized &&
      input.normalized.installationId !== undefined
      ? String(input.normalized.installationId)
      : null,
  );
  const [inserted] = await input.db
    .insert(d1Schema.githubWebhookDeliveries)
    .values({
      deliveryId: input.deliveryId,
      eventName: input.eventName,
      action: input.action,
      installationId:
        input.normalized &&
        'installationId' in input.normalized &&
        input.normalized.installationId !== undefined
          ? String(input.normalized.installationId)
          : null,
      organizationId: scope.organizationId,
      repositoryId: scope.repositoryId,
      normalizedEvent: input.normalized,
      payloadSha256: input.payloadSha256,
    })
    .onConflictDoNothing({ target: d1Schema.githubWebhookDeliveries.deliveryId })
    .returning({ id: d1Schema.githubWebhookDeliveries.id });
  const existing = inserted
    ? null
    : (
        await input.db
          .select({
            id: d1Schema.githubWebhookDeliveries.id,
            status: d1Schema.githubWebhookDeliveries.status,
          })
          .from(d1Schema.githubWebhookDeliveries)
          .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, input.deliveryId))
          .limit(1)
      )[0];
  const delivery = inserted ?? existing;
  if (!delivery) throw new Error('Webhook delivery could not be recorded.');
  if (!inserted && existing?.status !== 'received') {
    return {
      accepted: true,
      duplicate: true,
      queued: false,
      normalized: Boolean(input.normalized),
    };
  }

  const message = {
    version: '1' as const,
    type: 'github.webhook.process' as const,
    idempotencyKey: input.deliveryId,
    enqueuedAt: new Date().toISOString(),
    deliveryId: input.deliveryId,
    eventName: input.eventName,
    event: input.normalized,
  } satisfies TraceQueueMessage;
  try {
    await enqueueCloudflareTraceMessage(input.queue, message);
    await input.db
      .update(d1Schema.githubWebhookDeliveries)
      .set({ status: input.normalized ? 'queued' : 'ignored', updatedAt: new Date() })
      .where(eq(d1Schema.githubWebhookDeliveries.id, delivery.id));
  } catch (error) {
    await input.db
      .update(d1Schema.githubWebhookDeliveries)
      .set({
        status: 'potentially_unresolved',
        lastError: sanitizeWebhookError(error),
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(d1Schema.githubWebhookDeliveries.id, delivery.id));
    throw error;
  }
  return {
    accepted: true,
    duplicate: false,
    queued: Boolean(input.normalized),
    normalized: Boolean(input.normalized),
  };
}
