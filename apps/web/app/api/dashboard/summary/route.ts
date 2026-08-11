import { and, eq, inArray } from 'drizzle-orm';
import { getTraceSession } from '@trace/auth';
import { schema } from '@trace/db';
import { createRequestDatabase } from '../../../../lib/request-database';

export async function GET(request: Request) {
  const session = await getTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const { db, client } = await createRequestDatabase();
  try {
    const memberships = await db
      .select({ organizationId: schema.memberships.organizationId })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, session.user.id));
    const organizationIds = memberships.map((membership) => membership.organizationId);
    const repositories = organizationIds.length
      ? await db
          .select({
            id: schema.githubRepositories.id,
            fullName: schema.githubRepositories.fullName,
            state: schema.githubRepositories.state,
          })
          .from(schema.githubRepositories)
          .where(
            and(
              inArray(schema.githubRepositories.organizationId, organizationIds),
              eq(schema.githubRepositories.state, 'active'),
            ),
          )
      : [];
    return Response.json({
      source: 'postgresql',
      repositories,
      analyses: [],
      conflicts: [],
      reports: [],
      artifacts: [],
    });
  } finally {
    await client.end();
  }
}
