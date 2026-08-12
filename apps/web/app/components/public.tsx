import Link from 'next/link';
import type { ReactNode } from 'react';

const navItems = [
  ['Product', '/product'],
  ['Security', '/security'],
  ['Specification', '/specification'],
  ['Pricing', '/pricing'],
  ['Docs', '/docs'],
] as const;

export function TraceMark() {
  return (
    <span className="trace-mark" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

export function Wordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="TRACE home">
      <TraceMark />
      <span>TRACE</span>
    </Link>
  );
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <div className="public-header__inner">
        <Wordmark />
        <nav className="public-nav" aria-label="Primary navigation">
          {navItems.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="public-header__actions">
          <Link className="header-signin" href="/sign-in">
            Sign in
          </Link>
          <Link className="trace-button trace-button--primary header-cta" href="/sign-in">
            Start with TRACE
          </Link>
        </div>
        <details className="mobile-nav">
          <summary aria-label="Open navigation menu">Menu</summary>
          <nav aria-label="Mobile navigation">
            {navItems.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <Link href="/sign-in">Sign in</Link>
            <Link className="trace-button trace-button--primary" href="/sign-in">
              Start with TRACE
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <Wordmark />
        <p>Portable understanding for software change.</p>
      </div>
      <div className="public-footer__links">
        <Link href="/security">Security</Link>
        <Link href="/specification">.trace specification</Link>
        <Link href="/docs">Documentation</Link>
        <a href="https://github.com/mathofdynamic/TRACE">GitHub</a>
      </div>
      <span className="public-footer__note">
        Experimental product. Claims follow implementation.
      </span>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-frame">
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="section-label">{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="page-header">
      <SectionLabel>{eyebrow}</SectionLabel>
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}
