import { and, eq } from 'drizzle-orm';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { authenticateCliRequest } from '../../../../lib/cli-auth';
import { createRequestDatabase } from '../../../../lib/request-database';

export async function GET(request: Request) {
  const { db, client } = await createRequestDatabase();
  try {
    const connection = await authenticateCliRequest(db, request, 'repository:read');
    if (!connection)
      return Response.json({ error: 'Invalid or expired CLI credential.' }, { status: 401 });
    const d1 = isD1Database(db) ? (db as unknown as TraceD1Database) : null;
    const [workspace] = d1
      ? await d1
          .select({ id: d1Schema.organizations.id, name: d1Schema.organizations.name })
          .from(d1Schema.organizations)
          .where(eq(d1Schema.organizations.id, connection.organizationId))
          .limit(1)
      : await db
          .select({ id: schema.organizations.id, name: schema.organizations.name })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, connection.organizationId))
          .limit(1);
    const repositories = d1
      ? await d1
          .select({
            id: d1Schema.githubRepositories.id,
            fullName: d1Schema.githubRepositories.fullName,
            defaultBranch: d1Schema.githubRepositories.defaultBranch,
          })
          .from(d1Schema.githubRepositories)
          .where(
            and(
              eq(d1Schema.githubRepositories.organizationId, connection.organizationId),
              eq(d1Schema.githubRepositories.state, 'active'),
            ),
          )
      : await db
          .select({
            id: schema.githubRepositories.id,
            fullName: schema.githubRepositories.fullName,
            defaultBranch: schema.githubRepositories.defaultBranch,
          })
          .from(schema.githubRepositories)
          .where(
            and(
              eq(schema.githubRepositories.organizationId, connection.organizationId),
              eq(schema.githubRepositories.state, 'active'),
            ),
          );
    return Response.json({
      connection: {
        id: connection.id,
        label: connection.label,
        scopes: connection.scopes,
        expiresAt: connection.expiresAt.toISOString(),
      },
      workspace,
      repositories,
    });
  } finally {
    await client.end();
  }
}
