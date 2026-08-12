import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from './public';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-shell__top">
        <Wordmark />
        <Link href="/">Back to TRACE</Link>
      </div>
      <section className="auth-card">{children}</section>
      <p className="auth-shell__footer">One account. Repository access stays under your control.</p>
    </main>
  );
}
