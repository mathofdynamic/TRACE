import { getTracePublicUrl } from '@trace/auth';

export const PRODUCTION_BROWSER_ORIGIN = 'https://trace-code.pages.dev';
export const PRODUCTION_BACKEND_ORIGIN = 'https://trace-production.mathofdynamic2.workers.dev';
export const STAGING_ORIGIN = 'https://trace-test-staging.mathofdynamic2.workers.dev';

// Forwarding metadata selects the browser URL only; it never grants authentication.
export function canonicalBrowserLocation(
  request: Request,
  environment: { TRACE_DEPLOYMENT_ENV?: string; TRACE_PUBLIC_URL?: string },
): string | null {
  if (
    environment.TRACE_DEPLOYMENT_ENV !== 'production' ||
    environment.TRACE_PUBLIC_URL !== PRODUCTION_BROWSER_ORIGIN
  )
    return null;
  const url = new URL(request.url);
  const browserApi =
    /^\/api\/(auth\/(github(?:\/callback)?|sign-out)|github\/(install|setup|reconcile))\/?$/.test(
      url.pathname,
    );
  if (url.pathname.startsWith('/api/') && !browserApi) return null;
  if (url.origin === PRODUCTION_BROWSER_ORIGIN) return null;
  if (
    url.origin === PRODUCTION_BACKEND_ORIGIN &&
    request.headers.get('x-forwarded-host') === new URL(PRODUCTION_BROWSER_ORIGIN).host &&
    request.headers.get('x-forwarded-proto') === 'https'
  )
    return null;
  return `${PRODUCTION_BROWSER_ORIGIN}${url.pathname}${url.search}`;
}

export function isTrustedBrowserMutation(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const publicOrigin = new URL(getTracePublicUrl()).origin;
  const allowed = new Set(
    process.env.TRACE_DEPLOYMENT_ENV === 'production'
      ? [publicOrigin]
      : [new URL(request.url).origin, publicOrigin],
  );
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
