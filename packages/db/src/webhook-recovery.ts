import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  enqueueCloudflareTraceMessage,
  traceGitHubEventSchema,
  type TraceGitHubEvent,
  type TraceQueueSender,
} from '@trace/core';
import * as d1Schema from './d1/schema.js';
import type { TraceD1Database } from './d1.js';

export const D1_WEBHOOK_RECOVERY_STATUSES = ['potentially_unresolved', 'replaying'] as const;

export type D1WebhookRecoveryStatus = (typeof D1_WEBHOOK_RECOVERY_STATUSES)[number];

export type D1WebhookRecoveryDelivery = {
  id: string;
  deliveryId: string;
  eventName: string;
  action: string | null;
  installationId: string | null;
  organizationId: string;
  repositoryId: string | null;
  status: D1WebhookRecoveryStatus;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: Date | null;
  replayRequestedAt: Date | null;
  replayCount: number;
  receivedAt: Date;
  updatedAt: Date;
};

export class D1WebhookRecoveryError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not-found'
      | 'not-owner'
      | 'already-processing'
      | 'installation-unavailable'
      | 'repository-unavailable'
      | 'event-unavailable'
      | 'queue-unavailable',
  ) {
    super(message);
    this.name = 'D1WebhookRecoveryError';
  }
}

const MAX_ERROR_LENGTH = 500;
const MAX_RECOVERY_LIMIT = 50;

export function sanitizeWebhookError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const withoutControls = Array.from(message, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  return (
    withoutControls.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_LENGTH) ||
    'Unknown webhook processing error'
  );
}

function eventRepositoryId(event: TraceGitHubEvent) {
  return 'repositoryId' in event && event.repositoryId !== undefined
    ? String(event.repositoryId)
    : null;
}

function eventInstallationId(event: TraceGitHubEvent | null) {
  return event && 'installationId' in event && event.installationId !== undefined
    ? String(event.installationId)
    : null;
}

/** Resolve trusted tenant scope from the normalized event, never from client input. */
export async function resolveD1WebhookScope(
  db: TraceD1Database,
  event: TraceGitHubEvent | null,
  installationId: string | null,
) {
  const providerInstallationId = installationId ?? eventInstallationId(event);
  const providerRepositoryId = event ? eventRepositoryId(event) : null;

  if (providerRepositoryId) {
    const [repository] = await db
      .select({
        repositoryId: d1Schema.githubRepositories.id,
        organizationId: d1Schema.githubRepositories.organizationId,
        installationProviderId: d1Schema.githubInstallations.githubInstallationId,
      })
      .from(d1Schema.githubRepositories)
      .innerJoin(
        d1Schema.githubInstallations,
        eq(d1Schema.githubRepositories.installationId, d1Schema.githubInstallations.id),
      )
      .where(eq(d1Schema.githubRepositories.githubRepositoryId, providerRepositoryId))
      .limit(1);
    if (!repository) return { organizationId: null, repositoryId: null };
    if (providerInstallationId && repository.installationProviderId !== providerInstallationId) {
      return { organizationId: null, repositoryId: null };
    }
    return {
      organizationId: repository.organizationId,
      repositoryId: repository.repositoryId,
    };
  }

  if (providerInstallationId) {
    const [installation] = await db
      .select({ organizationId: d1Schema.githubInstallations.organizationId })
      .from(d1Schema.githubInstallations)
      .where(eq(d1Schema.githubInstallations.githubInstallationId, providerInstallationId))
      .limit(1);
    if (installation) return { organizationId: installation.organizationId, repositoryId: null };
  }

  return { organizationId: null, repositoryId: null };
}

