import Link from 'next/link';
import { FixtureBadge } from '../_components/fixture-badge';
export default function SettingsPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Settings</p>
          <h1>Workspace boundaries.</h1>
          <p>
            Settings will cover execution policy, synchronization, model provider boundaries, and
            team authorization.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <div className="empty-panel empty-panel--large">
        <span>⚙</span>
        <h2>Settings are not connected</h2>
        <p>
          Configuration surfaces will be enabled alongside the corresponding server capabilities.
        </p>
        <Link className="trace-button trace-button--secondary" href="/app">
          Return to overview
        </Link>
      </div>
    </div>
  );
}
