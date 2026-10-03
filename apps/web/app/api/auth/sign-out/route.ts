import {
  cookieAttributes,
  getTracePublicUrl,
  isSecurePublicUrl,
  readCookie,
  sessionCookieName,
} from '@trace/auth';
import { invalidateRequestAuthSession } from '../../../../lib/request-database';

export async function POST(request: Request) {
  try {
    await invalidateRequestAuthSession(readCookie(request.headers, sessionCookieName()));
  } catch {
    // Clearing the browser cookie remains the safe fallback if persistence is unavailable.
  }
  const response = new Response(null, {
    status: 302,
    headers: {
      location: new URL('/', getTracePublicUrl()).toString(),
      'cache-control': 'no-store',
    },
  });
  response.headers.append(
    'set-cookie',
    `${sessionCookieName()}=; ${cookieAttributes(0, isSecurePublicUrl())}`,
  );
  return response;
}
