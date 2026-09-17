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

export const implementedCloudflareQueueMessageTypes = [
  'system.healthcheck',
  'github.webhook.process',
] as const;

export function parseTraceQueueMessage(input: unknown): TraceQueueMessage {
  return traceQueueMessageSchema.parse(input);
}

export type TraceQueueSender = {
  send(message: TraceQueueMessage): Promise<void>;
};

export async function enqueueTraceMessage(sender: TraceQueueSender, input: unknown) {
  const message = parseTraceQueueMessage(input);
  await sender.send(message);
  return message;
}
