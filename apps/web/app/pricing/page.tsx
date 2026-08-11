import { PublicLayout, PageHeader } from '../components/public';

export const metadata = { title: 'Pricing — TRACE' };

export default function PricingPage() {
  return (
    <PublicLayout>
      <main className="public-container public-page">
        <PageHeader
          eyebrow="Pre-launch"
          title="Pricing is under validation."
          body="The product is not accepting paid subscriptions yet. The early build is focused on proving factual, evidence-backed coordination value."
        />
        <div className="pricing-grid">
          <article>
            <span className="pricing-label">Local / Community</span>
            <h2>Planned free core</h2>
            <p>
              Portable local artifacts and CLI workflows are the foundation. Final licensing and
              availability are not yet decided.
            </p>
          </article>
          <article className="pricing-card--accent">
            <span className="pricing-label">Team Cloud</span>
            <h2>Pricing under validation</h2>
            <p>
              Hosted coordination may support teams that choose cloud processing and synchronized
              views. No purchase flow is live.
            </p>
          </article>
          <article>
            <span className="pricing-label">Enterprise / Private</span>
            <h2>Contact when ready</h2>
            <p>
              Private deployment and operational requirements will be defined with design partners
              before they are sold.
            </p>
          </article>
        </div>
      </main>
    </PublicLayout>
  );
}
