import { authenticateCliRequest } from '../../../../lib/cli-auth';
import { createRequestDatabase } from '../../../../lib/request-database';
import { getSyncStatus } from '../../../../lib/sync-service';

export async function GET(request: Request) {
  const repositoryId = new URL(request.url).searchParams.get('repositoryId');
  if (!repositoryId) return Response.json({ error: 'Repository ID is required.' }, { status: 400 });
  const { db, client } = await createRequestDatabase();
  try {
    const connection = await authenticateCliRequest(db, request, 'sync:write');
    if (!connection)
      return Response.json({ error: 'CLI authentication required.' }, { status: 401 });
    const status = await getSyncStatus(db, connection, repositoryId);
    return status
      ? Response.json(status)
      : Response.json({ error: 'Repository was not found.' }, { status: 404 });
  } finally {
    await client.end();
  }
}
