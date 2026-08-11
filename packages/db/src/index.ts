import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { parseServerEnv } from '@trace/env';
import * as schema from './schema.js';

export { schema };
export type TraceDatabase = ReturnType<typeof createDatabase>;

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
