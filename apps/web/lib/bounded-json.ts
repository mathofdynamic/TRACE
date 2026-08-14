export async function readBoundedJson<T>(request: Request, maximumBytes = 64 * 1024) {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim();
  if (contentType !== 'application/json') {
    throw new Response(JSON.stringify({ error: 'Content-Type must be application/json.' }), {
      status: 415,
      headers: { 'content-type': 'application/json' },
    });
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Response(JSON.stringify({ error: 'Request body is too large.' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new Response(JSON.stringify({ error: 'Request body is too large.' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Response(JSON.stringify({ error: 'Request body must be valid JSON.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export function requestCorrelationId(request: Request) {
  const supplied = request.headers.get('x-trace-request-id');
  return supplied && /^[A-Za-z0-9._:-]{1,80}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function jsonRouteError(
  error: unknown,
  context: { requestId?: string; route?: string; operationId?: string } = {},
) {
  if (error instanceof Response) return error;
  console.error(
    JSON.stringify({
      message: 'TRACE route failed',
      errorCategory: error instanceof Error ? error.name : 'UnknownError',
      ...context,
    }),
  );
  const response = Response.json({ error: 'The request could not be completed.' }, { status: 500 });
  if (context.requestId) response.headers.set('x-trace-request-id', context.requestId);
  return response;
}
