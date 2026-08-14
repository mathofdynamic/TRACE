import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

const categories = [
  ['Security-sensitive paths', 'Files and components that need stricter review.'],
  ['Architecture expectations', 'Project boundaries that changes should preserve.'],
  ['Testing expectations', 'Evidence required before work is considered complete.'],
  ['Human review requirements', 'Changes that must not be accepted automatically.'],
  ['Ignored areas', 'Generated or low-signal paths TRACE should exclude.'],
] as const;

export default async function RulesPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Rules</p>
          <h1>What TRACE should care about when reviewing your project.</h1>
          <p>
            Rules make review expectations explicit and explainable across local and hosted
            execution.
          </p>
        </div>
        <span className="availability-label">
          {summary.rules.length ? 'Synced from repository' : 'Local configuration'}
        </span>
      </div>
      {summary.rules.length ? (
        <div className="report-list">
          {summary.rules.map((rule) => (
            <article className="dashboard-card synced-record" key={rule.id}>
              <div className="card-heading">
                <div>
                  <span className="card-label">Rule · Local</span>
                  <h2>{rule.title}</h2>
                </div>
              </div>
              <p>{rule.summary}</p>
              {rule.items.length ? (
                <ul>
                  {rule.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <section className="dashboard-card rules-explainer">
          <div>
            <span className="card-label">Current availability</span>
            <h2>No synchronized rules</h2>
            <p>
              The local rule evaluator is available. This dashboard intentionally has no overlay
              editor; repository rules appear only after an approved rule artifact sync.
            </p>
            <Link className="trace-button trace-button--secondary" href="/docs#local-dashboard">
              View local workflow
            </Link>
          </div>
          <ul>
            {categories.map(([title, detail]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
