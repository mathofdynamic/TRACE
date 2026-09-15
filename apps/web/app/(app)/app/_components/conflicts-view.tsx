'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { TraceSelect } from './trace-select';
import { OverlayPortal, ModalBackdrop, CenteredDialog } from './overlay-portal';
import { usePresence, getMotionItemProps } from '../../../../lib/entrance-motion';
import type {
  DashboardAttention,
  DashboardChange,
  DashboardRepository,
  DashboardSyncedRecord,
} from '../../../../lib/dashboard';
import { formatDate } from '../../../../lib/dashboard-state';
import {
  type ConflictSide,
  type PairedConflictModel,
  resolvePairedConflict,
} from '../../../../lib/conflict-view-model';

// Re-export for backward compatibility with imports
export { resolvePairedConflict, type ConflictSide, type PairedConflictModel };

export interface ConflictsViewProps {
  conflicts: DashboardSyncedRecord[];
  changes: DashboardChange[];
  repositories: DashboardRepository[];
  attention: DashboardAttention[];
}

export function ConflictsView({ conflicts, changes, repositories, attention }: ConflictsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [repositoryFilter, setRepositoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [selectedConflict, setSelectedConflict] = useState<PairedConflictModel | null>(null);
  const [cachedConflict, setCachedConflict] = useState<PairedConflictModel | null>(null);

  useEffect(() => {
    if (selectedConflict) {
      setCachedConflict(selectedConflict);
    }
  }, [selectedConflict]);

  // Resolved paired conflict models
  const pairedConflicts = useMemo(() => {
    return conflicts.map((conflict) => resolvePairedConflict(conflict, changes, repositories));
  }, [conflicts, changes, repositories]);

  // Filtered conflicts
  const filteredConflicts = useMemo(() => {
    return pairedConflicts.filter((model) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = model.conflict.title.toLowerCase().includes(query);
        const matchesSummary = model.conflict.summary.toLowerCase().includes(query);
        const matchesRepo = model.conflict.repositoryName.toLowerCase().includes(query);
        const matchesTarget = model.sharedBoundary.target.toLowerCase().includes(query);
        const matchesSideA =
          model.sideA.title.toLowerCase().includes(query) ||
          model.sideA.badge.toLowerCase().includes(query) ||
          (model.sideA.author?.toLowerCase().includes(query) ?? false) ||
          (model.sideA.branch?.toLowerCase().includes(query) ?? false) ||
          model.sideA.locus.toLowerCase().includes(query);
        const matchesSideB =
          model.sideB.title.toLowerCase().includes(query) ||
          model.sideB.badge.toLowerCase().includes(query) ||
          (model.sideB.author?.toLowerCase().includes(query) ?? false) ||
          (model.sideB.branch?.toLowerCase().includes(query) ?? false) ||
          model.sideB.locus.toLowerCase().includes(query);
        const matchesEvidence = model.items.some(
          (i) =>
            i.title.toLowerCase().includes(query) ||
            i.detail.toLowerCase().includes(query) ||
            i.evidence.some((e) => e.toLowerCase().includes(query)),
        );

        if (
          !matchesTitle &&
          !matchesSummary &&
          !matchesRepo &&
          !matchesTarget &&
          !matchesSideA &&
          !matchesSideB &&
          !matchesEvidence
        ) {
          return false;
        }
      }

      // Repository filter
      if (repositoryFilter !== 'all') {
        if (
          model.conflict.repositoryId !== repositoryFilter &&
          model.conflict.repositoryName !== repositoryFilter
        ) {
          return false;
        }
      }

      // Severity filter
      if (severityFilter !== 'all') {
        if (model.severity !== severityFilter) {
          return false;
        }
      }

      return true;
    });
  }, [pairedConflicts, searchQuery, repositoryFilter, severityFilter]);

  const activeFilterCount =
    (searchQuery.trim() !== '' ? 1 : 0) +
    (repositoryFilter !== 'all' ? 1 : 0) +
    (severityFilter !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setSearchQuery('');
    setRepositoryFilter('all');
    setSeverityFilter('all');
  };

  // Metrics summary
  const totalConflictsCount = conflicts.length;
  const affectedReposCount = new Set(conflicts.map((c) => c.repositoryId)).size;
  const highSeverityCount = pairedConflicts.filter((c) => c.severity === 'high').length;
  const deterministicConflictsCount = pairedConflicts.filter(
    (c) =>
      c.classification.toLowerCase().includes('deterministic') ||
      c.items.some((i) => (i.classification ?? '').toLowerCase().includes('deterministic')),
  ).length;

  const selectedRepoObject = repositories.find((r) => r.id === repositoryFilter);

  return (
    <div className="conflicts-surface" id="conflicts-surface">
      {/* Top Intelligence Summary Strip */}
      <section
        className="conflicts-summary-bar"
        aria-label="Conflicts summary metrics"
        data-trace-motion="item"
        style={{ '--motion-index': 1 } as React.CSSProperties}
      >
        <div className="conflicts-summary-metric">
          <span className="conflicts-summary-metric__value">{totalConflictsCount}</span>
          <span className="conflicts-summary-metric__label">Active conflicts</span>
        </div>
        <div className="conflicts-summary-divider" aria-hidden="true" />
        <div className="conflicts-summary-metric">
          <span className="conflicts-summary-metric__value">{affectedReposCount}</span>
          <span className="conflicts-summary-metric__label">Affected repositories</span>
        </div>
        <div className="conflicts-summary-divider" aria-hidden="true" />
        <div className="conflicts-summary-metric">
          <span className="conflicts-summary-metric__value conflicts-summary-metric__value--high">
            {highSeverityCount}
          </span>
          <span className="conflicts-summary-metric__label">High impact</span>
        </div>
        <div className="conflicts-summary-divider" aria-hidden="true" />
        <div className="conflicts-summary-metric">
          <span className="conflicts-summary-metric__value">{deterministicConflictsCount}</span>
          <span className="conflicts-summary-metric__label">Deterministic AST</span>
        </div>
        <div className="conflicts-summary-note">
          <span>Deterministic invariant checks Ãƒâ€šÃ‚Â· Zero developer surveillance</span>
        </div>
      </section>

      {/* Toolbar & Filters */}
      <div
        className="conflicts-toolbar"
        role="search"
        aria-label="Filter and search conflicts"
        data-trace-motion="item"
        style={{ '--motion-index': 2 } as React.CSSProperties}
      >
        <div className="conflicts-toolbar__row conflicts-toolbar__row--primary">
          <div className="conflicts-toolbar__search">
            <div className="search-input-wrapper">
              <svg
                className="search-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="conflicts-search-input"
                className="trace-input conflicts-search-input"
                type="search"
                placeholder="Search by PR #, table, file path, author, or boundaryÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search conflicts"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="search-clear-button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search input"
                >
                  ÃƒÆ’Ã¢â‚¬â€
                </button>
              ) : null}
            </div>
          </div>
          <div className="conflicts-toolbar__count">
            <span>
              Showing {filteredConflicts.length} of {totalConflictsCount} conflicts
            </span>
          </div>
        </div>

        <div className="conflicts-toolbar__row conflicts-toolbar__row--filters">
          <div className="conflicts-toolbar__filters-group">
            {/* Repository Scope Selector */}
            <div className="filter-select-group">
              <label htmlFor="conflicts-repo-filter" className="filter-select-label">
                Repository
              </label>
              <TraceSelect
                id="conflicts-repo-filter"
                value={repositoryFilter}
                onChange={setRepositoryFilter}
                ariaLabel="Filter by repository"
                options={[
                  { value: 'all', label: `All repositories (${conflicts.length})` },
                  ...repositories.map((repo) => ({
                    value: repo.id,
                    label: repo.name,
                    count: conflicts.filter((c) => c.repositoryId === repo.id).length,
                  })),
                ]}
              />
            </div>

            {/* Severity / Impact Filter */}
            <div className="filter-select-group">
              <label htmlFor="conflicts-severity-filter" className="filter-select-label">
                Severity
              </label>
              <TraceSelect
                id="conflicts-severity-filter"
                value={severityFilter}
                onChange={setSeverityFilter}
                ariaLabel="Filter by severity"
                options={[
                  { value: 'all', label: `All severities (${conflicts.length})` },
                  { value: 'high', label: 'High impact only', count: highSeverityCount },
                  {
                    value: 'medium',
                    label: 'Medium impact only',
                    count: conflicts.length - highSeverityCount,
                  },
                ]}
              />
            </div>
          </div>

          {/* Reset Filters */}
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="trace-button trace-button--tertiary trace-button--small filter-reset-button"
              onClick={resetFilters}
            >
              Reset ({activeFilterCount})
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Conflict Listing / Empty State */}
      {filteredConflicts.length === 0 ? (
        /* Repository Specific or General Empty States */
        selectedRepoObject &&
        (selectedRepoObject.syncState === 'not_analyzed' ||
          !selectedRepoObject.lastSynchronizedAt ||
          selectedRepoObject.analysis?.status === 'not-started') ? (
          <div
            className="conflicts-empty-panel conflicts-empty-panel--pending"
            role="status"
            data-trace-motion="item"
            style={{ '--motion-index': 3 } as React.CSSProperties}
          >
            <div className="conflicts-empty-glyph" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="conflicts-empty-status-tag conflicts-empty-status-tag--pending">
              ANALYSIS PENDING Ãƒâ€šÃ‚Â· SETUP REQUIRED
            </span>
            <h3>Conflict analysis requires completed TRACE analysis.</h3>
            <p>
              {selectedRepoObject.name} has not yet completed local TRACE analysis. Run{' '}
              <code>trace analyze</code> locally and sync an approved conflict artifact before
              cross-branch AST invariants can be evaluated.
            </p>
            <div className="conflicts-empty-actions">
              <Link
                className="trace-button trace-button--primary trace-button--small"
                href={`/app/repositories/${selectedRepoObject.id}`}
              >
                Configure {selectedRepoObject.name} repository ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
              </Link>
              <button
                type="button"
                className="trace-button trace-button--secondary trace-button--small"
                onClick={resetFilters}
              >
                View all repositories
              </button>
            </div>
          </div>
        ) : selectedRepoObject && selectedRepoObject.lastSynchronizedAt ? (
          <div
            className="conflicts-empty-panel conflicts-empty-panel--complete"
            role="status"
            data-trace-motion="item"
            style={{ '--motion-index': 3 } as React.CSSProperties}
          >
            <div className="conflicts-empty-glyph" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <span className="conflicts-empty-status-tag">
              AST INVARIANTS CLEAN Ãƒâ€šÃ‚Â· ANALYSIS COMPLETE
            </span>
            <h3>No active engineering conflicts detected.</h3>
            <p>
              {selectedRepoObject.name} has passed all deterministic AST collision invariant checks
              across active branches. All active pull request snapshots in this repository are
              uncontested and safe for independent evaluation.
            </p>
            <div className="conflicts-empty-actions">
              <Link
                className="trace-button trace-button--secondary trace-button--small"
                href={`/app/repositories/${selectedRepoObject.id}`}
              >
                View {selectedRepoObject.name} repository overview ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
              </Link>
              <button
                type="button"
                className="trace-button trace-button--tertiary trace-button--small"
                onClick={resetFilters}
              >
                View all repositories
              </button>
            </div>
          </div>
        ) : (
          <div
            className="conflicts-empty-panel"
            role="status"
            data-trace-motion="item"
            style={{ '--motion-index': 3 } as React.CSSProperties}
          >
            <div className="conflicts-empty-glyph" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3>No conflicts match your filter criteria</h3>
            <p>
              Adjust your search query or reset filter selections to inspect all{' '}
              {totalConflictsCount} synchronized coordination conflicts.
            </p>
            <button
              type="button"
              className="trace-button trace-button--secondary trace-button--small"
              onClick={resetFilters}
            >
              Reset all filters
            </button>
          </div>
        )
      ) : (
        /* Paired Conflict Cards (High-Signal Progressive Disclosure) */
        <div
          className="conflicts-card-list"
          data-trace-motion="section"
          data-motion-section="conflicts-card-list"
        >
          {filteredConflicts.map((model, idx) => (
            <PairedConflictCard
              key={model.conflict.id}
              model={model}
              onInspect={() => setSelectedConflict(model)}
              motionIndex={idx}
            />
          ))}
        </div>
      )}

      {/* Centered Conflict Inspection Modal */}
      {cachedConflict ? (
        <ConflictDetailModal
          model={cachedConflict}
          attention={attention}
          isOpen={Boolean(selectedConflict)}
          onClose={() => setSelectedConflict(null)}
        />
      ) : null}
    </div>
  );
}

