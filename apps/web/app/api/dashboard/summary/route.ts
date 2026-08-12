import { getTraceSession } from '@trace/auth';
import { createRequestDatabase } from '../../../../lib/request-database';
import { getDashboardSummary } from '../../../../lib/dashboard';

export async function GET(request: Request) {
  const session = await getTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const { db, client } = await createRequestDatabase();
  try {
    return Response.json(await getDashboardSummary(db, session.user.id));
  } finally {
    await client.end();
  }
}
