import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';

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
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Reports</p>
          <h1>A readable record of what changed and why.</h1>
          <p>Local reports approved for sync. Source code and code snippets are excluded.</p>
        </div>
        <span className="availability-label">
          {summary.latestReports.length ? 'Local evidence synced' : 'Awaiting local sync'}
        </span>
      </div>
      {summary.latestReports.length ? (
        <div className="record-groups">
          {['Today', 'Yesterday', 'This week', 'Earlier'].map((label) => {
            const reports = grouped[label];
            if (!reports?.length) return null;
            return (
              <section
                key={label}
                aria-labelledby={`reports-${label.replaceAll(' ', '-').toLowerCase()}`}
              >
                <h2
                  id={`reports-${label.replaceAll(' ', '-').toLowerCase()}`}
                  className="record-group-title"
                >
                  {label}
                </h2>
                <div className="report-list">
                  {reports.map((report) => (
                    <article className="dashboard-card synced-record" key={report.id}>
                      <div className="card-heading">
                        <div>
                          <span className="card-label">
                            {report.artifactType.replaceAll('_', ' ')}
                          </span>
                          <h3>{report.title}</h3>
                        </div>
                        <span className="origin-label">Local</span>
                      </div>
                      <p>{report.summary}</p>
                      {report.items.length ? (
                        <ul>
                          {report.items.slice(0, 5).map((item) => (
                            <li key={item.id}>
                              <strong>{item.title}</strong>
                              <span>{item.detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <details>
                        <summary>View approved Markdown</summary>
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
        <div className="empty-panel empty-panel--large">
          <h2>No reports synced</h2>
          <p>
            {summary.setup.repositorySelected
              ? 'Generate a local report, review the dry run, then sync approved .trace artifacts.'
              : 'Connect a repository before TRACE can associate local reports with this workspace.'}
          </p>
          {summary.setup.repositorySelected ? (
            <>
              <code className="empty-command">trace report daily --yes</code>
              <code className="empty-command">trace sync --dry-run</code>
              <code className="empty-command">trace sync</code>
            </>
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
