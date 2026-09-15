import Link from 'next/link';
import { PublicLayout, SectionLabel } from './components/public';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Not Found â€” TRACE',
  description: 'The requested resource could not be found.',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PublicLayout>
      <main
        className="public-container"
        style={{ padding: '80px 24px', maxWidth: '640px', minHeight: '60vh' }}
      >
        <section
          data-trace-motion="section"
          data-motion-section="not-found"
          className="card"
          style={{ padding: '36px', border: '1px solid var(--trace-border-subtle)' }}
        >
          <div data-trace-motion="item" style={{ '--motion-index': 0 } as React.CSSProperties}>
            <SectionLabel>404 â€” Not Found</SectionLabel>
            <h1
              style={{ fontSize: '24px', fontWeight: 600, marginTop: '8px', marginBottom: '12px' }}
            >
              Resource not found
            </h1>
          </div>
          <p
            data-trace-motion="item"
            style={
              {
                '--motion-index': 1,
                color: 'var(--trace-text-secondary)',
                marginBottom: '24px',
                lineHeight: 1.6,
              } as React.CSSProperties
            }
          >
            The page or artifact record you requested does not exist or has been moved.
          </p>
          <div
            data-trace-motion="item"
            style={
              {
                '--motion-index': 2,
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
              } as React.CSSProperties
            }
          >
            <Link className="trace-button trace-button--primary" href="/">
              Return Home
            </Link>
            <Link className="trace-button trace-button--secondary" href="/docs">
              View Documentation
            </Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
