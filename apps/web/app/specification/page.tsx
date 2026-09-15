import Link from 'next/link';
import { artifactRelationships, specLifecycleNodes, specQuestions } from '../../lib/spec-data';
import { PageHeader, PublicLayout, SectionLabel, TraceMark } from '../components/public';

export const metadata = { title: '.trace specification — TRACE' };

export default function SpecificationPage() {
  return (
    <PublicLayout>
      <main id="main-content" className="public-container public-page">
        {/* =================================================================
            Hero Section
            ================================================================= */}
        <PageHeader
          eyebrow="RFC-001 Standard"
          title="`.trace` keeps understanding close to the code."
          body="The proposed artifact layer connects Git history to human-readable project memory without making a hosted dashboard the durable owner."
        />

        {/* =================================================================
            Lifecycle Visual Flow (Local Analysis -> Artifact -> Sync -> Projection)
            ================================================================= */}
        <section
          className="spec-lifecycle-section"
          aria-label="TRACE Artifact Lifecycle"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="spec-lifecycle__header">
            <div className="spec-lifecycle__title-group">
              <TraceMark size={14} />
              <span>Artifact Lifecycle Flow</span>
            </div>
            <span className="trace-badge trace-badge--info">Schema v0.1 Invariant</span>
          </div>

          <div className="spec-lifecycle-flow" role="list">
            {specLifecycleNodes.map((node, index) => (
              <div
                key={node.stage}
                className={`spec-life-node ${node.active ? 'spec-life-node--active' : ''}`}
                role="listitem"
                data-trace-motion="item"
                style={{ '--motion-index': index + 2 } as React.CSSProperties}
              >
                <div className="spec-life-node__header">
                  <span className="spec-life-node__stage">{node.stage}</span>
                  <span className="spec-life-node__role">{node.role}</span>
                </div>
                <h3 className="spec-life-node__title">{node.title}</h3>
                <p className="spec-life-node__desc">{node.description}</p>
                <div className="spec-life-node__boundary">
                  <span className="boundary-pill">
                    <code>{node.boundaryNote}</code>
                  </span>
                </div>
                {index < specLifecycleNodes.length - 1 && (
                  <div className="spec-life-node__connector" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>

          <div className="spec-lifecycle__notice">
            <span className="notice-icon" aria-hidden="true">
              ℹ
            </span>
            <p>
              <strong>Core Invariant:</strong> The dashboard is a projection layer, never the sole
              durable owner. Source code is never transmitted.
            </p>
          </div>
        </section>

        {/* =================================================================
            Versioned-Record Relationship Architecture (.trace/ tree & linkages)
            ================================================================= */}
        <section
          className="spec-relationship-section"
          data-trace-motion="section"
          data-motion-section="relationships"
          aria-labelledby="relationships-heading"
        >
          <div
            className="section-header-compact"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Directory contract</SectionLabel>
            <h2 id="relationships-heading">The versioned record layer.</h2>
            <p>
              Every durable output is representable inside <code>.trace/</code> using human-readable
              Markdown with machine-readable YAML frontmatter.
            </p>
          </div>

          <div className="artifact-grid">
            {artifactRelationships.map((item, idx) => (
              <article
                className="artifact-card"
                key={item.path}
                data-trace-motion="item"
                style={{ '--motion-index': idx + 1 } as React.CSSProperties}
              >
                <div className="artifact-card__top">
                  <span className="artifact-type">{item.type}</span>
                  <span className="artifact-format">
                    <code>{item.format}</code>
                  </span>
                </div>
                <h3 className="artifact-card__title">
                  <code>{item.path}</code>
                </h3>
                <p className="artifact-card__role">{item.role}</p>

                <div className="artifact-card__flow">
                  <div className="flow-step">
                    <span className="flow-step__label">Upstream source</span>
                    <span className="flow-step__val">{item.upstream}</span>
                  </div>
                  <div className="flow-step">
                    <span className="flow-step__label">Downstream consumer</span>
                    <span className="flow-step__val">{item.downstream}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* =================================================================
            Four Core Questions: Structured Specification Grid
            ================================================================= */}
        <section
          className="spec-questions-section"
          data-trace-motion="section"
          data-motion-section="questions"
          aria-labelledby="questions-heading"
        >
          <div
            className="section-header-compact"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Specification depth</SectionLabel>
            <h2 id="questions-heading">Four architectural questions.</h2>
            <p>
              Formal definitions of storage, relationships, transport, and implementation readiness.
            </p>
          </div>

          <div className="spec-questions-list">
            {specQuestions.map((q, idx) => (
              <article
                className="spec-question-row"
                key={q.id}
                id={q.id}
                data-trace-motion="item"
                style={{ '--motion-index': idx + 1 } as React.CSSProperties}
              >
                <div className="spec-question-row__prose">
                  <div className="spec-question-row__header">
                    <span className="question-num">{q.number}</span>
                    <h3>{q.title}</h3>
                  </div>
                  <p className="question-summary">{q.summary}</p>
                  <ul className="question-details">
                    {q.details.map((detail, dIdx) => (
                      <li key={dIdx}>
                        <span className="detail-bullet" aria-hidden="true">
                          —
                        </span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  className="spec-question-row__snippet"
                  aria-label={`Code example for ${q.title}`}
                >
                  <div className="snippet-header">
                    <span className="snippet-title">
                      <code>{q.snippetTitle}</code>
                    </span>
                    <span className="snippet-type">{q.snippetType.toUpperCase()}</span>
                  </div>
                  <pre className="snippet-code">
                    <code>{q.snippet}</code>
                  </pre>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* =================================================================
            Specification Action / Repository Reference
            ================================================================= */}
        <section
          className="spec-footer-action"
          data-trace-motion="section"
          data-motion-section="footer-action"
          aria-label="Specification Documents"
        >
          <div
            className="spec-footer-action__inner"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div className="spec-footer-action__copy">
              <h3>Inspect the open specification & RFCs</h3>
              <p>
                Review the technical schema definitions, JSON validators, and architectural decision
                records in the public TRACE repository.
              </p>
            </div>
            <div className="spec-footer-action__links">
              <a
                className="trace-button trace-button--primary"
                href="https://github.com/mathofdynamic/TRACE/tree/main/DOC"
                target="_blank"
                rel="noreferrer"
              >
                Inspect Repository Docs →
              </a>
              <Link className="inline-link" href="/security">
                Review Security & Privacy Boundaries →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
