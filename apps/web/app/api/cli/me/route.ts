import { and, eq } from 'drizzle-orm';
import { schema } from '@trace/db';
import { authenticateCliRequest } from '../../../../lib/cli-auth';
import { createRequestDatabase } from '../../../../lib/request-database';

export async function GET(request: Request) {
  const { db, client } = await createRequestDatabase();
  try {
    const connection = await authenticateCliRequest(db, request, 'repository:read');
    if (!connection)
      return Response.json({ error: 'Invalid or expired CLI credential.' }, { status: 401 });
    const [workspace] = await db
      .select({ id: schema.organizations.id, name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, connection.organizationId))
      .limit(1);
    const repositories = await db
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
