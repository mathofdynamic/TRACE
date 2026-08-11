import Link from 'next/link';
import { FixtureBadge } from '../_components/fixture-badge';
export default function ConflictsPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Conflict queue</p>
          <h1>Coordinate before work collides.</h1>
          <p>
            Deterministic overlap and semantic conflict signals will be presented separately with
            visible evidence.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <div className="empty-panel empty-panel--large">
        <span>◇</span>
        <h2>No conflicts to review</h2>
        <p>Conflict detection is not connected to repository data yet.</p>
        <Link className="trace-button trace-button--secondary" href="/app/repositories">
          Review repository setup
        </Link>
      </div>
    </div>
  );
}
