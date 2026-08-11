import Link from 'next/link';
import { FixtureBadge } from '../_components/fixture-badge';
export default function ReportsPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Reports</p>
          <h1>Read the record, not a score.</h1>
          <p>
            Daily and weekly reports will summarize change, decisions, risks, conflicts, and
            incomplete work.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <div className="empty-panel empty-panel--large">
        <span>▤</span>
        <h2>No reports generated</h2>
        <p>Reports depend on validated `.trace` artifacts and a connected analysis pipeline.</p>
        <Link className="trace-button trace-button--secondary" href="/app/repositories">
          Review repository setup
        </Link>
      </div>
    </div>
  );
}
