'use client';

import { useState } from 'react';
import Link from 'next/link';
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

export type ReportDetailViewProps = {
  report: DashboardSyncedRecord;
  repository?: DashboardRepository;
  relatedChanges: DashboardChange[];
  relatedFindings: DashboardAttention[];
};

type ViewTab = 'readable' | 'raw' | 'provenance';

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

interface ParsedSection {
  title: string;
  lines: string[];
}

function parseMarkdownDocument(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection = { title: 'Overview', lines: [] };

  for (const line of content.split(/\r?\n/)) {
    const headingMatch = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      if (current.lines.some((l) => l.trim().length > 0)) {
        sections.push(current);
      }
      current = {
        title: headingMatch[2]!.replaceAll('**', '').trim(),
        lines: [],
      };
      continue;
    }
    // Skip frontmatter or top h1 if already in title
    if (!/^#\s+/.test(line) || current.title !== 'Overview') {
      current.lines.push(line);
    }
  }

  if (current.lines.some((l) => l.trim().length > 0)) {
    sections.push(current);
  }

  return sections;
}

export function ReportDetailView({
  report,
  repository,
  relatedChanges,
  relatedFindings,
}: ReportDetailViewProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('readable');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedText(label);
    setTimeout(() => {
      setCopiedText((curr) => (curr === label ? null : curr));
    }, 2000);
  };

  const parsedSections = parseMarkdownDocument(report.content);

  const isNeedsRefresh = report.freshness === 'needs-refresh';
  const isAttention = report.freshness === 'attention';

  return (
    <div className="report-detail-surface">
      {/* 1. Breadcrumb Top Bar */}
      <nav
        className="report-detail-breadcrumb"
        aria-label="Breadcrumb navigation"
        data-trace-motion="item"
        style={{ '--motion-index': 0 } as React.CSSProperties}
      >
        <Link href="/app/reports" className="report-breadcrumb-link">
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
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to reports library
        </Link>
        <span className="breadcrumb-separator" aria-hidden="true">
          /
        </span>
        <span className="report-breadcrumb-current">
          {report.repositoryName.split('/')[1] ?? report.repositoryName} Â· {report.id}
        </span>
      </nav>

      {/* 2. Main Two-Column Document Layout */}
      <div className="report-detail-layout">
        {/* Left/Center Document Column */}
        <main
          className="report-document-column"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <article className="report-document-surface" aria-label={`Report: ${report.title}`}>
            {/* Document Header */}
            <header className="report-doc-header">
              <div className="report-doc-header__eyebrow">
                <span className="report-type-badge">
                  {formatArtifactTypeLabel(report.artifactType)}
                </span>
                {repository ? (
                  <Link href={`/app/repositories/${repository.id}`} className="report-repo-tag">
                    {repository.fullName}
                  </Link>
                ) : (
                  <span className="report-repo-tag">{report.repositoryName}</span>
                )}
                <span className="report-origin-tag">Approved local sync</span>
              </div>

              <h1 className="report-doc-header__title">{report.title}</h1>

              <p className="report-doc-header__summary">
                {report.summary || 'Approved TRACE project-memory record.'}
              </p>

              <div className="report-doc-header__meta-row">
                <span className="doc-meta-item">
                  <span className="meta-label">Generated</span>
                  <time dateTime={report.generatedAt}>{formatDate(report.generatedAt)}</time>
                </span>
                <span className="doc-meta-divider" aria-hidden="true" />
                <span className="doc-meta-item">
                  <span className="meta-label">Time Window</span>
                  <span>{report.timeWindow ?? 'Single evaluation'}</span>
                </span>
                <span className="doc-meta-divider" aria-hidden="true" />
                <span className="doc-meta-item">
                  <span className="meta-label">Synced</span>
                  <span>{formatRelativeDate(report.syncedAt)}</span>
                </span>
              </div>
            </header>

            {/* Deliberate Freshness Notice */}
            {isNeedsRefresh ? (
              <div
                className="report-freshness-notice report-freshness-notice--warning"
                role="region"
                aria-label="Freshness Status"
              >
                <div className="freshness-notice-head">
                  <span className="freshness-glyph" aria-hidden="true">
                    â†»
                  </span>
                  <div>
                    <strong>
                      Report intelligence represents analyzed commit{' '}
                      <code>{report.analyzedCommit?.slice(0, 12)}</code>
                    </strong>
                    <p>
                      GitHub remote default branch has advanced to{' '}
                      <code>{report.remoteHeadCommit?.slice(0, 12)}</code>. The synchronized record
                      remains truthful for commit <code>{report.analyzedCommit?.slice(0, 7)}</code>,
                      but a local refresh is recommended to incorporate subsequent pull requests.
                    </p>
                  </div>
                </div>
                <div className="freshness-notice-actions">
                  <div className="freshness-cli-commands">
                    <code>trace analyze</code>
                    <code>trace sync --dry-run</code>
                    <code>trace sync</code>
                  </div>
                  <button
                    type="button"
                    className="trace-button trace-button--secondary trace-button--sm"
                    onClick={() =>
                      copyToClipboard(
                        'trace analyze && trace sync --dry-run && trace sync',
                        'refresh-cmd',
                      )
                    }
                    aria-label="Copy refresh workflow commands"
                  >
                    {copiedText === 'refresh-cmd' ? 'Copied' : 'Copy refresh workflow'}
                  </button>
                </div>
              </div>
            ) : isAttention ? (
              <div
                className="report-freshness-notice report-freshness-notice--attention"
                role="region"
                aria-label="Freshness Status"
              >
                <div className="freshness-notice-head">
                  <span className="freshness-glyph" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <strong>Sync Bridge Schema Alignment Required</strong>
                    <p>
                      Local report intelligence is valid for analyzed commit{' '}
                      <code>{report.analyzedCommit?.slice(0, 12)}</code>. The synchronized bridge
                      requires a CLI schema version update before newer automated artifacts can
                      ingest cleanly.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="report-freshness-notice report-freshness-notice--current"
                role="region"
                aria-label="Freshness Status"
              >
                <div className="freshness-notice-head">
                  <span className="freshness-glyph" aria-hidden="true">
                    âœ“
                  </span>
                  <div>
                    <strong>Intelligence Current with GitHub HEAD</strong>
                    <p>
                      Analyzed commit <code>{report.analyzedCommit?.slice(0, 12)}</code> matches
                      GitHub remote repository default branch.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* View Mode Segmented Control Tabs */}
            <div className="report-view-tabs" role="tablist" aria-label="Report display mode">
              <button
                type="button"
                role="tab"
                id="tab-readable"
                aria-selected={activeTab === 'readable'}
                aria-controls="panel-readable"
                className={`report-view-tab ${activeTab === 'readable' ? 'report-view-tab--active' : ''}`}
                onClick={() => setActiveTab('readable')}
              >
                Structured Document
              </button>
              <button
                type="button"
                role="tab"
                id="tab-raw"
                aria-selected={activeTab === 'raw'}
                aria-controls="panel-raw"
                className={`report-view-tab ${activeTab === 'raw' ? 'report-view-tab--active' : ''}`}
                onClick={() => setActiveTab('raw')}
              >
                Canonical TRACE Markdown
              </button>
              <button
                type="button"
                role="tab"
                id="tab-provenance"
                aria-selected={activeTab === 'provenance'}
                aria-controls="panel-provenance"
                className={`report-view-tab ${activeTab === 'provenance' ? 'report-view-tab--active' : ''}`}
                onClick={() => setActiveTab('provenance')}
              >
                Verification & Provenance
              </button>
            </div>

            {/* Tab 1: Readable Structured Document */}
            {activeTab === 'readable' && (
              <div
                className="report-doc-body"
                id="panel-readable"
                role="tabpanel"
                aria-labelledby="tab-readable"
                data-trace-motion="section"
                data-motion-section="report-readable"
              >
                {/* 1. Related Pull Requests */}
                {relatedChanges.length > 0 ? (
                  <section className="report-doc-section" aria-labelledby="section-changes-heading">
                    <div className="doc-section-header">
                      <span className="doc-section-eyebrow">Pull Requests</span>
                      <h2 id="section-changes-heading" className="doc-section-title">
                        Changes Reviewed ({relatedChanges.length})
                      </h2>
                    </div>

                    <div className="doc-changes-list">
                      {relatedChanges.map((change) => (
                        <div className="doc-change-item" key={change.id}>
                          <div className="doc-change-item__left">
                            <span className="doc-pr-badge">PR #{change.number}</span>
                            <div className="doc-change-text">
                              <h3 className="doc-change-title">{change.title}</h3>
                              <div className="doc-change-meta">
                                <span>{change.authorLogin ?? 'Unknown author'}</span>
                                <span className="doc-meta-dot" aria-hidden="true">
                                  Â·
                                </span>
                                <code>{change.branch ?? 'feature'}</code>
                                {change.affectedAreas?.length ? (
                                  <>
                                    <span className="doc-meta-dot" aria-hidden="true">
                                      Â·
                                    </span>
                                    <span className="doc-area-pill">
                                      {change.affectedAreas.join(', ')}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {change.url ? (
                            <a
                              href={change.url}
                              target="_blank"
                              rel="noreferrer"
                              className="trace-button trace-button--secondary trace-button--small doc-gh-link"
                            >
                              GitHub PR â†—
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* 2. Recorded Findings & AST Evidence */}
                {report.items.length > 0 ? (
                  <section
                    className="report-doc-section"
                    aria-labelledby="section-findings-heading"
                  >
                    <div className="doc-section-header">
                      <span className="doc-section-eyebrow">Intelligence</span>
                      <h2 id="section-findings-heading" className="doc-section-title">
                        Recorded Findings & AST Evidence ({report.items.length})
                      </h2>
                    </div>

                    <div className="doc-findings-list">
                      {report.items.map((item) => (
                        <div className="doc-finding-card" key={item.id}>
                          <div className="doc-finding-card__header">
                            <span
                              className="item-severity-tag"
                              data-severity={item.severity ?? 'low'}
                            >
                              {item.severity ?? 'low'} severity
                            </span>
                            <span className="doc-finding-class">
                              {item.classification ?? 'deterministic AST match'}
                            </span>
                          </div>

                          <h3 className="doc-finding-card__title">{item.title}</h3>
                          <p className="doc-finding-card__detail">
                            {presentFindingDetail(item.detail)}
                          </p>

                          {item.evidence.length > 0 ? (
                            <div className="doc-finding-card__evidence">
                              <span className="evidence-title">
                                Deterministic AST Evidence Loci:
                              </span>
                              <div className="evidence-tokens">
                                {item.evidence.map((ev) => (
                                  <code key={ev}>{ev}</code>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* 3. Parsed Content Sections */}
                {parsedSections.map((section) => (
                  <section
                    className="report-doc-section"
                    key={section.title}
                    aria-labelledby={`sec-${section.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  >
                    <div className="doc-section-header">
                      <h2
                        id={`sec-${section.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                        className="doc-section-title"
                      >
                        {section.title}
                      </h2>
                    </div>

                    <div className="doc-section-content">
                      {section.lines.map((line, idx) => {
                        const trimmed = line.trim();
                        if (!trimmed) return null;

                        // Bullet items
                        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                          const itemText = trimmed.slice(2);
                          return (
                            <div className="doc-bullet-item" key={idx}>
                              <span className="bullet-dot" aria-hidden="true">
                                â€”
                              </span>
                              <p>{itemText}</p>
                            </div>
                          );
                        }

                        // Numbered items
                        const numMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
                        if (numMatch) {
                          return (
                            <div className="doc-numbered-item" key={idx}>
                              <span className="numbered-index">{numMatch[1]}.</span>
                              <p>{numMatch[2]}</p>
                            </div>
                          );
                        }

                        // Regular paragraph
                        return (
                          <p className="doc-paragraph" key={idx}>
                            {trimmed}
                          </p>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* Tab 2: Raw Canonical TRACE Markdown */}
            {activeTab === 'raw' && (
              <div
                className="report-doc-raw"
                id="panel-raw"
                role="tabpanel"
                aria-labelledby="tab-raw"
                data-trace-motion="section"
                data-motion-section="report-raw"
              >
                <div className="raw-toolbar">
                  <span className="raw-toolbar__label">Canonical TRACE Markdown Record</span>
                  <button
                    type="button"
                    className="trace-button trace-button--secondary trace-button--small"
                    onClick={() => copyToClipboard(report.content, 'raw-markdown')}
                  >
                    {copiedText === 'raw-markdown' ? 'Copied to clipboard' : 'Copy markdown'}
                  </button>
                </div>
                <pre className="raw-pre">
                  <code>{report.content}</code>
                </pre>
              </div>
            )}

            {/* Tab 3: Verification & Provenance */}
            {activeTab === 'provenance' && (
              <div
                className="report-doc-provenance"
                id="panel-provenance"
                role="tabpanel"
                aria-labelledby="tab-provenance"
                data-trace-motion="section"
                data-motion-section="report-provenance"
              >
                <div className="doc-section-header">
                  <span className="doc-section-eyebrow">Audit Trail</span>
                  <h2 className="doc-section-title">Cryptographic & AST Provenance</h2>
                </div>

                <dl className="provenance-facts-table">
                  <div className="provenance-row">
                    <dt>Artifact Identifier</dt>
                    <dd>
                      <code>{report.id}</code>
                    </dd>
                  </div>
                  <div className="provenance-row">
                    <dt>Artifact Schema Type</dt>
                    <dd>
                      <code>{report.artifactType}</code>
                    </dd>
                  </div>
                  <div className="provenance-row">
                    <dt>Target Repository</dt>
                    <dd>
                      <code>
                        {report.repositoryName} ({report.repositoryId})
                      </code>
                    </dd>
                  </div>
                  <div className="provenance-row">
                    <dt>Analyzed Local Commit</dt>
                    <dd>
                      <code>{report.analyzedCommit ?? 'Local workspace HEAD'}</code>
                    </dd>
                  </div>
                  {report.remoteHeadCommit ? (
                    <div className="provenance-row">
                      <dt>Remote GitHub HEAD Commit</dt>
                      <dd>
                        <code>{report.remoteHeadCommit}</code>
                      </dd>
                    </div>
                  ) : null}
                  <div className="provenance-row">
                    <dt>Synchronized At</dt>
                    <dd>{formatDate(report.syncedAt)}</dd>
                  </div>
                  <div className="provenance-row">
                    <dt>Execution Origin</dt>
                    <dd>Approved Local TRACE Daemon</dd>
                  </div>
                  <div className="provenance-row">
                    <dt>Zero-Surveillance Guarantee</dt>
                    <dd>
                      Verified: No developer score, rankings, or private source code snippets
                      transmitted. Only deterministic AST syntax matches and boundary invariants are
                      stored.
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </article>
        </main>

        {/* Right Metadata & Provenance Rail */}
        <aside
          className="report-metadata-rail"
          aria-label="Report Metadata and Actions Rail"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          {/* 1. Record Provenance Card */}
          <div className="rail-module">
            <span className="rail-module__title">Record Provenance</span>
            <dl className="rail-facts-list">
              <div className="rail-fact-item">
                <dt>Repository</dt>
                <dd>
                  {repository ? (
                    <Link href={`/app/repositories/${repository.id}`}>{repository.fullName}</Link>
                  ) : (
                    report.repositoryName
                  )}
                </dd>
              </div>
              <div className="rail-fact-item">
                <dt>Time Window</dt>
                <dd>{report.timeWindow ?? 'Single evaluation'}</dd>
              </div>
              <div className="rail-fact-item">
                <dt>Generated</dt>
                <dd>{formatDate(report.generatedAt)}</dd>
              </div>
              <div className="rail-fact-item">
                <dt>Synced</dt>
                <dd>{formatRelativeDate(report.syncedAt)}</dd>
              </div>
              <div className="rail-fact-item">
                <dt>Origin</dt>
                <dd>Approved local sync</dd>
              </div>
              <div className="rail-fact-item">
                <dt>Analyzed Commit</dt>
                <dd>
                  <code>{report.analyzedCommit?.slice(0, 12) ?? 'Local HEAD'}</code>
                </dd>
              </div>
              {report.remoteHeadCommit ? (
                <div className="rail-fact-item">
                  <dt>Remote HEAD</dt>
                  <dd>
                    <code>{report.remoteHeadCommit.slice(0, 12)}</code>
                  </dd>
                </div>
              ) : null}
              <div className="rail-fact-item">
                <dt>Privacy Guarantee</dt>
                <dd>AST facts Â· Code excluded</dd>
              </div>
              <div className="rail-fact-item">
                <dt>Status</dt>
                <dd className="rail-status-pill">{report.status ?? 'Approved'}</dd>
              </div>
            </dl>
          </div>

          {/* 2. Local CLI Commands Module */}
          <div className="rail-module">
            <span className="rail-module__title">Local CLI Inspection</span>
            <p className="rail-module__desc">
              Inspect or re-run this artifact deterministically on your local workstation:
            </p>
            <div className="rail-cli-stack">
              <div className="rail-cli-box">
                <code>{report.path ? `trace inspect ${report.path}` : `trace report daily`}</code>
                <button
                  type="button"
                  className="rail-cli-copy-btn"
                  onClick={() =>
                    copyToClipboard(
                      report.path ? `trace inspect ${report.path}` : `trace report daily`,
                      'cli-view',
                    )
                  }
                  title="Copy inspect command"
                  aria-label="Copy CLI inspect command"
                >
                  {copiedText === 'cli-view' ? 'âœ“' : 'Copy'}
                </button>
              </div>

              {isNeedsRefresh ? (
                <div className="rail-cli-box rail-cli-box--workflow">
                  <div className="rail-cli-workflow-lines">
                    <code>trace analyze</code>
                    <code>trace sync --dry-run</code>
                    <code>trace sync</code>
                  </div>
                  <button
                    type="button"
                    className="trace-button trace-button--secondary trace-button--sm rail-workflow-btn"
                    onClick={() =>
                      copyToClipboard(
                        'trace analyze && trace sync --dry-run && trace sync',
                        'cli-refresh',
                      )
                    }
                    title="Copy refresh workflow"
                    aria-label="Copy refresh workflow commands"
                  >
                    {copiedText === 'cli-refresh' ? 'Copied' : 'Copy refresh workflow'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* 3. Related Changes Summary */}
          {relatedChanges.length > 0 ? (
            <div className="rail-module">
              <span className="rail-module__title">
                Associated Pull Requests ({relatedChanges.length})
              </span>
              <ul className="rail-pr-list">
                {relatedChanges.map((c) => (
                  <li key={c.id} className="rail-pr-item">
                    <span className="rail-pr-num">#{c.number}</span>
                    <span className="rail-pr-title">{c.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