export async function listD1WebhookRecoveriesForOwner(
  db: TraceD1Database,
  userId: string,
  limit = 50,
) {
  const boundedLimit = Math.max(1, Math.min(MAX_RECOVERY_LIMIT, Math.floor(limit)));
  const rows = await db
    .select({
      id: d1Schema.githubWebhookDeliveries.id,
      deliveryId: d1Schema.githubWebhookDeliveries.deliveryId,
      eventName: d1Schema.githubWebhookDeliveries.eventName,
      action: d1Schema.githubWebhookDeliveries.action,
      installationId: d1Schema.githubWebhookDeliveries.installationId,
      organizationId: d1Schema.githubWebhookDeliveries.organizationId,
      repositoryId: d1Schema.githubWebhookDeliveries.repositoryId,
      status: d1Schema.githubWebhookDeliveries.status,
      attempts: d1Schema.githubWebhookDeliveries.attempts,
      lastError: d1Schema.githubWebhookDeliveries.lastError,
      lastAttemptAt: d1Schema.githubWebhookDeliveries.lastAttemptAt,
      replayRequestedAt: d1Schema.githubWebhookDeliveries.replayRequestedAt,
      replayCount: d1Schema.githubWebhookDeliveries.replayCount,
      receivedAt: d1Schema.githubWebhookDeliveries.receivedAt,
      updatedAt: d1Schema.githubWebhookDeliveries.updatedAt,
    })
    .from(d1Schema.githubWebhookDeliveries)
    .innerJoin(
      d1Schema.memberships,
      eq(d1Schema.githubWebhookDeliveries.organizationId, d1Schema.memberships.organizationId),
    )
    .where(
      and(
        eq(d1Schema.memberships.userId, userId),
        eq(d1Schema.memberships.role, 'owner'),
        inArray(d1Schema.githubWebhookDeliveries.status, [...D1_WEBHOOK_RECOVERY_STATUSES]),
      ),
    )
    .orderBy(desc(d1Schema.githubWebhookDeliveries.updatedAt))
    .limit(boundedLimit);

  return rows.filter(
    (row): row is D1WebhookRecoveryDelivery =>
      Boolean(row.organizationId) &&
      (row.status === 'potentially_unresolved' || row.status === 'replaying'),
  );
}

async function assertOwner(db: TraceD1Database, userId: string, organizationId: string) {
  const [membership] = await db
    .select({ id: d1Schema.memberships.id })
    .from(d1Schema.memberships)
    .where(
      and(
        eq(d1Schema.memberships.userId, userId),
        eq(d1Schema.memberships.organizationId, organizationId),
        eq(d1Schema.memberships.role, 'owner'),
      ),
    )
    .limit(1);
  if (!membership)
    throw new D1WebhookRecoveryError('Workspace owner access required.', 'not-owner');
}

async function assertCurrentGitHubAccess(
  db: TraceD1Database,
  delivery: {
    organizationId: string;
    repositoryId: string | null;
    installationId: string | null;
  },
) {
  if (!delivery.installationId) {
    throw new D1WebhookRecoveryError(
      'The delivery has no trusted installation association.',
      'installation-unavailable',
    );
  }
  const [installation] = await db
    .select({ id: d1Schema.githubInstallations.id, state: d1Schema.githubInstallations.state })
    .from(d1Schema.githubInstallations)
    .where(
      and(
        eq(d1Schema.githubInstallations.organizationId, delivery.organizationId),
        eq(d1Schema.githubInstallations.githubInstallationId, delivery.installationId),
      ),
    )
    .limit(1);
  if (!installation || installation.state !== 'active') {
    throw new D1WebhookRecoveryError(
      'The GitHub App installation is no longer active for this workspace.',
      'installation-unavailable',
    );
  }
  if (!delivery.repositoryId) return;

  const [repository] = await db
    .select({
      id: d1Schema.githubRepositories.id,
      state: d1Schema.githubRepositories.state,
      installationId: d1Schema.githubRepositories.installationId,
    })
    .from(d1Schema.githubRepositories)
    .where(
      and(
        eq(d1Schema.githubRepositories.id, delivery.repositoryId),
        eq(d1Schema.githubRepositories.organizationId, delivery.organizationId),
      ),
    )
    .limit(1);
  if (
    !repository ||
    repository.installationId !== installation.id ||
    repository.state !== 'active'
  ) {
    throw new D1WebhookRecoveryError(
      'The GitHub repository is no longer active for this workspace.',
      'repository-unavailable',
    );
  }
}

