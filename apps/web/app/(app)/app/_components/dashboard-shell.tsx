'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { TraceMark } from '../../../components/public';
import {
  getRouteLabel,
  isNavigationItemActive,
  primaryNavigation,
  secondaryNavigation,
} from './navigation';
import type { NavigationItem } from './navigation';
import type { NavigationCapabilities } from './navigation';
import { RepositorySwitcher } from './trace-redesign';
import type { DashboardAttention, DashboardRepository } from '../../../../lib/dashboard';

function NavigationIcon({ name }: { name: NavigationItem['icon'] }) {
  const paths: Record<NavigationItem['icon'], ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    repository: (
      <>
        <path d="M4 4.5h6l2 2H20v13H4z" />
        <path d="M4 9h16" />
      </>
    ),
    change: (
      <>
        <path d="M6 7h12" />
        <path d="m15 4 3 3-3 3" />
        <path d="M18 17H6" />
        <path d="m9 14-3 3 3 3" />
      </>
    ),
    conflict: (
      <>
        <path d="M8 4v4c0 2 1 3 3 4-2 1-3 2-3 4v4" />
        <path d="m5 17 3 3 3-3" />
        <path d="M16 4v4c0 2-1 3-3 4 2 1 3 2 3 4v4" />
        <path d="m13 7 3-3 3 3" />
      </>
    ),
    report: (
      <>
        <path d="M5 3h11l3 3v15H5z" />
        <path d="M16 3v4h4" />
        <path d="M8 12h8M8 16h8" />
      </>
    ),
    decision: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    rule: (
      <>
        <path d="M5 5h14M5 12h14M5 19h14" />
        <circle cx="9" cy="5" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="11" cy="19" r="2" />
      </>
    ),
    activity: (
      <>
        <path d="M4 12h4l2-6 4 12 2-6h4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1Z" />
      </>
    ),
    docs: (
      <>
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23.5z" />
        <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5a3.5 3.5 0 0 1 3.5 3.5z" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function NavigationLinks({
  items,
  pathname,
  pendingHref,
  onNavigate,
  capabilities,
}: {
  items: readonly NavigationItem[];
  pathname: string;
  pendingHref: string | null;
  onNavigate: (href: string) => void;
  capabilities: NavigationCapabilities;
}) {
  return items.map((item) => {
    const available = !item.requires || capabilities[item.requires];
    const active = isNavigationItemActive(pathname, item.href);
    const pending = pendingHref === item.href;
    if (!available) {
      return (
        <span
          key={item.href}
          className="dashboard-nav__link dashboard-nav__link--unavailable"
          aria-disabled="true"
          title="Available when TRACE has relevant project data"
        >
          <NavigationIcon name={item.icon} />
          <span>{item.label}</span>
          <small>Unavailable</small>
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className="dashboard-nav__link"
        aria-current={active ? 'page' : undefined}
        data-pending={pending || undefined}
        prefetch={!item.external}
        onClick={() => onNavigate(item.href)}
      >
        <NavigationIcon name={item.icon} />
        <span>{item.label}</span>
        {pending ? <i className="nav-pending-dot" aria-label="Loading" /> : null}
      </Link>
    );
  });
}

export function DashboardShell({
  children,
  userName,
  workspaceName,
  capabilities,
  repositoryCount,
  repositories,
  attention,
  preferredRepositoryId,
}: {
  children: ReactNode;
  userName: string;
  workspaceName: string;
  capabilities: NavigationCapabilities;
  repositoryCount: number;
  repositories: DashboardRepository[];
  attention: DashboardAttention[];
  preferredRepositoryId: string | null;
}) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const routeLabel = getRouteLabel(pathname);

  useEffect(() => {
    setPendingHref(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    closeButtonRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMobileOpen(false);
      menuButtonRef.current?.focus();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  function navigate(href: string) {
    if (!isNavigationItemActive(pathname, href)) setPendingHref(href);
  }

  const navigationProps = { pathname, pendingHref, onNavigate: navigate, capabilities };

  return (
    <div className="dashboard-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="dashboard-sidebar" aria-label="Workspace" aria-hidden={mobileOpen}>
        <Link className="dashboard-brand" href="/app" aria-label="TRACE overview">
          <TraceMark />
          <span>TRACE</span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-switcher__dot" />
          <span>
            <small>Workspace</small>
            <strong>{workspaceName}</strong>
          </span>
          <span className="workspace-switcher__scope">
            {repositoryCount
              ? `${repositoryCount} repo${repositoryCount === 1 ? '' : 's'}`
              : 'Setup'}
          </span>
        </div>
        <nav className="dashboard-nav" aria-label="Application navigation">
          <p>Workspace</p>
          <NavigationLinks items={primaryNavigation} {...navigationProps} />
          <p>Manage</p>
          <NavigationLinks items={secondaryNavigation} {...navigationProps} />
        </nav>
        <div className="dashboard-account">
          <span className="avatar">{userName.charAt(0).toUpperCase()}</span>
          <span>
            <small>Signed in as</small>
            <strong title={userName}>{userName}</strong>
          </span>
        </div>
      </aside>

      {mobileOpen ? (
        <>
          <button
            className="dashboard-scrim"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="dashboard-mobile-drawer"
            data-open="true"
            aria-label="Mobile workspace navigation"
          >
            <div className="dashboard-mobile-drawer__header">
              <span>{workspaceName}</span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                ×
              </button>
            </div>
            <nav className="dashboard-nav" aria-label="Mobile application navigation">
              <p>Workspace</p>
              <NavigationLinks items={primaryNavigation} {...navigationProps} />
              <p>Manage</p>
              <NavigationLinks items={secondaryNavigation} {...navigationProps} />
            </nav>
          </aside>
        </>
      ) : null}

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            ref={menuButtonRef}
            className="dashboard-menu-button"
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <span />
            <span />
          </button>
          <span className="breadcrumb">
            <span>{workspaceName}</span>
            <i aria-hidden="true">/</i>
            <strong>{routeLabel}</strong>
          </span>
          {repositories.length ? (
            <RepositorySwitcher
              repositories={repositories}
              attention={attention}
              preferredRepositoryId={preferredRepositoryId}
            />
          ) : null}
          <span className="topbar-status">
            <i /> Early pilot
          </span>
        </header>
        {pendingHref ? (
          <div
            className="route-progress"
            role="status"
            aria-label={`Loading ${getRouteLabel(pendingHref)}`}
          />
        ) : null}
        <main id="main-content" className="dashboard-content">
          <div className="dashboard-route" key={pathname}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
