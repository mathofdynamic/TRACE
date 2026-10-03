import { z } from 'zod';
import { traceGitHubEventSchema } from './github-events.js';

const identifier = z.string().trim().min(1).max(160);
const timestamp = z.string().datetime({ offset: true });
const base = z
  .object({
    version: z.literal('1'),
    idempotencyKey: identifier,
    enqueuedAt: timestamp,
  })
  .strict();

export const traceQueueMessageSchema = z.discriminatedUnion('type', [
  base.extend({ type: z.literal('system.healthcheck'), probeId: identifier }).strict(),
  base
    .extend({
      type: z.literal('github.webhook.process'),
      deliveryId: identifier,
      eventName: identifier,
      event: traceGitHubEventSchema.nullable(),
    })
    .strict(),
  base
    .extend({
      type: z.literal('github.installation.sync'),
      organizationId: identifier,
      installationId: identifier,
    })
    .strict(),
  base
    .extend({
      type: z.literal('github.repository.sync'),
      organizationId: identifier,
      repositoryId: identifier,
    })
    .strict(),
  base
    .extend({
      type: z.literal('github.pull-request.sync'),
      organizationId: identifier,
      repositoryId: identifier,
      pullRequestNumber: z.number().int().positive(),
    })
    .strict(),
  base
    .extend({
      type: z.literal('github.issue.sync'),
      organizationId: identifier,
      repositoryId: identifier,
      issueNumber: z.number().int().positive(),
    })
    .strict(),
  base.extend({ type: z.literal('github.webhook.replay'), deliveryId: identifier }).strict(),
  base
    .extend({
      type: z.literal('analysis.changes'),
      organizationId: identifier,
      repositoryId: identifier,
      analysisRunId: identifier,
    })
    .strict(),
  base
    .extend({
      type: z.literal('reports.daily'),
      organizationId: identifier,
      repositoryId: identifier.optional(),
      windowStart: timestamp,
      windowEnd: timestamp,
    })
    .strict(),
  base
    .extend({
      type: z.literal('reports.weekly'),
      organizationId: identifier,
      repositoryId: identifier.optional(),
      windowStart: timestamp,
      windowEnd: timestamp,
    })
    .strict(),
  base
    .extend({
      type: z.literal('conflicts.reconcile'),
      organizationId: identifier,
      repositoryId: identifier,
    })
    .strict(),
  base
    .extend({
      type: z.literal('sync.reconcile'),
      organizationId: identifier,
      repositoryId: identifier,
      syncOperationId: identifier,
    })
    .strict(),
]);

export type TraceQueueMessage = z.infer<typeof traceQueueMessageSchema>;
export type TraceQueueMessageType = TraceQueueMessage['type'];

export type TraceQueueJobClassification =
  | 'REQUIRED_ACTIVE'
  | 'REQUIRED_FEATURE_FLAGGED'
  | 'LEGACY_ONLY'
  | 'PLACEHOLDER'
  | 'FUTURE'
  | 'UNREACHABLE';

export type TraceQueueJobDescriptor = {
  type: TraceQueueMessageType;
  classification: TraceQueueJobClassification;
  productionReachable: boolean;
  cloudflareSupported: boolean;
};

/**
 * The registry is deliberately explicit. Queue names retained for the
 * PostgreSQL/pg-boss transition are not implicitly Cloudflare-capable.
 */
export const traceQueueJobRegistry = [
  {
    type: 'system.healthcheck',
    classification: 'REQUIRED_ACTIVE',
    productionReachable: true,
    cloudflareSupported: true,
  },
  {
    type: 'github.webhook.process',
    classification: 'REQUIRED_ACTIVE',
    productionReachable: true,
    cloudflareSupported: true,
  },
  {
    type: 'github.installation.sync',
    classification: 'UNREACHABLE',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'github.repository.sync',
    classification: 'UNREACHABLE',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'github.pull-request.sync',
    classification: 'UNREACHABLE',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'github.issue.sync',
    classification: 'UNREACHABLE',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'github.webhook.replay',
    classification: 'LEGACY_ONLY',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'analysis.changes',
    classification: 'PLACEHOLDER',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'reports.daily',
    classification: 'PLACEHOLDER',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'reports.weekly',
    classification: 'PLACEHOLDER',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'conflicts.reconcile',
    classification: 'PLACEHOLDER',
    productionReachable: false,
    cloudflareSupported: false,
  },
  {
    type: 'sync.reconcile',
    classification: 'PLACEHOLDER',
    productionReachable: false,
    cloudflareSupported: false,
  },
] as const satisfies readonly TraceQueueJobDescriptor[];

export const implementedCloudflareQueueMessageTypes = [
  'system.healthcheck',
  'github.webhook.process',
] as const;

export type CloudflareTraceQueueMessage = Extract<
  TraceQueueMessage,
  { type: (typeof implementedCloudflareQueueMessageTypes)[number] }
>;

const cloudflareQueueMessageTypeSet = new Set<string>(implementedCloudflareQueueMessageTypes);

export function parseTraceQueueMessage(input: unknown): TraceQueueMessage {
  return traceQueueMessageSchema.parse(input);
}

export function isCloudflareQueueMessageType(
  type: TraceQueueMessageType,
): type is CloudflareTraceQueueMessage['type'] {
  return cloudflareQueueMessageTypeSet.has(type);
}

/** Parse only messages with an implemented Cloudflare consumer. */
export function parseCloudflareQueueMessage(input: unknown): CloudflareTraceQueueMessage {
  const message = parseTraceQueueMessage(input);
  if (!isCloudflareQueueMessageType(message.type)) {
    throw new Error(`Cloudflare Queue handler is not implemented for ${message.type}.`);
  }
  return message as CloudflareTraceQueueMessage;
}

export type TraceQueueSender = {
  send(message: TraceQueueMessage): Promise<void>;
};

export async function enqueueTraceMessage(sender: TraceQueueSender, input: unknown) {
  const message = parseTraceQueueMessage(input);
  await sender.send(message);
  return message;
}

/**
 * Producer boundary for the D1/Cloudflare path. Keeping this separate from
 * the legacy contract prevents dormant pg-boss names from being emitted by
 * current Cloudflare application code.
 */
export async function enqueueCloudflareTraceMessage(sender: TraceQueueSender, input: unknown) {
  const message = parseCloudflareQueueMessage(input);
  await sender.send(message);
  return message;
}
