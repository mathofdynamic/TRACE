import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTraceSession } from '@trace/auth';
import { createRequestDatabase } from './request-database';
import { getDashboardSummary } from './dashboard';

export async function getAuthenticatedDashboardSummary() {
  const session = await getTraceSession(await headers());
  if (!session?.user) redirect('/sign-in?next=/app');
  const { db, client } = await createRequestDatabase();
  try {
    return {
      session,
      summary: await getDashboardSummary(db, session.user.id),
    };
  } finally {
    await client.end();
  }
}
