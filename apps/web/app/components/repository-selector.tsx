'use client';

import { useMemo, useState, useRef } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import type {
  DashboardAttention,
  DashboardRepository,
  DashboardSyncedRecord,
} from '../../lib/dashboard';
import {
  deriveTraceProjectState,
  formatRelativeDate,
  localTraceCommandsForState,
} from '../../lib/dashboard-state';
import { LocalActionPanel, ProjectStatusGlyph } from '../(app)/app/_components/trace-redesign';
import {
  OverlayPortal,
  ModalBackdrop,
  CenteredDialog,
  PresenceContext,
} from '../(app)/app/_components/overlay-portal';
import { usePresence, getMotionItemProps } from '../../lib/entrance-motion';

export type RepositorySelectorProps = {
  repositories: DashboardRepository[];
  attention?: DashboardAttention[];
  reports?: DashboardSyncedRecord[];
  installations?: Array<{
    id: string;
    accountLogin: string;
    accountType: string;
    state: string;
  }>;
  workspaceName?: string;
  setupMessage?: string | null;
  setupStatus?: string | null;
};

type FilterCategory = 'all' | 'current' | 'attention' | 'not-analyzed';

export function RepositorySelector({
  repositories,
  attention = [],
  reports = [],
  installations = [],
  workspaceName = 'Workspace',
  setupMessage = null,
  setupStatus = null,
}: RepositorySelectorProps) {
  const [selected, setSelected] = useState(
    () =>
      new Set(
        repositories
          .filter((repository) => repository.state === 'active')
          .map((repository) => repository.id),
      ),
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle');
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [showAccessForm, setShowAccessForm] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Enriched repository list with derived facts
  const enrichedRepositories = useMemo(() => {
    return repositories.map((repo) => {
      const isSelected = selected.has(repo.id);
      const state = deriveTraceProjectState(repo as DashboardRepository, attention);
      const repoAttention = attention.filter((item) => item.repositoryId === repo.id);
      const findings = repoAttention.filter((item) =>
        ['finding', 'risk', 'conflict'].includes(item.kind),
      );
      const repoReports = reports.filter((item) => item.repositoryId === repo.id);
      const localCommands = localTraceCommandsForState(state.key);
      const isCurrent = state.key === 'current';
      const isAttention =
        ['needs-refresh', 'sync-attention', 'analysis-failed'].includes(state.key) ||
        findings.length > 0;
      const isNotAnalyzed = state.key === 'connected-not-analyzed' || state.key === 'not-connected';

      const shortSha = repo.latestSync?.headCommit
        ? repo.latestSync.headCommit.slice(0, 7)
        : repo.remoteHeadSha
          ? repo.remoteHeadSha.slice(0, 7)
          : null;

      return {
        ...repo,
        isSelected,
        state,
        findingsCount: findings.length,
        reportsCount: repoReports.length,
        localCommands,
        isCurrent,
        isAttention,
        isNotAnalyzed,
        shortSha,
      };
    });
  }, [repositories, selected, attention, reports]);

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: enrichedRepositories.length,
      current: enrichedRepositories.filter((r) => r.isCurrent).length,
      attention: enrichedRepositories.filter((r) => r.isAttention).length,
      notAnalyzed: enrichedRepositories.filter((r) => r.isNotAnalyzed).length,
    };
  }, [enrichedRepositories]);

  // Filtered repositories based on search query and category filter
  const filteredRepositories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return enrichedRepositories.filter((repo) => {
      // Search filter
      if (
        normalized &&
        !repo.fullName.toLowerCase().includes(normalized) &&
        !(repo.defaultBranch && repo.defaultBranch.toLowerCase().includes(normalized)) &&
        !repo.state.label.toLowerCase().includes(normalized)
      ) {
        return false;
      }

      // Category filter
      if (activeFilter === 'current') return repo.isCurrent;
      if (activeFilter === 'attention') return repo.isAttention;
      if (activeFilter === 'not-analyzed') return repo.isNotAnalyzed;
      return true;
    });
  }, [enrichedRepositories, query, activeFilter]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setStatus('idle');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    try {
      const response = await fetch('/api/github/repositories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repositoryIds: Array.from(selected) }),
      });
      setStatus(response.ok ? 'saved' : 'error');
    } catch {
      setStatus('error');
    }
  }

  const primaryInstallation = installations[0];

  return (
    <div className="repositories-management" id="repositories-management">
      {/* 1. Page Header: Two Clear Zones */}
      <header
        className="repositories-header"
        data-trace-motion="item"
        style={{ '--motion-index': 0 } as React.CSSProperties}
      >
        <div className="repositories-header__title-group">
          <span className="eyebrow">WORKSPACE REPOSITORIES</span>
          <h1>Which projects should TRACE understand?</h1>
          <p className="repositories-header__lead">
            {repositories.length === 1
              ? '1 connected project in this workspace. TRACE maintains deterministic local records and sync history.'
              : `${repositories.length} connected projects in this workspace. TRACE maintains deterministic local records and sync history.`}
          </p>
        </div>

        <div className="repositories-header__right">
          {primaryInstallation ? (
            <div
              className="repositories-installation-fact"
              aria-label="GitHub installation details"
            >
              <span className="installation-fact__icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </span>
              <span className="installation-fact__label">GitHub</span>
              <span className="installation-fact__sep" aria-hidden="true">
                /
              </span>
              <code className="installation-fact__account">{primaryInstallation.accountLogin}</code>
              <span className="installation-fact__meta">
                {primaryInstallation.accountType === 'Organization' ? 'Org' : 'User'} · Read-only
              </span>
            </div>
          ) : null}

          <div className="repositories-header__actions">
            <button
              type="button"
              className="trace-button trace-button--secondary"
              onClick={() => setShowAccessForm(true)}
              aria-haspopup="dialog"
            >
              Adjust access
            </button>
            <Link
              className="trace-button trace-button--secondary"
              href="/api/github/install?next=/app/repositories"
            >
              Connect GitHub ↗
            </Link>
            <Link
              className="trace-button trace-button--secondary"
              href="/api/github/reconcile?next=/app/repositories"
            >
              Refresh GitHub access
            </Link>
          </div>
        </div>
      </header>

      {/* Setup notification banner (if redirected from GitHub connect) */}
      {setupMessage ? (
        <aside
          className={`repositories-notification ${setupStatus === 'connected' ? 'repositories-notification--success' : 'repositories-notification--info'}`}
          role="status"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="repositories-notification__body">
            <span className="notification-glyph" aria-hidden="true">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="7" cy="7" r="5.5" />
                <path d="M7 6.5v4" />
                <path d="M7 4.5h.01" />
              </svg>
            </span>
            <p>{setupMessage}</p>
          </div>
        </aside>
      ) : null}

      {/* 2. Access Management Modal Window Popup */}
      <RepositoryAccessModal
        isOpen={showAccessForm}
        onClose={() => setShowAccessForm(false)}
        selected={selected}
        setSelected={setSelected}
        repositories={repositories}
        primaryInstallation={primaryInstallation}
        status={status}
        setStatus={setStatus}
        toggle={toggle}
        save={save}
        closeBtnRef={closeBtnRef}
      />

      {/* 3. Search and Category Filter Toolbar */}
      <section
        className="repositories-toolbar"
        aria-label="Search and filter repositories"
        data-trace-motion="item"
        style={{ '--motion-index': 1 } as React.CSSProperties}
      >
        <div className="repositories-search">
          <span className="repositories-search-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="7" cy="7" r="5" />
              <path d="m11 11 3.5 3.5" />
            </svg>
          </span>
          <input
            id="repository-search-input"
            className="repositories-search-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories by name, branch, or status..."
            aria-label="Filter repositories"
          />
          {query ? (
            <button
              type="button"
              className="repositories-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : null}
        </div>

        <nav className="repositories-filter-nav" aria-label="Repository state filters">
          <button
            type="button"
            className="repositories-filter-button"
            data-active={activeFilter === 'all'}
            aria-pressed={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
          >
            <span className="filter-button__label">All</span>
            <span className="filter-button__sep" aria-hidden="true">
              ·
            </span>
            <span className="filter-count-badge">{counts.all}</span>
          </button>
          <button
            type="button"
            className="repositories-filter-button"
            data-active={activeFilter === 'current'}
            aria-pressed={activeFilter === 'current'}
            onClick={() => setActiveFilter('current')}
          >
            <span className="filter-button__label">Current</span>
            <span className="filter-button__sep" aria-hidden="true">
              ·
            </span>
            <span className="filter-count-badge">{counts.current}</span>
          </button>
          <button
            type="button"
            className="repositories-filter-button"
            data-active={activeFilter === 'attention'}
            aria-pressed={activeFilter === 'attention'}
            onClick={() => setActiveFilter('attention')}
          >
            <span className="filter-button__label">Attention</span>
            <span className="filter-button__sep" aria-hidden="true">
              ·
            </span>
            <span className="filter-count-badge">{counts.attention}</span>
          </button>
          <button
            type="button"
            className="repositories-filter-button"
            data-active={activeFilter === 'not-analyzed'}
            aria-pressed={activeFilter === 'not-analyzed'}
            onClick={() => setActiveFilter('not-analyzed')}
          >
            <span className="filter-button__label">Not analyzed</span>
            <span className="filter-button__sep" aria-hidden="true">
              ·
            </span>
            <span className="filter-count-badge">{counts.notAnalyzed}</span>
          </button>
        </nav>
      </section>

      {/* 4. Structured Repository Table Collection */}
      <section
        className="repositories-collection"
        aria-label="Managed repositories list"
        data-trace-motion="section"
        data-motion-section="repositories-table"
      >
        {filteredRepositories.length === 0 ? (
          <div
            className="repositories-empty-state"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <span className="empty-glyph" aria-hidden="true">
              ◌
            </span>
            <h3>
              {repositories.length === 0
                ? 'No repositories were granted'
                : 'No repositories match your filter'}
            </h3>
            <p>
              {repositories.length === 0
                ? 'The GitHub installation is connected, but it has not granted TRACE access to any repository.'
                : query
                  ? `No repositories found matching "${query}" with filter "${activeFilter}".`
                  : `No repositories in the "${activeFilter}" category.`}
            </p>
            <div className="repositories-empty-state__actions">
              {query ? (
                <button
                  type="button"
                  className="trace-button trace-button--secondary"
                  onClick={() => setQuery('')}
                >
                  Clear search
                </button>
              ) : null}
              {activeFilter !== 'all' ? (
                <button
                  type="button"
                  className="trace-button trace-button--secondary"
                  onClick={() => setActiveFilter('all')}
                >
                  View all repositories
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="repositories-table-container">
            <div
              className="repositories-collection__header"
              data-trace-motion="item"
              style={{ '--motion-index': 0 } as React.CSSProperties}
            >
              <p className="repositories-collection__caption">
                List of managed repositories and their synchronization status
              </p>
              <span className="repositories-collection__count">
                {filteredRepositories.length}{' '}
                {filteredRepositories.length === 1 ? 'repository' : 'repositories'}
              </span>
            </div>

            <div className="repositories-table-wrapper">
              <table className="repositories-table">
                <caption className="sr-only">
                  List of managed repositories and their synchronization status
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="col-identity">
                      Repository
                    </th>
                    <th scope="col" className="col-state">
                      Lifecycle State
                    </th>
                    <th scope="col" className="col-facts">
                      Findings & Reports
                    </th>
                    <th scope="col" className="col-sync">
                      Last Sync
                    </th>
                    <th scope="col" className="col-action">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRepositories.map((repo, idx) => (
                    <tr
                      className="repositories-row"
                      key={repo.id}
                      data-trace-motion="item"
                      style={{ '--motion-index': 1 + idx } as React.CSSProperties}
                    >
                      {/* Zone 1: Identity */}
                      <td className="col-identity">
                        <div className="repo-identity-cell">
                          <Link
                            className="repo-identity-name"
                            href={`/app/repositories/${repo.id}`}
                          >
                            {repo.fullName}
                          </Link>
                          <div className="repo-identity-tags">
                            <span className="repo-branch-pill">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 14 14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                aria-hidden="true"
                              >
                                <circle cx="4" cy="10" r="2" />
                                <circle cx="10" cy="4" r="2" />
                                <path d="M4 8V4c0-1.1.9-2 2-2h2" />
                              </svg>
                              {repo.defaultBranch ?? 'main'}
                            </span>
                            <span className="repo-visibility-pill">
                              {repo.visibility ?? 'private'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Zone 2: Lifecycle */}
                      <td className="col-state">
                        <div className="repo-state-cell">
                          <div className="repo-state-head">
                            <ProjectStatusGlyph stateKey={repo.state.key} />
                            <span className="repo-state-label">{repo.state.label}</span>
                          </div>
                          <p className="repo-state-description">{repo.state.description}</p>
                        </div>
                      </td>

                      {/* Zone 3: Intelligence Facts (14 findings · 5 reports) */}
                      <td className="col-facts">
                        <div className="repo-intelligence-cell">
                          <span className="intelligence-count-group">
                            <strong className="intelligence-number">{repo.findingsCount}</strong>{' '}
                            {repo.findingsCount === 1 ? 'finding' : 'findings'}
                          </span>
                          <span className="intelligence-sep" aria-hidden="true">
                            ·
                          </span>
                          <span className="intelligence-count-group">
                            <strong className="intelligence-number">{repo.reportsCount}</strong>{' '}
                            {repo.reportsCount === 1 ? 'report' : 'reports'}
                          </span>
                        </div>
                      </td>

                      {/* Zone 4: Synchronization (5d ago · 4953add) */}
                      <td className="col-sync">
                        <div className="repo-sync-cell">
                          <span className="sync-time">
                            {formatRelativeDate(repo.lastSynchronizedAt)}
                          </span>
                          <span className="sync-sep" aria-hidden="true">
                            ·
                          </span>
                          {repo.shortSha ? (
                            <code className="sync-sha">{repo.shortSha}</code>
                          ) : (
                            <span className="sync-sha-none">No sync commit</span>
                          )}
                        </div>
                      </td>

                      {/* Zone 5: Action */}
                      <td className="col-action">
                        <div className="repo-action-cell">
                          {repo.state.actionKind === 'local' ? (
                            <LocalActionPanel
                              repositoryName={repo.fullName}
                              title={repo.state.actionLabel ?? 'Update TRACE intelligence'}
                              description={repo.state.description}
                              commands={repo.localCommands}
                              triggerLabel={repo.state.actionLabel ?? 'Update TRACE'}
                              variant={repo.state.key === 'needs-refresh' ? 'primary' : 'secondary'}
                            />
                          ) : null}
                          <Link
                            className="trace-button trace-button--secondary repo-open-btn"
                            href={`/app/repositories/${repo.id}`}
                          >
                            Open project
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 5. GitHub Installation & Security Context (Secondary Card with Definition List) */}
      {primaryInstallation ? (
        <section
          className="repositories-installation-card"
          aria-labelledby="installation-card-title"
          data-trace-motion="section"
          data-motion-section="repositories-installation"
        >
          <div className="installation-card__header">
            <div
              className="installation-card__identity"
              data-trace-motion="item"
              style={{ '--motion-index': 0 } as React.CSSProperties}
            >
              <span className="eyebrow">GITHUB APP INTEGRATION</span>
              <h2 id="installation-card-title">GitHub account & access control</h2>
              <p>
                TRACE connects to GitHub as an official GitHub App with strict read-only
                permissions. Source code remains on your machine; only metadata, pull request
                summaries, and issue context are inspected.
              </p>
            </div>

            <dl
              className="installation-facts-grid"
              aria-label="GitHub integration details"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              <div className="installation-fact-item">
                <dt className="installation-fact-item__label">Account</dt>
                <dd className="installation-fact-item__val">
                  <code>{primaryInstallation.accountLogin}</code>
                </dd>
              </div>
              <div className="installation-fact-item">
                <dt className="installation-fact-item__label">Type</dt>
                <dd className="installation-fact-item__val">{primaryInstallation.accountType}</dd>
              </div>
              <div className="installation-fact-item">
                <dt className="installation-fact-item__label">Access</dt>
                <dd className="installation-fact-item__val">Read-only</dd>
              </div>
              <div className="installation-fact-item">
                <dt className="installation-fact-item__label">Status</dt>
                <dd className="installation-fact-item__val">Active</dd>
              </div>
            </dl>
          </div>

          <div
            className="installation-card__footer"
            data-trace-motion="item"
            style={{ '--motion-index': 2 } as React.CSSProperties}
          >
            <button
              type="button"
              className="trace-button trace-button--secondary"
              onClick={() => setShowAccessForm(true)}
              aria-haspopup="dialog"
            >
              Adjust repository selection ↑
            </button>
            <Link
              className="trace-button trace-button--secondary"
              href="/api/github/install?next=/app/repositories"
            >
              Configure GitHub App permissions ↗
            </Link>
            <Link
              className="trace-button trace-button--secondary"
              href="/api/github/reconcile?next=/app/repositories"
            >
              Refresh GitHub access
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RepositoryAccessModal({
  isOpen,
  onClose,
  selected,
  setSelected,
  repositories,
  primaryInstallation,
  status,
  setStatus,
  toggle,
  save,
  closeBtnRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  repositories: DashboardRepository[];
  primaryInstallation?: {
    id: string;
    accountLogin: string;
    accountType: string;
    state: string;
  };
  status: 'idle' | 'loading' | 'saved' | 'error';
  setStatus: (s: 'idle' | 'loading' | 'saved' | 'error') => void;
  toggle: (id: string) => void;
  save: (e: FormEvent<HTMLFormElement>) => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const presence = usePresence(isOpen);

  if (!presence.isMounted) return null;

  return (
    <PresenceContext.Provider value={presence}>
      <OverlayPortal>
        <ModalBackdrop
          onRequestClose={presence.requestClose}
          ariaLabel="Close repository access configuration"
        >
          <CenteredDialog
            size="md"
            titleId="repositories-access-title"
            onRequestClose={presence.requestClose}
            initialFocusRef={closeBtnRef}
            className="repositories-access-dialog repositories-access-drawer"
          >
            <div className="repositories-access-dialog__header" {...getMotionItemProps(0)}>
              <div className="repositories-access-dialog__eyebrow-row">
                <span className="eyebrow">ACCESS CONFIGURATION</span>
                <span className="access-selected-badge">
                  {selected.size} of {repositories.length} active
                </span>
              </div>
              <button
                ref={closeBtnRef}
                className="trace-dialog__close"
                type="button"
                aria-label="Close access configuration"
                onClick={() => presence.requestClose()}
              >
                ×
              </button>
            </div>

            <div className="repositories-access-dialog__intro" {...getMotionItemProps(1)}>
              <h2 id="repositories-access-title">Manage repository access</h2>
              <p>
                Select which repositories from{' '}
                <strong>{primaryInstallation?.accountLogin ?? 'GitHub'}</strong> TRACE should track
                in this workspace.
              </p>
            </div>

            <form className="repositories-access-form" onSubmit={save}>
              <div className="repositories-access-toolbar" {...getMotionItemProps(2)}>
                <span className="repositories-access-toolbar__label">Available repositories</span>
                <div className="repositories-access-toolbar__actions">
                  <button
                    type="button"
                    className="trace-link-btn"
                    onClick={() => {
                      setSelected(new Set(repositories.map((r) => r.id)));
                      setStatus('idle');
                    }}
                  >
                    Select all
                  </button>
                  <span className="trace-bullet-sep" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    className="trace-link-btn"
                    onClick={() => {
                      setSelected(new Set());
                      setStatus('idle');
                    }}
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              <fieldset className="repositories-access-fieldset" {...getMotionItemProps(3)}>
                <legend className="sr-only">Available repositories</legend>
                <div className="repositories-access-grid">
                  {repositories.map((repo) => {
                    const isActive = selected.has(repo.id);
                    return (
                      <label
                        className={`repositories-access-item ${isActive ? 'is-selected' : ''}`}
                        key={repo.id}
                      >
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => toggle(repo.id)}
                          className="repositories-access-checkbox"
                        />
                        <div className="repositories-access-item__info">
                          <strong>{repo.fullName}</strong>
                          <small>
                            {repo.visibility ?? 'repository'} · {repo.defaultBranch ?? 'main'}
                          </small>
                        </div>
                        <span
                          className={`access-item-state ${isActive ? 'is-active' : 'is-excluded'}`}
                        >
                          {isActive ? 'Active' : 'Excluded'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="repositories-access-actions" {...getMotionItemProps(4)}>
                <div className="repositories-access-actions__left">
                  <button
                    className="trace-button trace-button--primary"
                    type="submit"
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? 'Saving access...' : 'Save repository access'}
                  </button>
                  <Link
                    className="trace-button trace-button--tertiary"
                    href="/api/github/install?next=/app/repositories"
                    onClick={presence.requestClose}
                  >
                    Configure on GitHub ↗
                  </Link>
                </div>
                <div className="repositories-access-actions__right">
                  <button
                    className="trace-button trace-button--secondary"
                    type="button"
                    onClick={presence.requestClose}
                  >
                    Cancel
                  </button>
                </div>
                {status === 'saved' ? (
                  <span className="access-save-feedback is-success" role="status">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        verticalAlign: 'middle',
                        marginRight: '6px',
                      }}
                    >
                      <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
                    </svg>
                    Repository access saved successfully.
                  </span>
                ) : null}
                {status === 'error' ? (
                  <span className="access-save-feedback is-error" role="alert">
                    Failed to save selection. Please try again.
                  </span>
                ) : null}
              </div>
            </form>
          </CenteredDialog>
        </ModalBackdrop>
      </OverlayPortal>
    </PresenceContext.Provider>
  );
}
