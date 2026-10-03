import { NextResponse, type NextRequest } from 'next/server';
import { canonicalBrowserLocation } from './lib/browser-origin';

export function middleware(request: NextRequest) {
  const location = canonicalBrowserLocation(request, {
    TRACE_DEPLOYMENT_ENV: process.env.TRACE_DEPLOYMENT_ENV,
    TRACE_PUBLIC_URL: process.env.TRACE_PUBLIC_URL,
  });
  return location ? NextResponse.redirect(location, 307) : NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
