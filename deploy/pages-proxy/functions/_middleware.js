/* global URL, Headers, fetch, Request */

const TRACE_ORIGIN = 'https://trace-test-staging.mathofdynamic2.workers.dev';

export async function onRequest({ request }) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, TRACE_ORIGIN);
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
  }

  return fetch(new Request(targetUrl, init));
}
