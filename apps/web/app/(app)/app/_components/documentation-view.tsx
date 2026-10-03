'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  localAnalysisCommands,
  localToDashboardStages,
  sourceDocuments,
  syncWorkflowCommands,
} from '../../../../lib/docs-data';
import { CommandBlock } from '../../../docs/command-block';

export function DocumentationView() {
  const [activeSection, setActiveSection] = useState<string>('source-documents');

  // Filter out internal contributor redesign prompts for clean dashboard documentation
  const userSourceDocs = sourceDocuments.filter((d) => d.category !== 'Internal / Contributor');

  return (
    <div className="dashboard-docs-surface" id="dashboard-docs-root">
      {/* 1. Header & Technical Grounding */}
      <header className="dashboard-docs-header">
        <div
          className="dashboard-docs-header__copy"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="dashboard-docs-header__eyebrow-row">
            <span className="docs-eyebrow-tag">IN-TREE SPECIFICATIONS &amp; MANUALS</span>
            <span className="docs-header-divider" aria-hidden="true">
              ·
            </span>
            <span className="docs-badge docs-badge--spec">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              RFC-001 / Schema v0.1
            </span>
          </div>
          <h1 className="dashboard-docs-header__title">
            Technical Documentation &amp; CLI Manuals
          </h1>
          <p className="dashboard-docs-header__lead">
            Authoritative documentation lives versioned in the Git repository alongside TRACE engine
            code. Deterministic AST analysis executes on your machine, producing source-free
            metadata projections for your workspace.
          </p>
        </div>

        {/* Quick Spec Metadata Indicators */}
        <div
          className="dashboard-docs-metrics"
          role="region"
          aria-label="Documentation specifications"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="docs-metric-item">
            <span className="docs-metric-label">AUTHORITATIVE SOURCE</span>
            <span className="docs-metric-val">In-Tree Git Records</span>
          </div>
          <div className="docs-metric-item">
            <span className="docs-metric-label">EXECUTION ORIGIN</span>
            <span className="docs-metric-val">Local AST Engine</span>
          </div>
          <div className="docs-metric-item">
            <span className="docs-metric-label">SOURCE CODE TELEMETRY</span>
            <span className="docs-metric-val docs-metric-val--guarantee">Excluded by Design</span>
          </div>
        </div>
      </header>

      {/* 2. Main Content Layout with Sticky Sidebar TOC */}
      <div className="dashboard-docs-layout">
        {/* Sticky Table of Contents Sidebar */}
        <aside
          className="dashboard-docs-toc"
          aria-label="Documentation table of contents"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <div className="dashboard-docs-toc__inner">
            <span className="dashboard-docs-toc__title">DOCUMENTATION INDEX</span>
            <nav className="dashboard-docs-toc__nav">
              <a
                href="#source-documents"
                className={`dashboard-docs-toc__link ${activeSection === 'source-documents' ? 'is-active' : ''}`}
                onClick={() => setActiveSection('source-documents')}
              >
                1. Source Documents
              </a>
              <a
                href="#execution-pipeline"
                className={`dashboard-docs-toc__link ${activeSection === 'execution-pipeline' ? 'is-active' : ''}`}
                onClick={() => setActiveSection('execution-pipeline')}
              >
                2. Local → Dashboard Pipeline
              </a>
              <a
                href="#local-cli"
                className={`dashboard-docs-toc__link ${activeSection === 'local-cli' ? 'is-active' : ''}`}
                onClick={() => setActiveSection('local-cli')}
              >
                3. Local Analysis CLI
              </a>
              <a
                href="#cloud-sync"
                className={`dashboard-docs-toc__link ${activeSection === 'cloud-sync' ? 'is-active' : ''}`}
                onClick={() => setActiveSection('cloud-sync')}
              >
                4. Sync &amp; Verification CLI
              </a>
              <a
                href="#boundary-guarantees"
                className={`dashboard-docs-toc__link ${activeSection === 'boundary-guarantees' ? 'is-active' : ''}`}
                onClick={() => setActiveSection('boundary-guarantees')}
              >
                5. Boundary &amp; Trust Invariants
              </a>
            </nav>

            <div className="dashboard-docs-toc__footer">
              <span className="toc-footer-label">Quick Links</span>
              <div className="toc-footer-links">
                <Link href="/specification" className="toc-footer-link">
                  Specification RFC →
                </Link>
                <Link href="/security" className="toc-footer-link">
                  Security Architecture →
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Technical Reading Column */}
        <div className="dashboard-docs-main">
          {/* Section 1: In-Tree Source Documents */}
          <section
            id="source-documents"
            className="dashboard-docs-section"
            aria-labelledby="source-docs-heading"
            data-trace-motion="section"
            data-motion-section="docs-source-documents"
          >
            <div
              className="dashboard-docs-section__header"
              data-trace-motion="item"
              style={{ '--motion-index': 0 } as React.CSSProperties}
            >
              <span className="dashboard-docs-section__num">01</span>
              <div>
                <h2 id="source-docs-heading" className="dashboard-docs-section__title">
                  Authoritative in-tree repository records.
                </h2>
                <p className="dashboard-docs-section__desc">
                  Durable Markdown documents and specifications versioned in Git alongside codebase
                  implementations.
                </p>
              </div>
            </div>

            <div
              className="dashboard-docs-table-wrapper"
              role="region"
              aria-label="Source documents table"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              <table className="dashboard-docs-table">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '28%' }}>
                      Document
                    </th>
                    <th scope="col" style={{ width: '38%' }}>
                      Purpose &amp; Scope
                    </th>
                    <th scope="col" style={{ width: '22%' }}>
                      Path
                    </th>
                    <th scope="col" style={{ width: '12%', textAlign: 'right' }}>
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {userSourceDocs.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div className="docs-table-doc-cell">
                          <span className="docs-category-tag">{doc.category}</span>
                          <strong className="docs-table-doc-name">{doc.name}</strong>
                        </div>
                      </td>
                      <td>
                        <p className="docs-table-purpose">{doc.purpose}</p>
                      </td>
                      <td>
                        <code className="docs-table-path">{doc.path}</code>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="docs-github-link"
                          aria-label={`Open ${doc.name} on GitHub`}
                        >
                          GitHub ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2: Local → Dashboard Flow */}
          <section
            id="execution-pipeline"
            className="dashboard-docs-section"
            aria-labelledby="execution-pipeline-heading"
            data-trace-motion="section"
            data-motion-section="docs-pipeline"
          >
            <div
              className="dashboard-docs-section__header"
              data-trace-motion="item"
              style={{ '--motion-index': 0 } as React.CSSProperties}
            >
              <span className="dashboard-docs-section__num">02</span>
              <div>
                <h2 id="execution-pipeline-heading" className="dashboard-docs-section__title">
                  Local-to-dashboard pipeline stages.
                </h2>
                <p className="dashboard-docs-section__desc">
                  AST analysis executes locally. Projections are transmitted as approved,
                  source-free metadata snapshots.
                </p>
              </div>
            </div>

            <div
              className="dashboard-workflow-grid"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              {localToDashboardStages.map((stage) => (
                <div key={stage.step} className="dashboard-workflow-card">
                  <div className="dashboard-workflow-card__top">
                    <span className="workflow-step-badge">{stage.step}</span>
                    <code className="workflow-cmd-badge">{stage.command}</code>
                  </div>
                  <h3 className="workflow-card-title">{stage.title}</h3>
                  <p className="workflow-card-desc">{stage.description}</p>
                  <div className="workflow-card-boundary">
                    <span className="boundary-shield-icon" aria-hidden="true">
                      🛡️
                    </span>
                    <code>{stage.boundaryGuarantee}</code>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Local Analysis CLI */}
          <section
            id="local-cli"
            className="dashboard-docs-section"
            aria-labelledby="local-cli-heading"
            data-trace-motion="section"
            data-motion-section="docs-local-cli"
          >
            <div
              className="dashboard-docs-section__header"
              data-trace-motion="item"
              style={{ '--motion-index': 0 } as React.CSSProperties}
            >
              <span className="dashboard-docs-section__num">03</span>
              <div>
                <h2 id="local-cli-heading" className="dashboard-docs-section__title">
                  Local Analysis CLI manual.
                </h2>
                <p className="dashboard-docs-section__desc">
                  Commands executed locally inside your Git workspace to extract facts, verify ADRs,
                  and create reports.
                </p>
              </div>
            </div>

            <div
              className="dashboard-cli-list"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              {localAnalysisCommands.map((item) => (
                <div className="dashboard-cli-card" key={item.id}>
                  <div className="dashboard-cli-card__head">
                    <CommandBlock command={item.command} id={item.id} />
                  </div>
                  <div className="dashboard-cli-card__body">
                    <p className="dashboard-cli-card__explanation">{item.explanation}</p>
                    <div className="dashboard-cli-card__meta">
                      {item.contextNote && (
                        <span className="dashboard-cli-context">
                          <span aria-hidden="true">↳</span> {item.contextNote}
                        </span>
                      )}
                      {item.outputFormat && (
                        <span className="dashboard-cli-output">
                          Output: <code>{item.outputFormat}</code>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4: Cloud Sync & Verification CLI */}
          <section
            id="cloud-sync"
            className="dashboard-docs-section"
            aria-labelledby="cloud-sync-heading"
            data-trace-motion="section"
            data-motion-section="docs-sync-cli"
          >
            <div
              className="dashboard-docs-section__header"
              data-trace-motion="item"
              style={{ '--motion-index': 0 } as React.CSSProperties}
            >
              <span className="dashboard-docs-section__num">04</span>
              <div>
                <h2 id="cloud-sync-heading" className="dashboard-docs-section__title">
                  Synchronization &amp; Verification CLI.
                </h2>
                <p className="dashboard-docs-section__desc">
                  Pair your CLI with this workspace, audit the cryptographic dry-run manifest, and
                  publish source-free records.
                </p>
              </div>
            </div>

            <div
              className="dashboard-cli-list"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              {syncWorkflowCommands.map((item) => (
                <div className="dashboard-cli-card" key={item.id}>
                  <div className="dashboard-cli-card__head">
                    <CommandBlock command={item.command} id={item.id} />
                  </div>
                  <div className="dashboard-cli-card__body">
                    <p className="dashboard-cli-card__explanation">{item.explanation}</p>
                    {item.contextNote && (
                      <div className="dashboard-cli-card__meta">
                        <span className="dashboard-cli-context">
                          <span aria-hidden="true">↳</span> {item.contextNote}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 5: Boundary & Invariant Guarantees */}
          <section
            id="boundary-guarantees"
            className="dashboard-docs-section"
            aria-labelledby="boundary-guarantees-heading"
            data-trace-motion="section"
            data-motion-section="docs-guarantees"
          >
            <div
              className="dashboard-docs-section__header"
              data-trace-motion="item"
              style={{ '--motion-index': 0 } as React.CSSProperties}
            >
              <span className="dashboard-docs-section__num">05</span>
              <div>
                <h2 id="boundary-guarantees-heading" className="dashboard-docs-section__title">
                  Architectural &amp; Privacy Invariants.
                </h2>
                <p className="dashboard-docs-section__desc">
                  Non-negotiable security guarantees enforced across all TRACE CLI and web dashboard
                  components.
                </p>
              </div>
            </div>

            <div
              className="dashboard-guarantees-grid"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              <div className="dashboard-guarantee-card">
                <div className="guarantee-card-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h3 className="guarantee-card-title">Source Code Exclusion</h3>
                <p className="guarantee-card-text">
                  Source code, inline code snippets, and confidential comments never leave your
                  developer workstation. Remote cloud compilation is strictly prohibited.
                </p>
              </div>

              <div className="dashboard-guarantee-card">
                <div className="guarantee-card-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                </div>
                <h3 className="guarantee-card-title">Zero Surveillance Telemetry</h3>
                <p className="guarantee-card-text">
                  No individual developer scoring, rankings, velocity leaderboards, or surveillance
                  telemetry are ever generated, computed, or persisted.
                </p>
              </div>

              <div className="dashboard-guarantee-card">
                <div className="guarantee-card-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 className="guarantee-card-title">Deterministic AST Facts</h3>
                <p className="guarantee-card-text">
                  Change evidence is parsed deterministically from compiler ASTs before any model
                  inference. Deterministic facts are always labeled separately from inferences.
                </p>
              </div>

              <div className="dashboard-guarantee-card">
                <div className="guarantee-card-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <h3 className="guarantee-card-title">Pre-Flight Review Guarantee</h3>
                <p className="guarantee-card-text">
                  Running <code>trace sync --dry-run</code> allows complete inspection of the
                  cryptographic artifact manifest and checksums before any data is sent.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
