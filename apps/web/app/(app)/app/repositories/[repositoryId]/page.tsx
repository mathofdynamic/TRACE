import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthenticatedDashboardSummary } from '../../../../../lib/dashboard-server';
import {
  deriveTraceProjectState,
  analysisOriginLabel,
  formatDate,
  formatRelativeDate,
  localTraceCommandsForState,
  presentFindingDetail,
  stateToneClass,
} from '../../../../../lib/dashboard-state';
import {
  FindingDisclosure,
  LocalActionPanel,
  ProjectContextSummary,
  TraceRail,
} from '../../_components/trace-redesign';
import { RepositoryTabs } from '../../_components/repository-tabs';

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ repositoryId: string }>;
}) {
  const { repositoryId } = await params;
  const { summary } = await getAuthenticatedDashboardSummary();
  const repository = summary.repositories.find((item) => item.id === repositoryId);
  if (!repository) notFound();
  const state = deriveTraceProjectState(repository, summary.attention);
  const findings = summary.attention.filter(
    (item) =>
      item.repositoryId === repository.id && ['finding', 'risk', 'conflict'].includes(item.kind),
  );
  const changes = summary.latestChanges.filter((item) => item.repositoryId === repository.id);
  const reports = summary.latestReports.filter((item) => item.repositoryId === repository.id);
  const localCommands = localTraceCommandsForState(state.key);
  const originLabel = analysisOriginLabel(repository);

  return (
    <div className="dashboard-page redesign-page repository-page">
      <header className="redesign-header repository-command-header">
        <div>
          <span className="eyebrow">Repository</span>
          <h1>{repository.fullName}</h1>
          <ProjectContextSummary repository={repository} attention={summary.attention} />
        </div>
        <div className="header-actions">
          {state.actionKind === 'local' ? (
            <LocalActionPanel
              repositoryName={repository.fullName}
              title={state.actionLabel ?? 'Update TRACE intelligence'}
              description={state.description}
              commands={localCommands}
              triggerLabel={state.actionLabel ?? 'Update TRACE'}
            />
          ) : null}
          <Link className="trace-button trace-button--secondary" href="/app/repositories">
            Manage repositories
          </Link>
        </div>
      </header>
      <RepositoryTabs repositoryId={repositoryId} />

      <section className="project-state-surface" aria-label="Repository lifecycle">
        <div className="project-state-surface__summary">
          <span className={`state-pill ${stateToneClass(state.tone)}`}>{state.label}</span>
          <p>{state.description}</p>
        </div>
        <TraceRail state={state.key} />
      </section>

      <section className="intelligence-strip repository-metrics" aria-label="Repository facts">
        <div>
          <span className="eyebrow">Findings</span>
          <strong>{findings.length}</strong>
          <small>Unresolved persisted findings</small>
        </div>
        <div>
          <span className="eyebrow">Reports</span>
          <strong>{reports.length}</strong>
          <small>Approved local reports</small>
        </div>
        <div>
          <span className="eyebrow">Last sync</span>
          <strong>{formatRelativeDate(repository.lastSynchronizedAt)}</strong>
          <small>
            {repository.latestSync?.branch ?? repository.defaultBranch ?? 'Branch unavailable'}
          </small>
        </div>
        {originLabel ? (
          <div>
            <span className="eyebrow">Origin</span>
            <strong>{originLabel}</strong>
            <small>Source code is not uploaded</small>
          </div>
        ) : null}
      </section>

      <section className="redesign-section" aria-labelledby="repository-intelligence-title">
        <div className="section-heading-row redesign-section-heading">
          <div>
            <span className="eyebrow">Engineering intelligence</span>
            <h2 id="repository-intelligence-title">What TRACE knows</h2>
          </div>
          <span className="quiet-count">{findings.length} to review</span>
        </div>
        {findings.length ? (
          <div className="redesign-list finding-list-redesign">
            {findings.slice(0, 6).map((finding) => (
              <div className="finding-row-redesign" key={finding.id}>
                <div className="finding-row-redesign__severity">
                  <span className="severity-label" data-severity={finding.severity}>
                    {finding.severity}
                  </span>
                  <small>
                    {finding.evidence.length} evidence reference
                    {finding.evidence.length === 1 ? '' : 's'}
                  </small>
                </div>
                <div className="finding-row-redesign__body">
                  <h3>{finding.title}</h3>
                  <p>{presentFindingDetail(finding.detail)}</p>
                  <small>
                    {finding.classification === 'deterministic'
                      ? 'Verified local evidence'
                      : `${finding.classification} interpretation`}
                  </small>
                </div>
                <FindingDisclosure
                  finding={finding}
                  repositoryName={repository.fullName}
                  repository={repository}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-empty redesign-empty">
            <strong>
              {repository.analysis?.status === 'completed'
                ? 'No unresolved findings'
                : 'Findings require a completed local analysis'}
            </strong>
            <p>
              {repository.analysis?.status === 'completed'
                ? 'The latest persisted run has nothing requiring review.'
                : 'Run the local TRACE workflow to create a validated project record.'}
            </p>
          </div>
        )}
      </section>

      <div className="redesign-two-column">
        <section className="redesign-section" aria-labelledby="repository-reports-title">
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">Project memory</span>
              <h2 id="repository-reports-title">Reports</h2>
            </div>
            <Link href="/app/reports">View all</Link>
          </div>
          {reports.length ? (
            reports.slice(0, 3).map((report) => (
              <div className="redesign-list-row" key={report.id}>
                <div>
                  <strong>{report.title}</strong>
                  <small>{report.artifactType.replaceAll('_', ' ')} - Local record</small>
                </div>
                <time dateTime={report.generatedAt}>{formatDate(report.generatedAt)}</time>
              </div>
            ))
          ) : (
            <div className="inline-empty redesign-empty">
              <strong>No reports synchronized</strong>
              <p>Generate a report locally, review the dry run, then sync the approved record.</p>
            </div>
          )}
        </section>
        <section className="redesign-section" aria-labelledby="repository-changes-title">
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">GitHub context</span>
              <h2 id="repository-changes-title">Changes</h2>
            </div>
            <Link href={`/app/repositories/${repository.id}/pull-requests`}>View all</Link>
          </div>
          {changes.length ? (
            changes.slice(0, 3).map((change) => (
              <div className="redesign-list-row" key={change.id}>
                <div>
                  <strong>{change.title}</strong>
                  <small>
                    PR #{change.number} - {change.state}
                  </small>
                </div>
                <time dateTime={change.updatedAt}>{formatRelativeDate(change.updatedAt)}</time>
              </div>
            ))
          ) : (
            <div className="inline-empty redesign-empty">
              <strong>No pull request snapshots yet</strong>
              <p>
                Signed GitHub activity will appear here when it is processed for this repository.
              </p>
            </div>
          )}
        </section>
      </div>

      <details className="technical-details redesign-technical">
        <summary>Technical details</summary>
        <dl className="technical-grid">
          <div>
            <dt>Analyzed commit</dt>
            <dd>
              <code>{repository.latestSync?.headCommit ?? 'Unavailable'}</code>
            </dd>
          </div>
          <div>
            <dt>GitHub default-branch commit</dt>
            <dd>
              <code>{repository.remoteHeadSha ?? 'Unavailable'}</code>
            </dd>
          </div>
          <div>
            <dt>Freshness source</dt>
            <dd>{repository.remoteHeadSha ? 'Trusted GitHub repository state' : 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>
              {repository.latestSync ? formatDate(repository.latestSync.completedAt) : 'Not yet'}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
