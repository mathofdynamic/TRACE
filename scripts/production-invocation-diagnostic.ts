import { pathToFileURL } from 'node:url';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}

export function invocationQuery(rayId: string, timestamp: string, exact = true) {
  if (!/^[a-f0-9]{16}$/.test(rayId)) throw new Error('Invalid Ray ID.');
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || !timestamp.endsWith('Z')) throw new Error('Invalid UTC timestamp.');
  return {
    queryId: 'trace-production-resource-diagnostic',
    dry: true,
    view: 'events',
    limit: 100,
    timeframe: { from: time - 60_000, to: time + 60_000 },
    parameters: {
      filters: [
        { key: '$metadata.service', operation: 'eq', type: 'string', value: 'trace-production' },
      ],
      ...(exact ? { needle: { value: rayId, isRegex: false, matchCase: false } } : {}),
    },
  };
}

export function invocationSummary(value: unknown) {
  const event = record(value);
  const metadata = record(event.$metadata);
  const workers = record(event.$workers);
  const source = record(event.source);
  const sourceWorkers = record(source.$workers);
  const details = { ...sourceWorkers, ...workers };
  const outcome = details.outcome;
  let requestPath: string | null = null;
  try {
    const url = metadata.url ?? record(record(details.event).request).url;
    const pathname = new URL(String(url)).pathname;
    requestPath = ['/api/github/setup', '/app/repositories'].includes(pathname)
      ? pathname
      : 'OTHER_PATH';
  } catch {
    /* No valid request URL; omit it. */
  }
  const error = String(metadata.error ?? source.error ?? '');
  const knownOutcome = typeof outcome === 'string' && /^[a-zA-Z_ -]{1,40}$/.test(outcome);
  const number = (key: string) =>
    typeof details[key] === 'number' && Number.isFinite(details[key]) ? details[key] : null;
  return {
    timestamp: typeof event.timestamp === 'number' ? new Date(event.timestamp).toISOString() : null,
    rayId:
      typeof metadata.rayId === 'string' && /^[a-f0-9]{16}$/i.test(metadata.rayId)
        ? metadata.rayId
        : null,
    requestId:
      typeof metadata.requestId === 'string' && /^[a-f0-9-]{16,40}$/i.test(metadata.requestId)
        ? metadata.requestId
        : null,
    outcome: knownOutcome ? outcome : null,
    requestPath,
    cpuTimeMs: number('cpuTimeMs'),
    wallTimeMs: number('wallTimeMs'),
    errorClass: /CPU|exceededCpu/i.test(error)
      ? 'CPU_LIMIT'
      : /memory|exceededMemory/i.test(error)
        ? 'MEMORY_LIMIT'
        : /subrequest|Too many requests/i.test(error)
          ? 'SUBREQUEST_LIMIT'
          : /D1/i.test(error)
            ? 'D1_ERROR'
            : error
              ? 'OTHER_ERROR_REDACTED'
              : null,
    workerVersion:
      typeof record(details.scriptVersion).id === 'string' &&
      /^[a-f0-9-]{36}$/i.test(String(record(details.scriptVersion).id))
        ? record(details.scriptVersion).id
        : null,
  };
}

export async function diagnoseInvocation(
  environment: Record<string, string | undefined>,
  fetcher = fetch,
) {
  const account = 'c5d6cf110905c91fc3eed1abaf8236a2';
  if (environment.CLOUDFLARE_ACCOUNT_ID !== account || !environment.CLOUDFLARE_API_TOKEN)
    throw new Error('Protected production diagnostic credentials unavailable.');
  const ray = environment.INVOCATION_RAY_ID ?? '';
  const timestamp = environment.INVOCATION_TIMESTAMP ?? '';
  for (const exact of [true, false]) {
    const response = await fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(invocationQuery(ray, timestamp, exact)),
      },
    );
    if (!response.ok)
      throw new Error(`Protected Workers observability read failed (HTTP ${response.status}).`);
    const body = record(await response.json());
    if (body.success !== true) throw new Error('Protected Workers observability query failed.');
    const events = record(record(body.result).events).events;
    if (!Array.isArray(events)) throw new Error('Workers observability events response invalid.');
    console.log(
      JSON.stringify({
        scope: exact ? 'EXACT_RAY' : 'WORKER_TIME_WINDOW',
        events: events.map(invocationSummary),
      }),
    );
    if (exact && events.length) return;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  diagnoseInvocation(process.env).catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Production invocation diagnostic failed.',
    );
    process.exitCode = 1;
  });
}
