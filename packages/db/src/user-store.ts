import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as d1Schema from './d1/schema.js';
import * as postgresSchema from './schema.js';

export type PersistedUserInput = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

export type UserStore = {
  upsert(input: PersistedUserInput): Promise<{ id: string }>;
};

function userValues(input: PersistedUserInput) {
  return {
    id: input.id,
    email: input.email,
    name: input.name ?? null,
    image: input.image ?? null,
  };
}

export function createPostgresUserStore(db: NodePgDatabase<typeof postgresSchema>): UserStore {
  return {
    async upsert(input) {
      const [user] = await db
        .insert(postgresSchema.users)
        .values(userValues(input))
        .onConflictDoUpdate({
          target: postgresSchema.users.email,
          set: {
            name: input.name ?? null,
            image: input.image ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: postgresSchema.users.id });
      if (!user) throw new Error('TRACE user could not be persisted.');
      return user;
    },
  };
}

export function createD1UserStore(db: DrizzleD1Database<typeof d1Schema>): UserStore {
  return {
    async upsert(input) {
      const [user] = await db
        .insert(d1Schema.users)
        .values(userValues(input))
        .onConflictDoUpdate({
          target: d1Schema.users.email,
          set: {
            name: input.name ?? null,
            image: input.image ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: d1Schema.users.id });
      if (!user) throw new Error('TRACE user could not be persisted.');
      return user;
    },
  };
}