interface PairedConflictCardProps {
  model: PairedConflictModel;
  onInspect: () => void;
  motionIndex?: number;
}

function PairedConflictCard({ model, onInspect, motionIndex }: PairedConflictCardProps) {
  const { conflict, sideA, sideB, sharedBoundary, severity, classification, items } = model;

  return (
    <article
      className="conflict-card"
      id={`conflict-card-${conflict.id}`}
      data-trace-motion="item"
      style={
        motionIndex !== undefined
          ? ({ '--motion-index': motionIndex } as React.CSSProperties)
          : undefined
      }
    >
      {/* Topline: Repository, Provenance, Classification, Severity */}
      <div className="conflict-card__topline">
        <div className="conflict-card__provenance">
          <span className="conflict-repo-tag">
            <Link href={`/app/repositories/${conflict.repositoryId}`}>
              {conflict.repositoryName}
            </Link>
          </span>
          <span className="meta-sep" aria-hidden="true">
            Ãƒâ€šÃ‚Â·
          </span>
          <span className="conflict-provenance-text">
            Local snapshot Ãƒâ€šÃ‚Â· Synced {formatDate(conflict.syncedAt ?? conflict.generatedAt)}
          </span>
        </div>

        <div className="conflict-card__badges">
          <span className="conflict-classification-badge">{classification.toUpperCase()}</span>
          <span className="conflict-severity-badge" data-severity={severity}>
            {severity === 'high' ? 'HIGH IMPACT' : 'MEDIUM IMPACT'}
          </span>
        </div>
      </div>

      {/* Core Headline & Summary */}
      <div className="conflict-card__header">
        <h2 className="conflict-card__title">
          <button type="button" className="conflict-card__title-btn" onClick={onInspect}>
            {conflict.title}
          </button>
        </h2>
        <p className="conflict-card__summary">{conflict.summary}</p>
      </div>

      {/* COMPACT PAIRED SUMMARY: Change A ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬Â Shared Boundary ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬Â Change B */}
      <div className="conflict-compact-pair">
        {/* Side A Summary */}
        <div className="conflict-compact-item conflict-compact-item--a">
          <div className="compact-item-head">
            <span className="compact-item-role">SIDE A</span>
            <strong className="compact-item-badge">{sideA.badge}</strong>
            {sideA.area ? <span className="compact-item-area">{sideA.area}</span> : null}
          </div>
          <p className="compact-item-title">{sideA.title}</p>
        </div>

        {/* Center: Shared Boundary */}
        <div className="conflict-compact-boundary">
          <div className="compact-boundary-glyph" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
            </svg>
          </div>
          <span className="compact-boundary-label">SHARED BOUNDARY</span>
          <strong className="compact-boundary-target">{sharedBoundary.target}</strong>
        </div>

        {/* Side B Summary */}
        <div className="conflict-compact-item conflict-compact-item--b">
          <div className="compact-item-head">
            <span className="compact-item-role">SIDE B</span>
            <strong className="compact-item-badge">{sideB.badge}</strong>
            {sideB.area ? <span className="compact-item-area">{sideB.area}</span> : null}
          </div>
          <p className="compact-item-title">{sideB.title}</p>
        </div>
      </div>

      {/* Decision Line / Required Coordination */}
      <div className="conflict-card__decision-line">
        <span className="decision-tag">REQUIRED ACTION</span>
        <span className="decision-text">{sharedBoundary.actionRequired}</span>
      </div>

      {/* Card Footer Actions */}
      <div className="conflict-card__footer">
        <div className="conflict-card__evidence-summary">
          <span className="evidence-summary-glyph" aria-hidden="true">
            ÃƒÂ¢Ã¢â‚¬â€œÃ‚Âª
          </span>
          <span>
            {items.length} deterministic evidence reference{items.length === 1 ? '' : 's'} Ãƒâ€šÃ‚Â·
            AST collision
          </span>
        </div>

        <div className="conflict-card__actions">
          <button
            type="button"
            className="trace-button trace-button--primary trace-button--small"
            onClick={onInspect}
          >
            Inspect coordination plan
          </button>
        </div>
      </div>
    </article>
  );
}

