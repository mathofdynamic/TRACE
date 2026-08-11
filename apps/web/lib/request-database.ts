import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { TraceUser } from '@trace/auth';
import { createDatabaseClient, schema } from '@trace/db';

type HyperdriveBinding = {
  connectionString?: string;
};

type TraceCloudflareEnv = CloudflareEnv & {
  HYPERDRIVE?: HyperdriveBinding;
};

export async function getRequestDatabaseUrl() {
  let cloudflareUrl: string | undefined;
  try {
    const context = await getCloudflareContext({ async: true });
    cloudflareUrl = (context.env as TraceCloudflareEnv).HYPERDRIVE?.connectionString;
  } catch {
    // The local Next.js runtime has no Cloudflare request context.
  }

  const databaseUrl = cloudflareUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TRACE database is not configured.');
  }
  return databaseUrl;
}

export async function createRequestDatabase() {
  return createDatabaseClient(await getRequestDatabaseUrl());
}

export async function upsertRequestUser(user: TraceUser) {
  const { db, client } = await createRequestDatabase();
  try {
    const [persistedUser] = await db
      .insert(schema.users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: {
          name: user.name,
          image: user.image,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.users.id });
    if (!persistedUser) throw new Error('TRACE user could not be persisted.');
    return { ...user, id: persistedUser.id } satisfies TraceUser;
  } finally {
    await client.end();
  }
}
