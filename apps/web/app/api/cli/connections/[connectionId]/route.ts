import { and, eq } from 'drizzle-orm';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { jsonRouteError, readBoundedJson } from '../../../../../lib/bounded-json';
import { createRequestDatabase, getRequestTraceSession } from '../../../../../lib/request-database';
import { isTrustedBrowserMutation } from '../../../../../lib/browser-origin';

async function authorizedConnection(
  db: Awaited<ReturnType<typeof createRequestDatabase>>['db'],
  connectionId: string,
  userId: string,
) {
  if (isD1Database(db)) {
    const [connection] = await (db as unknown as TraceD1Database)
      .select()
      .from(d1Schema.cliConnections)
      .where(
        and(
          eq(d1Schema.cliConnections.id, connectionId),
          eq(d1Schema.cliConnections.userId, userId),
        ),
      )
      .limit(1);
    return connection ?? null;
  }
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
    const session = await getRequestTraceSession(request.headers);
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
      if (isD1Database(db)) {
        await (db as unknown as TraceD1Database)
          .update(d1Schema.cliConnections)
          .set({ label: body.label.trim(), updatedAt: new Date() })
          .where(eq(d1Schema.cliConnections.id, connection.id));
      } else {
        await db
          .update(schema.cliConnections)
          .set({ label: body.label.trim(), updatedAt: new Date() })
          .where(eq(schema.cliConnections.id, connection.id));
      }
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
  const session = await getRequestTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isTrustedBrowserMutation(request))
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const { connectionId } = await params;
  const { db, client } = await createRequestDatabase();
  try {
    const connection = await authorizedConnection(db, connectionId, session.user.id);
    if (!connection) return Response.json({ error: 'Connection not found.' }, { status: 404 });
    if (isD1Database(db)) {
      const d1 = db as unknown as TraceD1Database;
      await d1
        .update(d1Schema.cliConnections)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(d1Schema.cliConnections.id, connection.id));
      await d1.insert(d1Schema.auditEvents).values({
        organizationId: connection.organizationId,
        actorUserId: session.user.id,
        action: 'cli.connection.revoked',
        subjectType: 'cli_connection',
        subjectId: connection.id,
      });
    } else {
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
    }
    return Response.json({ revoked: true });
  } finally {
    await client.end();
  }
}
