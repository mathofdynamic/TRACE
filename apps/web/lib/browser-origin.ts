import { getTracePublicUrl } from '@trace/auth';

export function isTrustedBrowserMutation(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin, new URL(getTracePublicUrl()).origin]);
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
