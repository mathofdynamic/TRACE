import { notFound } from 'next/navigation';
import { getAuthenticatedDashboardSummary } from '../../../../../lib/dashboard-server';
import { ReportDetailView } from '../../_components/report-detail-view';

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const { summary } = await getAuthenticatedDashboardSummary();
  const report = summary.latestReports.find((r) => r.id === reportId);
  if (!report) notFound();

  const repository = summary.repositories.find((r) => r.id === report.repositoryId);
  const relatedChanges = summary.latestChanges.filter(
    (c) =>
      c.repositoryId === report.repositoryId &&
      (report.relatedChangeIds?.includes(c.id) ||
        report.items.some((i) => i.changeId === c.id || i.changeNumber === c.number)),
  );
  const relatedFindings = summary.attention.filter(
    (a) =>
      a.repositoryId === report.repositoryId &&
      (report.relatedFindingIds?.includes(a.id) || report.items.some((i) => i.findingId === a.id)),
  );

  return (
    <div className="dashboard-page redesign-page report-detail-page">
      <ReportDetailView
        report={report}
        repository={repository}
        relatedChanges={relatedChanges}
        relatedFindings={relatedFindings}
      />
    </div>
  );
}
