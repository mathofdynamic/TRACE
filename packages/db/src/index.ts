import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { parseServerEnv } from '@trace/env';
import * as schema from './schema.js';

export { schema };
export { createD1Database, d1Schema, isD1Database } from './d1.js';
export type { TraceD1Database } from './d1.js';
export { createD1UserStore, createPostgresUserStore } from './user-store.js';
export type { PersistedUserInput, UserStore } from './user-store.js';
export { createTraceId, normalizeProviderId } from './domain-types.js';
export type { JsonObject, ProviderId, StringList, StringMap } from './domain-types.js';
export type TraceDatabase = ReturnType<typeof createDatabase>;
export type TracePostgresDatabase = Awaited<ReturnType<typeof createDatabaseClient>>['db'];
export {
  createD1GitHubIngestionStore,
  createPostgresGitHubIngestionStore,
  markD1WebhookDeliveryProcessed,
  markPostgresWebhookDeliveryProcessed,
} from './github-ingestion.js';

export function createDatabase(databaseUrl = parseServerEnv().DATABASE_URL) {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function createDatabaseClient(databaseUrl = parseServerEnv().DATABASE_URL) {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    return { db: drizzle(client, { schema }), client };
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}
