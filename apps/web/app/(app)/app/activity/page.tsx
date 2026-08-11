import Link from 'next/link';
import { FixtureBadge } from '../_components/fixture-badge';
export default function ActivityPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Activity</p>
          <h1>System events with provenance.</h1>
          <p>
            Audit and execution activity will be shown here once authenticated product actions
            exist.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <div className="empty-panel empty-panel--large">
        <span>◷</span>
        <h2>No activity recorded</h2>
        <p>Nothing has been connected or analyzed in this workspace.</p>
        <Link className="trace-button trace-button--secondary" href="/app/repositories">
          Connect a repository
        </Link>
      </div>
    </div>
  );
}
