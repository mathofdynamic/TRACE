import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

export default async function SettingsPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Settings</p>
          <h1>Workspace and data boundaries.</h1>
          <p>Only configuration backed by the current account and database is shown.</p>
        </div>
      </div>
      <div className="settings-sections">
        <section className="dashboard-card">
          <span className="card-label">Workspace</span>
          <h2>{summary.workspace.name}</h2>
          <dl className="state-list">
            <div>
              <dt>Usage</dt>
              <dd>{summary.workspace.intendedUsage ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Execution preference</dt>
              <dd>{summary.workspace.executionMode ?? 'Undecided'}</dd>
            </div>
            <div>
              <dt>Repositories</dt>
              <dd>{summary.repositories.length}</dd>
            </div>
          </dl>
        </section>
        <section className="dashboard-card">
          <span className="card-label">Analysis boundary</span>
          <h2>Local execution available</h2>
          <p className="card-muted">
            Cloud analysis is not enabled in this environment. Source code is not uploaded through
            the current dashboard flow.
          </p>
          <Link className="text-action" href="/docs#local-analysis">
            Local setup
          </Link>
        </section>
        <section className="dashboard-card">
          <span className="card-label">Account</span>
          <h2>GitHub session</h2>
          <p className="card-muted">
            Repository access is managed separately and remains limited to the repositories selected
            during setup.
          </p>
          <a className="trace-button trace-button--secondary" href="/api/auth/sign-out">
            Sign out
          </a>
        </section>
      </div>
    </div>
  );
}
