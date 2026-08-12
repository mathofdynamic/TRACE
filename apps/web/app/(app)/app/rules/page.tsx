import Link from 'next/link';

const categories = [
  ['Security-sensitive paths', 'Files and components that need stricter review.'],
  ['Architecture expectations', 'Project boundaries that changes should preserve.'],
  ['Testing expectations', 'Evidence required before work is considered complete.'],
  ['Human review requirements', 'Changes that must not be accepted automatically.'],
  ['Ignored areas', 'Generated or low-signal paths TRACE should exclude.'],
] as const;

export default function RulesPage() {
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
        <span className="availability-label">Local configuration</span>
      </div>
      <section className="dashboard-card rules-explainer">
        <div>
          <span className="card-label">Current availability</span>
          <h2>No dashboard rule editor</h2>
          <p>
            The rule evaluator and configuration contracts exist in the repository packages. A
            tenant-scoped editor and persisted rule projection do not, so TRACE does not show a fake
            editor here.
          </p>
          <Link className="trace-button trace-button--secondary" href="/docs#local-analysis">
            View local setup
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
    </div>
  );
}
