import { eq } from 'drizzle-orm';
import { getTraceSession } from '@trace/auth';
import { schema } from '@trace/db';
import { createRequestDatabase } from '../../../lib/request-database';

const usageValues = new Set(['individual', 'team', 'organization']);
const modeValues = new Set(['cloud', 'local', 'hybrid', 'undecided']);

export async function POST(request: Request) {
  const session = await getTraceSession(request.headers);
  if (!session?.user) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const body = (await request.json()) as { intendedUsage?: unknown; executionMode?: unknown };
  if (typeof body.intendedUsage !== 'string' || !usageValues.has(body.intendedUsage)) {
    return Response.json({ error: 'Onboarding choices are invalid.' }, { status: 400 });
  }
  const executionMode =
    typeof body.executionMode === 'string' && modeValues.has(body.executionMode)
      ? body.executionMode
      : 'undecided';

  const { db, client } = await createRequestDatabase();
  try {
    await db
      .insert(schema.onboardingProfiles)
      .values({
        userId: session.user.id,
        intendedUsage: body.intendedUsage,
        executionMode,
        completed: true,
      })
      .onConflictDoUpdate({
        target: schema.onboardingProfiles.userId,
        set: {
          intendedUsage: body.intendedUsage,
          executionMode,
          completed: true,
          updatedAt: new Date(),
        },
      });
    await db.insert(schema.auditEvents).values({
      actorUserId: session.user.id,
      action: 'workspace.profile.completed',
      subjectType: 'onboarding_profile',
    });
    return Response.json({ status: 'saved' });
  } finally {
    await client.end();
  }
}

export async function GET(request: Request) {
  const session = await getTraceSession(request.headers);
  if (!session?.user) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { db, client } = await createRequestDatabase();
  try {
    const [profile] = await db
      .select({
        intendedUsage: schema.onboardingProfiles.intendedUsage,
        executionMode: schema.onboardingProfiles.executionMode,
        completed: schema.onboardingProfiles.completed,
      })
      .from(schema.onboardingProfiles)
      .where(eq(schema.onboardingProfiles.userId, session.user.id))
      .limit(1);
    return Response.json({ profile: profile ?? null });
  } finally {
    await client.end();
  }
}
