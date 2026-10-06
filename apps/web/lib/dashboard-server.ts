import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createRequestDatabase, getRequestTraceSession } from './request-database';
import { getDashboardSummary } from './dashboard';

// React's server cache is scoped to this render/request, never across users.
export const getAuthenticatedDashboardSummary = cache(
  async function getAuthenticatedDashboardSummary() {
    const session = await getRequestTraceSession(await headers());
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
  },
);
