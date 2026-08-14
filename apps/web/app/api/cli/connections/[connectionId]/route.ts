import { and, eq } from 'drizzle-orm';
import { getTraceSession } from '@trace/auth';
import { schema } from '@trace/db';
import { jsonRouteError, readBoundedJson } from '../../../../../lib/bounded-json';
import { createRequestDatabase } from '../../../../../lib/request-database';
import { isTrustedBrowserMutation } from '../../../../../lib/browser-origin';

async function authorizedConnection(
  db: Awaited<ReturnType<typeof createRequestDatabase>>['db'],
  connectionId: string,
  userId: string,
) {
  const [connection] = await db
    .select()
    .from(schema.cliConnections)
    .where(
      and(eq(schema.cliConnections.id, connectionId), eq(schema.cliConnections.userId, userId)),
    )
    .limit(1);
  return connection ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const session = await getTraceSession(request.headers);
    if (!session?.user)
      return Response.json({ error: 'Authentication required.' }, { status: 401 });
    if (!isTrustedBrowserMutation(request))
      return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    const { connectionId } = await params;
    const body = await readBoundedJson<{ label?: unknown }>(request, 2_048);
    if (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 80)
      return Response.json({ error: 'Label is invalid.' }, { status: 400 });
    const { db, client } = await createRequestDatabase();
    try {
      const connection = await authorizedConnection(db, connectionId, session.user.id);
      if (!connection) return Response.json({ error: 'Connection not found.' }, { status: 404 });
      await db
        .update(schema.cliConnections)
        .set({ label: body.label.trim(), updatedAt: new Date() })
        .where(eq(schema.cliConnections.id, connection.id));
      return Response.json({ updated: true });
    } finally {
      await client.end();
    }
  } catch (error) {
    return jsonRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const session = await getTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isTrustedBrowserMutation(request))
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const { connectionId } = await params;
  const { db, client } = await createRequestDatabase();
  try {
    const connection = await authorizedConnection(db, connectionId, session.user.id);
    if (!connection) return Response.json({ error: 'Connection not found.' }, { status: 404 });
    await db
      .update(schema.cliConnections)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.cliConnections.id, connection.id));
    await db.insert(schema.auditEvents).values({
      organizationId: connection.organizationId,
      actorUserId: session.user.id,
      action: 'cli.connection.revoked',
      subjectType: 'cli_connection',
      subjectId: connection.id,
    });
    return Response.json({ revoked: true });
  } finally {
    await client.end();
  }
}
