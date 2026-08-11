import Link from 'next/link';
import { FixtureBadge } from '../_components/fixture-badge';
export default function RulesPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Rules</p>
          <h1>Team-owned governance.</h1>
          <p>
            Rules will be scoped, explainable, reviewable, and applied consistently across local and
            cloud execution.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <div className="empty-panel empty-panel--large">
        <span>⌘</span>
        <h2>No rules configured</h2>
        <p>No active repository or workspace rules are available in this connected view.</p>
        <Link className="trace-button trace-button--secondary" href="/docs">
          Read rule documentation
        </Link>
      </div>
    </div>
  );
}
