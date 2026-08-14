import { authenticateCliRequest } from '../../../../lib/cli-auth';
import {
  jsonRouteError,
  readBoundedJson,
  requestCorrelationId,
} from '../../../../lib/bounded-json';
import { createRequestDatabase } from '../../../../lib/request-database';
import { stageSyncArtifact } from '../../../../lib/sync-service';

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request);
  try {
    const input = await readBoundedJson<unknown>(request, 384 * 1024);
    const { db, client } = await createRequestDatabase();
    try {
      const connection = await authenticateCliRequest(db, request, 'sync:write');
      if (!connection)
        return Response.json({ error: 'CLI authentication required.' }, { status: 401 });
      const result = await stageSyncArtifact(db, connection, input);
      return Response.json(result.body, { status: result.status });
    } finally {
      await client.end();
    }
  } catch (error) {
    return jsonRouteError(error, { requestId, route: 'sync.artifact' });
  }
}
