'use client';

import { useId, useMemo, useState, useEffect } from 'react';
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
import {
  formatDate,
  formatRelativeDate,
  presentFindingDetail,
} from '../../../../lib/dashboard-state';
import {
  computeReportsSummaryMetrics,
  groupReportsByDate,
  getRepositoryReportEmptyState,
} from '../../../../lib/report-view-model';

export type ReportsViewProps = {
  reports: DashboardSyncedRecord[];
  repositories: DashboardRepository[];
  changes?: DashboardChange[];
  attention?: DashboardAttention[];
  initialSelectedRepoId?: string;
};

function formatArtifactTypeLabel(type: string): string {
  switch (type) {
    case 'daily_report':
      return 'Daily Brief';
    case 'weekly_report':
      return 'Weekly Rollup';
    case 'architecture_review':
      return 'Architecture Review';
    case 'security_audit':
      return 'Security Audit';
    case 'performance_review':
      return 'Performance Benchmark';
    default:
      return type.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function getReportDateGroup(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
      86_400_000,
  );
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Earlier';
}

function parseReportMarkdownSections(content: string): Array<{ title: string; body: string[] }> {
  const sections: Array<{ title: string; body: string[] }> = [];
  let current = { title: 'Overview', body: [] as string[] };
  for (const line of content.split(/\r?\n/)) {
    const heading = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current.body.some((item) => item.trim())) sections.push(current);
      current = { title: heading[2]!.replaceAll('**', ''), body: [] };
      continue;
    }
    if (!/^#\s+/.test(line) || current.title !== 'Overview') current.body.push(line);
  }
  if (current.body.some((item) => item.trim())) sections.push(current);
  return sections;
}

