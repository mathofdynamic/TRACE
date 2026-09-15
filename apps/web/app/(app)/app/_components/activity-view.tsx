'use client';

import { useId, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { TraceSelect } from './trace-select';
import type { DashboardActivity, DashboardRepository } from '../../../../lib/dashboard';

export type ActivityViewProps = {
  activities: DashboardActivity[];
  repositories: DashboardRepository[];
  initialSelectedRepoId?: string;
  initialCategory?: string;
};

export type ActivityCategory =
  | 'all'
  | 'report'
  | 'decision'
  | 'rule'
  | 'conflict'
  | 'analysis'
  | 'sync'
  | 'system';

export function deriveActivityCategory(activity: DashboardActivity): ActivityCategory {
  const title = activity.title.toLowerCase();
  const detail = activity.detail.toLowerCase();

  if (title.includes('decision recorded') || detail.includes('art-decision-')) {
    return 'decision';
  }
  if (
    title.includes('rule activated') ||
    title.includes('rule enforced') ||
    detail.includes('art-rule-')
  ) {
    return 'rule';
  }
  if (
    title.includes('collision') ||
    title.includes('mismatch') ||
    title.includes('diverges') ||
    detail.includes('collision') ||
    detail.includes('mismatch')
  ) {
    return 'conflict';
  }
  if (
    title.includes('report synchronized') ||
    title.includes('brief synchronized') ||
    title.includes('audit synchronized') ||
    title.includes('review synchronized') ||
    title.includes('verification synchronized') ||
    title.includes('change intelligence synchronized') ||
    detail.includes('art-report-')
  ) {
    return 'report';
  }
  if (
    activity.kind === 'repository-connected' ||
    activity.kind === 'audit' ||
    title.includes('device paired')
  ) {
    return 'system';
  }
  if (activity.kind === 'sync') {
    return 'sync';
  }
  return 'analysis';
}

export function formatEventTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatEventGroupDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Today Â· ${dateStr}`;
  }
  return dateStr;
}

// Extracted tokens from detail text
type ExtractedToken =
  | { type: 'report'; id: string; label: string }
  | { type: 'decision'; id: string; label: string }
  | { type: 'rule'; id: string; label: string }
  | { type: 'commit'; sha: string }
  | { type: 'pr'; number: string }
  | { type: 'path'; path: string };

export function parseActivityTokens(detail: string): ExtractedToken[] {
  const tokens: ExtractedToken[] = [];

  // Reports
  const reportMatches = detail.match(/art-report-[a-z0-9-]+/g);
  if (reportMatches) {
    for (const id of reportMatches) {
      tokens.push({ type: 'report', id, label: id });
    }
  }

  // Decisions
  const decisionMatches = detail.match(/art-decision-[a-z0-9-]+/g);
  if (decisionMatches) {
    for (const id of decisionMatches) {
      tokens.push({ type: 'decision', id, label: id });
    }
  }

  // Rules
  const ruleMatches = detail.match(/art-rule-[a-z0-9-]+/g);
  if (ruleMatches) {
    for (const id of ruleMatches) {
      tokens.push({ type: 'rule', id, label: id });
    }
  }

  // PR numbers
  const prMatches = detail.match(/PR #\d+/g);
  if (prMatches) {
    for (const pr of prMatches) {
      tokens.push({ type: 'pr', number: pr });
    }
  }

  // Commits (12-char hex)
  const commitMatches = detail.match(/\b[0-9a-f]{12}\b/g);
  if (commitMatches) {
    for (const sha of commitMatches) {
      tokens.push({ type: 'commit', sha });
    }
  }

  return tokens;
}

// Category visual metadata
function ActivityGlyph({ category }: { category: ActivityCategory }) {
  if (category === 'report') {
    return (
      <svg
        className="activity-glyph-svg"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" />
        <polyline points="9 2 9 6 13 6" />
        <line x1="6" y1="9" x2="10" y2="9" />
        <line x1="6" y1="12" x2="9" y2="12" />
      </svg>
    );
  }
  if (category === 'decision') {
    return (
      <svg
        className="activity-glyph-svg"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3l2 2" />
      </svg>
    );
  }
  if (category === 'rule') {
    return (
      <svg
        className="activity-glyph-svg"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 1.5 2.5 4v4.5c0 3.3 2.3 6.4 5.5 7 3.2-.6 5.5-3.7 5.5-7V4L8 1.5z" />
      </svg>
    );
  }
  if (category === 'conflict') {
    return (
      <svg
        className="activity-glyph-svg"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 2.5 14 13H2L8 2.5z" />
        <line x1="8" y1="7" x2="8" y2="9.5" />
        <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
      </svg>
    );
  }
  if (category === 'system') {
    return (
      <svg
        className="activity-glyph-svg"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M5 8h6M8 5v6" />
      </svg>
    );
  }
  if (category === 'sync') {
    return (
      <svg
        className="activity-glyph-svg"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 8a6 6 0 0 1 10.2-4.2L14 5M14 8a6 6 0 0 1-10.2 4.2L2 11" />
        <polyline points="14 2 14 5 11 5" />
        <polyline points="2 14 2 11 5 11" />
      </svg>
    );
  }
  // Default: analysis
  return (
    <svg
      className="activity-glyph-svg"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" />
    </svg>
  );
}

export function ActivityView({
  activities,
  repositories,
  initialSelectedRepoId = 'all',
  initialCategory = 'all',
}: ActivityViewProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(initialSelectedRepoId);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const searchInputId = useId();
  const repoSelectId = useId();
  const categorySelectId = useId();
  const sortSelectId = useId();

  useEffect(() => {
    if (initialSelectedRepoId) {
      setSelectedRepoId(initialSelectedRepoId);
    }
  }, [initialSelectedRepoId]);

  // Counts by repository
  const repoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of repositories) {
      counts.set(r.id, 0);
    }
    for (const act of activities) {
      if (act.repositoryId) {
        counts.set(act.repositoryId, (counts.get(act.repositoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [activities, repositories]);

  // Counts by category
  const categoryCounts = useMemo(() => {
    const counts: Record<ActivityCategory, number> = {
      all: activities.length,
      report: 0,
      decision: 0,
      rule: 0,
      conflict: 0,
      analysis: 0,
      sync: 0,
      system: 0,
    };
    for (const act of activities) {
      const cat = deriveActivityCategory(act);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [activities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // Repo filter
      if (selectedRepoId !== 'all' && act.repositoryId !== selectedRepoId) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'all') {
        const cat = deriveActivityCategory(act);
        if (cat !== selectedCategory) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = act.title.toLowerCase().includes(q);
        const matchesDetail = act.detail.toLowerCase().includes(q);
        const matchesRepo = (act.repositoryName ?? '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDetail && !matchesRepo) return false;
      }
      return true;
    });
  }, [activities, selectedRepoId, selectedCategory, searchQuery]);

  // Sort activities
  const sortedActivities = useMemo(() => {
    return [...filteredActivities].sort((a, b) => {
      const timeA = new Date(a.occurredAt).getTime();
      const timeB = new Date(b.occurredAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
  }, [filteredActivities, sortOrder]);

  // Group by Date String (YYYY-MM-DD)
  const groupedActivities = useMemo(() => {
    const groups: { dateKey: string; dateTitle: string; items: DashboardActivity[] }[] = [];
    const groupMap = new Map<string, DashboardActivity[]>();

    for (const act of sortedActivities) {
      const dateKey = act.occurredAt.split('T')[0] ?? act.occurredAt;
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
      }
      groupMap.get(dateKey)!.push(act);
    }

    for (const [dateKey, items] of groupMap.entries()) {
      const firstItem = items[0];
      const dateTitle = firstItem ? formatEventGroupDate(firstItem.occurredAt) : dateKey;
      groups.push({ dateKey, dateTitle, items });
    }

    return groups;
  }, [sortedActivities]);

  const selectedRepoObj = useMemo(() => {
    return repositories.find((r) => r.id === selectedRepoId);
  }, [repositories, selectedRepoId]);

  return (
    <div className="activity-surface" id="activity-root">
      {/* 1. Header & Workspace Ledger Summary Bar */}
      <header className="activity-header">
        <div
          className="activity-header__copy"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="activity-header__eyebrow">
            <span className="activity-eyebrow-tag">WORKSPACE AUDIT TIMELINE</span>
            <span className="activity-eyebrow-count">{activities.length} Recorded Events</span>
          </div>
          <h1 className="activity-header__title">Workspace Engineering Activity</h1>
          <p className="activity-header__description">
            Complete chronological record of synchronization briefs, cryptographic boundary
            validations, and governance decisions. Workspace-wide and repository-labeled without
            tracking individual developer productivity metrics.
          </p>
        </div>

        {/* Intelligence Overview Metrics Bar */}
        <div
          className="activity-metrics-bar"
          role="region"
          aria-label="Workspace activity metrics"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="activity-metric-item">
            <span className="activity-metric-label">TOTAL LEDGER EVENTS</span>
            <span className="activity-metric-value">{activities.length}</span>
            <span className="activity-metric-sub">Across {repositories.length} workspaces</span>
          </div>
          <div className="activity-metric-divider" />
          <div className="activity-metric-item">
            <span className="activity-metric-label">EVENT TAXONOMY</span>
            <span className="activity-metric-value">
              {categoryCounts.report} Briefs Â· {categoryCounts.decision} Decisions Â·{' '}
              {categoryCounts.rule} Rules
            </span>
            <span className="activity-metric-sub">
              {categoryCounts.analysis} Scans Â· {categoryCounts.conflict} Conflicts
            </span>
          </div>
          <div className="activity-metric-divider" />
          <div className="activity-metric-item">
            <span className="activity-metric-label">CHRONOLOGY SPAN</span>
            <span className="activity-metric-value">Aug 1 â€“ Aug 19, 2026</span>
            <span className="activity-metric-sub">Continuous audit ledger</span>
          </div>
          <div className="activity-metric-divider" />
          <div className="activity-metric-item">
            <span className="activity-metric-label">INTEGRITY GUARANTEE</span>
            <span className="activity-metric-value activity-metric-value--pill">
              CRYPTOGRAPHICALLY ANCHORED
            </span>
            <span className="activity-metric-sub">Zero surveillance scoring</span>
          </div>
        </div>
      </header>

      {/* 2. Filter & Controls Toolbar (Structured Two-Row Grid) */}
      <section
        className="activity-toolbar"
        aria-label="Filter and search workspace activity"
        data-trace-motion="item"
        style={{ '--motion-index': 2 } as React.CSSProperties}
      >
        {/* Row 1: Primary Search Input */}
        <div className="activity-toolbar__row-search">
          <label htmlFor={searchInputId} className="sr-only">
            Search activity by title, commit SHA, PR number, or artifact ID
          </label>
          <div className="search-input-wrapper">
            <svg
              className="search-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id={searchInputId}
              type="search"
              placeholder="Search activity events, commits, PRs, artifact IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="activity-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
              >
                âœ•
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Secondary Filter Controls */}
        <div className="activity-toolbar__row-controls">
          {/* Repository Scope Pills */}
          <div className="activity-repo-pills" role="group" aria-label="Repository filter">
            <button
              type="button"
              className={`repo-pill ${selectedRepoId === 'all' ? 'repo-pill--active' : ''}`}
              onClick={() => setSelectedRepoId('all')}
            >
              All Repositories <span className="pill-count">{activities.length}</span>
            </button>
            {repositories.map((repo) => {
              const count = repoCounts.get(repo.id) ?? 0;
              const isSelected = selectedRepoId === repo.id;
              return (
                <button
                  key={repo.id}
                  type="button"
                  className={`repo-pill ${isSelected ? 'repo-pill--active' : ''}`}
                  onClick={() => setSelectedRepoId(repo.id)}
                >
                  {repo.name} <span className="pill-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="activity-toolbar__actions">
            {/* Category Filter Dropdown */}
            <div className="activity-select-control">
              <label htmlFor={categorySelectId} className="sr-only">
                Filter by event category
              </label>
              <TraceSelect
                id={categorySelectId}
                value={selectedCategory}
                onChange={setSelectedCategory}
                ariaLabel="Filter by event category"
                size="sm"
                options={[
                  { value: 'all', label: `All Categories (${activities.length})` },
                  {
                    value: 'report',
                    label: 'Reports & Briefs',
                    count: categoryCounts.report,
                  },
                  {
                    value: 'decision',
                    label: 'Decisions',
                    count: categoryCounts.decision,
                  },
                  {
                    value: 'rule',
                    label: 'Rules & Governance',
                    count: categoryCounts.rule,
                  },
                  {
                    value: 'conflict',
                    label: 'Conflicts & Incompatibilities',
                    count: categoryCounts.conflict,
                  },
                  {
                    value: 'analysis',
                    label: 'Analysis Runs',
                    count: categoryCounts.analysis,
                  },
                  {
                    value: 'sync',
                    label: 'Sync Operations',
                    count: categoryCounts.sync,
                  },
                  {
                    value: 'system',
                    label: 'Setup & Devices',
                    count: categoryCounts.system,
                  },
                ]}
              />
            </div>

            {/* Sort Order Dropdown */}
            <div className="activity-select-control">
              <label htmlFor={sortSelectId} className="sr-only">
                Sort chronology
              </label>
              <TraceSelect
                id={sortSelectId}
                value={sortOrder}
                onChange={(val) => setSortOrder(val as 'newest' | 'oldest')}
                ariaLabel="Sort chronology"
                size="sm"
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                ]}
              />
            </div>

            {/* Explicit Reset Button when active */}
            {(selectedRepoId !== 'all' || selectedCategory !== 'all' || searchQuery.trim()) && (
              <button
                type="button"
                className="activity-reset-btn"
                onClick={() => {
                  setSelectedRepoId('all');
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Active Filter State Subtitle */}
      {(selectedRepoId !== 'all' || selectedCategory !== 'all' || searchQuery.trim()) && (
        <div className="activity-filter-status">
          <span>
            Showing <strong>{sortedActivities.length}</strong> of{' '}
            <strong>{activities.length}</strong> events
            {selectedRepoId !== 'all' && (
              <>
                {' '}
                in <strong>{selectedRepoObj?.name ?? selectedRepoId}</strong>
              </>
            )}
            {selectedCategory !== 'all' && (
              <>
                {' '}
                filtered by <strong>{selectedCategory.toUpperCase()}</strong>
              </>
            )}
            {searchQuery.trim() && (
              <>
                {' '}
                matching <em>&ldquo;{searchQuery}&rdquo;</em>
              </>
            )}
          </span>
          <button
            type="button"
            className="filter-reset-link"
            onClick={() => {
              setSelectedRepoId('all');
              setSelectedCategory('all');
              setSearchQuery('');
            }}
          >
            Reset filters
          </button>
        </div>
      )}

      {/* 3. Grouped Timeline Feed */}
      {groupedActivities.length > 0 ? (
        <main
          className="activity-timeline-feed"
          aria-label="Workspace activity timeline"
          data-trace-motion="section"
          data-motion-section="activity-feed"
        >
          {groupedActivities.map((group, gIdx) => (
            <section
              key={group.dateKey}
              className="timeline-date-group"
              aria-labelledby={`group-${group.dateKey}`}
              data-trace-motion="item"
              style={{ '--motion-index': gIdx } as React.CSSProperties}
            >
              {/* Sticky Date Group Header */}
              <div className="timeline-date-header">
                <div className="date-header-badge">
                  <span className="date-bullet" aria-hidden="true" />
                  <h2 id={`group-${group.dateKey}`} className="date-title">
                    {group.dateTitle}
                  </h2>
                </div>
                <span className="date-count-label">
                  {group.items.length} {group.items.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              {/* Items in date group */}
              <ol className="timeline-items-list">
                {group.items.map((act) => {
                  const category = deriveActivityCategory(act);
                  const tokens = parseActivityTokens(act.detail);
                  const repoShortName =
                    act.repositoryName?.split('/').pop() ?? act.repositoryId ?? 'Workspace';
                  const timeFormatted = formatEventTime(act.occurredAt);

                  return (
                    <li key={act.id} className="timeline-item" id={`event-${act.id}`}>
                      {/* Timeline Rail & Node */}
                      <div className="timeline-node-container" aria-hidden="true">
                        <div className={`timeline-glyph-badge timeline-glyph-badge--${category}`}>
                          <ActivityGlyph category={category} />
                        </div>
                        <div className="timeline-rail-line" />
                      </div>

                      {/* Content Card */}
                      <div className="timeline-item-card">
                        {/* 1. Event Title 1st (with time right-aligned) */}
                        <div className="item-card-top">
                          <h3 className="item-title">{act.title}</h3>
                          <time dateTime={act.occurredAt} className="item-time-tag">
                            {timeFormatted}
                          </time>
                        </div>

                        {/* 2. Repository & Type 2nd */}
                        <div className="item-badge-row">
                          <span className="item-repo-tag">{repoShortName}</span>
                          <span className={`item-category-tag item-category-tag--${category}`}>
                            {category.toUpperCase()}
                          </span>
                          <span className="item-kind-label">{act.kind}</span>
                        </div>

                        {/* 3. Detail text 3rd */}
                        <p className="item-detail">{act.detail}</p>

                        {/* 4. Technical token/commit 4th */}
                        {tokens.length > 0 && (
                          <div
                            className="item-tokens-row"
                            aria-label="Referenced artifacts and entities"
                          >
                            {tokens.map((token, tIdx) => {
                              if (token.type === 'report') {
                                return (
                                  <Link
                                    key={tIdx}
                                    href="/app/reports"
                                    className="entity-token-pill entity-token-pill--report"
                                    title={`View linked report: ${token.id}`}
                                  >
                                    <svg
                                      className="token-svg-icon"
                                      viewBox="0 0 16 16"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" />
                                      <polyline points="9 2 9 6 13 6" />
                                    </svg>
                                    <code>{token.label}</code>
                                  </Link>
                                );
                              }
                              if (token.type === 'decision') {
                                return (
                                  <Link
                                    key={tIdx}
                                    href="/app/decisions"
                                    className="entity-token-pill entity-token-pill--decision"
                                    title={`View linked decision: ${token.id}`}
                                  >
                                    <svg
                                      className="token-svg-icon"
                                      viewBox="0 0 16 16"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <circle cx="8" cy="8" r="6" />
                                      <path d="M8 5v3l2 2" />
                                    </svg>
                                    <code>{token.label}</code>
                                  </Link>
                                );
                              }
                              if (token.type === 'rule') {
                                return (
                                  <Link
                                    key={tIdx}
                                    href="/app/rules"
                                    className="entity-token-pill entity-token-pill--rule"
                                    title={`View linked rule: ${token.id}`}
                                  >
                                    <svg
                                      className="token-svg-icon"
                                      viewBox="0 0 16 16"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <path d="M8 1.5 2.5 4v4.5c0 3.3 2.3 6.4 5.5 7 3.2-.6 5.5-3.7 5.5-7V4L8 1.5z" />
                                    </svg>
                                    <code>{token.label}</code>
                                  </Link>
                                );
                              }
                              if (token.type === 'commit') {
                                return (
                                  <span
                                    key={tIdx}
                                    className="entity-token-pill entity-token-pill--commit"
                                    title={`Commit hash: ${token.sha}`}
                                  >
                                    <svg
                                      className="token-svg-icon"
                                      viewBox="0 0 16 16"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <circle cx="8" cy="8" r="3" />
                                      <line x1="1" y1="8" x2="5" y2="8" />
                                      <line x1="11" y1="8" x2="15" y2="8" />
                                    </svg>
                                    <code>{token.sha}</code>
                                  </span>
                                );
                              }
                              if (token.type === 'pr') {
                                return (
                                  <span
                                    key={tIdx}
                                    className="entity-token-pill entity-token-pill--pr"
                                    title={`Pull Request: ${token.number}`}
                                  >
                                    <code>{token.number}</code>
                                  </span>
                                );
                              }
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </main>
      ) : (
        /* Empty State */
        <div
          className="activity-empty-surface"
          role="region"
          aria-label="No activity events found"
          data-trace-motion="item"
          style={{ '--motion-index': 3 } as React.CSSProperties}
        >
          <div className="empty-surface-inner">
            <div className="empty-glyph-box">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2 className="empty-title">No events match current filter</h2>
            <p className="empty-description">
              No activity records found{searchQuery.trim() ? ` for â€œ${searchQuery}â€` : ''} in the
              selected category.
            </p>
            <button
              type="button"
              className="trace-button trace-button--secondary"
              onClick={() => {
                setSelectedRepoId('all');
                setSelectedCategory('all');
                setSearchQuery('');
              }}
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* 4. Privacy & Provenance Truth Footer */}
      <footer
        className="activity-privacy-footer"
        data-trace-motion="item"
        style={{ '--motion-index': 4 } as React.CSSProperties}
      >
        <div className="privacy-footer-inner">
          <span className="privacy-dot" aria-hidden="true">
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
          <p className="privacy-text">
            <strong>Workspace Audit Guarantee:</strong> TRACE logs structural boundary events, AST
            review checkpoints, and synchronized change briefs without collecting telemetry on
            individual developer velocity, score, or keystroke timing.
          </p>
          <Link href="/app/documentation#boundary-guarantees" className="privacy-link">
            Read privacy spec â†’
          </Link>
        </div>
      </footer>
    </div>
  );
}
