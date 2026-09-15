import Link from 'next/link';
import {
  notClaimedPoints,
  securityMatrix,
  trustBoundaryGates,
  trustBoundaryNodes,
} from '../../lib/security-data';
import { PageHeader, PublicLayout, SectionLabel, TraceMark } from '../components/public';

export const metadata = { title: 'Security & Privacy Ã¢â‚¬â€ TRACE' };

export default function SecurityPage() {
  return (
    <PublicLayout>
      <main id="main-content" className="public-container public-page">
        {/* =================================================================
            Page Header (Preserved core headline and body)
            ================================================================= */}
        <PageHeader
          eyebrow="Security & Privacy Architecture"
          title="Boundaries are part of the product."
          body="TRACE is designed around explicit data boundaries, portable artifacts, and visible uncertainty. This page describes commitments and planned controls without inventing certifications."
        />

        {/* =================================================================
            Trust-Boundary Diagram (Local Repo -> Boundary -> Dashboard)
            ================================================================= */}
        <section
          className="security-boundary-section"
          aria-label="TRACE Trust Boundary Architecture"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="security-boundary__header">
            <div className="security-boundary__title-group">
              <TraceMark size={14} />
              <span>Trust-Boundary Architecture</span>
            </div>
            <span className="trace-badge trace-badge--info">Strict Local-First Perimeter</span>
          </div>

          <div className="trust-boundary-flow" role="list">
            {trustBoundaryNodes.map((node, index) => (
              <div
                key={node.stage}
                className={`trust-node ${node.active ? 'trust-node--active' : ''}`}
                role="listitem"
                data-trace-motion="item"
                style={{ '--motion-index': index + 2 } as React.CSSProperties}
              >
                <div className="trust-node__header">
                  <span className="trust-node__stage">{node.stage}</span>
                  <span className="trust-node__status">{node.status}</span>
                </div>
                <h3 className="trust-node__title">{node.title}</h3>
                <span className="trust-node__scope">{node.scope}</span>
                <p className="trust-node__rule">{node.rule}</p>
                {index < trustBoundaryNodes.length - 1 && (
                  <div className="trust-node__connector" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>

          {/* Explicit Boundary Gates List */}
          <div className="trust-gates" aria-label="Explicit Perimeter Controls">
            <div className="trust-gates__header">
              <span className="trust-gates__label">Data Transmission Perimeter Invariants:</span>
            </div>
            <div className="trust-gates__grid">
              {trustBoundaryGates.map((gate, gIdx) => (
                <div
                  className="gate-item"
                  key={gate.label}
                  data-trace-motion="item"
                  style={{ '--motion-index': gIdx + 6 } as React.CSSProperties}
                >
                  <div className="gate-item__badge">
                    <span className="gate-item__icon" aria-hidden="true">
                      Ã¢â€“Â{' '}
                    </span>
                    <code>{gate.label}</code>
                  </div>
                  <p className="gate-item__desc">{gate.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            Security Principles: Structured Boundary Matrix
            ================================================================= */}
        <section
          className="security-matrix-section"
          data-trace-motion="section"
          data-motion-section="matrix"
          aria-labelledby="matrix-heading"
        >
          <div
            className="section-header-compact"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Operational boundaries</SectionLabel>
            <h2 id="matrix-heading">Structured boundary matrix & invariants.</h2>
            <p>
              Precise mapping of operational behavior versus explicit non-claims across every system
              layer.
            </p>
          </div>

          <div className="security-matrix">
            {securityMatrix.map((item, idx) => (
              <article
                className="security-matrix-card"
                key={item.title}
                data-trace-motion="item"
                style={{ '--motion-index': idx + 1 } as React.CSSProperties}
              >
                <div className="security-matrix-card__header">
                  <div className="security-matrix-card__tags">
                    <span className="boundary-tag">{item.boundary}</span>
                    <span className="invariant-badge">{item.invariantStatus}</span>
                  </div>
                  <h3>{item.title}</h3>
                </div>

                <div className="security-matrix-card__body">
                  <div className="matrix-col matrix-col--current">
                    <span className="matrix-col__heading">Current Behavior</span>
                    <p>{item.currentBehavior}</p>
                  </div>
                  <div className="matrix-col matrix-col--excluded">
                    <span className="matrix-col__heading">What is Excluded / Not Claimed</span>
                    <p>{item.excludedNotClaimed}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* =================================================================
            "Not Claimed" Explicit Disclosure (Neutral Dark Inset, No Red/Amber)
            ================================================================= */}
        <section
          className="security-not-claimed"
          data-trace-motion="section"
          data-motion-section="not-claimed"
          aria-labelledby="not-claimed-heading"
        >
          <div
            className="security-not-claimed__header"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div className="security-not-claimed__title-group">
              <span className="not-claimed-badge" aria-hidden="true">
                NOT CLAIMED
              </span>
              <h3 id="not-claimed-heading">Explicit limits & certification transparency</h3>
            </div>
            <span className="security-not-claimed__meta">Auditable Boundaries</span>
          </div>

          <div className="security-not-claimed__body">
            <p
              className="security-not-claimed__summary"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              TRACE does not currently claim SOC 2, ISO 27001, GDPR certification, zero retention,
              compliance guarantees, or a completed enterprise security program. Operational
              boundaries reflect verified software invariants, not external regulatory attestations.
            </p>

            <div className="not-claimed-points-grid">
              {notClaimedPoints.map((point, idx) => (
                <div
                  className="not-claimed-point"
                  key={point.label}
                  data-trace-motion="item"
                  style={{ '--motion-index': idx + 2 } as React.CSSProperties}
                >
                  <div className="not-claimed-point__title">
                    <span className="point-bullet" aria-hidden="true">
                      Ã¢â‚¬â€
                    </span>
                    <strong>{point.label}</strong>
                  </div>
                  <p>{point.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            Responsible Disclosure
            ================================================================= */}
        <section
          className="security-disclosure"
          data-trace-motion="section"
          data-motion-section="disclosure"
          aria-labelledby="disclosure-heading"
        >
          <div
            className="security-disclosure__inner"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div className="security-disclosure__copy">
              <h3 id="disclosure-heading">Responsible disclosure</h3>
              <p>
                If you discover a security issue, vulnerability, or potential leak in the TRACE
                specification or implementation, please report it responsibly through our GitHub
                Security Advisory channel.
              </p>
            </div>
            <div className="security-disclosure__actions">
              <a
                className="trace-button trace-button--secondary"
                href="https://github.com/mathofdynamic/TRACE/security"
                target="_blank"
                rel="noreferrer"
              >
                Open Security Advisory Channel Ã¢â€ â€™
              </a>
              <Link className="inline-link" href="/specification">
                Review Artifact Schema (RFC-001) Ã¢â€ â€™
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
