import Link from 'next/link';
import { packagingTiers, prelaunchPrinciples } from '../../lib/pricing-data';
import { PageHeader, PublicLayout, SectionLabel, TraceMark } from '../components/public';

export const metadata = { title: 'Pricing — TRACE' };

export default function PricingPage() {
  return (
    <PublicLayout>
      <main id="main-content" className="public-container public-page">
        {/* =================================================================
            Hero Section (Honest, reduced vertical space, clear intent)
            ================================================================= */}
        <PageHeader
          eyebrow="Pre-launch Validation"
          title="Pricing is under validation."
          body="TRACE is not accepting paid subscriptions yet. The early build is focused on proving factual, evidence-backed coordination value without premature commercial packaging."
        />

        {/* =================================================================
            Packaging Direction: Structured Comparison Matrix
            ================================================================= */}
        <section
          className="pricing-matrix-section"
          data-trace-motion="section"
          data-motion-section="packaging"
          aria-labelledby="packaging-heading"
        >
          <div
            className="section-header-compact"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Packaging direction</SectionLabel>
            <h2 id="packaging-heading">Three conceptual operating modes.</h2>
            <p>
              Current availability, operational boundaries, and licensing intent across development
              environments.
            </p>
          </div>

          <div className="pricing-matrix" role="list">
            {packagingTiers.map((tier, idx) => (
              <article
                key={tier.id}
                className={`pricing-mode-card ${tier.active ? 'pricing-mode-card--active' : ''}`}
                role="listitem"
                data-trace-motion="item"
                style={{ '--motion-index': idx + 1 } as React.CSSProperties}
              >
                <div className="pricing-mode-card__header">
                  <div className="pricing-mode-card__top">
                    <span className="mode-badge">{tier.badge}</span>
                    <span className="mode-status">{tier.statusTag}</span>
                  </div>
                  <h3>{tier.name}</h3>
                </div>

                <div className="pricing-mode-card__details">
                  <div className="mode-row">
                    <span className="mode-row__label">Intended Role</span>
                    <p className="mode-row__val">{tier.intendedRole}</p>
                  </div>

                  <div className="mode-row">
                    <span className="mode-row__label">Current Availability</span>
                    <p className="mode-row__val">{tier.currentAvailability}</p>
                  </div>

                  <div className="mode-row">
                    <span className="mode-row__label">Data Boundary</span>
                    <p className="mode-row__val mode-row__val--code">
                      <code>{tier.dataBoundary}</code>
                    </p>
                  </div>

                  <div className="mode-row mode-row--licensing">
                    <span className="mode-row__label">Licensing Intent</span>
                    <p className="mode-row__val">{tier.licensingStatus}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* =================================================================
            Validation Commitments / Pre-launch Principles
            ================================================================= */}
        <section
          className="pricing-principles-section"
          data-trace-motion="section"
          data-motion-section="principles"
          aria-labelledby="principles-heading"
        >
          <div
            className="section-header-compact"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Pre-launch principles</SectionLabel>
            <h2 id="principles-heading">Commercial commitments.</h2>
            <p>Core principles governing software value, artifact freedom, and future pricing.</p>
          </div>

          <div className="pricing-principles-grid">
            {prelaunchPrinciples.map((item, idx) => (
              <div
                className="principle-card"
                key={item.title}
                data-trace-motion="item"
                style={{ '--motion-index': idx + 1 } as React.CSSProperties}
              >
                <div className="principle-card__tag">
                  <TraceMark size={12} />
                  <span>{item.tag}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* =================================================================
            Single High-Intent CTA
            ================================================================= */}
        <section
          className="pricing-cta-section"
          data-trace-motion="section"
          data-motion-section="cta"
          aria-label="Join Early Build"
        >
          <div
            className="pricing-cta__inner"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div className="pricing-cta__copy">
              <h3>Start with the early validation build</h3>
              <p>
                Experience change intelligence on live repositories, evaluate multi-branch conflict
                detection, or review the open specification without financial commitment.
              </p>
            </div>
            <div className="pricing-cta__actions">
              <Link className="trace-button trace-button--primary" href="/app">
                Open Live Workspace →
              </Link>
              <Link className="inline-link" href="/specification">
                Review Artifact Specification →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
