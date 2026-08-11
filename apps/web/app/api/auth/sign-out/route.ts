import {
  cookieAttributes,
  getTracePublicUrl,
  isSecurePublicUrl,
  sessionCookieName,
} from '@trace/auth';

export async function POST(request: Request) {
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
