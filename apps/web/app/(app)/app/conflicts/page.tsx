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
          <p>Evidence remains distinct from interpretation.</p>
        </div>
        <span className="availability-label">
          {summary.conflicts.length ? `${summary.conflicts.length} synced` : 'No records synced'}
        </span>
      </div>
      {summary.conflicts.length ? (
        <div className="conflict-list">
          {summary.conflicts.map((conflict) => (
            <article className="dashboard-card synced-record" key={conflict.id}>
              <div className="card-heading">
                <div>
                  <span className="card-label">Possible conflict · Local</span>
                  <h2>{conflict.title}</h2>
                </div>
              </div>
              <p>{conflict.summary}</p>
              {conflict.items.map((item) => (
                <section key={item.id} className="conflict-item">
                  <span data-severity={item.severity ?? 'medium'}>{item.severity ?? 'review'}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                    <h4>Evidence</h4>
                    <ul>
                      {item.evidence.map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                    <small>
                      {item.classification === 'deterministic'
                        ? 'Deterministic evidence'
                        : `${item.classification ?? 'uncertain'} inference`}
                    </small>
                  </div>
                </section>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel empty-panel--large">
          <h2>No conflict records synced</h2>
          <p>
            {summary.setup.repositorySelected
              ? 'This is not yet a claim that no conflicts exist. Run local analysis and sync an approved conflict artifact.'
              : 'Connect a repository before TRACE can associate conflict evidence.'}
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
