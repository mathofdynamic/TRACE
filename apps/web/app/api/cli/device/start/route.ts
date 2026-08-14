import {
  createDeviceAuthorization,
  DeviceAuthorizationRateLimitError,
} from '../../../../../lib/cli-auth';
import { readBoundedJson, jsonRouteError } from '../../../../../lib/bounded-json';
import { createRequestDatabase } from '../../../../../lib/request-database';
import { getTracePublicUrl } from '@trace/auth';

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson<{ label?: unknown }>(request, 2_048);
    const label = typeof body.label === 'string' ? body.label : 'TRACE CLI';
    const { db, client } = await createRequestDatabase();
    try {
      const requestKey =
        request.headers.get('cf-connecting-ip') ??
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'local-unknown';
      const authorization = await createDeviceAuthorization(db, label, requestKey);
      return Response.json({
        deviceCode: authorization.deviceCode,
        userCode: authorization.userCode,
        verificationUri: `${getTracePublicUrl()}/cli/authorize`,
        verificationUriComplete: `${getTracePublicUrl()}/cli/authorize?code=${encodeURIComponent(authorization.userCode)}`,
        expiresIn: Math.max(0, Math.floor((authorization.expiresAt.getTime() - Date.now()) / 1000)),
        interval: 3,
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    if (error instanceof DeviceAuthorizationRateLimitError)
      return Response.json(
        { error: 'Too many device authorization attempts. Try again later.' },
        { status: 429 },
      );
    return jsonRouteError(error);
  }
}