interface ConflictDetailModalProps {
  model: PairedConflictModel;
  attention: DashboardAttention[];
  isOpen: boolean;
  onClose: () => void;
}

function ConflictDetailModal({ model, attention, isOpen, onClose }: ConflictDetailModalProps) {
  const presence = usePresence(isOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const { conflict, sideA, sideB, sharedBoundary, severity, classification, items } = model;

  const copyCliCommand = async () => {
    const cmd = `trace analyze --conflict ${conflict.id}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!presence.isMounted) return null;

  return (
    <OverlayPortal>
      <ModalBackdrop onClose={onClose} ariaLabel="Close conflict details">
        <CenteredDialog
          size="lg"
          titleId={`conflict-modal-title-${conflict.id}`}
          onClose={onClose}
          initialFocusRef={closeRef}
          className="conflict-drawer"
        >
          {/* Modal Header */}
          <div className="conflict-drawer__header" {...getMotionItemProps(0)}>
            <div className="conflict-drawer__eyebrow">
              <span className="conflict-repo-tag">{conflict.repositoryName}</span>
              <span className="conflict-classification-badge">{classification.toUpperCase()}</span>
              <span className="conflict-severity-badge" data-severity={severity}>
                {severity === 'high' ? 'HIGH IMPACT' : 'MEDIUM IMPACT'}
              </span>
            </div>
            <button
              ref={closeRef}
              className="trace-dialog__close"
              type="button"
              aria-label="Close conflict details"
              onClick={onClose}
            >
              ÃƒÆ’Ã¢â‚¬â€
            </button>
          </div>

          {/* Title and Summary Intro */}
          <div className="conflict-drawer__intro" {...getMotionItemProps(1)}>
            <h2 id={`conflict-modal-title-${conflict.id}`}>{conflict.title}</h2>
            <p className="conflict-drawer__lead">{conflict.summary}</p>
            <div className="conflict-drawer__provenance-row">
              <span className="provenance-label">Provenance:</span>
              <span className="provenance-value">
                Local deterministic snapshot Ãƒâ€šÃ‚Â· Synced{' '}
                {formatDate(conflict.syncedAt ?? conflict.generatedAt)}
              </span>
            </div>
          </div>

          {/* Shared Invariant Callout */}
          <section
            className="conflict-drawer__section conflict-drawer__section--boundary"
            {...getMotionItemProps(2)}
          >
            <span className="eyebrow">Shared Boundary Invariant</span>
            <div className="drawer-boundary-box">
              <strong className="drawer-boundary-box__target">{sharedBoundary.target}</strong>
              <p className="drawer-boundary-box__statement">{sharedBoundary.statement}</p>
              <div className="drawer-boundary-action">
                <span className="action-tag">Resolution guidance:</span>
                <span className="action-guidance">{sharedBoundary.actionRequired}</span>
              </div>
            </div>
          </section>

          {/* Paired Changes Details */}
          <section className="conflict-drawer__section" {...getMotionItemProps(3)}>
            <span className="eyebrow">Involved Branches & Changes</span>
            <div className="drawer-sides-grid">
              {/* Side A Full Card */}
              <div className="drawer-side-block drawer-side-block--a">
                <div className="drawer-side-block__head">
                  <span className="conflict-side-role-tag">SIDE A</span>
                  <strong className="drawer-side-badge">{sideA.badge}</strong>
                  {sideA.area ? <span className="drawer-side-area-pill">{sideA.area}</span> : null}
                </div>
                <h4 className="drawer-side-title">{sideA.title}</h4>
                <div className="drawer-side-meta">
                  {sideA.author ? <span>Author: @{sideA.author}</span> : null}
                  {sideA.branch ? (
                    <span>
                      Branch: <code>{sideA.branch}</code>
                    </span>
                  ) : null}
                  {sideA.locus ? (
                    <span>
                      Locus: <code>{sideA.locus}</code>
                    </span>
                  ) : null}
                </div>
                <div className="drawer-side-assumption">
                  <span className="assumption-label">Branch Assumption & State</span>
                  <p>{sideA.assumption}</p>
                </div>
                {sideA.url ? (
                  <div className="drawer-side-actions">
                    <a
                      className="trace-button trace-button--secondary trace-button--small"
                      href={sideA.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open {sideA.badge} on GitHub ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â€
                    </a>
                  </div>
                ) : null}
              </div>

              {/* Side B Full Card */}
              <div className="drawer-side-block drawer-side-block--b">
                <div className="drawer-side-block__head">
                  <span className="conflict-side-role-tag">SIDE B</span>
                  <strong className="drawer-side-badge">{sideB.badge}</strong>
                  {sideB.area ? <span className="drawer-side-area-pill">{sideB.area}</span> : null}
                </div>
                <h4 className="drawer-side-title">{sideB.title}</h4>
                <div className="drawer-side-meta">
                  {sideB.author ? <span>Author: @{sideB.author}</span> : null}
                  {sideB.branch ? (
                    <span>
                      Branch: <code>{sideB.branch}</code>
                    </span>
                  ) : null}
                  {sideB.locus ? (
                    <span>
                      Locus: <code>{sideB.locus}</code>
                    </span>
                  ) : null}
                </div>
                <div className="drawer-side-assumption">
                  <span className="assumption-label">System / Branch Assumption</span>
                  <p>{sideB.assumption}</p>
                </div>
                {sideB.url ? (
                  <div className="drawer-side-actions">
                    <a
                      className="trace-button trace-button--secondary trace-button--small"
                      href={sideB.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open {sideB.badge} on GitHub ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â€
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {/* Deterministic Evidence */}
          <section className="conflict-drawer__section" {...getMotionItemProps(4)}>
            <span className="eyebrow">Deterministic AST Evidence Items ({items.length})</span>
            <div className="drawer-evidence-list">
              {items.map((item) => (
                <div key={item.id} className="drawer-evidence-card">
                  <div className="drawer-evidence-card__head">
                    <div className="evidence-card-title-group">
                      <span className="evidence-glyph" aria-hidden="true">
                        ÃƒÂ¢Ã¢â‚¬â€œÃ‚Âª
                      </span>
                      <strong>{item.title}</strong>
                    </div>
                    <span className="evidence-classification-pill">{item.classification}</span>
                  </div>
                  <p>{item.detail}</p>
                  {item.evidence?.length ? (
                    <div className="drawer-evidence-card__paths">
                      {item.evidence.map((p) => (
                        <code key={p}>{p}</code>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {/* Local Verification Command */}
          <section className="conflict-drawer__section" {...getMotionItemProps(5)}>
            <span className="eyebrow">Local reproduction guidance</span>
            <div className="conflict-drawer__cli-box">
              <code>trace analyze</code>
              <button
                type="button"
                className="trace-button trace-button--secondary trace-button--small"
                onClick={copyCliCommand}
              >
                {copied ? 'Copied' : 'Copy command'}
              </button>
            </div>
            <p className="conflict-drawer__cli-note">
              Run deterministic change analysis in your local repository workspace to verify AST
              collision boundaries.
            </p>
          </section>

          {/* Modal Actions Footer */}
          <div className="conflict-drawer__footer" {...getMotionItemProps(6)}>
            <button
              type="button"
              className="trace-button trace-button--secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </CenteredDialog>
      </ModalBackdrop>
    </OverlayPortal>
  );
}

export function ConflictDetailDrawer(props: ConflictDetailModalProps) {
  return <ConflictDetailModal {...props} />;
}
