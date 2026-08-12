import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../lib/dashboard-server';

function relativeDate(value: string | null) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export default async function DashboardOverviewPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  const repository = summary.repositories[0];
  const analysis = repository?.analysis;

  let attentionTitle = 'Connect your first repository';
  let attentionBody =
    'TRACE needs repository access before it can understand project activity and build a change record.';
  let actionHref = '/app/repositories';
  let actionLabel = 'Connect repository';

  if (summary.setup.githubConnected && !summary.setup.repositorySelected) {
    attentionTitle = 'Choose a repository for TRACE';
    attentionBody =
      'GitHub is connected. Select the repositories that should become part of this workspace.';
    actionLabel = 'Choose repository';
  } else if (repository && !analysis) {
    attentionTitle = `${repository.fullName} is connected`;
    attentionBody =
      'Cloud analysis is not enabled in this environment. Run the local CLI to build the first evidence-backed project record.';
    actionHref = '/docs#local-analysis';
    actionLabel = 'View local setup';
  } else if (analysis?.status === 'queued' || analysis?.status === 'running') {
    attentionTitle = `Understanding ${repository?.fullName ?? 'your repository'}…`;
    attentionBody =
      analysis.status === 'queued'
        ? 'The persisted analysis is waiting for a worker.'
        : 'The persisted analysis is currently running. TRACE will show findings only after validation.';
    actionHref = repository ? `/app/repositories/${repository.id}` : '/app/repositories';
    actionLabel = 'View repository';
  } else if (analysis?.status === 'failed') {
    attentionTitle = `Analysis needs attention`;
    attentionBody =
      'The latest persisted analysis failed. Review the repository state before running it again.';
    actionHref = repository ? `/app/repositories/${repository.id}` : '/app/repositories';
    actionLabel = 'Review failure';
  } else if (summary.attention.length) {
    attentionTitle = `${summary.attention.length} ${summary.attention.length === 1 ? 'thing needs' : 'things need'} attention`;
    attentionBody = 'These are unresolved findings from persisted analysis runs.';
    actionHref = repository ? `/app/repositories/${repository.id}/findings` : '/app/repositories';
    actionLabel = 'Review findings';
  } else if (analysis?.status === 'completed') {
    attentionTitle = 'Nothing currently needs attention';
    attentionBody =
      'The latest persisted analysis completed without unresolved findings in this workspace.';
    actionHref = repository ? `/app/repositories/${repository.id}` : '/app/repositories';
    actionLabel = 'View project record';
  }

  return (
    <div className="dashboard-page overview-page">
      <header className="overview-heading">
        <div>
          <p className="section-label">{summary.workspace.name}</p>
          <h1>What needs attention</h1>
        </div>
        <span className="overview-source">Live workspace data</span>
      </header>

      <section
        className="attention-panel attention-panel--primary"
        aria-labelledby="attention-title"
      >
        <div>
          <span className="attention-kicker">
            {analysis?.status === 'completed' ? 'Current state' : 'Next step'}
          </span>
          <h2 id="attention-title">{attentionTitle}</h2>
          <p>{attentionBody}</p>
        </div>
        <Link className="trace-button trace-button--primary" href={actionHref}>
          {actionLabel}
        </Link>
      </section>

      <div className="overview-grid">
        <section className="dashboard-card project-state" aria-labelledby="project-state-title">
          <div className="card-heading">
            <div>
              <span className="card-label">Project state</span>
              <h2 id="project-state-title">{repository?.fullName ?? 'No repository selected'}</h2>
            </div>
          </div>
          <dl className="state-list">
            <div>
              <dt>Repositories</dt>
              <dd>{summary.repositories.length || 'None'}</dd>
            </div>
            <div>
              <dt>Last synchronized</dt>
              <dd>{relativeDate(repository?.lastSynchronizedAt ?? null)}</dd>
            </div>
            <div>
              <dt>Last analysis</dt>
              <dd>
                {analysis ? `${analysis.status} · ${relativeDate(analysis.updatedAt)}` : 'Not run'}
              </dd>
            </div>
            <div>
              <dt>Latest report</dt>
              <dd>Not synchronized</dd>
            </div>
          </dl>
        </section>

        <section className="dashboard-card recent-change" aria-labelledby="recent-change-title">
          <div className="card-heading">
            <div>
              <span className="card-label">Recent meaningful change</span>
              <h2 id="recent-change-title">
                {summary.latestChanges[0]?.title ?? 'No pull request snapshots yet'}
              </h2>
            </div>
          </div>
          {summary.latestChanges[0] ? (
            <div className="change-summary">
              <p>
                {summary.latestChanges[0].repositoryName} · PR #{summary.latestChanges[0].number}
              </p>
              <span>
                {summary.latestChanges[0].state} ·{' '}
                {relativeDate(summary.latestChanges[0].updatedAt)}
              </span>
              {summary.latestChanges[0].url ? (
                <a href={summary.latestChanges[0].url}>Open on GitHub</a>
              ) : null}
            </div>
          ) : (
            <p className="card-muted">
              This is normal before GitHub webhook processing has stored pull request activity.
            </p>
          )}
        </section>
      </div>

      <section className="dashboard-card record-section" aria-labelledby="attention-list-title">
        <div className="section-heading-row">
          <div>
            <span className="card-label">Attention</span>
            <h2 id="attention-list-title">Risks, findings, and failed analysis</h2>
          </div>
          <span>{summary.attention.length} unresolved</span>
        </div>
        {summary.attention.length ? (
          <div className="finding-list">
            {summary.attention.slice(0, 5).map((item) => (
              <article key={item.id} className="finding-row">
                <span data-severity={item.severity}>{item.severity}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <small>
                    {item.classification === 'deterministic'
                      ? 'Verified evidence'
                      : `${item.classification} interpretation`}
                    {item.repositoryName ? ` · ${item.repositoryName}` : ''}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="inline-empty">
            <strong>
              {analysis?.status === 'completed'
                ? 'No unresolved findings'
                : 'No analysis findings yet'}
            </strong>
            <p>
              {analysis?.status === 'completed'
                ? 'Nothing from the latest persisted run currently requires review.'
                : 'Findings appear only after an analysis run has been persisted and validated.'}
            </p>
          </div>
        )}
      </section>

      <section className="dashboard-card record-section" aria-labelledby="record-title">
        <div className="section-heading-row">
          <div>
            <span className="card-label">Recent project record</span>
            <h2 id="record-title">Meaningful TRACE events</h2>
          </div>
          {summary.capabilities.activity ? <Link href="/app/activity">View activity</Link> : null}
        </div>
        {summary.activity.length ? (
          <ol className="activity-list">
            {summary.activity.slice(0, 6).map((item) => (
              <li key={item.id}>
                <span aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <time dateTime={item.occurredAt}>{relativeDate(item.occurredAt)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="inline-empty">
            <strong>No project events yet</strong>
            <p>Connecting a repository creates the first durable workspace event.</p>
          </div>
        )}
      </section>
    </div>
  );
}
