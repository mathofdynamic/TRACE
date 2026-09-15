'use client';

import { useId, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { TraceSelect } from './trace-select';
import { RulePromptBuilder } from './rule-prompt-builder';
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

export type RulesViewProps = {
  rules: DashboardSyncedRecord[];
  repositories: DashboardRepository[];
  changes?: DashboardChange[];
  attention?: DashboardAttention[];
  initialSelectedRepoId?: string;
};

type ParsedRuleContent = {
  ruleTitle?: string;
  requirements: string[];
  otherLines: string[];
};

function parseRuleContent(content: string): ParsedRuleContent {
  const lines = content.split(/\r?\n/);
  let ruleTitle: string | undefined;
  const requirements: string[] = [];
  const otherLines: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# ')) {
      ruleTitle = trimmed.replace(/^#\s+/, '').replace(/^Repository Rule:\s*/i, '');
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed) || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      requirements.push(trimmed.replace(/^\d+\.\s+/, '').replace(/^[-*]\s+/, ''));
    } else {
      otherLines.push(trimmed);
    }
  }

  return { ruleTitle, requirements, otherLines };
}

function getRuleMaxSeverity(rule: DashboardSyncedRecord): 'high' | 'medium' | 'low' {
  let hasHigh = false;
  let hasMedium = false;
  for (const item of rule.items) {
    const s = item.severity?.toLowerCase();
    if (s === 'high' || s === 'critical') hasHigh = true;
    if (s === 'medium') hasMedium = true;
  }
  if (hasHigh) return 'high';
  if (hasMedium) return 'medium';
  return 'low';
}