export function ReportsView({
  reports,
  repositories,
  changes = [],
  attention = [],
  initialSelectedRepoId,
}: ReportsViewProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(initialSelectedRepoId ?? 'all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedFreshness, setSelectedFreshness] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeDrawerReport, setActiveDrawerReport] = useState<DashboardSyncedRecord | null>(null);
  const [cachedDrawerReport, setCachedDrawerReport] = useState<DashboardSyncedRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeDrawerReport) {
      setCachedDrawerReport(activeDrawerReport);
    }
  }, [activeDrawerReport]);

  const searchInputId = useId();
  const repoSelectId = useId();
  const typeSelectId = useId();
  const freshnessSelectId = useId();

  // Keep repository filter in sync if prop changes
  useEffect(() => {
    if (initialSelectedRepoId) {
      setSelectedRepoId(initialSelectedRepoId);
    }
  }, [initialSelectedRepoId]);

  // Handle drawer escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && activeDrawerReport) {
        setActiveDrawerReport(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDrawerReport]);

  const copyCliCommand = (report: DashboardSyncedRecord) => {
    const cmd = report.path ? `trace inspect ${report.path}` : `trace report daily`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    setCopiedId(report.id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === report.id ? null : curr));
    }, 2000);
  };

  // Available unique types from report dataset
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const r of reports) {
      types.add(r.artifactType);
    }
    return Array.from(types);
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      // Repository filter
      if (selectedRepoId !== 'all' && report.repositoryId !== selectedRepoId) {
        return false;
      }
      // Type filter
      if (selectedType !== 'all' && report.artifactType !== selectedType) {
        return false;
      }
      // Freshness filter
      if (selectedFreshness !== 'all') {
        const freshness = report.freshness ?? 'unknown';
        if (freshness !== selectedFreshness) {
          return false;
        }
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = report.title.toLowerCase().includes(q);
        const matchesSummary = report.summary.toLowerCase().includes(q);
        const matchesRepo = report.repositoryName.toLowerCase().includes(q);
        const matchesType = report.artifactType.toLowerCase().includes(q);
        const matchesCommit = report.analyzedCommit?.toLowerCase().includes(q);
        const matchesItems = report.items.some(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.detail.toLowerCase().includes(q) ||
            i.evidence.some((ev) => ev.toLowerCase().includes(q)),
        );
        if (
          !matchesTitle &&
          !matchesSummary &&
          !matchesRepo &&
          !matchesType &&
          !matchesCommit &&
          !matchesItems
        ) {
          return false;
        }
      }
      return true;
    });
  }, [reports, selectedRepoId, selectedType, selectedFreshness, searchQuery]);

  // Group filtered reports by date
  const groupedReports = useMemo(() => {
    return groupReportsByDate(filteredReports);
  }, [filteredReports]);

  // Overall counts for summary intelligence strip
  const summaryMetrics = useMemo(
    () => computeReportsSummaryMetrics(reports, repositories),
    [reports, repositories],
  );

  const activeFilterCount =
    (selectedRepoId !== 'all' ? 1 : 0) +
    (selectedType !== 'all' ? 1 : 0) +
    (selectedFreshness !== 'all' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const resetFilters = () => {
    setSelectedRepoId('all');
    setSelectedType('all');
    setSelectedFreshness('all');
    setSearchQuery('');
  };

  const selectedRepoObj = repositories.find((r) => r.id === selectedRepoId);
  const isSelectedRepoUnsynced =
    selectedRepoObj &&
    (selectedRepoObj.syncState === 'not_analyzed' ||
      (selectedRepoId !== 'all' &&
        reports.filter((r) => r.repositoryId === selectedRepoId).length === 0));

  const emptyStateReason = getRepositoryReportEmptyState(selectedRepoObj);

  return (
    <div className="reports-library-surface">
      {/* 1. Summary Intelligence Strip */}
      <div
        className="reports-summary-bar"
        aria-label="Reports Library Overview"
        data-trace-motion="item"
        style={{ '--motion-index': 1 } as React.CSSProperties}
      >
        <div className="reports-summary-metric">
          <span className="reports-summary-metric__value">{summaryMetrics.totalReportsCount}</span>
          <span className="reports-summary-metric__label">Archived Records</span>
        </div>
        <div className="reports-summary-divider" aria-hidden="true" />
        <div className="reports-summary-metric">
          <span className="reports-summary-metric__value">
            {summaryMetrics.syncedRepositoriesCount}
          </span>
          <span className="reports-summary-metric__label">Synced Repositories</span>
        </div>
        <div className="reports-summary-divider" aria-hidden="true" />
        <div className="reports-summary-metric">
          <span className="reports-summary-metric__value">{summaryMetrics.currentCount}</span>
          <span className="reports-summary-metric__label">Current</span>
        </div>
        <div className="reports-summary-divider" aria-hidden="true" />
        <div className="reports-summary-metric">
          <span className="reports-summary-metric__value reports-summary-metric__value--warning">
            {summaryMetrics.needsRefreshCount}
          </span>
          <span className="reports-summary-metric__label">Needs Refresh</span>
        </div>
        {summaryMetrics.attentionCount > 0 ? (
          <>
            <div className="reports-summary-divider" aria-hidden="true" />
            <div className="reports-summary-metric">
              <span className="reports-summary-metric__value reports-summary-metric__value--attention">
                {summaryMetrics.attentionCount}
              </span>
              <span className="reports-summary-metric__label">Sync Attention</span>
            </div>
          </>
        ) : null}
        <span className="reports-summary-note">
          Approved local records Ãƒâ€šÃ‚Â· Privacy preserving
        </span>
      </div>

      {/* 2. Compact Multi-Dimensional Toolbar */}
      <div
        className="reports-toolbar"
        aria-label="Reports Filter and Search Bar"
        data-trace-motion="item"
        style={{ '--motion-index': 2 } as React.CSSProperties}
      >
        <div className="reports-toolbar__search">
          <div className="search-input-wrapper">
            <svg
              className="search-icon"
              width="14"
              height="14"
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
              className="reports-search-input"
              placeholder="Search reports by title, commit, findings, or repository..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search reports library"
            />
            {searchQuery ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search input"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <div className="reports-toolbar__controls">
          {/* Repository Selector */}
          <div className="filter-select-group">
            <label htmlFor={repoSelectId} className="filter-select-label">
              Repo
            </label>
            <TraceSelect
              id={repoSelectId}
              value={selectedRepoId}
              onChange={setSelectedRepoId}
              ariaLabel="Filter by repository"
              options={[
                { value: 'all', label: `All repositories (${reports.length})` },
                ...repositories.map((repo) => ({
                  value: repo.id,
                  label: repo.name,
                  count: reports.filter((r) => r.repositoryId === repo.id).length,
                })),
              ]}
            />
          </div>

          {/* Type Selector */}
          <div className="filter-select-group">
            <label htmlFor={typeSelectId} className="filter-select-label">
              Type
            </label>
            <TraceSelect
              id={typeSelectId}
              value={selectedType}
              onChange={setSelectedType}
              ariaLabel="Filter by report artifact type"
              options={[
                { value: 'all', label: 'All types' },
                ...availableTypes.map((type) => ({
                  value: type,
                  label: formatArtifactTypeLabel(type),
                })),
              ]}
            />
          </div>

          {/* Freshness Selector */}
          <div className="filter-select-group">
            <label htmlFor={freshnessSelectId} className="filter-select-label">
              Freshness
            </label>
            <TraceSelect
              id={freshnessSelectId}
              value={selectedFreshness}
              onChange={setSelectedFreshness}
              ariaLabel="Filter by synchronization freshness"
              options={[
                { value: 'all', label: 'All freshness' },
                {
                  value: 'current',
                  label: 'Current',
                  count: summaryMetrics.currentCount,
                },
                {
                  value: 'needs-refresh',
                  label: 'Needs refresh',
                  count: summaryMetrics.needsRefreshCount,
                },
                {
                  value: 'attention',
                  label: 'Sync attention',
                  count: summaryMetrics.attentionCount,
                },
              ]}
            />
          </div>

          {/* Reset Filters */}
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="trace-button trace-button--secondary trace-button--sm reset-filter-btn"
              onClick={resetFilters}
              aria-label={`Reset ${activeFilterCount} active filters`}
            >
              Reset ({activeFilterCount})
            </button>
          ) : null}
        </div>
      </div>

      {/* 3. Reports Library Main Content Area */}
      {isSelectedRepoUnsynced ? (
        /* Truthful Unsynced Repository Empty State */
        <div
          className="reports-empty-panel reports-empty-panel--pending"
          role="region"
          aria-label="Repository Analysis Pending Status"
          data-trace-motion="item"
          style={{ '--motion-index': 3 } as React.CSSProperties}
        >
          <div className="reports-empty-glyph">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <span className="reports-empty-status-tag">
            0 SYNCHRONIZED REPORTS Ãƒâ€šÃ‚Â· LOCAL ANALYSIS PENDING
          </span>
          <h3>{emptyStateReason.title}</h3>
          <p>{emptyStateReason.description}</p>
          <div className="reports-cli-box">
            <p className="cli-title">Run these commands from the repository on your computer:</p>
            {emptyStateReason.recommendedCommands.map((command) => (
              <code key={command}>{command}</code>
            ))}
          </div>
          <div className="reports-empty-actions">
            <Link href="/docs#local-dashboard" className="trace-button trace-button--primary">
              View local CLI guide
            </Link>
            <button
              type="button"
              className="trace-button trace-button--secondary"
              onClick={resetFilters}
            >
              Show all reports
            </button>
          </div>
        </div>
      ) : filteredReports.length === 0 ? (
        /* Search / Filter Empty State */
        <div
          className="reports-empty-panel"
          role="region"
          aria-label="No reports found"
          data-trace-motion="item"
          style={{ '--motion-index': 3 } as React.CSSProperties}
        >
          <div className="reports-empty-glyph">
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
          <h3>No matching reports found</h3>
          <p>
            No reports in the project memory library match your active filters or search query
            &quot;{searchQuery}&quot;.
          </p>
          <button
            type="button"
            className="trace-button trace-button--secondary"
            onClick={resetFilters}
          >
            Clear all filters
          </button>
        </div>
      ) : (
        /* Structured Chronological Report Collection */
        <div
          className="reports-collection"
          role="feed"
          aria-label="Project Memory Reports Library"
          data-trace-motion="section"
          data-motion-section="reports-collection"
        >
          {groupedReports.map(({ label, reports: groupItems }, groupIdx) => (
            <section
              key={label}
              className="reports-date-group"
              aria-label={label}
              data-trace-motion="item"
              style={{ '--motion-index': groupIdx } as React.CSSProperties}
            >
              <div className="reports-date-group__header">
                <span className="reports-date-group__label">{label}</span>
                <span className="reports-date-group__count">
                  {groupItems.length} {groupItems.length === 1 ? 'record' : 'records'}
                </span>
              </div>

              <div className="reports-cards-list">
                {groupItems.map((report, cardIdx) => {
                  const relatedChangesCount =
                    report.relatedChangeIds?.length ??
                    changes.filter(
                      (c) =>
                        c.repositoryId === report.repositoryId &&
                        report.items.some(
                          (i) => i.changeId === c.id || i.changeNumber === c.number,
                        ),
                    ).length;

                  const findingsCount = report.items.length;
                  const highFindingsCount = report.items.filter(
                    (i) => i.severity === 'high',
                  ).length;

                  return (
                    <article
                      className="report-item-card report-row"
                      key={report.id}
                      data-report-id={report.id}
                      data-trace-motion="item"
                      style={{ '--motion-index': cardIdx } as React.CSSProperties}
                    >
                      {/* Top metadata line */}
                      <div className="report-item-card__top">
                        <div className="report-item-card__identity">
                          <span className="report-type-badge">
                            {formatArtifactTypeLabel(report.artifactType)}
                          </span>
                          <span className="report-repo-tag">
                            <Link href={`/app/repositories/${report.repositoryId}`}>
                              {report.repositoryName.split('/')[1] ?? report.repositoryName}
                            </Link>
                          </span>
                          <span className="report-origin-tag">Approved local sync</span>
                        </div>

                        <div className="report-item-card__status">
                          {report.freshness === 'needs-refresh' ? (
                            <span className="report-freshness-badge report-freshness-badge--warning">
                              Needs refresh
                            </span>
                          ) : report.freshness === 'attention' ? (
                            <span className="report-freshness-badge report-freshness-badge--attention">
                              Sync attention
                            </span>
                          ) : (
                            <span className="report-freshness-badge report-freshness-badge--current">
                              Current
                            </span>
                          )}
                          <span className="report-timestamp">{formatDate(report.generatedAt)}</span>
                        </div>
                      </div>

                      {/* Main Title & One-Line Summary */}
                      <div className="report-item-card__body">
                        <h3 className="report-item-card__title">
                          <Link href={`/app/reports/${report.id}`}>{report.title}</Link>
                        </h3>
                        <p className="report-item-card__summary">
                          {report.summary || 'Approved TRACE project-memory record.'}
                        </p>
                      </div>

                      {/* Intelligence & Provenance Badges */}
                      <div className="report-item-card__meta">
                        <div className="report-meta-tokens">
                          <span className="report-meta-token">
                            <span className="token-label">Commit</span>
                            <code>{report.analyzedCommit?.slice(0, 12) ?? 'Local HEAD'}</code>
                          </span>

                          {relatedChangesCount > 0 ? (
                            <span className="report-meta-token">
                              <span className="token-label">Changes</span>
                              <strong>{relatedChangesCount} PRs</strong>
                            </span>
                          ) : null}

                          <span className="report-meta-token">
                            <span className="token-label">Findings</span>
                            <strong>
                              {findingsCount} {findingsCount === 1 ? 'item' : 'items'}
                              {highFindingsCount > 0 ? ` (${highFindingsCount} high)` : ''}
                            </strong>
                          </span>

                          <span className="report-meta-token">
                            <span className="token-label">Synced</span>
                            <span>{formatRelativeDate(report.syncedAt)}</span>
                          </span>
                        </div>

                        {/* Interactive Actions (Max 2 prominent actions) */}
                        <div className="report-item-card__actions">
                          <button
                            type="button"
                            className="trace-button trace-button--secondary trace-button--sm"
                            onClick={() => setActiveDrawerReport(report)}
                            aria-label={`Quick inspect report ${report.title}`}
                          >
                            Quick inspect
                          </button>

                          <Link
                            href={`/app/reports/${report.id}`}
                            className="trace-button trace-button--primary trace-button--sm"
                          >
                            Read report ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
                          </Link>
                        </div>
                        <details className="report-raw-disclosure">
                          <summary>View approved TRACE record</summary>
                          <pre className="safe-markdown">{report.content}</pre>
                        </details>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 4. Quick Inspect Slide-Over Drawer */}
      {cachedDrawerReport ? (
        <ReportQuickDrawer
          report={cachedDrawerReport}
          repositories={repositories}
          changes={changes}
          attention={attention}
          isOpen={Boolean(activeDrawerReport)}
          onClose={() => setActiveDrawerReport(null)}
          onCopyCli={copyCliCommand}
          copiedId={copiedId}
        />
      ) : null}
    </div>
  );
}

function ReportQuickDrawer({
  report,
  repositories,
  changes,
  attention,
  isOpen,
  onClose,
  onCopyCli,
  copiedId,
}: {
  report: DashboardSyncedRecord;
  repositories: DashboardRepository[];
  changes: DashboardChange[];
  attention: DashboardAttention[];
  isOpen: boolean;
  onClose: () => void;
  onCopyCli: (report: DashboardSyncedRecord) => void;
  copiedId: string | null;
}) {
  const presence = usePresence(isOpen);
  const repository = repositories.find((r) => r.id === report.repositoryId);
  const relatedChanges = changes.filter(
    (c) =>
      c.repositoryId === report.repositoryId &&
      (report.relatedChangeIds?.includes(c.id) ||
        report.items.some((i) => i.changeId === c.id || i.changeNumber === c.number)),
  );

  // Top high-signal findings (2 to 4 items)
  const topFindings = report.items.slice(0, 3);
  const remainingFindingsCount = Math.max(0, report.items.length - topFindings.length);

  // Top linked changes (up to 2 items)
  const topChanges = relatedChanges.slice(0, 2);
  const remainingChangesCount = Math.max(0, relatedChanges.length - topChanges.length);

  if (!presence.isMounted) return null;

  return (
    <OverlayPortal>
      <ModalBackdrop onClose={onClose} ariaLabel="Close report quick inspect">
        <CenteredDialog
          size="lg"
          titleId="report-drawer-title"
          onClose={onClose}
          className="report-drawer report-quick-inspect"
        >
          {/* 1. Header: Type, Repo, Title, Date & Close */}
          <div className="report-drawer__header" {...getMotionItemProps(0)}>
            <div>
              <div className="report-drawer__eyebrow">
                <span className="report-type-badge">
                  {formatArtifactTypeLabel(report.artifactType)}
                </span>
                <span className="report-repo-tag">
                  {repository?.fullName ?? report.repositoryName}
                </span>
                <span className="report-origin-tag">Quick Inspect</span>
              </div>
              <h2 id="report-drawer-title" className="report-drawer__title">
                {report.title}
              </h2>
              <time className="report-drawer__date" dateTime={report.generatedAt}>
                Generated {formatDate(report.generatedAt)} Ãƒâ€šÃ‚Â·{' '}
                {report.timeWindow ?? 'Single evaluation'}
              </time>
            </div>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={onClose}
              aria-label="Close report quick inspect"
            >
              ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¢
            </button>
          </div>

          {/* 2. Freshness Status */}
          {report.freshness === 'needs-refresh' ? (
            <div
              className="drawer-freshness-banner drawer-freshness-banner--warning"
              {...getMotionItemProps(1)}
            >
              <strong>Needs refresh</strong>
              <p>
                Analyzed commit <code>{report.analyzedCommit?.slice(0, 12)}</code> is behind GitHub
                remote HEAD (<code>{report.remoteHeadCommit?.slice(0, 12)}</code>).
              </p>
            </div>
          ) : report.freshness === 'attention' ? (
            <div
              className="drawer-freshness-banner drawer-freshness-banner--attention"
              {...getMotionItemProps(1)}
            >
              <strong>Sync attention</strong>
              <p>CLI manifest schema alignment required for automated bridge sync.</p>
            </div>
          ) : (
            <div
              className="drawer-freshness-banner drawer-freshness-banner--current"
              {...getMotionItemProps(1)}
            >
              <strong>Current with GitHub</strong>
              <p>Analyzed commit matches remote default branch HEAD.</p>
            </div>
          )}

          {/* 3. Summary: One Concise Paragraph */}
          <div className="report-drawer__section" {...getMotionItemProps(2)}>
            <span className="drawer-section-label">Summary</span>
            <p className="report-drawer__summary-text">
              {report.summary || 'Approved TRACE project-memory record.'}
            </p>
          </div>

          {/* 4. High-Signal Intelligence: Top Findings & AST Evidence */}
          {topFindings.length > 0 ? (
            <div className="report-drawer__section" {...getMotionItemProps(3)}>
              <div className="drawer-section-header-row">
                <span className="drawer-section-label">Top Findings ({report.items.length})</span>
                {remainingFindingsCount > 0 ? (
                  <span className="drawer-more-hint">
                    +{remainingFindingsCount} more in full report
                  </span>
                ) : null}
              </div>
              <div className="drawer-items-list">
                {topFindings.map((item) => (
                  <div className="drawer-item-card" key={item.id}>
                    <div className="drawer-item-card__head">
                      <span className="item-severity-tag" data-severity={item.severity ?? 'low'}>
                        {item.severity ?? 'low'}
                      </span>
                      <strong>{item.title}</strong>
                    </div>
                    <p>{presentFindingDetail(item.detail)}</p>
                    {item.evidence?.length ? (
                      <div className="drawer-item-evidence">
                        {item.evidence.slice(0, 2).map((ev) => (
                          <code key={ev}>{ev}</code>
                        ))}
                        {item.evidence.length > 2 ? (
                          <span className="evidence-more-tag">
                            +{item.evidence.length - 2} loci
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 5. High-Signal Intelligence: Linked Changes */}
          {topChanges.length > 0 ? (
            <div className="report-drawer__section" {...getMotionItemProps(4)}>
              <div className="drawer-section-header-row">
                <span className="drawer-section-label">
                  Linked Pull Requests ({relatedChanges.length})
                </span>
                {remainingChangesCount > 0 ? (
                  <span className="drawer-more-hint">+{remainingChangesCount} more reviewed</span>
                ) : null}
              </div>
              <div className="drawer-changes-list">
                {topChanges.map((change) => (
                  <div className="drawer-change-row" key={change.id}>
                    <span className="drawer-change-badge">PR #{change.number}</span>
                    <div className="drawer-change-info">
                      <strong>{change.title}</strong>
                      <small>
                        @{change.authorLogin} Ãƒâ€šÃ‚Â· <code>{change.branch}</code>
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 6. High-Signal Intelligence: Provenance Summary */}
          <div className="report-drawer__section" {...getMotionItemProps(5)}>
            <span className="drawer-section-label">Provenance Summary</span>
            <dl className="drawer-facts-grid drawer-facts-grid--compact">
              <div>
                <dt>Repository</dt>
                <dd>
                  <Link href={`/app/repositories/${report.repositoryId}`}>
                    {report.repositoryName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Analyzed Commit</dt>
                <dd>
                  <code>{report.analyzedCommit?.slice(0, 12) ?? 'Local HEAD'}</code>
                </dd>
              </div>
              <div>
                <dt>Privacy Guarantee</dt>
                <dd>Deterministic AST facts Ãƒâ€šÃ‚Â· Source code excluded</dd>
              </div>
            </dl>
          </div>

          {/* 7. Footer: Read Full Report & Copy CLI */}
          <div className="report-drawer__footer" {...getMotionItemProps(6)}>
            <button
              type="button"
              className="trace-button trace-button--secondary trace-button--sm"
              onClick={() => onCopyCli(report)}
            >
              {copiedId === report.id ? 'Copied' : 'Copy CLI inspect'}
            </button>
            <Link
              href={`/app/reports/${report.id}`}
              className="trace-button trace-button--primary trace-button--sm"
            >
              Read full report ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
            </Link>
          </div>
        </CenteredDialog>
      </ModalBackdrop>
    </OverlayPortal>
  );
}
