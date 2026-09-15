import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { ReportsView } from '../_components/reports-view';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ repositoryId?: string }>;
}) {
  const { summary } = await getAuthenticatedDashboardSummary();
  const resolvedParams = searchParams ? await searchParams : {};
  const selectedRepoId = resolvedParams.repositoryId;

  return (
    <div className="dashboard-page redesign-page reports-page">
      <header
        className="redesign-header"
        data-trace-motion="item"
        style={{ '--motion-index': 0 } as React.CSSProperties}
      >
        <div>
          <span className="eyebrow">Reports Library</span>
          <h1>Synchronized Reports</h1>
          <p>
            Approved local engineering records organized around the changes they describe.
            Deterministic AST facts with source code excluded.
          </p>
        </div>
        <span className="source-note">
          {summary.latestReports.length ? 'Local evidence synced' : 'Awaiting local sync'}
        </span>
      </header>

      <ReportsView
        reports={summary.latestReports}
        repositories={summary.repositories}
        changes={summary.latestChanges}
        attention={summary.attention}
        initialSelectedRepoId={selectedRepoId}
      />
    </div>
  );
}