export function RulesView({
  rules,
  repositories,
  changes = [],
  attention = [],
  initialSelectedRepoId,
}: RulesViewProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(initialSelectedRepoId ?? 'all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'severity' | 'newest' | 'oldest' | 'repository' | 'title'>(
    'severity',
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState<boolean>(false);

  const searchInputId = useId();
  const repoSelectId = useId();
  const severitySelectId = useId();
  const sortSelectId = useId();

  // Sync initialSelectedRepoId when prop updates
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
    setExpandedIds(new Set(rules.map((r) => r.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const copyCliCommand = (rule: DashboardSyncedRecord) => {
    const cmd = `trace rules explain ${rule.id}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    setCopiedId(rule.id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === rule.id ? null : curr));
    }, 2000);
  };

  // Repository count map
  const repoRuleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of repositories) {
      counts.set(r.id, 0);
    }
    for (const rule of rules) {
      counts.set(rule.repositoryId, (counts.get(rule.repositoryId) ?? 0) + 1);
    }
    return counts;
  }, [rules, repositories]);

  // Severity counts
  const severityCounts = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const rule of rules) {
      const sev = getRuleMaxSeverity(rule);
      if (sev === 'high') high++;
      else if (sev === 'medium') medium++;
      else low++;
    }
    return { high, medium, low };
  }, [rules]);

  // Total evidence paths count
  const totalEvidencePaths = useMemo(() => {
    return rules.reduce(
      (acc, r) => acc + r.items.reduce((iAcc, item) => iAcc + item.evidence.length, 0),
      0,
    );
  }, [rules]);

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      // Repo filter
      if (selectedRepoId !== 'all' && rule.repositoryId !== selectedRepoId) {
        return false;
      }
      // Severity filter
      const maxSev = getRuleMaxSeverity(rule);
      if (selectedSeverity !== 'all' && maxSev !== selectedSeverity) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = rule.title.toLowerCase().includes(q);
        const matchesSummary = rule.summary.toLowerCase().includes(q);
        const matchesRepo = rule.repositoryName.toLowerCase().includes(q);
        const matchesContent = rule.content.toLowerCase().includes(q);
        const matchesItems = rule.items.some(
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
  }, [rules, selectedRepoId, selectedSeverity, searchQuery]);

  // Sorted rules
  const sortedRules = useMemo(() => {
    const sevRank: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };
    return [...filteredRules].sort((a, b) => {
      if (sortBy === 'severity') {
        const rankDiff =
          (sevRank[getRuleMaxSeverity(b)] ?? 0) - (sevRank[getRuleMaxSeverity(a)] ?? 0);
        if (rankDiff !== 0) return rankDiff;
        return a.title.localeCompare(b.title);
      }
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
  }, [filteredRules, sortBy]);

  const selectedRepoObj = useMemo(() => {
    return repositories.find((r) => r.id === selectedRepoId);
  }, [repositories, selectedRepoId]);

  return (
    <div className="rules-surface" id="rules-root">
      {/* 1. Header & Summary Intelligence Bar */}
      <header className="rules-header">
        <div
          className="rules-header__top"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="rules-header__copy">
            <div className="rules-header__eyebrow">
              <span className="rules-eyebrow-tag">GOVERNANCE &amp; BOUNDARY POLICIES</span>
              <span className="rules-eyebrow-count">{rules.length} Synchronized Rules</span>
            </div>
            <h1 className="rules-header__title">Repository Governance Rules</h1>
            <p className="rules-header__description">
              Explicit architectural boundary contracts, security invariants, and review
              expectations. Enforced deterministically during local analysis and synchronized via
              cryptographic review without transmitting source code.
            </p>
          </div>

          <div className="rules-header__action">
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
              <span>Draft rule prompt</span>
            </button>
          </div>
        </div>

        {/* Intelligence Metrics Bar */}
        <div
          className="rules-metrics-bar"
          role="region"
          aria-label="Governance rules overview metrics"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="rule-metric-item">
            <span className="rule-metric-label">TOTAL RULES</span>
            <span className="rule-metric-value">{rules.length}</span>
            <span className="rule-metric-sub">Across {repositories.length} workspaces</span>
          </div>
          <div className="rule-metric-divider" />
          <div className="rule-metric-item">
            <span className="rule-metric-label">SEVERITY INVARIANTS</span>
            <span className="rule-metric-value">
              {severityCounts.high} High Â· {severityCounts.medium} Med Â· {severityCounts.low} Low
            </span>
            <span className="rule-metric-sub">Policy weights</span>
          </div>
          <div className="rule-metric-divider" />
          <div className="rule-metric-item">
            <span className="rule-metric-label">AST EVIDENCE MATCHERS</span>
            <span className="rule-metric-value">{totalEvidencePaths} Loci</span>
            <span className="rule-metric-sub">Deterministic path patterns</span>
          </div>
          <div className="rule-metric-divider" />
          <div className="rule-metric-item">
            <span className="rule-metric-label">ENFORCEMENT TRUTH</span>
            <span className="rule-metric-value rule-metric-value--pill">
              DETERMINISTIC EVALUATION
            </span>
            <span className="rule-metric-sub">Zero surveillance scoring</span>
          </div>
        </div>
      </header>

      {/* 2. Filter & Search Controls Toolbar */}
      <section
        className="rules-toolbar"
        aria-label="Filter and search governance rules"
        data-trace-motion="item"
        style={{ '--motion-index': 2 } as React.CSSProperties}
      >
        {/* Row 1: Search flexible / full width */}
        <div className="rules-toolbar__row rules-toolbar__row--search">
          <label htmlFor={searchInputId} className="sr-only">
            Search rules by title, summary, constraints, or evidence paths
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
              placeholder="Search governance rules, constraints, or file matchers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rules-search-input"
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

        {/* Row 2: Repository pills, severity, sort, bulk toggle, reset button */}
        <div className="rules-toolbar__row rules-toolbar__row--controls">
          {/* Repository Scope Pills */}
          <div className="rules-repo-pills" role="group" aria-label="Repository filter">
            <button
              type="button"
              className={`repo-pill ${selectedRepoId === 'all' ? 'repo-pill--active' : ''}`}
              onClick={() => setSelectedRepoId('all')}
            >
              All Repositories <span className="pill-count">{rules.length}</span>
            </button>
            {repositories.map((repo) => {
              const count = repoRuleCounts.get(repo.id) ?? 0;
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

          <div className="rules-toolbar__actions">
            {/* Severity Filter Dropdown */}
            <div className="rules-select-control">
              <label htmlFor={severitySelectId} className="sr-only">
                Filter by severity
              </label>
              <TraceSelect
                id={severitySelectId}
                value={selectedSeverity}
                onChange={setSelectedSeverity}
                ariaLabel="Filter by severity"
                size="sm"
                options={[
                  { value: 'all', label: 'All Severities' },
                  { value: 'high', label: 'High', count: severityCounts.high },
                  { value: 'medium', label: 'Medium', count: severityCounts.medium },
                  { value: 'low', label: 'Low', count: severityCounts.low },
                ]}
              />
            </div>

            {/* Sort Dropdown */}
            <div className="rules-select-control">
              <label htmlFor={sortSelectId} className="sr-only">
                Sort rules by
              </label>
              <TraceSelect
                id={sortSelectId}
                value={sortBy}
                onChange={(val) =>
                  setSortBy(val as 'severity' | 'newest' | 'oldest' | 'repository' | 'title')
                }
                ariaLabel="Sort rules by"
                size="sm"
                options={[
                  { value: 'severity', label: 'By severity' },
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                  { value: 'repository', label: 'By repository' },
                  { value: 'title', label: 'By title' },
                ]}
              />
            </div>

            {/* Expand / Collapse All Toggle */}
            <div className="rules-bulk-toggle">
              <button
                type="button"
                className="bulk-toggle-btn"
                onClick={expandedIds.size === sortedRules.length ? collapseAll : expandAll}
                title={
                  expandedIds.size === sortedRules.length
                    ? 'Collapse all records'
                    : 'Expand all records'
                }
              >
                {expandedIds.size === sortedRules.length ? 'Collapse all' : 'Expand all'}
              </button>
            </div>

            {/* Reset Filters at End */}
            {(selectedRepoId !== 'all' ||
              selectedSeverity !== 'all' ||
              searchQuery.trim().length > 0) && (
              <button
                type="button"
                className="trace-button trace-button--secondary trace-button--sm rules-reset-btn"
                onClick={() => {
                  setSelectedRepoId('all');
                  setSelectedSeverity('all');
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
      {(selectedRepoId !== 'all' || selectedSeverity !== 'all' || searchQuery.trim()) && (
        <div className="rules-filter-status">
          <span>
            Showing <strong>{sortedRules.length}</strong> of <strong>{rules.length}</strong> rules
            {selectedRepoId !== 'all' && (
              <>
                {' '}
                in <strong>{selectedRepoObj?.name ?? selectedRepoId}</strong>
              </>
            )}
            {selectedSeverity !== 'all' && (
              <>
                {' '}
                with <strong>{selectedSeverity.toUpperCase()}</strong> severity
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

      {/* 3. Rules List Surface */}
      {sortedRules.length > 0 ? (
        <main
          className="rules-list"
          aria-label="Governance rules list"
          data-trace-motion="section"
          data-motion-section="rules-list"
        >
          {sortedRules.map((rule, idx) => {
            const isExpanded = expandedIds.has(rule.id);
            const parsed = parseRuleContent(rule.content);
            const repo = repositories.find((r) => r.id === rule.repositoryId);
            const repoShortName =
              repo?.name ?? rule.repositoryName.split('/').pop() ?? rule.repositoryName;
            const maxSeverity = getRuleMaxSeverity(rule);

            // Related attention findings lookup
            const linkedFindings = attention.filter((a) => {
              if (a.repositoryId !== rule.repositoryId) return false;
              if (
                a.provenance?.ruleId &&
                (rule.id.includes(a.provenance.ruleId) || a.provenance.ruleId.includes(rule.id))
              ) {
                return true;
              }
              return rule.items.some((i) =>
                i.evidence.some((e) => {
                  const cleanPattern = e.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
                  return a.evidence.some((ae) => {
                    const baseFile = ae.split(':')[0] ?? '';
                    return (
                      ae.includes(cleanPattern) ||
                      (baseFile ? cleanPattern.includes(baseFile) : false)
                    );
                  });
                }),
              );
            });

            // Extract all evidence paths for the rule
            const allEvidencePaths = Array.from(
              new Set(rule.items.flatMap((item) => item.evidence)),
            );

            return (
              <article
                key={rule.id}
                id={`rule-${rule.id}`}
                className={`rule-record ${isExpanded ? 'rule-record--expanded' : ''}`}
                data-trace-motion="item"
                style={{ '--motion-index': idx } as React.CSSProperties}
              >
                {/* Clickable Header Row */}
                <header
                  className="rule-record__header"
                  onClick={() => toggleExpand(rule.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-controls={`rule-content-${rule.id}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(rule.id);
                    }
                  }}
                >
                  <div className="rule-header-main">
                    {/* Eyebrow & Badges */}
                    <div className="rule-eyebrow-row">
                      <span className="rule-repo-tag">{repoShortName}</span>

                      {/* Neutral Severity Tag - Strictly NO Red/Amber/Green */}
                      <span className="rule-severity-tag">
                        <span className="severity-weight-label">
                          {maxSeverity.toUpperCase()} SEVERITY
                        </span>
                      </span>

                      {/* Neutral Status Tag */}
                      <span className="rule-status-tag">
                        <span className="status-bullet" aria-hidden="true">
                          â—
                        </span>
                        ACTIVE INVARIANT
                      </span>

                      <span className="rule-date-tag">{formatDate(rule.generatedAt)}</span>
                    </div>

                    {/* Title */}
                    <h2 className="rule-title">{rule.title}</h2>

                    {/* Concise Requirement Synopsis */}
                    <p className="rule-summary">{rule.summary}</p>

                    {/* Collapsed Metadata Tokens */}
                    <div className="rule-meta-row">
                      <span className="meta-token">
                        <strong className="token-label">Scope:</strong>{' '}
                        {allEvidencePaths.slice(0, 2).join(', ')}
                        {allEvidencePaths.length > 2 ? ` +${allEvidencePaths.length - 2} more` : ''}
                      </span>
                      <span className="meta-token-divider">Â·</span>
                      <span className="meta-token">
                        <strong className="token-label">Constraints:</strong> {rule.items.length}{' '}
                        checks
                      </span>
                      <span className="meta-token-divider">Â·</span>
                      {linkedFindings.length > 0 && (
                        <>
                          <span className="meta-token">
                            <strong className="token-label">Linked findings:</strong>{' '}
                            {linkedFindings.length}
                          </span>
                          <span className="meta-token-divider">Â·</span>
                        </>
                      )}
                      <span className="meta-token meta-token--provenance">
                        Origin: Approved local artifact
                      </span>
                    </div>
                  </div>

                  {/* Expand / Inspect Action */}
                  <div className="rule-header-action">
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

                {/* Expanded Governance Policy Body */}
                <RuleDisclosureBody
                  isExpanded={isExpanded}
                  rule={rule}
                  parsed={parsed}
                  allEvidencePaths={allEvidencePaths}
                  linkedFindings={linkedFindings}
                  copiedId={copiedId}
                  copyCliCommand={copyCliCommand}
                />
              </article>
            );
          })}
        </main>
      ) : (
        /* Empty / Zero-Rules State */
        <div
          className="rules-empty-surface"
          role="region"
          aria-label="No governance rules found"
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
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            {selectedRepoObj &&
            rules.filter((r) => r.repositoryId === selectedRepoObj.id).length === 0 &&
            !searchQuery.trim() &&
            selectedSeverity === 'all' ? (
              <>
                <h2 className="empty-title">
                  No governance rules recorded for {selectedRepoObj.name} yet
                </h2>
                <p className="empty-description">
                  {selectedRepoObj.name} has 0 active governance rules. Rule definitions will appear
                  here when local <code>.trace/rules.json</code> policy artifacts pass verification
                  and sync.
                </p>
                <div className="empty-cli-box">
                  <code>trace analyze &amp;&amp; trace sync</code>
                </div>
              </>
            ) : (
              <>
                <h2 className="empty-title">No matching governance rules found</h2>
                <p className="empty-description">
                  No rules match the current filters
                  {searchQuery.trim() ? ` for â€œ${searchQuery}â€` : ''}.
                </p>
                <button
                  type="button"
                  className="trace-button trace-button--secondary"
                  onClick={() => {
                    setSelectedRepoId('all');
                    setSelectedSeverity('all');
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

      {/* 4. Privacy & Governance Truth Footer Note */}
      <footer
        className="rules-privacy-footer"
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
            <strong>Deterministic Review Invariant:</strong> TRACE rules make review expectations
            explicit and explainable without computing surveillance metrics, ranking individual
            developers, or transmitting raw source files.
          </p>
          <Link href="/docs#rules" className="privacy-link">
            Read governance docs â†’
          </Link>
        </div>
      </footer>

      {/* 5. Draft Rule Prompt Modal Dialog */}
      <RulePromptBuilder
        isOpen={isPromptBuilderOpen}
        onClose={() => setIsPromptBuilderOpen(false)}
        repositories={repositories}
        defaultRepoId={selectedRepoId !== 'all' ? selectedRepoId : undefined}
      />
    </div>
  );
}

interface RuleDisclosureBodyProps {
  isExpanded: boolean;
  rule: DashboardSyncedRecord;
  parsed: ParsedRuleContent;
  allEvidencePaths: string[];
  linkedFindings: DashboardAttention[];
  copiedId: string | null;
  copyCliCommand: (rule: DashboardSyncedRecord) => void;
}

function RuleDisclosureBody({
  isExpanded,
  rule,
  parsed,
  allEvidencePaths,
  linkedFindings,
  copiedId,
  copyCliCommand,
}: RuleDisclosureBodyProps) {
  const presence = usePresence(isExpanded);

  if (!presence.isMounted) {
    return null;
  }

  return (
    <div
      id={`rule-content-${rule.id}`}
      className="rule-record__body"
      data-trace-motion="disclosure"
      {...presence.presenceProps}
    >
      <div className="rule-body-grid">
        {/* Left: What It Protects & Constraints */}
        <div className="rule-body-column">
          {/* What This Rule Protects */}
          <div className="rule-content-section" {...getMotionItemProps(0)}>
            <h3 className="section-title">What This Rule Protects</h3>
            <p className="section-paragraph">{rule.summary}</p>
          </div>

          {/* Checks & Constraints */}
          <div className="rule-content-section" {...getMotionItemProps(1)}>
            <h3 className="section-title">Automated Checks &amp; Constraints</h3>
            <div className="rule-constraints-stack">
              {rule.items.map((item) => (
                <div key={item.id} className="rule-constraint-card">
                  <div className="constraint-card-top">
                    <strong className="constraint-card-title">{item.title}</strong>
                    <div className="constraint-badge-group">
                      <span className="constraint-sev-pill">{item.severity ?? 'high'}</span>
                      <span className="constraint-class-pill">
                        {item.classification ?? 'deterministic'}
                      </span>
                    </div>
                  </div>
                  <p className="constraint-card-detail">{item.detail}</p>
                  {item.evidence.length > 0 && (
                    <div className="constraint-loci">
                      <span className="loci-header">MATCH PATTERNS:</span>
                      <div className="loci-pills-row">
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

          {/* Policy Requirements Specification */}
          {parsed.requirements.length > 0 && (
            <div className="rule-content-section" {...getMotionItemProps(2)}>
              <h3 className="section-title">Policy Invariants &amp; Rules</h3>
              <ul className="rule-requirements-list">
                {parsed.requirements.map((req, rIdx) => (
                  <li key={rIdx} className="requirement-item">
                    <span className="req-bullet" aria-hidden="true">
                      â–¸
                    </span>
                    <span className="req-text">{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: Applicability & Provenance Rail */}
        <aside
          className="rule-aside-column"
          aria-label="Rule scope and provenance"
          {...getMotionItemProps(1)}
        >
          {/* Target Scope & Matchers Box */}
          <div className="aside-box">
            <h4 className="aside-box__title">Applicable Path Scope</h4>
            <div className="scope-paths-list">
              {allEvidencePaths.map((path, pIdx) => (
                <div key={pIdx} className="scope-path-row">
                  <code className="scope-code-pill">{path}</code>
                </div>
              ))}
            </div>
            <p className="scope-explanation">
              Changes matching these file path patterns trigger automated boundary validation during
              `trace analyze`.
            </p>
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

          {/* Local CLI Inspection */}
          <div className="aside-box aside-box--cli">
            <h4 className="aside-box__title">Local CLI Inspection</h4>
            <p className="cli-desc">
              Inspect rule evaluation and check local compliance in your terminal:
            </p>
            <div className="cli-code-block">
              <code>trace rules explain {rule.id}</code>
              <button
                type="button"
                className="cli-copy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  copyCliCommand(rule);
                }}
                title="Copy CLI command to clipboard"
              >
                {copiedId === rule.id ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="provenance-facts">
              <div className="fact-row">
                <span className="fact-key">Artifact ID:</span>
                <code className="fact-val">{rule.artifactId}</code>
              </div>
              <div className="fact-row">
                <span className="fact-key">Repository:</span>
                <span className="fact-val">{rule.repositoryName}</span>
              </div>
              <div className="fact-row">
                <span className="fact-key">Synchronized:</span>
                <span className="fact-val">{formatRelativeDate(rule.syncedAt)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
