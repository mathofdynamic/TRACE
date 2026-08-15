'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
        return (
          <li
            className={`trace-rail__step${complete ? ' is-complete' : ''}${active ? ' is-active' : ''}${errored ? ' is-error' : ''}`}
            key={label.long}
            aria-label={label.long}
            title={label.long}
          >
            <span className="trace-rail__node">{errored ? '!' : complete ? '✓' : index + 1}</span>
            <span className="trace-rail__label">
              <span className="trace-rail__label-long">{label.long}</span>
              <span className="trace-rail__label-short">{label.short}</span>
            </span>
            {index < labels.length - 1 ? (
              <span className="trace-rail__line" aria-hidden="true" />
            ) : null}
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
}: {
  repositoryName?: string;
  title?: string;
  description?: string;
  commands?: string[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
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
  return (
    <>
      <button
        ref={triggerRef}
        className="trace-button trace-button--primary"
        type="button"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {open ? (
        <div className="trace-dialog-layer" role="presentation">
          <button
            className="trace-dialog-scrim"
            type="button"
            aria-label="Close local action panel"
            onClick={() => setOpen(false)}
          />
          <section
            className="trace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-action-title"
          >
            <button
              ref={closeRef}
              className="trace-dialog__close"
              type="button"
              aria-label="Close local action panel"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <span className="eyebrow">Local TRACE workflow</span>
            <h2 id="local-action-title">{title}</h2>
            <p>
              {description ??
                `Run these commands from ${repositoryName ? `${repositoryName} on ` : ''}your computer.`}
            </p>
            <div className="local-action-panel__notice">
              <StateMark tone="info" />
              <span>
                Analysis stays on your computer. Only approved TRACE records are synchronized.
              </span>
            </div>
            <ol className="local-action-commands">
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
              <p className="local-action-panel__hint">
                Synchronization becomes available after local analysis creates an approved record
                and a dashboard connection is present.
              </p>
            ) : null}
            <div className="trace-dialog__actions">
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
                onClick={() => setOpen(false)}
              >
                Learn how local analysis works
              </Link>
            </div>
          </section>
        </div>
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
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else triggerRef.current?.focus();
  }, [open]);
  function select(repository: DashboardRepository) {
    setOpen(false);
    setQuery('');
    router.push(`/app/repositories/${repository.id}`);
  }
  return (
    <div className="repository-context">
      <button
        ref={triggerRef}
        className="repository-context__trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="repository-context__identity">
          <small>Project</small>
          <strong>{current?.fullName ?? 'Choose a repository'}</strong>
        </span>
        {current ? (
          <span className={`state-pill ${stateToneClass(currentState.tone)}`}>
            <StateMark tone={currentState.tone} />
            {currentState.shortLabel}
          </span>
        ) : null}
        <span className="repository-context__chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open ? (
        <div className="repository-switcher" role="dialog" aria-label="Switch repository">
          <div className="repository-switcher__head">
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
          <input
            ref={searchRef}
            className="trace-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories…"
            aria-label="Search repositories"
          />
          <div className="repository-switcher__group">
            <span className="repository-switcher__label">With TRACE intelligence</span>
            {filtered
              .filter((repository) => repository.latestSync || repository.analysis)
              .map((repository) => (
                <RepositorySwitcherRow
                  key={repository.id}
                  repository={repository}
                  attention={attention}
                  selected={repository.id === current?.id}
                  onSelect={() => select(repository)}
                />
              ))}
            {!filtered.some((repository) => repository.latestSync || repository.analysis) ? (
              <p className="repository-switcher__empty">
                No analyzed repositories match this search.
              </p>
            ) : null}
          </div>
          <div className="repository-switcher__group">
            <span className="repository-switcher__label">Connected</span>
            {filtered
              .filter((repository) => !repository.latestSync && !repository.analysis)
              .map((repository) => (
                <RepositorySwitcherRow
                  key={repository.id}
                  repository={repository}
                  attention={attention}
                  selected={repository.id === current?.id}
                  onSelect={() => select(repository)}
                />
              ))}
          </div>
          <Link
            className="repository-switcher__manage"
            href="/app/repositories"
            onClick={() => setOpen(false)}
          >
            Manage repositories
          </Link>
        </div>
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
      <StateMark tone={state.tone} />
      <span>
        <strong>{repository.fullName}</strong>
        <small>
          {state.label}
          {repository.latestSync
            ? ` · ${formatRelativeDate(repository.latestSync.completedAt)}`
            : ''}
        </small>
      </span>
      <span className="repository-switcher__row-count">
        {repository.latestSync ? 'Open' : 'Setup'}
      </span>
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
        <StateMark tone={state.tone} />
        {state.label}
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileEvidence = finding.evidence.filter(isFileEvidenceReference);
  const recordEvidence = finding.evidence.filter((item) => !isFileEvidenceReference(item));
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  return (
    <>
      <button className="finding-row__open" type="button" onClick={() => setOpen(true)}>
        Review
      </button>
      {open ? (
        <div className="trace-dialog-layer" role="presentation">
          <button
            className="trace-dialog-scrim"
            type="button"
            aria-label="Close finding details"
            onClick={() => setOpen(false)}
          />
          <aside
            className="finding-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`finding-${finding.id}`}
          >
            <button
              ref={closeRef}
              className="trace-dialog__close"
              type="button"
              aria-label="Close finding details"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <div className="finding-drawer__eyebrow">
              <span data-severity={finding.severity}>{finding.severity}</span>
              <span>{finding.classification}</span>
            </div>
            <h2 id={`finding-${finding.id}`}>{finding.title}</h2>
            <p className="finding-drawer__lead">{presentFindingDetail(finding.detail)}</p>
            <section>
              <span className="eyebrow">Why TRACE flagged this</span>
              <p>{presentFindingDetail(finding.detail)}</p>
            </section>
            <section>
              <span className="eyebrow">Evidence</span>
              {fileEvidence.length ? (
                <>
                  <h3 className="finding-drawer__subheading">Affected locations</h3>
                  <ul className="evidence-list">
                    {fileEvidence.map((item) => (
                      <li key={item}>
                        <code>{item}</code>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="drawer-muted">No supporting file-level evidence was synchronized.</p>
              )}
              {recordEvidence.length ? (
                <>
                  <h3 className="finding-drawer__subheading">TRACE evidence records</h3>
                  <p className="drawer-muted">
                    These references are synchronized TRACE records, not raw source files.
                  </p>
                  <ul className="evidence-list">
                    {recordEvidence.map((item) => (
                      <li key={item}>
                        <code>{item}</code>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {!finding.evidence.length ? (
                <p className="drawer-muted">No supporting evidence record was synchronized.</p>
              ) : null}
            </section>
            <section>
              <span className="eyebrow">Origin and verification</span>
              <p>
                {repositoryName ?? 'Selected repository'} ·{' '}
                {repository?.latestSync?.branch ??
                  repository?.defaultBranch ??
                  'branch unavailable'}{' '}
                · {repository?.latestSync?.headCommit?.slice(0, 12) ?? 'commit unavailable'}
              </p>
              <small>Analysis remains local; only approved TRACE records are synchronized.</small>
            </section>
            <details className="technical-details">
              <summary>Technical details</summary>
              <p>
                Updated {formatDate(finding.updatedAt)}. No finding disposition controls are
                available because the current dashboard does not persist them.
              </p>
            </details>
          </aside>
        </div>
      ) : null}
    </>
  );
}
