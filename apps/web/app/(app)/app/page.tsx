import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../lib/dashboard-server';
import {
  FindingDisclosure,
  LocalActionPanel,
  ProjectContextSummary,
  TraceRail,
} from './_components/trace-redesign';
import {
  activityContextLabel,
  deriveTraceProjectState,
  formatRelativeDate,
  localTraceCommandsForState,
  presentFindingDetail,
  stateToneClass,
} from '../../../lib/dashboard-state';

export default async function DashboardOverviewPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  const repository =
    summary.repositories.find((item) => item.id === summary.preferredRepositoryId) ??
    summary.repositories[0] ??
    null;
  const state = deriveTraceProjectState(repository, summary.attention);
  const repositoryAttention = summary.attention.filter(
    (item) => !item.repositoryId || item.repositoryId === repository?.id,
  );
  const operations = repositoryAttention.filter((item) =>
    ['sync-failed', 'analysis-failed'].includes(item.kind),
  );
  const engineering = repositoryAttention.filter((item) =>
    ['finding', 'risk', 'conflict'].includes(item.kind),
  );
  const localCommands = localTraceCommandsForState(state.key);

  return (
    <div className="dashboard-page redesign-page overview-page">
      <header className="redesign-header overview-header">
        <div>
          <span className="eyebrow">Project overview</span>
          <h1>{repository?.fullName ?? 'Choose a repository'}</h1>
          <p>One clear view of what TRACE knows, when it was generated, and what to do next.</p>
        </div>
        <span className="source-note">Live workspace data</span>
      </header>

      <section className="project-command-surface" aria-labelledby="overview-state-title">
        <div className="project-command-surface__topline">
          <div>
            <span className="eyebrow">Project state</span>
            <h2 id="overview-state-title">{state.label}</h2>
            <ProjectContextSummary repository={repository} attention={summary.attention} />
          </div>
          {state.actionKind === 'local' ? (
            <LocalActionPanel
              repositoryName={repository?.fullName}
              title={state.actionLabel ?? 'Update TRACE intelligence'}
              description={state.description}
              commands={localCommands}
              triggerLabel={state.actionLabel ?? 'Update TRACE'}
            />
          ) : repository ? (
            <Link
              className="trace-button trace-button--secondary"
              href={`/app/repositories/${repository.id}`}
            >
              Open project
            </Link>
          ) : (
            <Link className="trace-button trace-button--primary" href="/app/repositories">
              Connect repository
            </Link>
          )}
        </div>
        <TraceRail state={state.key} />
        <div className="project-command-surface__footer">
          <span>Connect - analyze locally - sync approved records - understand the change</span>
          {repository?.latestSync ? (
            <time dateTime={repository.latestSync.completedAt}>
              Last sync {formatRelativeDate(repository.latestSync.completedAt)}
            </time>
          ) : null}
        </div>
      </section>

      <section className="attention-board" aria-labelledby="overview-attention-title">
        <div className="section-heading-row redesign-section-heading">
          <div>
            <span className="eyebrow">Attention</span>
            <h2 id="overview-attention-title">What needs your attention</h2>
          </div>
          <span className="quiet-count">{repositoryAttention.length} unresolved</span>
        </div>
        <div
          className={`attention-board__columns${operations.length ? '' : ' attention-board__columns--engineering-only'}`}
        >
          <div className={`attention-group${operations.length ? '' : ' attention-group--healthy'}`}>
            <div className="attention-group__heading">
              <span
                className={`status-dot ${operations.length ? 'status-dot--danger' : 'status-dot--success'}`}
              />
              <h3>{operations.length ? 'Operations' : 'Operations healthy'}</h3>
            </div>
            {operations.length ? (
              operations.slice(0, 4).map((item) => (
                <article className="attention-row attention-row--operation" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{presentFindingDetail(item.detail)}</p>
                  </div>
                  {item.repositoryId ? (
                    <Link href={`/app/repositories/${item.repositoryId}`}>Review</Link>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="inline-note">
                No operational failures are blocking the last verified record.
              </p>
            )}
          </div>
          <div className="attention-group">
            <div className="attention-group__heading">
              <span className="status-dot status-dot--warning" />
              <h3>Engineering</h3>
            </div>
            {engineering.length ? (
              engineering.slice(0, 5).map((item) => (
                <article className="attention-row" key={item.id}>
                  <div>
                    <span className="severity-label" data-severity={item.severity}>
                      {item.severity}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{presentFindingDetail(item.detail)}</p>
                  </div>
                  <FindingDisclosure
                    finding={item}
                    repositoryName={item.repositoryName}
                    repository={repository}
                  />
                </article>
              ))
            ) : (
              <p className="inline-note">
                {repository?.analysis?.status === 'completed'
                  ? 'No unresolved engineering findings for this project.'
                  : 'Engineering findings require a completed local analysis.'}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="intelligence-strip" aria-label="Project intelligence summary">
        <div>
          <span className="eyebrow">Findings</span>
          <strong>{engineering.filter((item) => item.kind === 'finding').length}</strong>
          <small>Persisted review signals</small>
        </div>
        <div>
          <span className="eyebrow">Reports</span>
          <strong>
            {
              summary.latestReports.filter(
                (item) => !repository || item.repositoryId === repository.id,
              ).length
            }
          </strong>
          <small>Approved local records</small>
        </div>
        <div>
          <span className="eyebrow">Branch</span>
          <strong>
            {repository?.latestSync?.branch ?? repository?.defaultBranch ?? 'Not available'}
          </strong>
          <small>
            {repository?.latestSync?.headCommit
              ? `@ ${repository.latestSync.headCommit.slice(0, 12)}`
              : 'No analyzed commit'}
          </small>
        </div>
        <div>
          <span className="eyebrow">Freshness</span>
          <strong className={stateToneClass(state.tone)}>{state.shortLabel}</strong>
          <small>Based on trusted GitHub state</small>
        </div>
      </section>

      <div className="redesign-two-column">
        <section className="redesign-section" aria-labelledby="overview-changes-title">
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">Project memory</span>
              <h2 id="overview-changes-title">What changed</h2>
            </div>
            {summary.capabilities.changes ? <Link href="/app/changes">View changes</Link> : null}
          </div>
          {summary.latestChanges.length ? (
            summary.latestChanges.slice(0, 5).map((change) => (
              <div className="redesign-list-row" key={change.id}>
                <div>
                  <strong>{change.title}</strong>
                  <small>
                    {change.repositoryName} - PR #{change.number} - {change.state}
                  </small>
                </div>
                <time dateTime={change.updatedAt}>{formatRelativeDate(change.updatedAt)}</time>
              </div>
            ))
          ) : (
            <div className="inline-empty redesign-empty">
              <strong>No recent change summary has been synchronized.</strong>
              <p>
                TRACE will show GitHub change context after signed repository activity is processed.
              </p>
            </div>
          )}
        </section>
        <section className="redesign-section" aria-labelledby="overview-record-title">
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">Workspace record</span>
              <h2 id="overview-record-title">Workspace activity</h2>
            </div>
            {summary.capabilities.activity ? <Link href="/app/activity">View activity</Link> : null}
          </div>
          {summary.activity.length ? (
            summary.activity.slice(0, 5).map((item) => (
              <div className="redesign-list-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {activityContextLabel(item.repositoryName)} - {item.detail}
                  </small>
                </div>
                <time dateTime={item.occurredAt}>{formatRelativeDate(item.occurredAt)}</time>
              </div>
            ))
          ) : (
            <div className="inline-empty redesign-empty">
              <strong>No project events yet.</strong>
              <p>Connecting a repository creates the first durable workspace event.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
