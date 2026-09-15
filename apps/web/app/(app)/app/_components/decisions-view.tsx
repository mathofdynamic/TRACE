'use client';

import { useId, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { TraceSelect } from './trace-select';
import { DecisionPromptBuilder } from './decision-prompt-builder';
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

export type DecisionsViewProps = {
  decisions: DashboardSyncedRecord[];
  repositories: DashboardRepository[];
  changes?: DashboardChange[];
  attention?: DashboardAttention[];
  initialSelectedRepoId?: string;
};

type ParsedSection = {
  title: string;
  lines: string[];
};

function parseDecisionSections(content: string): {
  statusText?: string;
  context: string[];
  decisionRules: string[];
  consequences: string[];
  otherSections: ParsedSection[];
} {
  const lines = content.split(/\r?\n/);
  let statusText: string | undefined;
  const context: string[] = [];
  const decisionRules: string[] = [];
  const consequences: string[] = [];
  const otherSections: ParsedSection[] = [];

  let currentSection = '';
  let currentOther: ParsedSection | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check main title
    if (trimmed.startsWith('# ')) {
      continue;
    }

    // Check section headings
    const sectionMatch = /^##\s+(.+)$/i.exec(trimmed);
    if (sectionMatch && sectionMatch[1]) {
      const heading = sectionMatch[1].trim();
      const lower = heading.toLowerCase();

      if (currentOther && currentOther.lines.length > 0) {
        otherSections.push(currentOther);
        currentOther = null;
      }

      if (lower === 'status') {
        currentSection = 'status';
      } else if (lower === 'context' || lower.includes('background')) {
        currentSection = 'context';
      } else if (lower === 'decision' || lower.includes('decisions') || lower.includes('mandate')) {
        currentSection = 'decision';
      } else if (
        lower === 'consequences' ||
        lower.includes('tradeoffs') ||
        lower.includes('invariants')
      ) {
        currentSection = 'consequences';
      } else {
        currentSection = 'other';
        currentOther = { title: heading, lines: [] };
      }
      continue;
    }

    // Accumulate lines based on current section
    if (currentSection === 'status') {
      if (!statusText) statusText = trimmed;
    } else if (currentSection === 'context') {
      context.push(trimmed);
    } else if (currentSection === 'decision') {
      decisionRules.push(trimmed);
    } else if (currentSection === 'consequences') {
      consequences.push(trimmed);
    } else if (currentSection === 'other' && currentOther) {
      currentOther.lines.push(trimmed);
    }
  }

  if (currentOther && currentOther.lines.length > 0) {
    otherSections.push(currentOther);
  }

  return { statusText, context, decisionRules, consequences, otherSections };
}

function cleanMarkdownLine(line: string): string {
  return line.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+\.\s+/, '');
}

