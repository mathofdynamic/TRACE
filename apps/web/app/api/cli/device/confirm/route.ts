import { and, eq } from 'drizzle-orm';
import { getTraceSession } from '@trace/auth';
import { schema } from '@trace/db';
import { approveDeviceAuthorization } from '../../../../../lib/cli-auth';
import { createRequestDatabase } from '../../../../../lib/request-database';
import { isTrustedBrowserMutation } from '../../../../../lib/browser-origin';

export async function POST(request: Request) {
  const session = await getTraceSession(request.headers);
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
    const [membership] = await db
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
    await db.insert(schema.auditEvents).values({
      organizationId,
      actorUserId: session.user.id,
      action: 'cli.connection.approved',
      subjectType: 'cli_connection',
      subjectId: approved.id,
    });
    return Response.redirect(new URL('/cli/authorize?approved=1', request.url), 303);
  } finally {
    await client.end();
  }
}
