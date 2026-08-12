import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

export default async function ActivityPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Project record</p>
          <h1>Meaningful TRACE events.</h1>
          <p>
            Repository connections, analysis state, findings, reports, and rule changes belong here.
            Commit-by-commit employee activity does not.
          </p>
        </div>
      </div>
      {summary.activity.length ? (
        <ol className="activity-list activity-list--page">
          {summary.activity.map((item) => (
            <li key={item.id}>
              <span aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <time dateTime={item.occurredAt}>
                {new Date(item.occurredAt).toLocaleString('en', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-panel empty-panel--large">
          <span aria-hidden="true">○</span>
          <h2>No project events yet</h2>
          <p>Connecting a repository creates the first meaningful workspace event.</p>
          <Link className="trace-button trace-button--secondary" href="/app/repositories">
            Connect repository
          </Link>
        </div>
      )}
    </div>
  );
}
