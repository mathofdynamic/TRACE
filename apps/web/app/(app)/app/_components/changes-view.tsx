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
import { formatDate, formatRelativeDate } from '../../../../lib/dashboard-state';

interface ChangesViewProps {
  changes: DashboardChange[];
  repositories: DashboardRepository[];
  conflicts: DashboardSyncedRecord[];
  attention: DashboardAttention[];
}

export function ChangesView({ changes, repositories, conflicts, attention }: ChangesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [repositoryFilter, setRepositoryFilter] = useState<string>('all');
  const [relationshipFilter, setRelationshipFilter] = useState<string>('all');
  const [affectedAreaFilter, setAffectedAreaFilter] = useState<string>('all');
  const [groupingMode, setGroupingMode] = useState<'by-repository' | 'flat'>('by-repository');
  const [selectedChange, setSelectedChange] = useState<DashboardChange | null>(null);
  const [cachedChange, setCachedChange] = useState<DashboardChange | null>(null);

  useEffect(() => {
    if (selectedChange) {
      setCachedChange(selectedChange);
    }
  }, [selectedChange]);

  // Map conflicts to changes
  const conflictByChangeId = useMemo(() => {
    const map = new Map<
      string,
      {
        conflict: DashboardSyncedRecord;
        collidingChanges: DashboardChange[];
      }
    >();

    for (const change of changes) {
      // Find matching conflict
      const matchingConflict = conflicts.find((c) => {
        if (
          change.relatedConflictId &&
          (c.id === change.relatedConflictId || c.artifactId === change.relatedConflictId)
        ) {
          return true;
        }
        if (c.relatedChangeIds?.includes(change.id)) {
          return true;
        }
        if (c.items?.some((i) => i.changeId === change.id || i.changeNumber === change.number)) {
          return true;
        }
        return false;
      });

      if (matchingConflict) {
        // Find other changes that participate in the same conflict
        const collidingChanges = changes.filter(
          (other) =>
            other.id !== change.id &&
            (matchingConflict.relatedChangeIds?.includes(other.id) ||
              matchingConflict.items?.some(
                (i) => i.changeId === other.id || i.changeNumber === other.number,
              ) ||
              (other.relatedConflictId &&
                (matchingConflict.id === other.relatedConflictId ||
                  matchingConflict.artifactId === other.relatedConflictId))),
        );

        map.set(change.id, {
          conflict: matchingConflict,
          collidingChanges,
        });
      }
    }

    return map;
  }, [changes, conflicts]);

  // Extract unique affected areas across all changes
  const allAffectedAreas = useMemo(() => {
    const areas = new Set<string>();
    for (const change of changes) {
      if (change.affectedAreas) {
        for (const area of change.affectedAreas) {
          areas.add(area);
        }
      }
    }
    return Array.from(areas).sort();
  }, [changes]);

  // Filtered changes
  const filteredChanges = useMemo(() => {
    return changes.filter((change) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesPr = `#${change.number}`.includes(query) || `${change.number}`.includes(query);
        const matchesTitle = change.title.toLowerCase().includes(query);
        const matchesAuthor = change.authorLogin?.toLowerCase().includes(query) ?? false;
        const matchesBranch = change.branch?.toLowerCase().includes(query) ?? false;
        const matchesRepo = change.repositoryName.toLowerCase().includes(query);
        const matchesIntent = change.intent?.toLowerCase().includes(query) ?? false;
        const matchesArea =
          change.affectedAreas?.some((a) => a.toLowerCase().includes(query)) ?? false;
        const matchesFile =
          change.affectedFiles?.some((f) => f.toLowerCase().includes(query)) ?? false;

        if (
          !matchesPr &&
          !matchesTitle &&
          !matchesAuthor &&
          !matchesBranch &&
          !matchesRepo &&
          !matchesIntent &&
          !matchesArea &&
          !matchesFile
        ) {
          return false;
        }
      }

      // Repository filter
      if (repositoryFilter !== 'all') {
        if (
          change.repositoryId !== repositoryFilter &&
          change.repositoryName !== repositoryFilter
        ) {
          return false;
        }
      }

      // Relationship / status filter
      if (relationshipFilter !== 'all') {
        const conflictInfo = conflictByChangeId.get(change.id);
        if (relationshipFilter === 'conflict-linked' && !conflictInfo) {
          return false;
        }
        if (relationshipFilter === 'clean' && conflictInfo) {
          return false;
        }
        if (
          relationshipFilter === 'with-findings' &&
          (!change.relatedFindingIds || change.relatedFindingIds.length === 0)
        ) {
          return false;
        }
      }

      // Affected area filter
      if (affectedAreaFilter !== 'all') {
        if (!change.affectedAreas?.includes(affectedAreaFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [
    changes,
    searchQuery,
    repositoryFilter,
    relationshipFilter,
    affectedAreaFilter,
    conflictByChangeId,
  ]);

  // Group filtered changes by repository
  const groupedByRepository = useMemo(() => {
    const map = new Map<
      string,
      {
        repositoryId: string;
        repositoryName: string;
        changes: DashboardChange[];
      }
    >();

    for (const change of filteredChanges) {
      const existing = map.get(change.repositoryId);
      if (existing) {
        existing.changes.push(change);
      } else {
        map.set(change.repositoryId, {
          repositoryId: change.repositoryId,
          repositoryName: change.repositoryName,
          changes: [change],
        });
      }
    }

    return Array.from(map.values());
  }, [filteredChanges]);

  const activeFilterCount =
    (searchQuery.trim() !== '' ? 1 : 0) +
    (repositoryFilter !== 'all' ? 1 : 0) +
    (relationshipFilter !== 'all' ? 1 : 0) +
    (affectedAreaFilter !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setSearchQuery('');
    setRepositoryFilter('all');
    setRelationshipFilter('all');
    setAffectedAreaFilter('all');
  };

  // Truthful metrics summary
  const totalChangesCount = changes.length;
  const uniqueReposCount = new Set(changes.map((c) => c.repositoryId)).size;
  const conflictLinkedChangesCount = changes.filter((c) => conflictByChangeId.has(c.id)).length;
  const changesWithFindingsCount = changes.filter(
    (c) => c.relatedFindingIds && c.relatedFindingIds.length > 0,
  ).length;

  return (
    <div className="changes-surface" id="active-changes-surface">
      {/* Top Intelligence Summary Strip */}
      <section
        className="changes-summary-container changes-summary-bar"
        aria-label="Changes intelligence metrics"
        data-trace-motion="item"
        style={{ '--motion-index': 1 } as React.CSSProperties}
      >
        <div className="changes-summary-metric">
          <span className="changes-summary-metric__value">{totalChangesCount}</span>
          <span className="changes-summary-metric__label">Active changes</span>
        </div>
        <div className="changes-summary-divider" aria-hidden="true" />
        <div className="changes-summary-metric">
          <span className="changes-summary-metric__value">{uniqueReposCount}</span>
          <span className="changes-summary-metric__label">Repositories</span>
        </div>
        <div className="changes-summary-divider" aria-hidden="true" />
        <div className="changes-summary-metric">
          <span
            className={`changes-summary-metric__value ${
              conflictLinkedChangesCount > 0 ? 'changes-summary-metric__value--conflict' : ''
            }`}
          >
            {conflictLinkedChangesCount}
          </span>
          <span className="changes-summary-metric__label">Conflict linked</span>
        </div>
        <div className="changes-summary-divider" aria-hidden="true" />
        <div className="changes-summary-metric">
          <span className="changes-summary-metric__value">{changesWithFindingsCount}</span>
          <span className="changes-summary-metric__label">With findings</span>
        </div>
        <div className="changes-summary-note changes-summary-subline">
          <span>Local deterministic snapshots Â· Zero personal scoring</span>
        </div>
      </section>

      {/* Changes Toolbar */}
      <div
        className="changes-toolbar"
        role="search"
        aria-label="Filter and sort active changes"
        data-trace-motion="item"
        style={{ '--motion-index': 2 } as React.CSSProperties}
      >
        {/* Row 1: Search and View Mode Controls */}
        <div className="changes-toolbar__row changes-toolbar__row--primary">
          <div className="changes-toolbar__search">
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
                id="changes-search-input"
                className="trace-input changes-search-input"
                type="search"
                placeholder="Search by PR #, title, branch, author, or areaâ€¦"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search pull requests"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="search-clear-button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search input"
                >
                  Ã—
                </button>
              ) : null}
            </div>
          </div>

          <div className="changes-toolbar__count changes-toolbar__status">
            <span>
              Showing <strong>{filteredChanges.length}</strong> of {totalChangesCount} change
              {totalChangesCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="changes-toolbar__view-group">
            {/* Grouping Toggle */}
            <div className="view-mode-toggle" role="radiogroup" aria-label="Grouping mode">
              <button
                type="button"
                className={`view-mode-button ${groupingMode === 'by-repository' ? 'view-mode-button--active' : ''}`}
                onClick={() => setGroupingMode('by-repository')}
                aria-checked={groupingMode === 'by-repository'}
                role="radio"
              >
                Grouped
              </button>
              <button
                type="button"
                className={`view-mode-button ${groupingMode === 'flat' ? 'view-mode-button--active' : ''}`}
                onClick={() => setGroupingMode('flat')}
                aria-checked={groupingMode === 'flat'}
                role="radio"
              >
                Flat list
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Filter Selects, Reset, and Facets */}
        <div className="changes-toolbar__row changes-toolbar__row--filters">
          <div className="changes-toolbar__filters-group">
            {/* Repository Selector */}
            <div className="filter-select-group">
              <label htmlFor="changes-repo-filter" className="filter-select-label">
                Repository
              </label>
              <TraceSelect
                id="changes-repo-filter"
                value={repositoryFilter}
                onChange={setRepositoryFilter}
                ariaLabel="Filter by repository"
                options={[
                  { value: 'all', label: `All repositories (${changes.length})` },
                  ...repositories.map((repo) => ({
                    value: repo.id,
                    label: repo.name,
                    count: changes.filter((c) => c.repositoryId === repo.id).length,
                  })),
                ]}
              />
            </div>

            {/* Relationship / Status Filter */}
            <div className="filter-select-group">
              <label htmlFor="changes-relationship-filter" className="filter-select-label">
                Relationship
              </label>
              <TraceSelect
                id="changes-relationship-filter"
                value={relationshipFilter}
                onChange={setRelationshipFilter}
                ariaLabel="Filter by relationship"
                options={[
                  { value: 'all', label: `All relationships (${changes.length})` },
                  {
                    value: 'conflict-linked',
                    label: 'Conflict linked only',
                    count: conflictLinkedChangesCount,
                  },
                  {
                    value: 'with-findings',
                    label: 'With findings only',
                    count: changesWithFindingsCount,
                  },
                  {
                    value: 'clean',
                    label: 'Clean / Uncontested',
                    count: changes.length - conflictLinkedChangesCount,
                  },
                ]}
              />
            </div>

            {/* Affected Area Filter */}
            {allAffectedAreas.length ? (
              <div className="filter-select-group">
                <label htmlFor="changes-area-filter" className="filter-select-label">
                  Affected area
                </label>
                <TraceSelect
                  id="changes-area-filter"
                  value={affectedAreaFilter}
                  onChange={setAffectedAreaFilter}
                  ariaLabel="Filter by architectural area"
                  options={[
                    { value: 'all', label: 'All architectural areas' },
                    ...allAffectedAreas.map((area) => ({
                      value: area,
                      label: area,
                    })),
                  ]}
                />
              </div>
            ) : null}
          </div>

          {/* Reset Filters */}
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="trace-button trace-button--secondary trace-button--small filter-reset-button"
              onClick={resetFilters}
            >
              Reset filters ({activeFilterCount})
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Content Area */}
      {filteredChanges.length === 0 ? (
        <div
          className="changes-empty-panel"
          role="status"
          data-trace-motion="item"
          style={{ '--motion-index': 3 } as React.CSSProperties}
        >
          <div className="changes-empty-icon" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3>No active changes match your filters</h3>
          <p>
            Adjust your search query or reset filter selections to inspect all {totalChangesCount}{' '}
            tracked pull request snapshots.
          </p>
          <button
            type="button"
            className="trace-button trace-button--secondary trace-button--small"
            onClick={resetFilters}
          >
            Reset all filters
          </button>
        </div>
      ) : groupingMode === 'by-repository' ? (
        /* Grouped View */
        <div
          className="changes-grouped-container"
          data-trace-motion="section"
          data-motion-section="changes-grouped-list"
        >
          {groupedByRepository.map((group, groupIdx) => {
            const repo = repositories.find((r) => r.id === group.repositoryId);
            return (
              <section
                key={group.repositoryId}
                className="changes-repo-section"
                aria-labelledby={`repo-heading-${group.repositoryId}`}
                data-trace-motion="item"
                style={{ '--motion-index': groupIdx } as React.CSSProperties}
              >
                <div className="changes-repo-section__header">
                  <div className="changes-repo-section__title-group">
                    <h2
                      id={`repo-heading-${group.repositoryId}`}
                      className="changes-repo-section__title"
                    >
                      <Link href={`/app/repositories/${group.repositoryId}`}>
                        {group.repositoryName}
                      </Link>
                    </h2>
                    <span className="changes-repo-section__count-badge">
                      {group.changes.length} change{group.changes.length === 1 ? '' : 's'}
                    </span>
                    {repo?.defaultBranch ? (
                      <span className="changes-repo-section__branch">
                        default: <code>{repo.defaultBranch}</code>
                      </span>
                    ) : null}
                  </div>
                  <Link
                    className="changes-repo-section__view-link"
                    href={`/app/repositories/${group.repositoryId}/changes`}
                  >
                    View repository changes â†’
                  </Link>
                </div>

                <div className="changes-list">
                  {group.changes.map((change, changeIdx) => {
                    const conflictInfo = conflictByChangeId.get(change.id);
                    return (
                      <ChangeRow
                        key={change.id}
                        change={change}
                        conflictInfo={conflictInfo}
                        showRepo={false}
                        onInspect={() => setSelectedChange(change)}
                        motionIndex={changeIdx}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* Flat List View */
        <div
          className="changes-list changes-list--flat"
          data-trace-motion="section"
          data-motion-section="changes-flat-list"
        >
          {filteredChanges.map((change, idx) => {
            const conflictInfo = conflictByChangeId.get(change.id);
            return (
              <ChangeRow
                key={change.id}
                change={change}
                conflictInfo={conflictInfo}
                showRepo={true}
                onInspect={() => setSelectedChange(change)}
                motionIndex={idx}
              />
            );
          })}
        </div>
      )}

      {/* Change Inspection Drawer */}
      {cachedChange ? (
        <ChangeDetailDrawer
          change={cachedChange}
          conflictInfo={conflictByChangeId.get(cachedChange.id)}
          attention={attention}
          isOpen={Boolean(selectedChange)}
          onClose={() => setSelectedChange(null)}
        />
      ) : null}
    </div>
  );
}

interface ChangeRowProps {
  change: DashboardChange;
  conflictInfo?: {
    conflict: DashboardSyncedRecord;
    collidingChanges: DashboardChange[];
  };
  showRepo?: boolean;
  onInspect: () => void;
  motionIndex?: number;
}

function ChangeRow({
  change,
  conflictInfo,
  showRepo = false,
  onInspect,
  motionIndex,
}: ChangeRowProps) {
  const relatedFindingsCount = change.relatedFindingIds?.length ?? 0;

  return (
    <article
      className="change-row-card"
      id={`change-card-${change.id}`}
      data-trace-motion="item"
      style={
        motionIndex !== undefined
          ? ({ '--motion-index': motionIndex } as React.CSSProperties)
          : undefined
      }
    >
      {/* Topline: PR Number, State, Repo, and Updated time */}
      <div className="change-row-card__topline">
        <div className="change-row-card__identity">
          <span className="change-pr-badge">PR #{change.number}</span>
          <span className="change-state-badge" data-state={change.state}>
            {change.state.toUpperCase()}
          </span>
          {showRepo ? (
            <span className="change-repo-tag">
              <Link href={`/app/repositories/${change.repositoryId}`}>{change.repositoryName}</Link>
            </span>
          ) : null}
        </div>
        <time className="change-row-card__timestamp" dateTime={change.updatedAt}>
          Updated {formatRelativeDate(change.updatedAt)}
        </time>
      </div>

      {/* Main Title & Intent */}
      <div className="change-row-card__body">
        <h3 className="change-row-card__title">
          <button type="button" className="change-row-card__title-btn" onClick={onInspect}>
            {change.title}
          </button>
        </h3>
        {change.intent ? <p className="change-row-card__intent">{change.intent}</p> : null}
      </div>

      {/* Conflict Coordination Callout (High Signal Relationship Cue) */}
      {conflictInfo ? (
        <div className="change-conflict-callout" role="alert">
          <div className="change-conflict-callout__header">
            <span className="change-conflict-glyph" aria-hidden="true">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polygon points="12 2 2 22 22 22 12 2" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <strong className="change-conflict-label">Conflict linked</strong>
            {conflictInfo.collidingChanges.length ? (
              <span className="change-conflict-target">
                Collides with{' '}
                {conflictInfo.collidingChanges.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 ? ', ' : ''}
                    <strong>PR #{c.number}</strong> ({c.authorLogin} Â· <code>{c.branch}</code>)
                  </span>
                ))}
              </span>
            ) : null}
          </div>
          <p className="change-conflict-summary">{conflictInfo.conflict.summary}</p>
        </div>
      ) : null}

      {/* Metadata Footprint: Author, Branch, Areas, Findings */}
      <div className="change-row-card__footer">
        <div className="change-row-card__meta-tags">
          <span className="change-meta-item change-author">
            <span className="meta-icon" aria-hidden="true">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span>{change.authorLogin ?? 'Author unavailable'}</span>
          </span>

          {change.branch ? (
            <span className="change-meta-item change-branch">
              <span className="meta-icon" aria-hidden="true">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </span>
              <code>{change.branch}</code>
            </span>
          ) : null}

          {change.headSha ? (
            <span className="change-meta-item change-sha" title={change.headSha}>
              <code>{change.headSha.slice(0, 7)}</code>
            </span>
          ) : null}

          {change.affectedAreas?.map((area) => (
            <span key={area} className="change-area-pill">
              {area}
            </span>
          ))}

          {relatedFindingsCount > 0 ? (
            <span className="change-findings-badge">
              {relatedFindingsCount} finding{relatedFindingsCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        <div className="change-row-card__actions">
          <button
            type="button"
            className="trace-button trace-button--secondary trace-button--small change-inspect-btn"
            onClick={onInspect}
          >
            Inspect details
          </button>
          {change.url ? (
            <a
              className="trace-button trace-button--secondary trace-button--small change-github-link"
              href={change.url}
              target="_blank"
              rel="noreferrer"
            >
              Open on GitHub â†—
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

interface ChangeDetailDrawerProps {
  change: DashboardChange;
  conflictInfo?: {
    conflict: DashboardSyncedRecord;
    collidingChanges: DashboardChange[];
  };
  attention: DashboardAttention[];
  isOpen: boolean;
  onClose: () => void;
}

function ChangeDetailDrawer({
  change,
  conflictInfo,
  attention,
  isOpen,
  onClose,
}: ChangeDetailDrawerProps) {
  const presence = usePresence(isOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const relatedFindings = attention.filter(
    (a) =>
      change.relatedFindingIds?.includes(a.id) ||
      a.relatedChangeId === change.id ||
      a.relatedChangeNumber === change.number,
  );

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

  const copyCliCommand = () => {
    const cmd = `trace pr inspect ${change.number}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!presence.isMounted) return null;

  return (
    <OverlayPortal>
      <ModalBackdrop onClose={onClose} ariaLabel="Close change details">
        <CenteredDialog
          size="lg"
          titleId={`change-drawer-title-${change.id}`}
          onClose={onClose}
          initialFocusRef={closeRef}
          className="change-drawer"
        >
          {/* Header */}
          <div className="change-drawer__header" {...getMotionItemProps(0)}>
            <div className="change-drawer__eyebrow">
              <span className="change-pr-badge">PR #{change.number}</span>
              <span className="change-state-badge" data-state={change.state}>
                {change.state.toUpperCase()}
              </span>
              <span className="change-repo-tag">{change.repositoryName}</span>
            </div>
            <button
              ref={closeRef}
              className="trace-dialog__close"
              type="button"
              aria-label="Close change details"
              onClick={onClose}
            >
              Ã—
            </button>
          </div>

          {/* Title and Intro */}
          <div className="change-drawer__intro" {...getMotionItemProps(1)}>
            <h2 id={`change-drawer-title-${change.id}`}>{change.title}</h2>
          </div>

          {/* Main Two-Column Content Layout */}
          <div className="change-drawer__columns" {...getMotionItemProps(2)}>
            {/* Left Column: Intent, Technical Context, Affected Files */}
            <div className="change-drawer__column change-drawer__column--left">
              {change.intent ? (
                <section className="change-drawer__section">
                  <span className="eyebrow">Architectural intent</span>
                  <p className="change-drawer__lead">{change.intent}</p>
                </section>
              ) : null}

              <section className="change-drawer__section">
                <span className="eyebrow">Technical context</span>
                <div className="change-drawer__grid">
                  <div>
                    <span className="detail-label">Author</span>
                    <strong>@{change.authorLogin ?? 'Author unavailable'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Source branch</span>
                    <code title={change.branch ?? 'branch unavailable'}>
                      {change.branch ?? 'branch unavailable'}
                    </code>
                  </div>
                  <div>
                    <span className="detail-label">Base branch</span>
                    <code title={change.baseBranch ?? 'main'}>{change.baseBranch ?? 'main'}</code>
                  </div>
                  <div>
                    <span className="detail-label">Head commit SHA</span>
                    <code title={change.headSha ?? 'SHA unavailable'}>
                      {change.headSha ? change.headSha.slice(0, 7) : 'SHA unavailable'}
                    </code>
                  </div>
                  {change.affectedAreas?.length ? (
                    <div>
                      <span className="detail-label">Affected areas</span>
                      <span>{change.affectedAreas.join(', ')}</span>
                    </div>
                  ) : null}
                  <div>
                    <span className="detail-label">Snapshot timestamp</span>
                    <span>{formatDate(change.updatedAt)}</span>
                  </div>
                </div>
              </section>

              {change.affectedFiles?.length ? (
                <section className="change-drawer__section">
                  <span className="eyebrow">Affected files ({change.affectedFiles.length})</span>
                  <ul className="change-drawer__file-list">
                    {change.affectedFiles.map((file) => (
                      <li key={file}>
                        <code title={file}>{file}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            {/* Right Column: Coordination Conflict, AST Findings, Local Review Command */}
            <div className="change-drawer__column change-drawer__column--right">
              {conflictInfo ? (
                <section className="change-drawer__section change-drawer__section--conflict">
                  <span className="eyebrow">Active Coordination Conflict</span>
                  <div className="change-drawer__conflict-box">
                    <div className="conflict-box__header">
                      <strong>{conflictInfo.conflict.title}</strong>
                    </div>
                    <p>{conflictInfo.conflict.summary}</p>
                    {conflictInfo.collidingChanges.length ? (
                      <div className="conflict-box__colliding">
                        <span className="conflict-box__subhead">Colliding pull requests:</span>
                        <ul>
                          {conflictInfo.collidingChanges.map((c) => (
                            <li key={c.id}>
                              <strong>PR #{c.number}</strong> ({c.title}) â€” Branch:{' '}
                              <code>{c.branch}</code> by @{c.authorLogin}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {conflictInfo.conflict.items?.length ? (
                      <div className="conflict-box__evidence">
                        <span className="conflict-box__subhead">
                          Deterministic AST collision points:
                        </span>
                        <ul>
                          {conflictInfo.conflict.items.map((item) => (
                            <li key={item.id}>
                              <strong>{item.title}</strong>: {item.detail}
                              {item.evidence?.length ? (
                                <div className="conflict-box__file-tags">
                                  {item.evidence.map((e) => (
                                    <code key={e}>{e}</code>
                                  ))}
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {relatedFindings.length ? (
                <section className="change-drawer__section">
                  <span className="eyebrow">Related AST findings ({relatedFindings.length})</span>
                  <div className="change-drawer__findings-list">
                    {relatedFindings.map((finding) => (
                      <div key={finding.id} className="change-drawer__finding-card">
                        <div className="finding-card__header">
                          <span className="severity-badge" data-severity={finding.severity}>
                            {finding.severity}
                          </span>
                          <strong>{finding.title}</strong>
                        </div>
                        <p>{finding.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="change-drawer__section">
                <span className="eyebrow">Local review command</span>
                <div className="change-drawer__cli-box">
                  <code>trace pr inspect {change.number}</code>
                  <button
                    type="button"
                    className="trace-button trace-button--secondary trace-button--small"
                    onClick={copyCliCommand}
                  >
                    {copied ? (
                      <>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          style={{ marginRight: '6px' }}
                        >
                          <polyline points="3 8 7 12 13 4" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          style={{ marginRight: '6px' }}
                        >
                          <rect x="5" y="5" width="9" height="9" rx="1.5" />
                          <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
                        </svg>
                        Copy command
                      </>
                    )}
                  </button>
                </div>
                <p className="change-drawer__cli-note">
                  Run on your local computer to verify AST invariants before merging.
                </p>
              </section>
            </div>
          </div>

          {/* Drawer Actions */}
          <div className="change-drawer__footer" {...getMotionItemProps(3)}>
            <button
              type="button"
              className="trace-button trace-button--secondary"
              onClick={onClose}
            >
              Close
            </button>
            {change.url ? (
              <a
                className="trace-button trace-button--secondary"
                href={change.url}
                target="_blank"
                rel="noreferrer"
              >
                Open PR #{change.number} on GitHub â†—
              </a>
            ) : null}
          </div>
        </CenteredDialog>
      </ModalBackdrop>
    </OverlayPortal>
  );
}
