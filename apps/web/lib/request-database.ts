import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  getTraceSession,
  readCookie,
  sessionCookieName,
  type TraceSession,
  type TraceUser,
} from '@trace/auth';
import {
  createD1Database,
  createDatabaseClient,
  createD1UserStore,
  createPostgresUserStore,
  createTraceId,
  d1Schema,
  isD1Database,
  schema,
  type TraceD1Database,
} from '@trace/db';
import { eq } from 'drizzle-orm';
import type { AnyD1Database } from 'drizzle-orm/d1';

type HyperdriveBinding = {
  connectionString?: string;
};

export type TraceQueueBinding = {
  send(message: unknown): Promise<void>;
};

type TraceCloudflareEnv = CloudflareEnv & {
  HYPERDRIVE?: HyperdriveBinding;
  DB?: AnyD1Database;
  TRACE_QUEUE?: TraceQueueBinding;
  TRACE_DATABASE_DRIVER?: string;
  TRACE_DEPLOYMENT_ENV?: string;
  TRACE_CANARY_MODE?: string;
};

export type RequestDatabase = Awaited<ReturnType<typeof createDatabaseClient>>['db'];

export type AnyRequestDatabase = RequestDatabase | TraceD1Database;

export type RequestDatabaseHandle = {
  db: RequestDatabase;
  client: { end(): Promise<void> };
};

const noopClient = { end: async () => undefined };

export async function getRequestCloudflareEnv() {
  try {
    const context = await getCloudflareContext({ async: true });
    return context.env as TraceCloudflareEnv;
  } catch {
    return null;
  }
}

export function createD1RequestDatabase(binding: AnyD1Database): RequestDatabaseHandle {
  return { db: createD1Database(binding) as unknown as RequestDatabase, client: noopClient };
}

type TraceRuntimeConfig = Pick<
  TraceCloudflareEnv,
  'TRACE_DATABASE_DRIVER' | 'TRACE_DEPLOYMENT_ENV'
>;

/**
 * D1 is mandatory for production and for any runtime that explicitly selects
 * the D1 driver. Callers must not silently fall back to Hyperdrive/Postgres
 * when that configuration is incomplete.
 */
export function requiresD1Runtime(cloudflareEnv: TraceRuntimeConfig | null) {
  const requestedDriver = cloudflareEnv?.TRACE_DATABASE_DRIVER ?? process.env.TRACE_DATABASE_DRIVER;
  const deploymentEnv = cloudflareEnv?.TRACE_DEPLOYMENT_ENV ?? process.env.TRACE_DEPLOYMENT_ENV;
  return requestedDriver === 'd1' || deploymentEnv === 'production';
}

export async function getRequestDatabaseUrl() {
  const cloudflareEnv = await getRequestCloudflareEnv();
  if (requiresD1Runtime(cloudflareEnv)) {
    throw new Error('TRACE D1 runtime is required; PostgreSQL fallback is disabled.');
  }

  const cloudflareUrl = cloudflareEnv?.HYPERDRIVE?.connectionString;

  const databaseUrl = cloudflareUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TRACE database is not configured.');
  }
  return databaseUrl;
}

export async function createRequestDatabase() {
  const cloudflareEnv = await getRequestCloudflareEnv();

  const requestedDriver = cloudflareEnv?.TRACE_DATABASE_DRIVER ?? process.env.TRACE_DATABASE_DRIVER;
  if (requiresD1Runtime(cloudflareEnv)) {
    if (requestedDriver !== 'd1') {
      throw new Error('TRACE production requires TRACE_DATABASE_DRIVER=d1.');
    }
    if (!cloudflareEnv?.DB) throw new Error('TRACE D1 database binding is not configured.');
    return createD1RequestDatabase(cloudflareEnv.DB);
  }
  if (requestedDriver === 'd1' || cloudflareEnv?.DB) {
    if (!cloudflareEnv?.DB) throw new Error('TRACE D1 database binding is not configured.');
    return createD1RequestDatabase(cloudflareEnv.DB);
  }
  if (requestedDriver && requestedDriver !== 'postgres') {
    throw new Error(`Unsupported TRACE database driver: ${requestedDriver}`);
  }
  const database = await createDatabaseClient(await getRequestDatabaseUrl());
  return { db: database.db, client: database.client } satisfies RequestDatabaseHandle;
}

