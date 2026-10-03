import { drizzle } from 'drizzle-orm/d1';
import type { AnyD1Database } from 'drizzle-orm/d1';
import * as d1Schema from './d1/schema.js';

export { d1Schema };
export type TraceD1Database = ReturnType<typeof createD1Database>;

const d1DatabaseInstances = new WeakSet<object>();

export function createD1Database(binding: AnyD1Database) {
  const database = drizzle(binding, { schema: d1Schema });
  d1DatabaseInstances.add(database as object);
  return database;
}

export function isD1Database(value: unknown): value is TraceD1Database {
  return typeof value === 'object' && value !== null && d1DatabaseInstances.has(value);
}