export async function requestD1WebhookReplay(input: {
  db: TraceD1Database;
  queue: TraceQueueSender;
  deliveryId: string;
  actorUserId: string;
}) {
  const [delivery] = await input.db
    .select({
      id: d1Schema.githubWebhookDeliveries.id,
      deliveryId: d1Schema.githubWebhookDeliveries.deliveryId,
      eventName: d1Schema.githubWebhookDeliveries.eventName,
      installationId: d1Schema.githubWebhookDeliveries.installationId,
      organizationId: d1Schema.githubWebhookDeliveries.organizationId,
      repositoryId: d1Schema.githubWebhookDeliveries.repositoryId,
      status: d1Schema.githubWebhookDeliveries.status,
      normalizedEvent: d1Schema.githubWebhookDeliveries.normalizedEvent,
      replayCount: d1Schema.githubWebhookDeliveries.replayCount,
    })
    .from(d1Schema.githubWebhookDeliveries)
    .where(eq(d1Schema.githubWebhookDeliveries.deliveryId, input.deliveryId))
    .limit(1);
  if (!delivery || !delivery.organizationId) {
    throw new D1WebhookRecoveryError('Webhook delivery was not found.', 'not-found');
  }
  const organizationId = delivery.organizationId;
  await assertOwner(input.db, input.actorUserId, organizationId);
  if (delivery.status !== 'potentially_unresolved') {
    throw new D1WebhookRecoveryError(
      'Webhook delivery is not currently eligible for replay.',
      delivery.status === 'replaying' ? 'already-processing' : 'not-found',
    );
  }
  await assertCurrentGitHubAccess(input.db, { ...delivery, organizationId });

  const parsed = traceGitHubEventSchema.safeParse(delivery.normalizedEvent);
  if (!parsed.success) {
    throw new D1WebhookRecoveryError(
      'Trusted normalized event data is unavailable for replay.',
      'event-unavailable',
    );
  }

  const now = new Date();
  const [claimed] = await input.db
    .update(d1Schema.githubWebhookDeliveries)
    .set({
      status: 'replaying',
      replayRequestedAt: now,
      replayRequestedBy: input.actorUserId,
      replayCount: sql`${d1Schema.githubWebhookDeliveries.replayCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(d1Schema.githubWebhookDeliveries.id, delivery.id),
        eq(d1Schema.githubWebhookDeliveries.organizationId, organizationId),
        eq(d1Schema.githubWebhookDeliveries.status, 'potentially_unresolved'),
      ),
    )
    .returning({ replayCount: d1Schema.githubWebhookDeliveries.replayCount });
  if (!claimed) {
    throw new D1WebhookRecoveryError(
      'Another recovery request already claimed this delivery.',
      'already-processing',
    );
  }

  const message = {
    version: '1' as const,
    type: 'github.webhook.process' as const,
    idempotencyKey: delivery.deliveryId,
    enqueuedAt: now.toISOString(),
    deliveryId: delivery.deliveryId,
    eventName: delivery.eventName,
    event: parsed.data,
  };
  try {
    await enqueueCloudflareTraceMessage(input.queue, message);
    await input.db
      .update(d1Schema.githubWebhookDeliveries)
      .set({ status: 'queued', updatedAt: new Date() })
      .where(eq(d1Schema.githubWebhookDeliveries.id, delivery.id));
    await input.db.insert(d1Schema.auditEvents).values({
      organizationId,
      actorUserId: input.actorUserId,
      action: 'github.webhook.recovery.requested',
      subjectType: 'github_webhook_delivery',
      subjectId: delivery.id,
      metadata: {
        deliveryId: delivery.deliveryId,
        replayCount: claimed.replayCount,
      },
    });
    return {
      deliveryId: delivery.deliveryId,
      status: 'queued' as const,
      replayCount: claimed.replayCount,
    };
  } catch (error) {
    const safeError = sanitizeWebhookError(error);
    await input.db
      .update(d1Schema.githubWebhookDeliveries)
      .set({ status: 'potentially_unresolved', lastError: safeError, updatedAt: new Date() })
      .where(
        and(
          eq(d1Schema.githubWebhookDeliveries.id, delivery.id),
          eq(d1Schema.githubWebhookDeliveries.status, 'replaying'),
        ),
      );
    throw new D1WebhookRecoveryError(
      'Webhook delivery replay could not be queued.',
      'queue-unavailable',
    );
  }
}

export async function markD1WebhookDeliveryFailure(
  db: TraceD1Database,
  deliveryId: string,
  attempt: number,
  error: unknown,
) {
  await db
    .update(d1Schema.githubWebhookDeliveries)
    .set({
      status: 'potentially_unresolved',
      attempts: Math.max(1, Math.floor(attempt)),
      lastError: sanitizeWebhookError(error),
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(d1Schema.githubWebhookDeliveries.deliveryId, deliveryId),
        notInArray(d1Schema.githubWebhookDeliveries.status, ['processed', 'ignored']),
      ),
    );
}
