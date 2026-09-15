import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from './public';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-stage-wrapper">
      <div className="auth-ambient-halo" aria-hidden="true" />
      <main className="auth-shell" id="main-content">
        <header
          className="auth-shell__top"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <Wordmark />
          <Link href="/" className="auth-back-link">
            Back to TRACE â†’
          </Link>
        </header>
        <section
          className="auth-card"
          aria-label="Sign in to TRACE"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          {children}
        </section>
        <footer
          className="auth-shell__footer"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <p className="auth-trust-note">
            One account. Repository access stays under your control.
          </p>
        </footer>
      </main>
    </div>
  );
}
