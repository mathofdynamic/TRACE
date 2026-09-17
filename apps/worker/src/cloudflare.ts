import { sql } from 'drizzle-orm';
import {
  createD1Database,
  createD1GitHubIngestionStore,
  markD1WebhookDeliveryProcessed,
} from '@trace/db';
import {
  implementedCloudflareQueueMessageTypes,
  parseTraceQueueMessage,
  processGitHubWebhookEvent,
  type TraceQueueMessage,
} from '@trace/core';
import { createLogger } from '@trace/logger';

const logger = createLogger('trace-cloudflare-worker');
const implemented = new Set<string>(implementedCloudflareQueueMessageTypes);

type TraceQueueDelivery = Pick<Message<unknown>, 'id' | 'body' | 'ack' | 'retry'>;

export async function assertD1Schema(binding: D1Database) {
  const row = await binding
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1")
    .first<{ name: string }>();
  if (row?.name !== 'users') throw new Error('TRACE D1 schema is not initialized.');
}

export async function handleTraceQueueMessage(message: TraceQueueMessage, env: Env) {
  if (!implemented.has(message.type)) {
    return { status: 'not-implemented' as const, type: message.type };
  }

  if (message.type === 'system.healthcheck') {
    await assertD1Schema(env.DB);
    const db = createD1Database(env.DB);
    await db.run(sql`select 1 as ok`);
    logger.info('D1 healthcheck completed', {
      idempotencyKey: message.idempotencyKey,
      probeId: message.probeId,
    });
    return { status: 'completed' as const, type: message.type };
  }

  if (message.type === 'github.webhook.process') {
    const db = createD1Database(env.DB);
    const result = await processGitHubWebhookEvent(createD1GitHubIngestionStore(db), message.event);
    await markD1WebhookDeliveryProcessed(
      db,
      message.deliveryId,
      result.status === 'processed' ? 'processed' : 'ignored',
    );
    logger.info('GitHub webhook business handler completed', {
      deliveryId: message.deliveryId,
      result: result.status,
      type: result.type,
    });
    return { status: 'completed' as const, type: message.type, result };
  }

  return { status: 'not-implemented' as const, type: message.type };
}

export async function processTraceQueueBatch(messages: readonly TraceQueueDelivery[], env: Env) {
  for (const queuedMessage of messages) {
    let message: TraceQueueMessage;
    try {
      message = parseTraceQueueMessage(queuedMessage.body);
    } catch (error) {
      logger.error('Queue message rejected by contract', {
        messageId: queuedMessage.id,
        error: error instanceof Error ? error.message : 'Invalid message',
      });
      queuedMessage.retry();
      continue;
    }

    try {
      const result = await handleTraceQueueMessage(message, env);
      if (result.status === 'not-implemented') {
        logger.info('Queue message deferred: handler is not implemented', {
          messageId: queuedMessage.id,
          type: message.type,
        });
        queuedMessage.retry({ delaySeconds: 60 });
        continue;
      }
      queuedMessage.ack();
    } catch (error) {
      logger.error('Queue message processing failed', {
        messageId: queuedMessage.id,
        type: message.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      queuedMessage.retry();
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/health') return new Response('Not found', { status: 404 });
    await assertD1Schema(env.DB);
    await createD1Database(env.DB).run(sql`select 1 as ok`);
    return Response.json({ service: 'trace-background-cf1', status: 'ok' });
  },

  async queue(batch, env) {
    await processTraceQueueBatch(batch.messages, env);
  },
} satisfies ExportedHandler<Env, unknown>;
