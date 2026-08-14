import { authenticateCliRequest } from '../../../../lib/cli-auth';
import {
  jsonRouteError,
  readBoundedJson,
  requestCorrelationId,
} from '../../../../lib/bounded-json';
import { createRequestDatabase } from '../../../../lib/request-database';
import { completeSync } from '../../../../lib/sync-service';

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request);
  try {
    const body = await readBoundedJson<{ operationId?: unknown }>(request, 4_096);
    if (typeof body.operationId !== 'string')
      return Response.json({ error: 'Operation ID is required.' }, { status: 400 });
    const { db, client } = await createRequestDatabase();
    try {
      const connection = await authenticateCliRequest(db, request, 'sync:write');
      if (!connection)
        return Response.json({ error: 'CLI authentication required.' }, { status: 401 });
      const result = await completeSync(db, connection, body.operationId);
      return Response.json(result.body, { status: result.status });
    } finally {
      await client.end();
    }
  } catch (error) {
    return jsonRouteError(error, { requestId, route: 'sync.complete' });
  }
}
