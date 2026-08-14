import { consumeDeviceAuthorization } from '../../../../../lib/cli-auth';
import { readBoundedJson, jsonRouteError } from '../../../../../lib/bounded-json';
import { createRequestDatabase } from '../../../../../lib/request-database';

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson<{ deviceCode?: unknown }>(request, 4_096);
    if (typeof body.deviceCode !== 'string' || body.deviceCode.length > 200) {
      return Response.json({ error: 'Device code is invalid.' }, { status: 400 });
    }
    const { db, client } = await createRequestDatabase();
    try {
      const result = await consumeDeviceAuthorization(db, body.deviceCode);
      if (result.status === 'expired') {
        return Response.json({ error: 'expired_token' }, { status: 400 });
      }
      if (result.status === 'pending') {
        return Response.json({ status: 'authorization_pending' }, { status: 202 });
      }
      return Response.json({
        status: 'approved',
        accessToken: result.token,
        tokenType: 'Bearer',
        connectionId: result.connectionId,
        scopes: ['repository:read', 'sync:write'],
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    return jsonRouteError(error);
  }
}
