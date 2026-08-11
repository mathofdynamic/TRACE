import Link from 'next/link';
import { FixtureBadge } from '../_components/fixture-badge';
export default function ChangesPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Active changes</p>
          <h1>Changes across the workspace.</h1>
          <p>
            Cross-repository change intelligence will appear here after signed GitHub events are
            connected.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <div className="empty-panel empty-panel--large">
        <span>↗</span>
        <h2>No active changes</h2>
        <p>
          This is an intentional empty state, not a zero-count claim about connected repositories.
        </p>
        <Link className="trace-button trace-button--secondary" href="/app/repositories">
          Review repository setup
        </Link>
      </div>
    </div>
  );
}
