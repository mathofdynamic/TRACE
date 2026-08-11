'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('TRACE dashboard route failed', { digest: error.digest });
  }, [error]);

  return (
    <section className="empty-panel empty-panel--large" role="alert">
      <span aria-hidden="true">!</span>
      <h1>Workspace view unavailable</h1>
      <p>The route could not load. Retry the request or return to the workspace overview.</p>
      <div className="error-actions">
        <button className="trace-button trace-button--primary" type="button" onClick={reset}>
          Retry
        </button>
        <Link className="trace-button trace-button--secondary" href="/app">
          Open overview
        </Link>
      </div>
      {error.digest ? <small className="error-diagnostic">Diagnostic {error.digest}</small> : null}
    </section>
  );
}
