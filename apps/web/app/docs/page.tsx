import Link from 'next/link';
import {
  localAnalysisCommands,
  localToDashboardStages,
  sourceDocuments,
  syncWorkflowCommands,
} from '../../lib/docs-data';
import { PageHeader, PublicLayout, SectionLabel, TraceMark } from '../components/public';
import { CommandBlock } from './command-block';

export const metadata = { title: 'Documentation — TRACE' };

export default function DocsPage() {
  return (
    <PublicLayout>
      <main id="main-content" className="public-container public-page docs-layout-container">
        {/* =================================================================
            Hero Section (Compact, technically grounded, no generic SaaS hype)
            ================================================================= */}
        <PageHeader
          eyebrow="Documentation"
          title="The source documents are the current documentation."
          body="TRACE is actively being developed. These documents point directly to in-tree architecture, specification records, CLI manuals, and GitHub App integrations rather than a fabricated marketing guide."
        />

        <div className="docs-content-wrapper">
          {/* =================================================================
              Sticky Mini Section Index / TOC for Desktop
              ================================================================= */}
          <aside
            className="docs-toc"
            aria-label="Documentation Table of Contents"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <div className="docs-toc__inner">
              <span className="docs-toc__title">On this page</span>
              <nav>
                <ul className="docs-toc__list">
                  <li>
                    <a href="#source-documents" className="docs-toc__link">
                      Source Documents
                    </a>
                  </li>
                  <li>
                    <a href="#local-to-dashboard" className="docs-toc__link">
                      Local → Dashboard Flow
                    </a>
                  </li>
                  <li>
                    <a href="#local-analysis" className="docs-toc__link">
                      Local Analysis CLI
                    </a>
                  </li>
                  <li>
                    <a href="#cloud-sync" className="docs-toc__link">
                      Cloud Sync & Verification
                    </a>
                  </li>
                </ul>
              </nav>

              <div className="docs-toc__meta">
                <div className="docs-toc__meta-item">
                  <span className="meta-label">Specification</span>
                  <span className="meta-val">RFC-001 / Schema v0.1</span>
                </div>
                <div className="docs-toc__meta-item">
                  <span className="meta-label">Authority</span>
                  <span className="meta-val">Git Repository Tree</span>
                </div>
              </div>
            </div>
          </aside>

          {/* =================================================================
              Main Technical Reading Column
              ================================================================= */}
          <div className="docs-main-col">
            {/* =============================================================
                Section 1: Source Documents Technical Index Table
                ============================================================= */}
            <section
              className="docs-section"
              id="source-documents"
              aria-labelledby="source-docs-heading"
              data-trace-motion="section"
              data-motion-section="source-docs"
            >
              <div
                className="section-header-compact"
                data-trace-motion="item"
                style={{ '--motion-index': 0 } as React.CSSProperties}
              >
                <SectionLabel>In-Tree Records</SectionLabel>
                <h2 id="source-docs-heading">Authoritative repository documents.</h2>
                <p>Durable Markdown and design records versioned alongside TRACE engine code.</p>
              </div>

              <div className="doc-index-table" role="table" aria-label="Source documents table">
                <div className="doc-index-table__head" role="row">
                  <span className="doc-col-name" role="columnheader">
                    Document
                  </span>
                  <span className="doc-col-purpose" role="columnheader">
                    Purpose & Scope
                  </span>
                  <span className="doc-col-path" role="columnheader">
                    Repository Path
                  </span>
                  <span className="doc-col-action" role="columnheader">
                    Link
                  </span>
                </div>

                <div className="doc-index-table__body" role="rowgroup">
                  {sourceDocuments.map((doc, idx) => (
                    <article
                      className="doc-index-row"
                      key={doc.id}
                      role="row"
                      data-trace-motion="item"
                      style={{ '--motion-index': idx + 1 } as React.CSSProperties}
                    >
                      <div className="doc-col-name" role="cell">
                        <span className="doc-category-badge">{doc.category}</span>
                        <strong className="doc-title">{doc.name}</strong>
                      </div>
                      <div className="doc-col-purpose" role="cell">
                        <p className="doc-purpose-text">{doc.purpose}</p>
                      </div>
                      <div className="doc-col-path" role="cell">
                        <code className="doc-path-code">{doc.path}</code>
                      </div>
                      <div className="doc-col-action" role="cell">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="doc-link-btn"
                          aria-label={`Open ${doc.name} on GitHub`}
                        >
                          GitHub ↗
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* =============================================================
                Section 2: Local → Dashboard Flow (Numbered Safe Workflow)
                ============================================================= */}
            <section
              className="docs-section"
              id="local-to-dashboard"
              aria-labelledby="workflow-flow-heading"
              data-trace-motion="section"
              data-motion-section="workflow"
            >
              <div
                className="section-header-compact"
                data-trace-motion="item"
                style={{ '--motion-index': 0 } as React.CSSProperties}
              >
                <SectionLabel>Execution Pipeline</SectionLabel>
                <h2 id="workflow-flow-heading">Local to dashboard workflow.</h2>
                <p>
                  Deterministic AST analysis occurs entirely on your machine. Dashboard
                  synchronization is an optional, source-free projection.
                </p>
              </div>

              <div className="workflow-flow-grid" role="list">
                {localToDashboardStages.map((stage, idx) => (
                  <div
                    key={stage.step}
                    className="workflow-step-card"
                    role="listitem"
                    data-trace-motion="item"
                    style={{ '--motion-index': idx + 1 } as React.CSSProperties}
                  >
                    <div className="workflow-step-card__top">
                      <span className="step-num">{stage.step}</span>
                      <code className="step-cmd">{stage.command}</code>
                    </div>
                    <h3 className="step-title">{stage.title}</h3>
                    <p className="step-desc">{stage.description}</p>
                    <div className="step-boundary">
                      <span className="boundary-text">
                        <code>{stage.boundaryGuarantee}</code>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* =============================================================
                Section 3: Local Analysis CLI Commands
                ============================================================= */}
            <section
              className="docs-section"
              id="local-analysis"
              aria-labelledby="local-cli-heading"
              data-trace-motion="section"
              data-motion-section="cli"
            >
              <div
                className="section-header-compact"
                data-trace-motion="item"
                style={{ '--motion-index': 0 } as React.CSSProperties}
              >
                <SectionLabel>Local CLI Manual</SectionLabel>
                <h2 id="local-cli-heading">Build the project record without uploading source.</h2>
                <p>
                  Run the CLI locally from your repository root to extract change evidence, verify
                  rules, and generate Markdown reports.
                </p>
              </div>

              <div className="cli-reference-list">
                {localAnalysisCommands.map((item, idx) => (
                  <div
                    className="cli-ref-card"
                    key={item.id}
                    data-trace-motion="item"
                    style={{ '--motion-index': idx + 1 } as React.CSSProperties}
                  >
                    <div className="cli-ref-card__header">
                      <CommandBlock command={item.command} id={item.id} />
                    </div>
                    <div className="cli-ref-card__body">
                      <p className="cli-ref-card__explanation">{item.explanation}</p>
                      <div className="cli-ref-card__footer">
                        {item.contextNote && (
                          <span className="cli-context-note">
                            <span className="note-bullet" aria-hidden="true">
                              ↳
                            </span>{' '}
                            {item.contextNote}
                          </span>
                        )}
                        {item.outputFormat && (
                          <span className="cli-output-tag">
                            Output: <code>{item.outputFormat}</code>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="docs-note-box"
                data-trace-motion="item"
                style={
                  { '--motion-index': localAnalysisCommands.length + 1 } as React.CSSProperties
                }
              >
                <TraceMark size={14} />
                <p>
                  <strong>Core Guarantee:</strong> Generated files in <code>.trace/</code> remain
                  durable repository records versioned with Git. Local analysis never contacts an
                  external network.
                </p>
              </div>
            </section>

            {/* =============================================================
                Section 4: Cloud Sync & Verification CLI Commands
                ============================================================= */}
            <section
              className="docs-section"
              id="cloud-sync"
              aria-labelledby="cloud-sync-heading"
              data-trace-motion="section"
              data-motion-section="sync"
            >
              <div
                className="section-header-compact"
                data-trace-motion="item"
                style={{ '--motion-index': 0 } as React.CSSProperties}
              >
                <SectionLabel>Sync & Verification</SectionLabel>
                <h2 id="cloud-sync-heading">Analyze locally. Sync only the record you approve.</h2>
                <p>
                  Connect the CLI to your GitHub workspace, inspect the dry-run artifact manifest,
                  and publish a source-free snapshot.
                </p>
              </div>

              <div className="cli-reference-list">
                {syncWorkflowCommands.map((item, idx) => (
                  <div
                    className="cli-ref-card"
                    key={item.id}
                    data-trace-motion="item"
                    style={{ '--motion-index': idx + 1 } as React.CSSProperties}
                  >
                    <div className="cli-ref-card__header">
                      <CommandBlock command={item.command} id={item.id} />
                    </div>
                    <div className="cli-ref-card__body">
                      <p className="cli-ref-card__explanation">{item.explanation}</p>
                      <div className="cli-ref-card__footer">
                        {item.contextNote && (
                          <span className="cli-context-note">
                            <span className="note-bullet" aria-hidden="true">
                              ↳
                            </span>{' '}
                            {item.contextNote}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="docs-note-box"
                data-trace-motion="item"
                style={{ '--motion-index': syncWorkflowCommands.length + 1 } as React.CSSProperties}
              >
                <span className="note-icon" aria-hidden="true">
                  ✓
                </span>
                <p>
                  <strong>Boundary Rule:</strong> Source files, raw code snippets, API secrets,
                  confidential comments, and browser credentials are automatically excluded by
                  transport schema validators.
                </p>
              </div>
            </section>

            {/* =============================================================
                Section 5: Next Steps & Repository References
                ============================================================= */}
            <section
              className="docs-footer-action"
              aria-label="Documentation Links"
              data-trace-motion="section"
              data-motion-section="footer-action"
            >
              <div
                className="docs-footer-action__inner"
                data-trace-motion="item"
                style={{ '--motion-index': 0 } as React.CSSProperties}
              >
                <div className="docs-footer-action__copy">
                  <h3>Continue exploring TRACE</h3>
                  <p>
                    Inspect the RFC-001 specification schema, review privacy invariants, or launch
                    the interactive repository dashboard.
                  </p>
                </div>
                <div className="docs-footer-action__links">
                  <Link className="trace-button trace-button--primary" href="/specification">
                    Read .trace Spec →
                  </Link>
                  <Link className="inline-link" href="/security">
                    Security Architecture →
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
