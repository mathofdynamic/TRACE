import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

export default async function ConflictsPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Conflicts</p>
          <h1>Changes that may be correct alone but incompatible together.</h1>
          <p>TRACE keeps deterministic overlap evidence separate from semantic interpretation.</p>
        </div>
        <span className="availability-label">Not synchronized</span>
      </div>
      <div className="empty-panel empty-panel--large">
        <span aria-hidden="true">◇</span>
        <h2>No conflict records available</h2>
        <p>
          {summary.setup.repositorySelected
            ? 'The deterministic conflict engine exists in the local analysis package, but conflict records are not persisted to this dashboard yet. This is not a claim that the repository has no conflicts.'
            : 'Connect a repository before TRACE can compare active work.'}
        </p>
        <Link
          className="trace-button trace-button--secondary"
          href={summary.setup.repositorySelected ? '/docs#local-analysis' : '/app/repositories'}
        >
          {summary.setup.repositorySelected ? 'View local analysis' : 'Connect repository'}
        </Link>
      </div>
    </div>
  );
}
