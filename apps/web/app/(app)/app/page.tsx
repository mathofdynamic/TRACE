import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../lib/dashboard-server';
import {
  FindingDisclosure,
  LocalActionPanel,
  ProjectStatusGlyph,
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

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ repo?: string }>;
}) {
  const params = await searchParams;
  const { summary } = await getAuthenticatedDashboardSummary();
  const repository =
    (params?.repo ? summary.repositories.find((item) => item.id === params.repo) : null) ??
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
  const repositoryChanges = summary.latestChanges.filter(
    (item) => !repository || item.repositoryId === repository.id,
  );
  const localCommands = localTraceCommandsForState(state.key);

  return (
    <div className="dashboard-page redesign-page overview-page">
      {/* 1. Page Header */}
      <header
        className="redesign-header overview-header"
        data-trace-motion="item"
        style={{ '--motion-index': 0 } as React.CSSProperties}
      >
        <div className="overview-header__main">
          <span className="eyebrow">Project overview</span>
          <h1>{repository?.fullName ?? 'Choose a repository'}</h1>
          <p>One clear view of what TRACE knows, when it was generated, and what to do next.</p>
        </div>
        <div className="overview-header__meta">
          <span className="source-note">Live workspace data</span>
        </div>
      </header>

      {/* 2. Compact Project State / Command Surface */}
      <section
        className="project-command-surface"
        aria-labelledby="overview-state-title"
        data-trace-motion="section"
        data-motion-section="overview-state"
      >
        <div
          className="project-command-surface__topline"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="project-command-surface__info">
            <div className="project-command-surface__header-row">
              <span className="eyebrow">Project state</span>
              <span className={`state-pill ${stateToneClass(state.tone)}`}>
                <ProjectStatusGlyph stateKey={state.key} />
                <span>{state.shortLabel}</span>
              </span>
            </div>
            <h2 id="overview-state-title">{state.label}</h2>
            <p className="project-command-surface__description">{state.description}</p>
            {repository?.latestSync ? (
              <div className="project-command-surface__meta">
                <span>Last synced {formatRelativeDate(repository.lastSynchronizedAt)}</span>
                <span className="project-command-surface__meta-dot" aria-hidden="true">
                  ·
                </span>
                <span>
                  <code>
                    {repository.latestSync.branch ?? repository.defaultBranch ?? 'default branch'}
                  </code>
                </span>
                {repository.latestSync.headCommit ? (
                  <>
                    <span className="project-command-surface__meta-dot" aria-hidden="true">
                      @
                    </span>
                    <code>{repository.latestSync.headCommit.slice(0, 12)}</code>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="project-command-surface__action">
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
        </div>

        <div data-trace-motion="item" style={{ '--motion-index': 1 } as React.CSSProperties}>
          <TraceRail state={state.key} />
        </div>

        <div
          className="project-command-surface__footer"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <span className="project-command-surface__flow-hint">
            Connect → analyze locally → sync approved records → understand the change
          </span>
          {repository?.latestSync ? (
            <time dateTime={repository.latestSync.completedAt}>
              Last verified {formatRelativeDate(repository.latestSync.completedAt)}
            </time>
          ) : null}
        </div>
      </section>

      {/* 3. Attention Section (Unified) */}
      <section
        className="overview-attention"
        aria-labelledby="overview-attention-title"
        data-trace-motion="section"
        data-motion-section="overview-attention"
      >
        <div
          className="section-heading-row redesign-section-heading"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div>
            <span className="eyebrow">Attention</span>
            <h2 id="overview-attention-title">What needs your attention</h2>
          </div>
          <span className="quiet-count">{repositoryAttention.length} unresolved</span>
        </div>

        <div className="overview-attention__container">
          {/* Operational status band */}
          <div
            className={`attention-operational-bar${
              operations.length
                ? ' attention-operational-bar--alert'
                : ' attention-operational-bar--healthy'
            }`}
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <div className="attention-operational-bar__status">
              <span className="attention-operational-bar__icon" aria-hidden="true">
                {operations.length ? (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <circle cx="8" cy="8" r="6" />
                    <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M13.5 4.5l-7 7L3 8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <div>
                <strong>
                  {operations.length
                    ? `Operational attention required (${operations.length})`
                    : 'Operations healthy'}
                </strong>
                <span className="attention-operational-bar__detail">
                  {operations.length
                    ? 'One or more operational workflows require investigation.'
                    : 'No operational failures are blocking the last verified record.'}
                </span>
              </div>
            </div>
            <span className="attention-operational-bar__badge">
              {operations.length
                ? `${operations.length} ISSUE${operations.length > 1 ? 'S' : ''}`
                : '0 BLOCKED'}
            </span>
          </div>

          {/* Operational issues list (if any) */}
          {operations.length > 0 ? (
            <div className="attention-operational-list">
              {operations.map((item, idx) => (
                <article
                  className="attention-row attention-row--operation"
                  key={item.id}
                  data-trace-motion="item"
                  style={{ '--motion-index': 2 + idx } as React.CSSProperties}
                >
                  <div className="attention-row__main">
                    <div className="attention-row__badges">
                      <span className="severity-badge" data-severity={item.severity}>
                        {item.severity.toUpperCase()}
                      </span>
                      <span className="attention-row__kind-badge">OPERATIONAL</span>
                    </div>
                    <strong className="attention-row__title">{item.title}</strong>
                    <p className="attention-row__detail">{presentFindingDetail(item.detail)}</p>
                  </div>
                  {item.repositoryId ? (
                    <div className="attention-row__action">
                      <Link
                        className="attention-row__link"
                        href={`/app/repositories/${item.repositoryId}`}
                      >
                        Review
                      </Link>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {/* Engineering attention findings */}
          <div className="attention-engineering-list">
            {engineering.length ? (
              engineering.slice(0, 5).map((item, idx) => (
                <article
                  className="attention-row"
                  key={item.id}
                  data-trace-motion="item"
                  style={{ '--motion-index': 2 + operations.length + idx } as React.CSSProperties}
                >
                  <div className="attention-row__main">
                    <div className="attention-row__badges">
                      <span className="severity-badge" data-severity={item.severity}>
                        {item.severity.toUpperCase()}
                      </span>
                      <span className="classification-pill">
                        {item.classification === 'deterministic'
                          ? 'Verified evidence'
                          : 'Probabilistic'}
                      </span>
                      {item.affectedArea ? (
                        <span className="affected-area-pill">{item.affectedArea}</span>
                      ) : null}
                    </div>
                    <strong className="attention-row__title">{item.title}</strong>
                    <p className="attention-row__detail">{presentFindingDetail(item.detail)}</p>
                  </div>
                  <div className="attention-row__action">
                    <FindingDisclosure
                      finding={item}
                      repositoryName={item.repositoryName}
                      repository={repository}
                    />
                  </div>
                </article>
              ))
            ) : (
              <div
                className="attention-empty-note"
                data-trace-motion="item"
                style={{ '--motion-index': 2 + operations.length } as React.CSSProperties}
              >
                <p className="inline-note">
                  {repository?.analysis?.status === 'completed'
                    ? 'No unresolved engineering findings for this project.'
                    : 'Engineering findings require a completed local analysis.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Intelligence Metrics Strip */}
      <section
        className="intelligence-strip"
        aria-label="Project intelligence summary"
        data-trace-motion="section"
        data-motion-section="overview-intelligence"
      >
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <span className="eyebrow">Findings</span>
          <strong>{engineering.filter((item) => item.kind === 'finding').length}</strong>
          <small>Persisted review signals</small>
        </div>
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
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
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <span className="eyebrow">Branch</span>
          <strong className="intelligence-card__branch">
            {repository?.latestSync?.branch ?? repository?.defaultBranch ?? 'Not available'}
          </strong>
          <small>
            {repository?.latestSync?.headCommit ? (
              <>
                @ <code>{repository.latestSync.headCommit.slice(0, 12)}</code>
              </>
            ) : (
              'No analyzed commit'
            )}
          </small>
        </div>
        <div
          className="intelligence-card"
          data-trace-motion="item"
          style={{ '--motion-index': 3 } as React.CSSProperties}
        >
          <span className="eyebrow">Freshness</span>
          <div className="intelligence-card__freshness">
            <ProjectStatusGlyph stateKey={state.key} />
            <strong className={stateToneClass(state.tone)}>{state.shortLabel}</strong>
          </div>
          <small>Based on trusted GitHub state</small>
        </div>
      </section>

      {/* 5. Project Memory / Recent Work Grid */}
      <div className="overview-recent-grid">
        <section
          className="overview-recent-card"
          aria-labelledby="overview-changes-title"
          data-trace-motion="section"
          data-motion-section="overview-changes"
        >
          <div
            className="section-heading-row redesign-section-heading"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div>
              <span className="eyebrow">Project memory</span>
              <h2 id="overview-changes-title">What changed</h2>
            </div>
            {summary.capabilities.changes ? (
              <Link className="overview-recent-card__link" href="/app/changes">
                View changes
              </Link>
            ) : null}
          </div>
          <div className="overview-recent-list">
            {repositoryChanges.length ? (
              repositoryChanges.slice(0, 5).map((change, idx) => (
                <div
                  className="overview-recent-row"
                  key={change.id}
                  data-trace-motion="item"
                  style={{ '--motion-index': 1 + idx } as React.CSSProperties}
                >
                  <div className="overview-recent-row__info">
                    <strong className="overview-recent-row__title">{change.title}</strong>
                    <div className="overview-recent-row__meta">
                      <span className="overview-recent-row__tag">PR #{change.number}</span>
                      <span>{change.repositoryName}</span>
                      <span className="overview-recent-row__sep">·</span>
                      <span className="overview-recent-row__state">{change.state}</span>
                    </div>
                  </div>
                  <time className="overview-recent-row__time" dateTime={change.updatedAt}>
                    {formatRelativeDate(change.updatedAt)}
                  </time>
                </div>
              ))
            ) : (
              <div
                className="inline-empty redesign-empty"
                data-trace-motion="item"
                style={{ '--motion-index': 1 } as React.CSSProperties}
              >
                <strong>No recent change summary has been synchronized.</strong>
                <p>
                  TRACE will show GitHub change context after signed repository activity is
                  processed.
                </p>
              </div>
            )}
          </div>
        </section>

        <section
          className="overview-recent-card"
          aria-labelledby="overview-record-title"
          data-trace-motion="section"
          data-motion-section="overview-activity"
        >
          <div
            className="section-heading-row redesign-section-heading"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div>
              <span className="eyebrow">Workspace record</span>
              <h2 id="overview-record-title">Workspace activity</h2>
            </div>
            {summary.capabilities.activity ? (
              <Link className="overview-recent-card__link" href="/app/activity">
                View activity
              </Link>
            ) : null}
          </div>
          <div className="overview-recent-list">
            {summary.activity.length ? (
              summary.activity.slice(0, 5).map((item, idx) => (
                <div
                  className="overview-recent-row"
                  key={item.id}
                  data-trace-motion="item"
                  style={{ '--motion-index': 1 + idx } as React.CSSProperties}
                >
                  <div className="overview-recent-row__info">
                    <strong className="overview-recent-row__title">{item.title}</strong>
                    <div className="overview-recent-row__meta">
                      <span>{activityContextLabel(item.repositoryName)}</span>
                      <span className="overview-recent-row__sep">·</span>
                      <span className="overview-recent-row__detail">{item.detail}</span>
                    </div>
                  </div>
                  <time className="overview-recent-row__time" dateTime={item.occurredAt}>
                    {formatRelativeDate(item.occurredAt)}
                  </time>
                </div>
              ))
            ) : (
              <div
                className="inline-empty redesign-empty"
                data-trace-motion="item"
                style={{ '--motion-index': 1 } as React.CSSProperties}
              >
                <strong>No project events yet.</strong>
                <p>Connecting a repository creates the first durable workspace event.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
