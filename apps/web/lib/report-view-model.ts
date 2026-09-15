import type { DashboardRepository, DashboardSyncedRecord } from './dashboard';

export interface ReportsSummaryMetrics {
  totalReportsCount: number;
  syncedRepositoriesCount: number;
  totalRepositoriesCount: number;
  currentCount: number;
  needsRefreshCount: number;
  attentionCount: number;
}

export function computeReportsSummaryMetrics(
  reports: DashboardSyncedRecord[],
  repositories: DashboardRepository[],
): ReportsSummaryMetrics {
  const reportsByRepository = new Set(reports.map((report) => report.repositoryId));
  return {
    totalReportsCount: reports.length,
    syncedRepositoriesCount: repositories.filter(
      (repository) => reportsByRepository.has(repository.id) || repository.syncState === 'synced',
    ).length,
    totalRepositoriesCount: repositories.length,
    currentCount: reports.filter((report) => report.freshness === 'current').length,
    needsRefreshCount: reports.filter((report) => report.freshness === 'needs-refresh').length,
    attentionCount: reports.filter((report) => report.freshness === 'attention').length,
  };
}

export function groupReportsByDate(
  reports: DashboardSyncedRecord[],
  referenceDate: string | Date = new Date(),
): Array<{ label: string; reports: DashboardSyncedRecord[] }> {
  const reference = new Date(referenceDate);
  const referenceDay = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const groups = new Map<string, DashboardSyncedRecord[]>();
  for (const report of reports) {
    const date = new Date(report.generatedAt);
    const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.floor((referenceDay - day) / 86_400_000);
    const label =
      days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Earlier';
    const group = groups.get(label) ?? [];
    group.push(report);
    groups.set(label, group);
  }
  return ['Today', 'Yesterday', 'This week', 'Earlier'].flatMap((label) => {
    const groupedReports = groups.get(label);
    return groupedReports?.length ? [{ label, reports: groupedReports }] : [];
  });
}

export interface RepoEmptyStateReason {
  isUnsyncedOrPending: boolean;
  title: string;
  description: string;
  recommendedCommands: string[];
}

export function getRepositoryReportEmptyState(
  selectedRepo: DashboardRepository | undefined,
): RepoEmptyStateReason {
  if (!selectedRepo) {
    return {
      isUnsyncedOrPending: false,
      title: 'No reports match the selected filters',
      description: 'Adjust the filters or select another repository.',
      recommendedCommands: [],
    };
  }
  const noAnalysis = !selectedRepo.analysis || selectedRepo.analysis.status === 'not-started';
  return {
    isUnsyncedOrPending: noAnalysis || selectedRepo.syncState === 'pending',
    title: noAnalysis
      ? `${selectedRepo.name} has not been analyzed yet`
      : `No reports found for ${selectedRepo.name}`,
    description: noAnalysis
      ? 'This repository is connected, but no local TRACE analysis has been synchronized.'
      : 'Run local TRACE analysis and synchronize an approved report record.',
    recommendedCommands: noAnalysis ? ['trace analyze'] : ['trace sync --dry-run', 'trace sync'],
  };
}
