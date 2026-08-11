import { FixtureBadge } from '../../_components/fixture-badge';
import { RepositoryTabs } from '../../_components/repository-tabs';

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ repositoryId: string }>;
}) {
  const { repositoryId } = await params;
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Repository / {repositoryId}</p>
          <h1>Repository summary.</h1>
          <p>
            This repository surface is a connected-data shell. It cannot show a real analysis until
            GitHub installation is complete.
          </p>
        </div>
        <FixtureBadge />
      </div>
      <RepositoryTabs repositoryId={repositoryId} />
      <div className="dashboard-grid dashboard-grid--two">
        <section className="dashboard-card dashboard-card--large">
          <span className="card-label">Connection state</span>
          <h2>Awaiting GitHub App installation</h2>
          <p className="card-muted">
            No repository identity, branch, findings, or permissions are being fabricated.
          </p>
        </section>
        <section className="dashboard-card dashboard-card--large">
          <span className="card-label">Artifact status</span>
          <h2>Not initialized</h2>
          <p className="card-muted">
            The `.trace` artifact contract will be created by the local runtime phase.
          </p>
        </section>
      </div>
    </div>
  );
}
