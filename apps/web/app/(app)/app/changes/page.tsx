import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { ChangesView } from '../_components/changes-view';

export default async function ChangesPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  return (
    <div className="dashboard-page redesign-page" id="changes-dashboard-page">
      <header
        className="redesign-header"
        data-trace-motion="item"
        style={{ '--motion-index': 0 } as React.CSSProperties}
      >
        <div>
          <span className="eyebrow">Active changes</span>
          <h1>Tracked Changes &amp; Pull Requests</h1>
          <p className="redesign-header__description">
            Pull request snapshots synchronized from connected GitHub repositories. Project context
            and deterministic AST findings without individual activity scoring.
          </p>
        </div>
      </header>
      {summary.latestChanges.length ? (
        <ChangesView
          changes={summary.latestChanges}
          repositories={summary.repositories}
          conflicts={summary.conflicts}
          attention={summary.attention}
        />
      ) : (
        <div
          className="empty-panel empty-panel--large"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <span aria-hidden="true">↗</span>
          <h2>No active changes stored</h2>
          <p>
            {summary.setup.repositorySelected
              ? 'This is normal when no pull request webhook snapshots have reached TRACE.'
              : 'Connect a repository before TRACE can receive project changes.'}
          </p>
          <Link className="trace-button trace-button--secondary" href="/app/repositories">
            {summary.setup.repositorySelected ? 'View repositories' : 'Connect repository'}
          </Link>
        </div>
      )}
    </div>
  );
}
