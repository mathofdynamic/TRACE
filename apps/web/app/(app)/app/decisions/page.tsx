import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

export default async function DecisionsPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Decisions</p>
          <h1>Important choices that should survive beyond a pull request.</h1>
          <p>
            Synced decision records preserve rationale and evidence without exposing source code.
          </p>
        </div>
        <span className="availability-label">
          {summary.decisions.length ? `${summary.decisions.length} synced` : 'Awaiting local sync'}
        </span>
      </div>
      {summary.decisions.length ? (
        <div className="report-list">
          {summary.decisions.map((decision) => (
            <article className="dashboard-card synced-record" key={decision.id}>
              <div className="card-heading">
                <div>
                  <span className="card-label">Decision · Local</span>
                  <h2>{decision.title}</h2>
                </div>
                <span className="origin-label">{decision.status ?? 'recorded'}</span>
              </div>
              <p>{decision.summary}</p>
              {decision.items.length ? (
                <ul>
                  {decision.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      {item.evidence.length ? (
                        <small>Evidence: {item.evidence.join(', ')}</small>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel empty-panel--large">
          <h2>No decisions synced</h2>
          <p>
            {summary.setup.repositorySelected
              ? 'Decision records appear after a local .trace decision artifact passes policy review and sync.'
              : 'Connect a repository before TRACE can associate decisions.'}
          </p>
          <Link
            className="trace-button trace-button--secondary"
            href={summary.setup.repositorySelected ? '/docs#local-dashboard' : '/app/repositories'}
          >
            {summary.setup.repositorySelected ? 'View local workflow' : 'Connect repository'}
          </Link>
        </div>
      )}
    </div>
  );
}
