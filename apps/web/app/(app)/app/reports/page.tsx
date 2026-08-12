import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

export default async function ReportsPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Reports</p>
          <h1>A readable record of what changed and why.</h1>
          <p>
            Reports summarize meaningful change, decisions, risks, conflicts, and incomplete work
            without developer scoring.
          </p>
        </div>
        <span className="availability-label">Local output only</span>
      </div>
      <div className="empty-panel empty-panel--large">
        <span aria-hidden="true">▤</span>
        <h2>No reports synchronized</h2>
        <p>
          {summary.setup.repositorySelected
            ? 'The report renderer and local CLI exist, but this dashboard has no persisted report or artifact ingestion path yet.'
            : 'Reports require a connected repository and a completed local analysis.'}
        </p>
        <code className="empty-command">trace report daily --write --yes</code>
        <Link
          className="trace-button trace-button--secondary"
          href={summary.setup.repositorySelected ? '/docs#local-analysis' : '/app/repositories'}
        >
          {summary.setup.repositorySelected ? 'View local setup' : 'Connect repository'}
        </Link>
      </div>
    </div>
  );
}
