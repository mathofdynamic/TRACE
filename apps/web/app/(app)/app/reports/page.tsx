import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { formatDate, formatRelativeDate } from '../../../../lib/dashboard-state';

function groupLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const days = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
      86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

type ReportSection = { title: string; body: string[] };

function parseApprovedReport(content: string): ReportSection[] {
  const sections: ReportSection[] = [];
  let current: ReportSection = { title: 'Overview', body: [] };
  for (const line of content.split(/\r?\n/)) {
    const heading = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current.body.some((item) => item.trim())) sections.push(current);
      current = { title: heading[2]!.replaceAll('**', ''), body: [] };
      continue;
    }
    if (!/^#\s+/.test(line) || current.title !== 'Overview') current.body.push(line);
  }
  if (current.body.some((item) => item.trim())) sections.push(current);
  return sections;
}

function ReportNativeDetail({
  report,
}: {
  report: {
    title: string;
    artifactType: string;
    repositoryName: string;
    generatedAt: string;
    syncedAt: string;
    summary: string;
    items: Array<{ id: string; title: string; detail: string }>;
    content: string;
  };
}) {
  const sections = parseApprovedReport(report.content);
  return (
    <div className="report-native-detail" aria-label={`${report.title} native detail`}>
      <div className="report-native-detail__header">
        <div>
          <span className="eyebrow">{report.artifactType.replaceAll('_', ' ')}</span>
          <h4>{report.title}</h4>
        </div>
        <span>Local analysis</span>
      </div>
      <dl className="report-native-detail__facts">
        <div>
          <dt>Repository</dt>
          <dd>{report.repositoryName}</dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>{formatDate(report.generatedAt)}</dd>
        </div>
        <div>
          <dt>Synced</dt>
          <dd>{formatRelativeDate(report.syncedAt)}</dd>
        </div>
      </dl>
      <section className="report-native-detail__section">
        <h5>Summary</h5>
        <p>{report.summary || 'Approved TRACE record with no summary text.'}</p>
      </section>
      {report.items.length ? (
        <section className="report-native-detail__section">
          <h5>Recorded intelligence</h5>
          {report.items.map((item) => (
            <div className="report-native-detail__item" key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </section>
      ) : null}
      {sections.map((section) => (
        <section className="report-native-detail__section" key={section.title}>
          <h5>{section.title}</h5>
          <p>{section.body.join('\n').trim()}</p>
        </section>
      ))}
    </div>
  );
}

export default async function ReportsPage() {
  const { summary } = await getAuthenticatedDashboardSummary();
  const grouped = summary.latestReports.reduce(
    (groups, report) => {
      const label = groupLabel(report.generatedAt);
      (groups[label] ??= []).push(report);
      return groups;
    },
    {} as Record<string, typeof summary.latestReports>,
  );
  return (
    <div className="dashboard-page redesign-page reports-page">
      <header className="redesign-header">
        <div>
          <span className="eyebrow">Reports</span>
          <h1>Project memory, made readable.</h1>
          <p>
            Approved local records organized around the changes they describe. Source code and code
            snippets stay excluded.
          </p>
        </div>
        <span className="source-note">
          {summary.latestReports.length ? 'Local evidence synced' : 'Awaiting local sync'}
        </span>
      </header>
      {summary.latestReports.length ? (
        <div className="report-archive">
          {['Today', 'Yesterday', 'This week', 'Earlier'].map((label) => {
            const reports = grouped[label];
            if (!reports?.length) return null;
            return (
              <section
                key={label}
                aria-labelledby={`reports-${label.replaceAll(' ', '-').toLowerCase()}`}
              >
                <div className="record-group-title redesign-section-heading">
                  <span className="eyebrow">{label}</span>
                  <h2 id={`reports-${label.replaceAll(' ', '-').toLowerCase()}`}>
                    {reports.length} {reports.length === 1 ? 'record' : 'records'}
                  </h2>
                </div>
                <div className="report-archive__list">
                  {reports.map((report) => (
                    <article className="report-row" key={report.id}>
                      <div className="report-row__heading">
                        <div>
                          <span className="report-type">
                            {report.artifactType.replaceAll('_', ' ')}
                          </span>
                          <h3>{report.title}</h3>
                        </div>
                        <span className="origin-label">Local</span>
                      </div>
                      <p>{report.summary || 'Approved TRACE record with no summary text.'}</p>
                      <div className="report-row__meta">
                        <span>{report.repositoryName}</span>
                        <span>{formatDate(report.generatedAt)}</span>
                        <span>Synced {formatRelativeDate(report.syncedAt)}</span>
                      </div>
                      {report.items.length ? (
                        <div className="report-highlights">
                          {report.items.slice(0, 4).map((item) => (
                            <div key={item.id}>
                              <strong>{item.title}</strong>
                              <span>{item.detail}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <ReportNativeDetail report={report} />
                      <details className="technical-details">
                        <summary>View approved TRACE record</summary>
                        <pre className="safe-markdown">{report.content}</pre>
                      </details>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="inline-empty redesign-empty redesign-empty--large">
          <strong>No reports synchronized</strong>
          <p>
            {summary.setup.repositorySelected
              ? 'Generate a local report, review the dry run, then sync the approved record.'
              : 'Connect a repository before TRACE can associate local reports with this workspace.'}
          </p>
          {summary.setup.repositorySelected ? (
            <div className="command-stack">
              <code>trace report daily --yes</code>
              <code>trace sync --dry-run</code>
              <code>trace sync</code>
            </div>
          ) : null}
          <Link
            className="trace-button trace-button--secondary"
            href={summary.setup.repositorySelected ? '/docs#local-dashboard' : '/app/repositories'}
          >
            {summary.setup.repositorySelected ? 'View local workflow' : 'Connect repository'}
          </Link>
        </div>
      )}
    </div>
  );
}