export function DecisionsView({
  decisions,
  repositories,
  changes = [],
  attention = [],
  initialSelectedRepoId,
}: DecisionsViewProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(initialSelectedRepoId ?? 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'repository' | 'title'>('newest');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState<boolean>(false);

  const searchInputId = useId();
  const repoSelectId = useId();
  const sortSelectId = useId();

  // Keep repository filter in sync if prop changes
  useEffect(() => {
    if (initialSelectedRepoId) {
      setSelectedRepoId(initialSelectedRepoId);
    }
  }, [initialSelectedRepoId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(decisions.map((d) => d.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const copyCliCommand = (decision: DashboardSyncedRecord) => {
    const cmd = `trace inspect .trace/decisions/${decision.id}.json`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    setCopiedId(decision.id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === decision.id ? null : curr));
    }, 2000);
  };

  // Repository count map
  const repoDecisionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of repositories) {
      counts.set(r.id, 0);
    }
    for (const d of decisions) {
      counts.set(d.repositoryId, (counts.get(d.repositoryId) ?? 0) + 1);
    }
    return counts;
  }, [decisions, repositories]);

  // Filtered decisions
  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      if (selectedRepoId !== 'all' && d.repositoryId !== selectedRepoId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = d.title.toLowerCase().includes(q);
        const matchesSummary = d.summary.toLowerCase().includes(q);
        const matchesRepo = d.repositoryName.toLowerCase().includes(q);
        const matchesContent = d.content.toLowerCase().includes(q);
        const matchesItems = d.items.some(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.detail.toLowerCase().includes(q) ||
            item.evidence.some((e) => e.toLowerCase().includes(q)),
        );
        if (!matchesTitle && !matchesSummary && !matchesRepo && !matchesContent && !matchesItems) {
          return false;
        }
      }
      return true;
    });
  }, [decisions, selectedRepoId, searchQuery]);

  // Sorted decisions
  const sortedDecisions = useMemo(() => {
    return [...filteredDecisions].sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime();
      }
      if (sortBy === 'repository') {
        return a.repositoryName.localeCompare(b.repositoryName);
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
  }, [filteredDecisions, sortBy]);

  const selectedRepoObj = useMemo(() => {
    return repositories.find((r) => r.id === selectedRepoId);
  }, [repositories, selectedRepoId]);

  const isFiltered = selectedRepoId !== 'all' || searchQuery.trim().length > 0;

  // Derive active repository count and names dynamically from decisions
  const activeReposCount = useMemo(() => {
    return new Set(decisions.map((d) => d.repositoryId)).size;
  }, [decisions]);

  const activeRepoNames = useMemo(() => {
    const names = Array.from(
      new Set(
        decisions.map((d) => {
          const repo = repositories.find((r) => r.id === d.repositoryId);
          return repo?.name ?? d.repositoryName.split('/').pop() ?? d.repositoryName;
        }),
      ),
    );
    return names.join(' Â· ');
  }, [decisions, repositories]);

  return (
    <div className="decisions-surface" id="decisions-root">
      {/* 1. Header & Action Row */}
      <header className="decisions-header">
        <div
          className="decisions-header__top"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="decisions-header__copy">
            <div className="decisions-header__eyebrow">
              <span className="decisions-eyebrow-tag">DURABLE ENGINEERING MEMORY</span>
              <span className="decisions-eyebrow-count">{decisions.length} Records</span>
            </div>
            <h1 className="decisions-header__title">Architectural Decisions</h1>
            <p className="decisions-header__description">
              Durable record of architectural choices, boundary invariants, and engineering
              tradeoffs. Preserves rationale beyond ephemeral pull requests without transmitting
              source code.
            </p>
          </div>

          <div className="decisions-header__action">
            <button
              type="button"
              className="trace-button trace-button--primary"
              onClick={() => setIsPromptBuilderOpen(true)}
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
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Draft decision prompt</span>
            </button>
          </div>
        </div>

        {/* Intelligence Metrics Bar */}
        <div
          className="decisions-metrics-bar"
          role="region"
          aria-label="Decisions overview metrics"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="decision-metric-item">
            <span className="decision-metric-label">TOTAL DECISIONS</span>
            <span className="decision-metric-value">{decisions.length}</span>
            <span className="decision-metric-sub">Across {repositories.length} workspaces</span>
          </div>
          <div className="decision-metric-divider" />
          <div className="decision-metric-item">
            <span className="decision-metric-label">ACTIVE REPOSITORIES</span>
            <span className="decision-metric-value">
              {activeReposCount} / {repositories.length}
            </span>
            <span className="decision-metric-sub">{activeRepoNames || 'Active workspaces'}</span>
          </div>
          <div className="decision-metric-divider" />
          <div className="decision-metric-item">
            <span className="decision-metric-label">AST EVIDENCE LOCI</span>
            <span className="decision-metric-value">
              {decisions.reduce(
                (acc, d) => acc + d.items.reduce((iAcc, item) => iAcc + item.evidence.length, 0),
                0,
              )}
            </span>
            <span className="decision-metric-sub">Deterministic proofs</span>
          </div>
          <div className="decision-metric-divider" />
          <div className="decision-metric-item">
            <span className="decision-metric-label">PROVENANCE GUARANTEE</span>
            <span className="decision-metric-value decision-metric-value--pill">
              APPROVED LOCAL
            </span>
            <span className="decision-metric-sub">Zero source transmission</span>
          </div>
        </div>
      </header>

      {/* 2. Structured Two-Row Filter & Search Toolbar */}
      <section
        className="decisions-toolbar"
        aria-label="Filter and search decisions"
        data-trace-motion="item"
        style={{ '--motion-index': 2 } as React.CSSProperties}
      >
        {/* Row 1: Search flexible/full width */}
        <div className="decisions-toolbar__row decisions-toolbar__row--search">
          <label htmlFor={searchInputId} className="sr-only">
            Search decisions by title, context, rationale, or evidence
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
              placeholder="Search decisions, context, rationale, or file paths..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="decisions-search-input"
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

        {/* Row 2: Repository pills, sort, bulk toggle, reset button */}
        <div className="decisions-toolbar__row decisions-toolbar__row--controls">
          {/* Repository Pills */}
          <div className="decisions-repo-pills" role="group" aria-label="Repository filter">
            <button
              type="button"
              className={`repo-pill ${selectedRepoId === 'all' ? 'repo-pill--active' : ''}`}
              onClick={() => setSelectedRepoId('all')}
            >
              All Repositories <span className="pill-count">{decisions.length}</span>
            </button>
            {repositories.map((repo) => {
              const count = repoDecisionCounts.get(repo.id) ?? 0;
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

          <div className="decisions-toolbar__actions">
            {/* Sort Dropdown */}
            <div className="decisions-sort-control">
              <label htmlFor={sortSelectId} className="sr-only">
                Sort decisions by
              </label>
              <TraceSelect
                id={sortSelectId}
                value={sortBy}
                onChange={(val) => setSortBy(val as 'newest' | 'oldest' | 'repository' | 'title')}
                ariaLabel="Sort decisions by"
                size="sm"
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                  { value: 'repository', label: 'By repository' },
                  { value: 'title', label: 'By title' },
                ]}
              />
            </div>

            {/* Expand / Collapse All Toggle */}
            <div className="decisions-bulk-toggle">
              <button
                type="button"
                className="bulk-toggle-btn"
                onClick={expandedIds.size === sortedDecisions.length ? collapseAll : expandAll}
                title={
                  expandedIds.size === sortedDecisions.length
                    ? 'Collapse all records'
                    : 'Expand all records'
                }
              >
                {expandedIds.size === sortedDecisions.length ? 'Collapse all' : 'Expand all'}
              </button>
            </div>

            {/* Reset Filters at End */}
            {isFiltered && (
              <button
                type="button"
                className="trace-button trace-button--secondary trace-button--sm decisions-reset-btn"
                onClick={() => {
                  setSelectedRepoId('all');
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
      {isFiltered && (
        <div className="decisions-filter-status">
          <span>
            Showing <strong>{sortedDecisions.length}</strong> of <strong>{decisions.length}</strong>{' '}
            decisions
            {selectedRepoId !== 'all' && (
              <>
                {' '}
                in <strong>{selectedRepoObj?.name ?? selectedRepoId}</strong>
              </>
            )}
            {searchQuery.trim() && (
              <>
                {' '}
                matching <em>&ldquo;{searchQuery}&rdquo;</em>
              </>
            )}
          </span>
        </div>
      )}

      {/* 3. Decision List Surface */}
      {sortedDecisions.length > 0 ? (
        <main
          className="decisions-list"
          aria-label="Decisions records list"
          data-trace-motion="section"
          data-motion-section="decisions-list"
        >
          {sortedDecisions.map((decision, idx) => {
            const isExpanded = expandedIds.has(decision.id);
            const parsed = parseDecisionSections(decision.content);
            const repo = repositories.find((r) => r.id === decision.repositoryId);
            const repoShortName =
              repo?.name ?? decision.repositoryName.split('/').pop() ?? decision.repositoryName;

            // Related findings lookup
            const linkedFindings = attention.filter(
              (a) =>
                a.repositoryId === decision.repositoryId &&
                (decision.relatedFindingIds?.includes(a.id) ||
                  decision.items.some((i) => i.findingId === a.id)),
            );

            // Related changes lookup
            const linkedChanges = changes.filter(
              (c) =>
                c.repositoryId === decision.repositoryId &&
                (decision.relatedChangeIds?.includes(c.id) ||
                  decision.items.some((i) => i.changeId === c.id || i.changeNumber === c.number)),
            );

            const evidenceCount = decision.items.reduce((acc, i) => acc + i.evidence.length, 0);

            return (
              <article
                key={decision.id}
                id={`decision-${decision.id}`}
                className={`decision-record ${isExpanded ? 'decision-record--expanded' : ''}`}
                data-trace-motion="item"
                style={{ '--motion-index': idx } as React.CSSProperties}
              >
                {/* Clickable Header Row */}
                <header
                  className="decision-record__header"
                  onClick={() => toggleExpand(decision.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-controls={`decision-content-${decision.id}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(decision.id);
                    }
                  }}
                >
                  <div className="decision-header-main">
                    {/* Eyebrow & Badges */}
                    <div className="decision-eyebrow-row">
                      <span className="decision-repo-tag">{repoShortName}</span>
                      <span className="decision-status-tag">
                        <span className="status-bullet" aria-hidden="true">
                          â—
                        </span>
                        {decision.status ?? 'Recorded'}
                      </span>
                      <span className="decision-date-tag">{formatDate(decision.generatedAt)}</span>
                    </div>

                    {/* Title */}
                    <h2 className="decision-title">{decision.title}</h2>

                    {/* Summary Statement with comfortable line measure */}
                    <p className="decision-summary">{decision.summary}</p>

                    {/* Collapsed Metadata Tokens */}
                    <div className="decision-meta-row">
                      <span className="meta-token">
                        <strong className="token-label">Evidence:</strong> {evidenceCount} files
                      </span>
                      <span className="meta-token-divider">Â·</span>
                      {linkedFindings.length > 0 && (
                        <>
                          <span className="meta-token">
                            <strong className="token-label">Linked finding:</strong>{' '}
                            {linkedFindings.length}
                          </span>
                          <span className="meta-token-divider">Â·</span>
                        </>
                      )}
                      <span className="meta-token meta-token--provenance">
                        Origin: Approved local sync
                      </span>
                    </div>
                  </div>

                  {/* Expand / Inspect Action */}
                  <div className="decision-header-action">
                    <span className="trace-button trace-button--secondary trace-button--sm inspect-pill-btn">
                      <span>{isExpanded ? 'Collapse' : 'Inspect'}</span>
                      <svg
                        className={`expand-chevron ${isExpanded ? 'expand-chevron--open' : ''}`}
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
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>
                </header>

                {/* Expanded Architectural Document Body */}
                <DecisionDisclosureBody
                  isExpanded={isExpanded}
                  decision={decision}
                  parsed={parsed}
                  linkedFindings={linkedFindings}
                  linkedChanges={linkedChanges}
                  copiedId={copiedId}
                  copyCliCommand={copyCliCommand}
                />
              </article>
            );
          })}
        </main>
      ) : (
        /* Empty / Zero-Records State */
        <div
          className="decisions-empty-surface"
          role="region"
          aria-label="No decisions found"
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            {selectedRepoObj &&
            decisions.filter((d) => d.repositoryId === selectedRepoObj.id).length === 0 &&
            !searchQuery.trim() ? (
              <>
                <h2 className="empty-title">
                  No decisions recorded for {selectedRepoObj.name} yet
                </h2>
                <p className="empty-description">
                  {selectedRepoObj.name} has 0 recorded architectural decisions. Decision records
                  will appear here when local <code>.trace/</code> decision artifacts pass policy
                  review and sync.
                </p>
                <div className="empty-cli-box">
                  <code>trace analyze &amp;&amp; trace sync</code>
                </div>
              </>
            ) : (
              <>
                <h2 className="empty-title">No matching decisions found</h2>
                <p className="empty-description">
                  No architectural decisions match the search query &ldquo;{searchQuery}&rdquo; in
                  the selected filter scope.
                </p>
                <button
                  type="button"
                  className="trace-button trace-button--secondary"
                  onClick={() => {
                    setSelectedRepoId('all');
                    setSearchQuery('');
                  }}
                >
                  Clear all filters
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. Footer Note: Zero-Surveillance Privacy Guarantee */}
      <footer
        className="decisions-privacy-footer"
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
            <strong>Zero-Surveillance Architecture:</strong> TRACE decision records preserve team
            architectural memory and invariant rules without storing raw source code or scoring
            individual developer output.
          </p>
          <Link href="/privacy" className="privacy-link">
            Read privacy guarantee â†’
          </Link>
        </div>
      </footer>

      {/* Decision Definition Prompt Builder Dialog */}
      <DecisionPromptBuilder
        isOpen={isPromptBuilderOpen}
        onClose={() => setIsPromptBuilderOpen(false)}
        repositories={repositories}
        defaultRepoId={selectedRepoId !== 'all' ? selectedRepoId : undefined}
      />
    </div>
  );
}

interface DecisionDisclosureBodyProps {
  isExpanded: boolean;
  decision: DashboardSyncedRecord;
  parsed: ReturnType<typeof parseDecisionSections>;
  linkedFindings: DashboardAttention[];
  linkedChanges: DashboardChange[];
  copiedId: string | null;
  copyCliCommand: (decision: DashboardSyncedRecord) => void;
}

function DecisionDisclosureBody({
  isExpanded,
  decision,
  parsed,
  linkedFindings,
  linkedChanges,
  copiedId,
  copyCliCommand,
}: DecisionDisclosureBodyProps) {
  const presence = usePresence(isExpanded);

  if (!presence.isMounted) {
    return null;
  }

  return (
    <div
      id={`decision-content-${decision.id}`}
      className="decision-record__body"
      data-trace-motion="disclosure"
      {...presence.presenceProps}
    >
      {/* Top Architectural Invariant Details */}
      <div className="decision-body-grid">
        {/* Left: Context & Rationale */}
        <div className="decision-body-column">
          {/* Context Section */}
          {parsed.context.length > 0 && (
            <div className="decision-content-section" {...getMotionItemProps(0)}>
              <h3 className="section-title">Context &amp; Motivation</h3>
              <div className="section-text-stack">
                {parsed.context.map((line, idx) => (
                  <p key={idx} className="section-paragraph">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Decision Mandate Rules */}
          {parsed.decisionRules.length > 0 && (
            <div className="decision-content-section" {...getMotionItemProps(1)}>
              <h3 className="section-title">Decision &amp; Architectural Mandates</h3>
              <ul className="decision-rules-list">
                {parsed.decisionRules.map((rule, idx) => (
                  <li key={idx} className="rule-item">
                    <span className="rule-bullet" aria-hidden="true">
                      â–¸
                    </span>
                    <span className="rule-text">{cleanMarkdownLine(rule)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Consequences & Invariants */}
          {parsed.consequences.length > 0 && (
            <div className="decision-content-section" {...getMotionItemProps(2)}>
              <h3 className="section-title">Consequences &amp; Invariants</h3>
              <ul className="consequences-list">
                {parsed.consequences.map((cons, idx) => (
                  <li key={idx} className="consequence-item">
                    <span className="cons-bullet" aria-hidden="true">
                      âœ“
                    </span>
                    <span className="cons-text">{cleanMarkdownLine(cons)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: AST Evidence & Provenance Rail */}
        <aside
          className="decision-aside-column"
          aria-label="Evidence and provenance"
          {...getMotionItemProps(1)}
        >
          {/* AST Evidence Box */}
          <div className="aside-box">
            <h4 className="aside-box__title">Deterministic AST Evidence</h4>
            <div className="evidence-items-list">
              {decision.items.map((item) => (
                <div key={item.id} className="evidence-item-card">
                  <div className="item-card-header">
                    <strong className="item-card-title">{item.title}</strong>
                    <span className="item-classification-pill">
                      {item.classification ?? 'deterministic'}
                    </span>
                  </div>
                  <p className="item-card-detail">{item.detail}</p>
                  {item.evidence.length > 0 && (
                    <div className="item-evidence-loci">
                      <span className="loci-label">VERIFIED FILE LOCI:</span>
                      <div className="loci-token-list">
                        {item.evidence.map((path, pIdx) => (
                          <code key={pIdx} className="loci-code-pill">
                            {path}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Linked Findings */}
          {linkedFindings.length > 0 && (
            <div className="aside-box">
              <h4 className="aside-box__title">Linked Attention Findings</h4>
              <div className="linked-findings-list">
                {linkedFindings.map((finding) => (
                  <div key={finding.id} className="linked-finding-card">
                    <div className="linked-finding-top">
                      <span className="finding-kind-tag">{finding.kind}</span>
                      <span className="finding-class-tag">{finding.classification}</span>
                    </div>
                    <h5 className="linked-finding-title">{finding.title}</h5>
                    <p className="linked-finding-detail">{presentFindingDetail(finding.detail)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Pull Requests */}
          {linkedChanges.length > 0 && (
            <div className="aside-box">
              <h4 className="aside-box__title">Related Pull Requests</h4>
              <div className="linked-pr-list">
                {linkedChanges.map((change) => (
                  <div key={change.id} className="linked-pr-item">
                    <span className="pr-number-pill">PR #{change.number}</span>
                    <span className="pr-title-text">{change.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Provenance & CLI Box */}
          <div className="aside-box aside-box--cli">
            <h4 className="aside-box__title">Local CLI Inspection</h4>
            <p className="cli-desc">
              View this decision and cryptographic invariant proofs in your terminal:
            </p>
            <div className="cli-code-block">
              <code>trace inspect .trace/decisions/{decision.id}.json</code>
              <button
                type="button"
                className="cli-copy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  copyCliCommand(decision);
                }}
                title="Copy CLI command to clipboard"
              >
                {copiedId === decision.id ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="provenance-facts">
              <div className="fact-row">
                <span className="fact-key">Artifact ID:</span>
                <code className="fact-val">{decision.artifactId}</code>
              </div>
              <div className="fact-row">
                <span className="fact-key">Repository:</span>
                <span className="fact-val">{decision.repositoryName}</span>
              </div>
              <div className="fact-row">
                <span className="fact-key">Synced:</span>
                <span className="fact-val">{formatRelativeDate(decision.syncedAt)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
