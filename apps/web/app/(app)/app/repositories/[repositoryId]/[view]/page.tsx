import Link from 'next/link';
import { FixtureBadge } from '../../../_components/fixture-badge';
import { RepositoryTabs } from '../../../_components/repository-tabs';

export default async function RepositoryViewPage({
  params,
}: {
  params: Promise<{ repositoryId: string; view: string }>;
}) {
  const { repositoryId, view } = await params;
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">
            {repositoryId} / {view}
          </p>
          <h1>{view.charAt(0).toUpperCase() + view.slice(1)} view.</h1>
          <p>
            This route is ready for typed view models and real artifacts. It currently contains no
            connected repository data.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <RepositoryTabs repositoryId={repositoryId} />
      <div className="empty-panel empty-panel--large">
        <span>□</span>
        <h2>Waiting for source data</h2>
        <p>
          The UI boundary is established; provider payloads and analysis artifacts are deliberately
          not mocked here.
        </p>
        <Link
          className="trace-button trace-button--secondary"
          href={`/app/repositories/${repositoryId}`}
        >
          Back to repository
        </Link>
      </div>
    </div>
  );
}
