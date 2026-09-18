// OpenNext generates the fetch handler during every Cloudflare build. This
// wrapper keeps that handler and adds the D1/Queue consumer to the same Worker.
import nextWorker from './.open-next/worker.js';
import { processTraceQueueBatch } from '../worker/src/cloudflare.js';

export default {
  fetch: nextWorker.fetch,
  async queue(batch: MessageBatch<unknown>, env: Env) {
    await processTraceQueueBatch(batch.messages, env);
  },
} satisfies ExportedHandler<Env>;

// OpenNext's generated Durable Object exports remain available when the
// custom worker is used.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';
