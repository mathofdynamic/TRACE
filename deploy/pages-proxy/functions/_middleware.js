/* global URL, Headers, fetch, Request, Response */

const TRACE_ORIGIN = 'https://trace-production.mathofdynamic2.workers.dev';

export async function onRequest({ request }) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(TRACE_ORIGIN);
  targetUrl.pathname = incomingUrl.pathname;
  targetUrl.search = incomingUrl.search;
  const headers = new Headers(request.headers);

  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  const upstream = await fetch(new Request(targetUrl, init));
  const response = new Response(upstream.body, upstream);
  response.headers.set('x-trace-proxy-upstream', TRACE_ORIGIN);
  return response;
}
