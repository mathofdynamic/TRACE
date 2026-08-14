import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthenticatedDashboardSummary } from '../../../../../lib/dashboard-server';
import { RepositoryTabs } from '../../_components/repository-tabs';

function formattedDate(value: string | null) {
  if (!value) return 'Not yet';
  return new Date(value).toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ repositoryId: string }>;
}) {
  const { repositoryId } = await params;
  const { summary } = await getAuthenticatedDashboardSummary();
  const repository = summary.repositories.find((item) => item.id === repositoryId);
  if (!repository) notFound();
  const findings = summary.attention.filter((item) => item.repositoryId === repository.id);
  const changes = summary.latestChanges.filter((item) => item.repositoryId === repository.id);
  const reports = summary.latestReports.filter((item) => item.repositoryId === repository.id);

  return (
    <div className="dashboard-page repository-page">
      <div className="repository-header">
        <div>
          <p className="section-label">Repository</p>
          <h1>
            <span>{repository.owner}</span> / {repository.name}
          </h1>
          <div className="repository-meta">
            <span data-state="connected">Connected</span>
            <span>{repository.defaultBranch ?? 'Default branch unavailable'}</span>
            <span>Last synchronized {formattedDate(repository.lastSynchronizedAt)}</span>
            {repository.latestSync ? (
              <span>Local · TRACE {repository.latestSync.traceVersion}</span>
            ) : null}
          </div>
        </div>
        <Link className="trace-button trace-button--secondary" href="/app/repositories">
          Manage access
        </Link>
      </div>
      <RepositoryTabs repositoryId={repositoryId} />

      {!repository.analysis ? (
        <section className="attention-panel">
          <div>
            <span className="attention-kicker">Next step</span>
            <h2>Build the first project record</h2>
            <p>
              This repository is connected, but cloud analysis is not enabled. Run the local CLI
              from the repository to create evidence-backed `.trace` output.
            </p>
          </div>
          <div className="local-command">
            <code>trace login</code>
            <code>trace connect</code>
            <code>trace analyze</code>
            <code>trace sync --dry-run</code>
            <code>trace sync</code>
            <Link href="/docs#local-dashboard">Local setup</Link>
          </div>
        </section>
      ) : (
        <section className="analysis-status" data-state={repository.analysis.status}>
          <div>
            <span className="card-label">Latest analysis</span>
            <h2>{repository.analysis.status.replace('-', ' ')}</h2>
          </div>
          <time dateTime={repository.analysis.updatedAt}>
            {formattedDate(repository.analysis.updatedAt)}
          </time>
        </section>
      )}

      {repository.latestSync ? (
        <section className="sync-provenance" aria-label="Local sync provenance">
          <div>
            <span className="card-label">Latest local sync</span>
            <strong>{formattedDate(repository.latestSync.completedAt)}</strong>
          </div>
          <div>
            <span>Branch</span>
            <strong>{repository.latestSync.branch ?? 'Unavailable'}</strong>
          </div>
          <div>
            <span>Commit</span>
            <code>{repository.latestSync.headCommit?.slice(0, 12) ?? 'Unavailable'}</code>
          </div>
          <div>
            <span>Freshness</span>
            <strong>
              {repository.latestSync.stale === true
                ? 'Behind GitHub'
                : repository.latestSync.stale === false
                  ? 'Current'
                  : 'Freshness unknown'}
            </strong>
          </div>
          <div>
            <span>Origin</span>
            <strong>Local analysis</strong>
          </div>
        </section>
      ) : null}

      <div className="overview-grid">
        <section className="dashboard-card">
          <span className="card-label">Project state</span>
          <dl className="state-list">
            <div>
              <dt>Visibility</dt>
              <dd>{repository.visibility ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Pull request snapshots</dt>
              <dd>{changes.length}</dd>
            </div>
            <div>
              <dt>Unresolved findings</dt>
              <dd>{findings.length}</dd>
            </div>
            <div>
              <dt>Reports</dt>
              <dd>{reports.length || 'Not synchronized'}</dd>
            </div>
          </dl>
        </section>
        <section className="dashboard-card">
          <span className="card-label">What TRACE knows</span>
          <h2>
            {repository.analysis
              ? 'Persisted analysis state is available'
              : 'Repository identity only'}
          </h2>
          <p className="card-muted">
            {repository.analysis
              ? 'Analysis status and unresolved findings below come from PostgreSQL.'
              : 'No analysis, report, conflict, decision, or risk is inferred from connection alone.'}
          </p>
        </section>
      </div>

      <section className="dashboard-card record-section">
        <div className="section-heading-row">
          <div>
            <span className="card-label">Attention</span>
            <h2>Current findings</h2>
          </div>
          {findings.length ? (
            <Link href={`/app/repositories/${repository.id}/findings`}>View all</Link>
          ) : null}
        </div>
        {findings.length ? (
          <div className="finding-list">
            {findings.slice(0, 3).map((finding) => (
              <article className="finding-row" key={finding.id}>
                <span data-severity={finding.severity}>{finding.severity}</span>
                <div>
                  <h3>{finding.title}</h3>
                  <p>{finding.detail}</p>
                  <small>{finding.classification}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="inline-empty">
            <strong>No unresolved findings</strong>
            <p>
              {repository.analysis?.status === 'completed'
                ? 'The latest persisted run has nothing requiring review.'
                : 'Findings require a completed persisted analysis.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
