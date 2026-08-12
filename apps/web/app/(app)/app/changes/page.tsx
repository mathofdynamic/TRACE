import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

export default async function ChangesPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Active changes</p>
          <h1>Work currently moving through the project.</h1>
          <p>
            Pull request snapshots stored from connected GitHub repositories. This is project
            context, not individual activity scoring.
          </p>
        </div>
      </div>
      {summary.latestChanges.length ? (
        <div className="record-list">
          {summary.latestChanges.map((change) => (
            <article key={change.id}>
              <span className="record-index">#{change.number}</span>
              <div>
                <p className="record-context">{change.repositoryName}</p>
                <h2>{change.title}</h2>
                <p>
                  {change.state} · {change.authorLogin ?? 'Author unavailable'}
                </p>
              </div>
              {change.url ? <a href={change.url}>Open on GitHub</a> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel empty-panel--large">
          <span aria-hidden="true">↗</span>
          <h2>No active changes stored</h2>
          <p>
            {summary.setup.repositorySelected
              ? 'This is normal when no pull request webhook snapshots have reached TRACE.'
              : 'Connect a repository before TRACE can receive project changes.'}
          </p>
          <Link className="trace-button trace-button--secondary" href="/app/repositories">
            {summary.setup.repositorySelected ? 'View repositories' : 'Connect repository'}
          </Link>
        </div>
      )}
    </div>
  );
}
