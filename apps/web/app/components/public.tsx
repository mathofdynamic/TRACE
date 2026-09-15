'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const navItems = [
  ['Product', '/product'],
  ['Security', '/security'],
  ['Specification', '/specification'],
  ['Pricing', '/pricing'],
  ['Docs', '/docs'],
] as const;

export const TRACE_LOGO_URL =
  'https://famjljl5gg.ufs.sh/f/aej4FOV7nKCWxlYdm74WLq4h6ZbegtSl8A7Xw2YKRnmpcVyi';

export function TraceMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`trace-mark ${className}`.trim()}
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <img
        src={TRACE_LOGO_URL}
        alt="TRACE logo"
        className="trace-mark__img"
        width={size}
        height={size}
      />
    </span>
  );
}

export function Wordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="TRACE home">
      <TraceMark size={20} />
      <span className="wordmark__text">TRACE</span>
    </Link>
  );
}

export function PublicHeader() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Monitor scroll for subtle floating material separation
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Handle ESC key and outside click for accessible mobile popover
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        toggleButtonRef.current?.focus();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(event.target as Node) &&
        toggleButtonRef.current &&
        !toggleButtonRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  return (
    <header className={`public-header ${isScrolled ? 'public-header--scrolled' : ''}`}>
      <div className="public-header__inner">
        <div
          className="public-header__brand"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <Wordmark />
        </div>

        <nav
          className="public-nav"
          aria-label="Primary navigation"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          {navItems.map(([label, href]) => {
            const isActive = pathname === href || Boolean(pathname?.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                className={`public-nav__link ${isActive ? 'public-nav__link--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{label}</span>
                {isActive && <span className="public-nav__indicator" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>

        <div
          className="public-header__actions"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <Link className="header-signin" href="/sign-in">
            Sign in
          </Link>
          <Link className="trace-button trace-button--primary header-cta" href="/sign-in">
            Start with TRACE
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <div className="public-header__mobile-trigger">
          <button
            ref={toggleButtonRef}
            type="button"
            className="mobile-nav-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-panel"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            <span
              className={`mobile-nav-icon ${mobileMenuOpen ? 'mobile-nav-icon--open' : ''}`}
              aria-hidden="true"
            >
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      {/* Accessible Floating Mobile Navigation Panel */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation-panel"
          ref={mobileNavRef}
          className="mobile-nav-panel"
          data-trace-motion="surface"
          data-motion-variant="popover"
          role="dialog"
          aria-label="Mobile navigation"
        >
          <div className="mobile-nav-panel__content">
            <nav className="mobile-nav-panel__links" aria-label="Mobile primary navigation">
              {navItems.map(([label, href], idx) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`mobile-nav-link ${isActive ? 'mobile-nav-link--active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    data-trace-motion="item"
                    style={{ '--motion-index': idx } as React.CSSProperties}
                  >
                    <span>{label}</span>
                    {isActive && <span className="mobile-nav-link__bullet" aria-hidden="true" />}
                  </Link>
                );
              })}
            </nav>

            <div
              className="mobile-nav-panel__actions"
              data-trace-motion="item"
              style={{ '--motion-index': navItems.length } as React.CSSProperties}
            >
              <Link className="mobile-nav-panel__signin" href="/sign-in">
                Sign in
              </Link>
              <Link
                className="trace-button trace-button--primary mobile-nav-panel__cta"
                href="/sign-in"
              >
                Start with TRACE
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer
      className="public-footer"
      data-trace-motion="section"
      data-motion-section="footer"
      aria-label="Site footer"
    >
      <div className="public-container public-footer__inner">
        <div className="public-footer__grid">
          {/* Brand Thesis Column */}
          <div
            className="public-footer__brand-col"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <Wordmark />
            <p className="public-footer__thesis">
              Git is the history of code.
              <br />
              TRACE is the history of understanding.
            </p>
            <p className="public-footer__desc">
              Evidence-backed change intelligence and portable repository memory for human
              developers and coding agents.
            </p>
          </div>

          {/* Product Column */}
          <div
            className="public-footer__col"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <h3 className="public-footer__heading">Product</h3>
            <ul className="public-footer__list">
              <li>
                <Link href="/product">Product Overview</Link>
              </li>
              <li>
                <Link href="/security">Security & Privacy</Link>
              </li>
              <li>
                <Link href="/specification">Artifact Specification</Link>
              </li>
              <li>
                <Link href="/pricing">Pricing & Tiers</Link>
              </li>
            </ul>
          </div>

          {/* Resources & Specification Column */}
          <div
            className="public-footer__col"
            data-trace-motion="item"
            style={{ '--motion-index': 2 } as React.CSSProperties}
          >
            <h3 className="public-footer__heading">Resources</h3>
            <ul className="public-footer__list">
              <li>
                <Link href="/docs">Documentation</Link>
              </li>
              <li>
                <Link href="/specification">.trace RFC-001</Link>
              </li>
              <li>
                <a href="https://github.com/mathofdynamic/TRACE" target="_blank" rel="noreferrer">
                  GitHub Repository
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/mathofdynamic/TRACE/security"
                  target="_blank"
                  rel="noreferrer"
                >
                  Security Advisory
                </a>
              </li>
            </ul>
          </div>

          {/* Access Column */}
          <div
            className="public-footer__col"
            data-trace-motion="item"
            style={{ '--motion-index': 3 } as React.CSSProperties}
          >
            <h3 className="public-footer__heading">Access</h3>
            <ul className="public-footer__list">
              <li>
                <Link href="/sign-in">Sign in</Link>
              </li>
              <li>
                <Link href="/sign-in">Start with TRACE</Link>
              </li>
              <li>
                <Link href="/app">Command Center</Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Integrity and Disclosure Bar */}
        <div
          className="public-footer__bottom"
          data-trace-motion="item"
          style={{ '--motion-index': 4 } as React.CSSProperties}
        >
          <div className="public-footer__disclosure">
            <span>
              Experimental early implementation. Public claims follow verified functionality.
            </span>
            <span>Zero raw source code is transmitted or stored.</span>
          </div>
          <div className="public-footer__version">
            <span>.trace specification v0.1</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-frame">
      <PublicHeader />
      <div className="public-content">{children}</div>
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
    <div
      className="page-header"
      data-trace-motion="item"
      style={{ '--motion-index': 0 } as React.CSSProperties}
    >
      <SectionLabel>{eyebrow}</SectionLabel>
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}
