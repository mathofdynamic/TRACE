import { and, eq } from 'drizzle-orm';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { approveDeviceAuthorization } from '../../../../../lib/cli-auth';
import { createRequestDatabase, getRequestTraceSession } from '../../../../../lib/request-database';
import { isTrustedBrowserMutation } from '../../../../../lib/browser-origin';

export async function POST(request: Request) {
  const session = await getRequestTraceSession(request.headers);
  if (!session?.user) return Response.redirect(new URL('/sign-in', request.url), 303);
  if (!isTrustedBrowserMutation(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }
  const form = await request.formData();
  const code = form.get('code');
  const organizationId = form.get('organizationId');
  if (typeof code !== 'string' || typeof organizationId !== 'string') {
    return Response.redirect(new URL('/cli/authorize?error=invalid', request.url), 303);
  }
  const { db, client } = await createRequestDatabase();
  try {
    const d1 = isD1Database(db) ? (db as unknown as TraceD1Database) : null;
    const [membership] = d1
      ? await d1
          .select({ organizationId: d1Schema.memberships.organizationId })
          .from(d1Schema.memberships)
          .where(
            and(
              eq(d1Schema.memberships.userId, session.user.id),
              eq(d1Schema.memberships.organizationId, organizationId),
            ),
          )
          .limit(1)
      : await db
          .select({ organizationId: schema.memberships.organizationId })
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.userId, session.user.id),
              eq(schema.memberships.organizationId, organizationId),
            ),
          )
          .limit(1);
    if (!membership) {
      return Response.redirect(new URL('/cli/authorize?error=forbidden', request.url), 303);
    }
    const approved = await approveDeviceAuthorization(db, {
      code: code.trim().toUpperCase(),
      userId: session.user.id,
      organizationId,
    });
    if (!approved) {
      return Response.redirect(new URL('/cli/authorize?error=expired', request.url), 303);
    }
    if (d1) {
      await d1.insert(d1Schema.auditEvents).values({
        organizationId,
        actorUserId: session.user.id,
        action: 'cli.connection.approved',
        subjectType: 'cli_connection',
        subjectId: approved.id,
      });
    } else {
      await db.insert(schema.auditEvents).values({
        organizationId,
        actorUserId: session.user.id,
        action: 'cli.connection.approved',
        subjectType: 'cli_connection',
        subjectId: approved.id,
      });
    }
    return Response.redirect(new URL('/cli/authorize?approved=1', request.url), 303);
  } finally {
    await client.end();
  }
}
