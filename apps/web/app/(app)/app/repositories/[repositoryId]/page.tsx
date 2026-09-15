import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthenticatedDashboardSummary } from '../../../../../lib/dashboard-server';
import {
  deriveTraceProjectState,
  analysisOriginLabel,
  formatDate,
  formatRelativeDate,
  freshnessLabel,
  localTraceCommandsForState,
  presentFindingDetail,
  stateToneClass,
} from '../../../../../lib/dashboard-state';
import {
  FindingDisclosure,
  LocalActionPanel,
  ProjectStatusGlyph,
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
    <div className="dashboard-page redesign-page repository-page" id="repository-command-center">
      {/* 1. Compact Repository Identity Header */}
      <header
        className="redesign-header repository-command-header"
        data-trace-motion="item"
        style={{ '--motion-index': 0 } as React.CSSProperties}
      >
        <div className="repository-identity-block">
          <div className="repository-identity-block__topline">
            <span className="eyebrow">{repository.owner}</span>
            <span className="repository-identity-block__sep" aria-hidden="true">
              /
            </span>
            <span className="repository-identity-block__visibility">{repository.visibility}</span>
            {repository.defaultBranch ? (
              <>
                <span className="repository-identity-block__sep" aria-hidden="true">
                  ·
                </span>
                <code className="repository-identity-block__branch-pill">
                  {repository.defaultBranch}
                </code>
              </>
            ) : null}
          </div>
          <div className="repository-identity-block__title-row">
            <h1 className="repository-identity-block__name">{repository.name}</h1>
            <span className={`state-pill ${stateToneClass(state.tone)}`}>
              <ProjectStatusGlyph stateKey={state.key} />
              <span>{state.label}</span>
            </span>
          </div>
          <p className="repository-identity-block__description">{state.description}</p>
          <div className="repository-identity-block__context">
            <span className="repository-identity-block__commit">
              <span className="repository-identity-block__commit-label">Analyzed commit:</span>
              <code>{repository.latestSync?.headCommit?.slice(0, 7) ?? 'Not synced'}</code>
            </span>
            {repository.remoteHeadSha ? (
              <>
                <span className="repository-identity-block__dot" aria-hidden="true">
                  ·
                </span>
                <span className="repository-identity-block__commit">
                  <span className="repository-identity-block__commit-label">GitHub head:</span>
                  <code>{repository.remoteHeadSha.slice(0, 7)}</code>
                </span>
              </>
            ) : null}
            <span className="repository-identity-block__dot" aria-hidden="true">
              ·
            </span>
            <span className="repository-identity-block__freshness-note">
              {state.key === 'current'
                ? 'Current with GitHub default branch'
                : state.key === 'needs-refresh'
                  ? 'Local intelligence needs refresh'
                  : state.key === 'sync-attention'
                    ? 'Sync attention required'
                    : 'Awaiting local CLI run'}
            </span>
          </div>
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

      {/* 2. Restrained Tab Rail */}
      <div data-trace-motion="item" style={{ '--motion-index': 1 } as React.CSSProperties}>
        <RepositoryTabs
          repositoryId={repositoryId}
          counts={{
            changes: changes.length,
            findings: findings.length,
            reports: reports.length,
          }}
        />
      </div>

      {/* 3. Single Compact Lifecycle Surface (Trace Rail) */}
      <section
        className="project-state-surface repository-state-surface"
        aria-label="Repository lifecycle"
        data-trace-motion="section"
        data-motion-section="repository-lifecycle"
      >
        <div
          className="project-state-surface__summary"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="repository-lifecycle-info">
            <span className="eyebrow">Project lifecycle</span>
            <strong className="repository-lifecycle-headline">
              {state.key === 'current'
                ? 'Verified local intelligence matches GitHub'
                : state.key === 'needs-refresh'
                  ? 'Intelligence refresh required'
                  : state.key === 'sync-attention'
                    ? 'Sync attention required'
                    : state.key === 'connected-not-analyzed'
                      ? 'Connected — awaiting first local run'
                      : state.label}
            </strong>
            <p>{state.description}</p>
            <div className="repository-lifecycle-meta">
              <span>
                Last sync: <strong>{formatRelativeDate(repository.lastSynchronizedAt)}</strong>
              </span>
              <span className="repository-lifecycle-meta__sep" aria-hidden="true">
                ·
              </span>
              <span>
                Origin: <strong>{originLabel ?? 'Not available yet'}</strong>
              </span>
            </div>
          </div>
        </div>
        <div
          className="repository-state-surface__rail"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <TraceRail state={state.key} />
        </div>
      </section>

      {/* 4. Compact Metrics Strip */}
      <section
        className="intelligence-strip repository-metrics"
        aria-label="Repository metrics"
        data-trace-motion="section"
        data-motion-section="repository-metrics"
      >
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <span className="eyebrow">Findings</span>
          <strong>{findings.length}</strong>
          <small>Unresolved persisted findings</small>
        </div>
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <span className="eyebrow">Reports</span>
          <strong>{reports.length}</strong>
          <small>Approved local records</small>
        </div>
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <span className="eyebrow">Last sync</span>
          <strong>{formatRelativeDate(repository.lastSynchronizedAt)}</strong>
          <small>
            <code>{repository.latestSync?.branch ?? repository.defaultBranch ?? 'main'}</code>
            {repository.latestSync?.headCommit ? (
              <>
                {' '}
                @ <code>{repository.latestSync.headCommit.slice(0, 7)}</code>
              </>
            ) : null}
          </small>
        </div>
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 3 } as React.CSSProperties}
        >
          <span className="eyebrow">Origin</span>
          <strong>{originLabel ?? 'Not available yet'}</strong>
          <small>
            {originLabel
              ? 'Source code is not uploaded'
              : 'Analysis source appears after a local analysis is created'}
          </small>
        </div>
      </section>

      {/* 5. "What TRACE knows" — Primary Engineering Intelligence */}
      <section
        className="redesign-section repository-intelligence-section"
        aria-labelledby="repository-intelligence-title"
        data-trace-motion="section"
        data-motion-section="repository-findings"
      >
        <div
          className="section-heading-row redesign-section-heading"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div>
            <span className="eyebrow">Engineering intelligence</span>
            <h2 id="repository-intelligence-title">What TRACE knows</h2>
          </div>
          <div className="repository-intelligence-actions">
            <span className="quiet-count">
              {findings.length} item{findings.length === 1 ? '' : 's'} to review
            </span>
            {findings.length > 6 ? (
              <Link
                className="repository-view-all-link"
                href={`/app/repositories/${repository.id}/findings`}
              >
                View all ({findings.length}) →
              </Link>
            ) : null}
          </div>
        </div>
        {findings.length ? (
          <div className="redesign-list finding-list-redesign">
            {findings.slice(0, 8).map((finding, idx) => (
              <div
                className="finding-row-redesign"
                key={finding.id}
                data-trace-motion="item"
                style={{ '--motion-index': 1 + idx } as React.CSSProperties}
              >
                <div className="finding-row-redesign__severity">
                  <span className="severity-badge" data-severity={finding.severity}>
                    {finding.severity}
                  </span>
                  <span className="evidence-count-pill">
                    {finding.evidence.length} evidence ref{finding.evidence.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="finding-row-redesign__body">
                  <div className="finding-row-redesign__header">
                    <h3 className="finding-row-redesign__title">{finding.title}</h3>
                    <div className="finding-row-redesign__badges">
                      <span className="classification-pill">
                        {finding.classification === 'deterministic'
                          ? 'Verified evidence'
                          : 'Probabilistic'}
                      </span>
                      {finding.affectedArea ? (
                        <span className="affected-area-pill">{finding.affectedArea}</span>
                      ) : null}
                      {finding.relatedChangeNumber ? (
                        <span className="related-change-pill">
                          PR #{finding.relatedChangeNumber}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="finding-row-redesign__detail">
                    {presentFindingDetail(finding.detail)}
                  </p>
                  <div className="finding-row-redesign__meta">
                    {finding.provenance?.ruleId ? (
                      <span className="finding-rule">
                        Rule: <code>{finding.provenance.ruleId}</code>
                      </span>
                    ) : null}
                    {finding.evidence.length > 0 ? (
                      <span className="finding-location">
                        Location: <code>{finding.evidence[0]}</code>
                        {finding.evidence.length > 1 ? ` +${finding.evidence.length - 1} more` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="finding-row-redesign__action">
                  <FindingDisclosure
                    finding={finding}
                    repositoryName={repository.fullName}
                    repository={repository}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="inline-empty redesign-empty"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
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

      {/* 6. Reports & Changes Modules */}
      <div
        className="redesign-two-column repository-two-column"
        data-trace-motion="section"
        data-motion-section="repository-recent"
      >
        <section
          className="redesign-section repository-intelligence-card"
          aria-labelledby="repository-reports-title"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">Project memory</span>
              <h2 id="repository-reports-title">Reports</h2>
            </div>
            <Link
              className="repository-view-all-link"
              href={reports.length ? `/app/repositories/${repository.id}/reports` : '/app/reports'}
            >
              View all {reports.length > 0 ? `(${reports.length})` : ''} →
            </Link>
          </div>
          {reports.length ? (
            <div className="repository-recent-list">
              {reports.slice(0, 4).map((report) => (
                <article className="repository-recent-row" key={report.id}>
                  <div className="repository-recent-row__info">
                    <div className="repository-recent-row__header">
                      <span className="report-type-badge">
                        {report.artifactType.replaceAll('_', ' ')}
                      </span>
                      <span className="repository-recent-row__date">
                        {formatRelativeDate(report.generatedAt)}
                      </span>
                    </div>
                    <h3 className="repository-recent-row__title">
                      <Link href={`/app/reports/${report.id}`}>{report.title}</Link>
                    </h3>
                    <p className="repository-recent-row__summary">
                      {report.summary || 'Approved local record'}
                    </p>
                    <div className="repository-recent-row__meta">
                      <span className="report-freshness-tag" data-freshness={report.freshness}>
                        {freshnessLabel(report.freshness)}
                      </span>
                      <span className="meta-sep" aria-hidden="true">
                        ·
                      </span>
                      <time dateTime={report.generatedAt}>{formatDate(report.generatedAt)}</time>
                    </div>
                  </div>
                  <div className="repository-recent-row__action">
                    <Link
                      className="trace-button trace-button--secondary trace-button--small"
                      href={`/app/reports/${report.id}`}
                    >
                      View
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="inline-empty redesign-empty">
              <strong>No reports synchronized</strong>
              <p>
                Generate a report locally (`trace report daily`), review the dry run, then sync the
                approved record.
              </p>
            </div>
          )}
        </section>

        <section
          className="redesign-section repository-intelligence-card"
          aria-labelledby="repository-changes-title"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">GitHub context</span>
              <h2 id="repository-changes-title">Changes</h2>
            </div>
            <Link
              className="repository-view-all-link"
              href={`/app/repositories/${repository.id}/pull-requests`}
            >
              View all {changes.length > 0 ? `(${changes.length})` : ''} →
            </Link>
          </div>
          {changes.length ? (
            <div className="repository-recent-list">
              {changes.slice(0, 4).map((change) => (
                <article className="repository-recent-row" key={change.id}>
                  <div className="repository-recent-row__info">
                    <div className="repository-recent-row__header">
                      <span className="change-pr-number">PR #{change.number}</span>
                      <span className="change-state-tag" data-state={change.state}>
                        {change.state}
                      </span>
                      <span className="repository-recent-row__date">
                        {formatRelativeDate(change.updatedAt)}
                      </span>
                    </div>
                    <h3 className="repository-recent-row__title">{change.title}</h3>
                    <div className="repository-recent-row__meta">
                      <span>{change.authorLogin ?? 'Author unavailable'}</span>
                      {change.branch ? (
                        <>
                          <span className="meta-sep" aria-hidden="true">
                            ·
                          </span>
                          <code>{change.branch}</code>
                        </>
                      ) : null}
                      {change.affectedAreas?.length ? (
                        <>
                          <span className="meta-sep" aria-hidden="true">
                            ·
                          </span>
                          <span>{change.affectedAreas.join(', ')}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {change.url ? (
                    <div className="repository-recent-row__action">
                      <a
                        className="trace-button trace-button--secondary trace-button--small"
                        href={change.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        GitHub ↗
                      </a>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
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

      {/* 7. Progressive Technical Details Accordion */}
      <details
        className="technical-details redesign-technical"
        id="repository-technical-details"
        data-trace-motion="item"
        style={{ '--motion-index': 2 } as React.CSSProperties}
      >
        <summary>Technical details & provenance</summary>
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
            <dt>Last synchronization</dt>
            <dd>
              {repository.latestSync
                ? formatDate(repository.latestSync.completedAt)
                : 'Not yet synchronized'}
            </dd>
          </div>
          <div>
            <dt>Trace schema version</dt>
            <dd>
              <code>{repository.latestSync?.schemaVersion ?? '1.0.0'}</code>
            </dd>
          </div>
          <div>
            <dt>Privacy guarantee</dt>
            <dd>Analysis computed locally; raw source code is never transmitted or stored.</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
