import { notFound } from 'next/navigation';
import { getAuthenticatedDashboardSummary } from '../../../../../../lib/dashboard-server';
import { RepositoryTabs } from '../../../_components/repository-tabs';

export default async function RepositoryViewPage({
  params,
}: {
  params: Promise<{ repositoryId: string; view: string }>;
}) {
  const { repositoryId, view } = await params;
  if (view !== 'pull-requests' && view !== 'findings') notFound();
  const { summary } = await getAuthenticatedDashboardSummary();
  const repository = summary.repositories.find((item) => item.id === repositoryId);
  if (!repository) notFound();
  const changes = summary.latestChanges.filter((item) => item.repositoryId === repository.id);
  const findings = summary.attention.filter((item) => item.repositoryId === repository.id);

  return (
    <div className="dashboard-page repository-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">{repository.fullName}</p>
          <h1>{view === 'pull-requests' ? 'Pull requests' : 'Analysis findings'}</h1>
          <p>
            {view === 'pull-requests'
              ? 'Pull request snapshots stored from authorized GitHub repository activity.'
              : 'Unresolved findings from persisted analysis runs. Evidence and interpretation remain labeled.'}
          </p>
        </div>
      </div>
      <RepositoryTabs repositoryId={repositoryId} />
      {view === 'pull-requests' ? (
        changes.length ? (
          <div className="record-list">
            {changes.map((change) => (
              <article key={change.id}>
                <span className="record-index">#{change.number}</span>
                <div>
                  <h2>{change.title}</h2>
                  <p>
                    {change.state} · {change.authorLogin ?? 'Author unavailable'}
                  </p>
                </div>
                {change.url ? <a href={change.url}>Open on GitHub</a> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-panel empty-panel--large">
            <span aria-hidden="true">↗</span>
            <h2>No pull request snapshots yet</h2>
            <p>
              This is normal until signed GitHub events have been processed for this repository.
            </p>
          </div>
        )
      ) : findings.length ? (
        <div className="finding-list finding-list--standalone">
          {findings.map((finding) => (
            <article className="finding-row" key={finding.id}>
              <span data-severity={finding.severity}>{finding.severity}</span>
              <div>
                <h2>{finding.title}</h2>
                <p>{finding.detail}</p>
                <small>
                  {finding.classification === 'deterministic'
                    ? 'Verified evidence'
                    : `${finding.classification} interpretation`}{' '}
                  · {finding.evidence.length} evidence reference
                  {finding.evidence.length === 1 ? '' : 's'}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel empty-panel--large">
          <span aria-hidden="true">✓</span>
          <h2>No unresolved findings</h2>
          <p>
            {repository.analysis?.status === 'completed'
              ? 'Nothing from the latest persisted run currently needs attention.'
              : 'Run TRACE locally to create the first validated analysis record.'}
          </p>
        </div>
      )}
    </div>
  );
}
