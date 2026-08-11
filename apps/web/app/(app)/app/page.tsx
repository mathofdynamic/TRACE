import Link from 'next/link';
import { FixtureBadge } from './_components/fixture-badge';

export default function DashboardOverviewPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Workspace overview</p>
          <h1>Your change record starts here.</h1>
          <p>
            Connect a repository to begin collecting verifiable project context. Unavailable
            capabilities stay explicit until their data exists.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <section className="attention-panel">
        <div>
          <span className="attention-kicker">Next required step</span>
          <h2>Connect GitHub and choose a repository.</h2>
          <p>
            Repository data appears only after the App installation is verified and you explicitly
            select access.
          </p>
        </div>
        <Link className="trace-button trace-button--secondary" href="/app/repositories">
          Continue setup
        </Link>
      </section>
      <div className="dashboard-grid dashboard-grid--three">
        <article className="dashboard-card">
          <span className="card-label">01 · Identity</span>
          <strong className="status-title">Signed in</strong>
          <p>Your account session is active for this pilot workspace.</p>
        </article>
        <article className="dashboard-card">
          <span className="card-label">02 · Repository access</span>
          <strong className="status-title status-title--pending">Needs setup</strong>
          <p>GitHub App access remains separate and repository-scoped.</p>
        </article>
        <article className="dashboard-card">
          <span className="card-label">03 · Intelligence</span>
          <strong className="status-title">Waiting</strong>
          <p>Analysis begins only after a repository source is connected.</p>
        </article>
      </div>
      <div className="dashboard-grid dashboard-grid--two">
        <section className="dashboard-card dashboard-card--large">
          <div className="card-heading">
            <div>
              <span className="card-label">Recent activity</span>
              <h2>Nothing to review yet</h2>
            </div>
            <FixtureBadge />
          </div>
          <div className="empty-panel">
            <span>○</span>
            <p>
              Connect a repository to see evidence-backed changes, decisions, risks, and reports
              here.
            </p>
          </div>
        </section>
        <section className="dashboard-card dashboard-card--large">
          <div className="card-heading">
            <div>
              <span className="card-label">Trust boundary</span>
              <h2>Source stays explicit</h2>
            </div>
          </div>
          <ul className="trust-list">
            <li>Local mode does not require source-code upload.</li>
            <li>Deterministic evidence will remain separate from inference.</li>
            <li>Dashboard edits must become explicit repository updates or overlays.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
