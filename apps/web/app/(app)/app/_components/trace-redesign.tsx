'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { OverlayPortal, ModalBackdrop, CenteredDialog, PresenceContext } from './overlay-portal';
import { usePresence, getMotionItemProps } from '../../../../lib/entrance-motion';
import type { DashboardAttention, DashboardRepository } from '../../../../lib/dashboard';
import {
  deriveTraceProjectState,
  formatDate,
  formatRelativeDate,
  isFileEvidenceReference,
  presentFindingDetail,
  stateToneClass,
  type TraceProjectStateKey,
} from '../../../../lib/dashboard-state';

export function StateMark({ tone = 'neutral' }: { tone?: string }) {
  return <span className={`state-mark state-mark--${tone}`} aria-hidden="true" />;
}

export function ProjectStatusGlyph({
  stateKey,
  className = '',
}: {
  stateKey: TraceProjectStateKey;
  className?: string;
}) {
  if (stateKey === 'current') {
    return (
      <span
        className={`project-status-glyph project-status-glyph--current ${className}`}
        aria-hidden="true"
        title="Current with GitHub"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
        </svg>
      </span>
    );
  }
  if (stateKey === 'needs-refresh') {
    return (
      <span
        className={`project-status-glyph project-status-glyph--refresh ${className}`}
        aria-hidden="true"
        title="Needs refresh"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 7a5 5 0 1 0 1.5-3.5M2 2.5v3.2h3.2" />
        </svg>
      </span>
    );
  }
  if (stateKey === 'sync-attention' || stateKey === 'analysis-failed') {
    return (
      <span
        className={`project-status-glyph project-status-glyph--attention ${className}`}
        aria-hidden="true"
        title="Attention needed"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 2.2 12.8 12H1.2L7 2.2zM7 5.8v3.2M7 10.2v.2" />
        </svg>
      </span>
    );
  }
  if (stateKey === 'connected-not-analyzed' || stateKey === 'not-connected') {
    return (
      <span
        className={`project-status-glyph project-status-glyph--setup ${className}`}
        aria-hidden="true"
        title="Not analyzed"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="4.5" strokeDasharray="2.2 2.2" />
        </svg>
      </span>
    );
  }
  if (stateKey === 'analysis-running' || stateKey === 'syncing') {
    return (
      <span
        className={`project-status-glyph project-status-glyph--running ${className}`}
        aria-hidden="true"
        title="Analyzing"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="4.5" opacity="0.3" />
          <path d="M7 2.5a4.5 4.5 0 0 1 4.5 4.5" />
        </svg>
      </span>
    );
  }
  if (stateKey === 'analysis-available-locally') {
    return (
      <span
        className={`project-status-glyph project-status-glyph--local ${className}`}
        aria-hidden="true"
        title="Ready to sync"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 11V3.5M3.5 6.8 7 3.5l3.5 3.3" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`project-status-glyph project-status-glyph--neutral ${className}`}
      aria-hidden="true"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="7" cy="7" r="2.5" />
      </svg>
    </span>
  );
}

export function TraceRail({ state }: { state: TraceProjectStateKey }) {
  const completion =
    state === 'current'
      ? 4
      : state === 'needs-refresh'
        ? 3
        : state === 'synced-freshness-unavailable'
          ? 3
          : state === 'sync-attention'
            ? 2
            : state === 'analysis-available-locally'
              ? 2
              : state === 'connected-not-analyzed'
                ? 1
                : state === 'analysis-running'
                  ? 1
                  : state === 'analysis-failed'
                    ? 1
                    : state === 'not-connected'
                      ? 0
                      : 1;
  const failed = state === 'sync-attention' || state === 'analysis-failed';
  const labels = [
    { long: 'GitHub', short: 'GitHub' },
    { long: 'Local analysis', short: 'Analyze' },
    { long: 'Synced record', short: 'Sync' },
    { long: 'Freshness', short: 'Fresh' },
  ];
  return (
    <ol className="trace-rail" aria-label="TRACE project lifecycle">
      {labels.map((label, index) => {
        const complete = index < completion || (state === 'current' && index === 3);
        const active = index === Math.min(completion, 3) && state !== 'current';
        const errored =
          failed &&
          ((state === 'sync-attention' && index === 2) ||
            (state === 'analysis-failed' && index === 1));
        const isLast = index === labels.length - 1;
        return (
          <li
            className={`trace-rail__step${complete ? ' is-complete' : ''}${active ? ' is-active' : ''}${errored ? ' is-error' : ''}${isLast ? ' is-last' : ''}`}
            key={label.long}
            aria-label={label.long}
            title={label.long}
          >
            <div className="trace-rail__step-body">
              <span className="trace-rail__node">{errored ? '!' : complete ? '✓' : index + 1}</span>
              <span className="trace-rail__label">
                <span className="trace-rail__label-long">{label.long}</span>
                <span className="trace-rail__label-short">{label.short}</span>
              </span>
            </div>
            {!isLast ? <span className="trace-rail__line" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard)
    return navigator.clipboard.writeText(value);
  return Promise.resolve();
}

export function LocalActionPanel({
  repositoryName,
  title = 'Update TRACE intelligence',
  description,
  commands = [],
  triggerLabel = 'Update TRACE',
  variant = 'primary',
  buttonClassName,
}: {
  repositoryName?: string;
  title?: string;
  description?: string;
  commands?: string[];
  triggerLabel?: string;
  variant?: 'primary' | 'secondary';
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const [copied, setCopied] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') presence.requestClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    return () => setCopied(null);
  }, [open]);
  useEffect(() => {
    if (!open) triggerRef.current?.focus();
  }, [open]);
  const allCommands = commands.join('\n');
  async function handleCopy(value: string, key: string) {
    await copyText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
  }
  const buttonClass =
    buttonClassName ??
    (variant === 'primary'
      ? 'trace-button trace-button--primary'
      : 'trace-button trace-button--secondary');

  return (
    <>
      <button ref={triggerRef} className={buttonClass} type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {presence.isMounted ? (
        <PresenceContext.Provider value={presence}>
          <OverlayPortal>
            <ModalBackdrop
              onRequestClose={presence.requestClose}
              ariaLabel="Close local action panel"
            >
              <CenteredDialog
                size="md"
                titleId="local-action-title"
                onRequestClose={presence.requestClose}
                initialFocusRef={closeRef}
              >
                <button
                  ref={closeRef}
                  className="trace-dialog__close"
                  type="button"
                  aria-label="Close local action panel"
                  onClick={() => presence.requestClose()}
                >
                  ×
                </button>
                <span className="eyebrow" {...getMotionItemProps(0)}>
                  Local TRACE workflow
                </span>
                <h2 id="local-action-title" {...getMotionItemProps(0)}>
                  {title}
                </h2>
                <p {...getMotionItemProps(1)}>
                  {description ??
                    `Run these commands from ${repositoryName ? `${repositoryName} on ` : ''}your computer.`}
                </p>
                <div className="local-action-panel__notice" {...getMotionItemProps(1)}>
                  <StateMark tone="info" />
                  <span>
                    Analysis stays on your computer. Only approved TRACE records are synchronized.
                  </span>
                </div>
                <ol className="local-action-commands" {...getMotionItemProps(2)}>
                  {commands.map((command, index) => (
                    <li key={command}>
                      <span>{index + 1}</span>
                      <code>{command}</code>
                      <button type="button" onClick={() => handleCopy(command, command)}>
                        {copied === command ? 'Copied' : 'Copy'}
                      </button>
                    </li>
                  ))}
                </ol>
                {!commands.some((command) => command.startsWith('trace sync')) ? (
                  <p className="local-action-panel__hint" {...getMotionItemProps(2)}>
                    Synchronization becomes available after local analysis creates an approved
                    record and a dashboard connection is present.
                  </p>
                ) : null}
                <div className="trace-dialog__actions" {...getMotionItemProps(3)}>
                  <button
                    className="trace-button trace-button--primary"
                    type="button"
                    onClick={() => handleCopy(allCommands, 'all')}
                  >
                    {copied === 'all' ? 'Commands copied' : 'Copy all commands'}
                  </button>
                  <Link
                    className="trace-button trace-button--tertiary"
                    href="/docs#local-dashboard"
                    onClick={presence.requestClose}
                  >
                    Learn how local analysis works
                  </Link>
                </div>
              </CenteredDialog>
            </ModalBackdrop>
          </OverlayPortal>
        </PresenceContext.Provider>
      ) : null}
    </>
  );
}

export function RepositorySwitcher({
  repositories,
  attention,
  preferredRepositoryId,
}: {
  repositories: DashboardRepository[];
  attention: DashboardAttention[];
  preferredRepositoryId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentId = pathname.match(/\/app\/repositories\/([^/]+)/)?.[1] ?? preferredRepositoryId;
  const current =
    repositories.find((repository) => repository.id === currentId) ?? repositories[0] ?? null;
  const currentState = deriveTraceProjectState(current, attention);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return repositories.filter(
      (repository) => !normalized || repository.fullName.toLowerCase().includes(normalized),
    );
  }, [query, repositories]);

  const withIntelligence = useMemo(
    () => filtered.filter((repository) => repository.latestSync || repository.analysis),
    [filtered],
  );

  const connectedOnly = useMemo(
    () => filtered.filter((repository) => !repository.latestSync && !repository.analysis),
    [filtered],
  );

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  function select(repository: DashboardRepository) {
    setOpen(false);
    setQuery('');
    router.push(`/app/repositories/${repository.id}`);
  }

  return (
    <div ref={containerRef} className="repository-context">
      <button
        ref={triggerRef}
        className="repository-context__trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Current repository: ${current?.fullName ?? 'Choose a repository'}, state: ${currentState.shortLabel}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="repository-context__identity">
          <strong>{current?.fullName ?? 'Choose a repository'}</strong>
        </span>
        {current ? (
          <span className={`state-pill ${stateToneClass(currentState.tone)}`}>
            <ProjectStatusGlyph stateKey={currentState.key} />
            <span>{currentState.shortLabel}</span>
          </span>
        ) : null}
        <span className="repository-context__chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {presence.isMounted ? (
        <>
          <button
            className="repository-switcher__scrim"
            type="button"
            aria-label="Close project switcher"
            onClick={() => setOpen(false)}
            data-trace-motion="surface"
            data-motion-variant="backdrop"
            data-presence-state={presence.presenceState}
          />
          <div
            className="repository-switcher"
            role="dialog"
            aria-label="Switch repository"
            aria-modal="true"
            data-trace-motion="surface"
            data-motion-variant="popover"
            data-presence-state={presence.presenceState}
          >
            <div className="repository-switcher__head" {...getMotionItemProps(0)}>
              <div>
                <span className="eyebrow">Project context</span>
                <strong>{current?.fullName ?? 'No repository selected'}</strong>
              </div>
              <button
                type="button"
                aria-label="Close repository switcher"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="repository-switcher__search-wrapper" {...getMotionItemProps(1)}>
              <span className="repository-switcher__search-icon" aria-hidden="true">
                <svg
                  width="13"
                  height="13"
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
                ref={searchRef}
                className="repository-switcher__search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects by name…"
                aria-label="Search repositories"
              />
              {query ? (
                <button
                  type="button"
                  className="repository-switcher__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              ) : null}
            </div>
            <div className="repository-switcher__body" {...getMotionItemProps(2)}>
              {filtered.length === 0 ? (
                <p className="repository-switcher__empty">
                  No repositories found matching &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <>
                  {withIntelligence.length > 0 ? (
                    <div className="repository-switcher__group">
                      <span className="repository-switcher__label">With TRACE intelligence</span>
                      {withIntelligence.map((repository) => (
                        <RepositorySwitcherRow
                          key={repository.id}
                          repository={repository}
                          attention={attention}
                          selected={repository.id === current?.id}
                          onSelect={() => select(repository)}
                        />
                      ))}
                    </div>
                  ) : null}

                  {connectedOnly.length > 0 ? (
                    <div className="repository-switcher__group">
                      <span className="repository-switcher__label">Connected</span>
                      {connectedOnly.map((repository) => (
                        <RepositorySwitcherRow
                          key={repository.id}
                          repository={repository}
                          attention={attention}
                          selected={repository.id === current?.id}
                          onSelect={() => select(repository)}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <Link
              className="repository-switcher__manage"
              href="/app/repositories"
              onClick={() => setOpen(false)}
              {...getMotionItemProps(3)}
            >
              <span>Manage repositories</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RepositorySwitcherRow({
  repository,
  attention,
  selected,
  onSelect,
}: {
  repository: DashboardRepository;
  attention: DashboardAttention[];
  selected: boolean;
  onSelect: () => void;
}) {
  const state = deriveTraceProjectState(repository, attention);
  return (
    <button
      className="repository-switcher__row"
      data-selected={selected || undefined}
      type="button"
      onClick={onSelect}
    >
      <ProjectStatusGlyph stateKey={state.key} className="repository-switcher__row-glyph" />
      <span className="repository-switcher__row-info">
        <strong>{repository.fullName}</strong>
        <small>
          {state.label}
          {repository.latestSync
            ? ` · ${formatRelativeDate(repository.latestSync.completedAt)}`
            : ''}
        </small>
      </span>
      {selected ? (
        <span className="repository-switcher__selected-indicator" aria-label="Current project">
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

export function ProjectContextSummary({
  repository,
  attention,
}: {
  repository: DashboardRepository | null;
  attention: DashboardAttention[];
}) {
  const state = deriveTraceProjectState(repository, attention);
  return (
    <div className="project-state-summary">
      <span className={`state-pill ${stateToneClass(state.tone)}`}>
        <ProjectStatusGlyph stateKey={state.key} />
        <span>{state.label}</span>
      </span>
      <p>{state.description}</p>
      {repository?.latestSync ? (
        <small>
          Last synced {formatRelativeDate(repository.lastSynchronizedAt)} ·{' '}
          {repository.latestSync.branch ?? repository.defaultBranch ?? 'default branch'} @{' '}
          {repository.latestSync.headCommit?.slice(0, 12) ?? 'unknown'}
        </small>
      ) : null}
    </div>
  );
}

export function FindingDisclosure({
  finding,
  repositoryName,
  repository,
}: {
  finding: DashboardAttention;
  repositoryName?: string | null;
  repository?: DashboardRepository | null;
}) {
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileEvidence = finding.evidence.filter(isFileEvidenceReference);
  const recordEvidence = finding.evidence.filter((item) => !isFileEvidenceReference(item));

  // Focus management and escape key listener
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          presence.requestClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open]);

  const analyzedCommitSha =
    finding.provenance?.analyzedCommit ??
    finding.analyzedCommit ??
    repository?.latestSync?.headCommit ??
    null;

  const branchName = repository?.latestSync?.branch ?? repository?.defaultBranch ?? 'main';

  return (
    <>
      <button
        ref={triggerRef}
        className="finding-row__open"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Review
      </button>
      {presence.isMounted ? (
        <PresenceContext.Provider value={presence}>
          <OverlayPortal>
            <ModalBackdrop onRequestClose={presence.requestClose} ariaLabel="Close finding details">
              <CenteredDialog
                size="lg"
                titleId={`finding-title-${finding.id}`}
                onRequestClose={presence.requestClose}
                initialFocusRef={closeRef}
                className="finding-drawer"
              >
                <div className="finding-drawer__header" {...getMotionItemProps(0)}>
                  <div className="finding-drawer__eyebrow">
                    <span className="severity-badge" data-severity={finding.severity}>
                      {finding.severity}
                    </span>
                    <span className="classification-pill">
                      {finding.classification === 'deterministic'
                        ? 'Verified evidence'
                        : 'Probabilistic'}
                    </span>
                    {finding.affectedArea ? (
                      <span className="affected-area-pill">{finding.affectedArea}</span>
                    ) : null}
                    {finding.relatedChangeNumber ? (
                      <span className="related-change-pill">PR #{finding.relatedChangeNumber}</span>
                    ) : null}
                  </div>
                  <button
                    ref={closeRef}
                    className="trace-dialog__close"
                    type="button"
                    aria-label="Close finding details"
                    onClick={() => presence.requestClose()}
                  >
                    ×
                  </button>
                </div>

                {/* 1. What Happened */}
                <div className="finding-drawer__intro" {...getMotionItemProps(1)}>
                  <h2 id={`finding-title-${finding.id}`}>{finding.title}</h2>
                  <p className="finding-drawer__lead">{presentFindingDetail(finding.detail)}</p>
                </div>

                {/* Responsive 2-Column Content Layout */}
                <div className="finding-drawer__body-grid" {...getMotionItemProps(2)}>
                  {/* Primary Left Column: Context, Reasoning & Evidence */}
                  <div className="finding-drawer__col-main">
                    {/* 2. Why this matters */}
                    <section className="finding-drawer__section finding-drawer__section--first">
                      <span className="eyebrow">Why TRACE flagged this</span>
                      <p className="finding-drawer__text">
                        {finding.classification === 'deterministic'
                          ? `Deterministic AST rule '${finding.provenance?.ruleId ?? 'code-rule'}' matched code patterns that violate local invariants. This condition directly affects ${finding.affectedArea ?? 'the codebase'} and should be addressed before merging.`
                          : `Heuristic evaluation flagged potential drift in ${finding.affectedArea ?? 'related components'}. Review the referenced evidence to verify impact on system stability.`}
                      </p>
                    </section>

                    {/* 3. Related Change (if present) */}
                    {finding.relatedChangeNumber ? (
                      <section className="finding-drawer__section">
                        <span className="eyebrow">Related change</span>
                        <div className="finding-drawer__fact-card">
                          <strong>Pull Request #{finding.relatedChangeNumber}</strong>
                          <p>
                            Observed in the context of active pull request #
                            {finding.relatedChangeNumber}.
                          </p>
                        </div>
                      </section>
                    ) : null}

                    {/* 4. Evidence & Locations */}
                    <section className="finding-drawer__section">
                      <span className="eyebrow">
                        Evidence ({finding.evidence.length} reference
                        {finding.evidence.length === 1 ? '' : 's'})
                      </span>
                      {fileEvidence.length ? (
                        <div className="finding-drawer__evidence-group">
                          <h3 className="finding-drawer__subheading">Affected file locations</h3>
                          <ul className="evidence-list evidence-list--enhanced">
                            {fileEvidence.map((item) => (
                              <li key={item} className="evidence-item">
                                <div className="evidence-item__icon" aria-hidden="true">
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                  </svg>
                                </div>
                                <div className="evidence-item__details">
                                  <code className="evidence-item__path">{item}</code>
                                  <span className="evidence-item__meta">
                                    {finding.classification === 'deterministic'
                                      ? 'Deterministic AST syntax match'
                                      : 'File reference'}
                                    {' · '}Verified by local trace CLI
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {recordEvidence.length ? (
                        <div className="finding-drawer__evidence-group">
                          <h3 className="finding-drawer__subheading">TRACE evidence records</h3>
                          <ul className="evidence-list evidence-list--enhanced">
                            {recordEvidence.map((item) => (
                              <li key={item} className="evidence-item">
                                <div className="evidence-item__icon" aria-hidden="true">
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <line x1="3" y1="9" x2="21" y2="9" />
                                    <line x1="9" y1="21" x2="9" y2="9" />
                                  </svg>
                                </div>
                                <div className="evidence-item__details">
                                  <code className="evidence-item__path">{item}</code>
                                  <span className="evidence-item__meta">
                                    Synchronized TRACE record
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {!finding.evidence.length ? (
                        <p className="drawer-muted">
                          No supporting evidence references were synchronized for this item.
                        </p>
                      ) : null}

                      <div className="finding-privacy-badge">
                        <span className="privacy-icon" aria-hidden="true">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 14 14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="2.5" y="5.5" width="9" height="7" rx="1.5" />
                            <path d="M4.5 5.5V3.5a2.5 2.5 0 0 1 5 0v2.5" />
                          </svg>
                        </span>
                        <span>
                          Zero source code exposure: TRACE analyzes AST locally and never uploads
                          code snippets or files.
                        </span>
                      </div>
                    </section>
                  </div>

                  {/* Secondary Right Column: Rule Metadata, Provenance & Privacy */}
                  <div className="finding-drawer__col-sidebar">
                    {/* 5. Origin & Verification */}
                    <section className="finding-drawer__section finding-drawer__section--first">
                      <span className="eyebrow">Origin & Rule details</span>
                      <div className="finding-drawer__grid">
                        <div>
                          <span className="detail-label">Repository</span>
                          <strong>
                            {repositoryName ?? repository?.fullName ?? 'Local workspace'}
                          </strong>
                        </div>
                        <div>
                          <span className="detail-label">Branch</span>
                          <code>{branchName}</code>
                        </div>
                        {finding.provenance?.ruleId ? (
                          <div>
                            <span className="detail-label">Rule ID</span>
                            <code>{finding.provenance.ruleId}</code>
                          </div>
                        ) : null}
                        <div>
                          <span className="detail-label">Verification source</span>
                          <span>Local CLI Analyzer</span>
                        </div>
                      </div>
                    </section>

                    {/* 6. Analyzed Commit & Freshness Boundary */}
                    <section className="finding-drawer__section">
                      <span className="eyebrow">Analyzed commit & Freshness</span>
                      <div className="finding-drawer__commit-info">
                        <span>
                          Analyzed at commit:{' '}
                          <code>
                            {analyzedCommitSha ? analyzedCommitSha.slice(0, 12) : 'local workspace'}
                          </code>
                        </span>
                        {finding.provenance?.isStaleWithRemote &&
                        finding.provenance.remoteHeadCommit ? (
                          <div className="stale-warning-box">
                            <strong>Newer commit on GitHub</strong>
                            <p>
                              Remote default branch has commit{' '}
                              <code>{finding.provenance.remoteHeadCommit.slice(0, 12)}</code>. Run{' '}
                              <code>trace analyze</code> locally to update findings against latest
                              remote changes.
                            </p>
                          </div>
                        ) : finding.provenance?.analyzedCommit &&
                          finding.provenance.remoteHeadCommit &&
                          finding.provenance.isStaleWithRemote === false ? (
                          <span className="freshness-ok">
                            Verified against current repository state.
                          </span>
                        ) : (
                          <span className="freshness-unknown">Verification unavailable.</span>
                        )}
                      </div>
                    </section>

                    {/* 7. Privacy & Security Boundary */}
                    <section className="finding-drawer__section">
                      <span className="eyebrow">Privacy & Security boundary</span>
                      <p className="finding-drawer__privacy-text">
                        Local-first guarantee: TRACE performs code analysis exclusively on your
                        machine. Raw source code, syntax trees, and sensitive repository contents
                        are never transmitted or retained in the cloud.
                      </p>
                    </section>

                    {/* 8. Technical Details Accordion */}
                    <details className="technical-details redesign-technical">
                      <summary>Technical provenance details</summary>
                      <div className="technical-details__content">
                        <div className="tech-row">
                          <span>Finding ID:</span>
                          <code>{finding.id}</code>
                        </div>
                        <div className="tech-row">
                          <span>Classification:</span>
                          <span>{finding.classification}</span>
                        </div>
                        <div className="tech-row">
                          <span>Severity Level:</span>
                          <span>{finding.severity}</span>
                        </div>
                        <div className="tech-row">
                          <span>Last Updated:</span>
                          <time dateTime={finding.updatedAt}>{formatDate(finding.updatedAt)}</time>
                        </div>
                        <div className="tech-notice">
                          <small>
                            TRACE finding records are immutable snapshots from local analysis runs.
                            Manual disposition controls (resolve, dismiss, or assign) are
                            intentionally excluded because TRACE enforces deterministic engineering
                            truth rather than subjective ticket status.
                          </small>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </CenteredDialog>
            </ModalBackdrop>
          </OverlayPortal>
        </PresenceContext.Provider>
      ) : null}
    </>
  );
}