export async function upsertRequestUser(user: TraceUser) {
  const { db, client } = await createRequestDatabase();
  try {
    const persistedUser = isD1Database(db)
      ? await createD1UserStore(db as unknown as TraceD1Database).upsert(user)
      : await createPostgresUserStore(db).upsert(user);
    return { ...user, id: persistedUser.id } satisfies TraceUser;
  } finally {
    await client.end();
  }
}

const REQUEST_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function persistRequestAuthSession(user: TraceUser, sessionToken: string) {
  const { db, client } = await createRequestDatabase();
  try {
    await persistAuthSession(db, user, sessionToken);
  } finally {
    await client.end();
  }
}

export async function persistAuthSession(
  db: AnyRequestDatabase,
  user: TraceUser,
  sessionToken: string,
) {
  const expiresAt = new Date(Date.now() + REQUEST_SESSION_MAX_AGE_MS);
  if (isD1Database(db)) {
    const d1 = db as unknown as TraceD1Database;
    await d1
      .insert(d1Schema.accounts)
      .values({
        id: createTraceId(),
        userId: user.id,
        accountId: user.githubLogin,
        providerId: 'github',
      })
      .onConflictDoUpdate({
        target: [d1Schema.accounts.providerId, d1Schema.accounts.accountId],
        set: { userId: user.id, updatedAt: new Date() },
      });
    await d1
      .insert(d1Schema.sessions)
      .values({ id: createTraceId(), userId: user.id, token: sessionToken, expiresAt })
      .onConflictDoUpdate({
        target: d1Schema.sessions.token,
        set: { userId: user.id, expiresAt, updatedAt: new Date() },
      });
    return;
  }
  await db
    .insert(schema.accounts)
    .values({ userId: user.id, accountId: user.githubLogin, providerId: 'github' })
    .onConflictDoUpdate({
      target: [schema.accounts.providerId, schema.accounts.accountId],
      set: { userId: user.id, updatedAt: new Date() },
    });
  await db
    .insert(schema.sessions)
    .values({ userId: user.id, token: sessionToken, expiresAt })
    .onConflictDoUpdate({
      target: schema.sessions.token,
      set: { userId: user.id, expiresAt, updatedAt: new Date() },
    });
}

export async function isPersistedAuthSession(
  db: AnyRequestDatabase,
  sessionToken: string,
  userId: string,
) {
  const [stored] = isD1Database(db)
    ? await (db as unknown as TraceD1Database)
        .select({ userId: d1Schema.sessions.userId, expiresAt: d1Schema.sessions.expiresAt })
        .from(d1Schema.sessions)
        .where(eq(d1Schema.sessions.token, sessionToken))
        .limit(1)
    : await db
        .select({ userId: schema.sessions.userId, expiresAt: schema.sessions.expiresAt })
        .from(schema.sessions)
        .where(eq(schema.sessions.token, sessionToken))
        .limit(1);
  return Boolean(stored && stored.userId === userId && stored.expiresAt > new Date());
}

export async function invalidateRequestAuthSession(sessionToken: string | null) {
  if (!sessionToken) return;
  const { db, client } = await createRequestDatabase();
  try {
    if (isD1Database(db)) {
      await (db as unknown as TraceD1Database)
        .delete(d1Schema.sessions)
        .where(eq(d1Schema.sessions.token, sessionToken));
    } else {
      await db.delete(schema.sessions).where(eq(schema.sessions.token, sessionToken));
    }
  } finally {
    await client.end();
  }
}

/**
 * Resolve the signed browser session and verify that it is still persisted and
 * unexpired in the active database. The signed cookie is only a transport
 * envelope; revocation and expiry are authoritative in the database.
 */
export async function getRequestTraceSession(headers: Headers): Promise<TraceSession | null> {
  const session = await getTraceSession(headers);
  if (!session?.user) return null;
  const token = readCookie(headers, sessionCookieName());
  if (!token) return null;

  const { db, client } = await createRequestDatabase();
  try {
    if (!(await isPersistedAuthSession(db, token, session.user.id))) return null;
    return session;
  } finally {
    await client.end();
  }
}
