import { describe, expect, it } from 'vitest';
import type { DashboardRepository, DashboardSyncedRecord } from './dashboard';
import {
  computeReportsSummaryMetrics,
  getRepositoryReportEmptyState,
  groupReportsByDate,
} from './report-view-model';

const repository = (overrides: Partial<DashboardRepository> = {}): DashboardRepository => ({
  id: 'repo-1',
  fullName: 'mathofdynamic/TRACE',
  owner: 'mathofdynamic',
  name: 'TRACE',
  defaultBranch: 'main',
  visibility: 'public',
  state: 'active',
  remoteHeadSha: 'new-head',
  lastSynchronizedAt: null,
  latestSync: null,
  analysis: null,
  ...overrides,
});

const report = (overrides: Partial<DashboardSyncedRecord> = {}): DashboardSyncedRecord => ({
  id: 'report-1',
  artifactId: 'artifact-1',
  artifactType: 'daily_report',
  repositoryId: 'repo-1',
  repositoryName: 'mathofdynamic/TRACE',
  title: 'Daily report',
  summary: 'A real synchronized report.',
  status: 'verified',
  items: [],
  generatedAt: '2026-09-14T12:00:00.000Z',
  syncedAt: '2026-09-14T12:05:00.000Z',
  origin: 'local',
  content: '# Daily report',
  ...overrides,
});

describe('report view-model contracts', () => {
  it('keeps unknown freshness out of the current metric', () => {
    const metrics = computeReportsSummaryMetrics(
      [
        report({ freshness: 'current' }),
        report({ id: 'report-2', freshness: 'unknown' }),
        report({ id: 'report-3', freshness: 'needs-refresh' }),
      ],
      [repository({ syncState: 'synced' })],
    );

    expect(metrics.currentCount).toBe(1);
    expect(metrics.needsRefreshCount).toBe(1);
  });

  it('gives a connected, unanalyzed repository only the analyze command', () => {
    expect(getRepositoryReportEmptyState(repository())).toMatchObject({
      isUnsyncedOrPending: true,
      recommendedCommands: ['trace analyze'],
    });
  });

  it('gives an analyzed repository without reports sync instructions only', () => {
    expect(
      getRepositoryReportEmptyState(
        repository({
          analysis: {
            id: 'analysis-1',
            status: 'completed',
            updatedAt: '2026-09-14T12:00:00.000Z',
          },
          syncState: 'pending',
        }),
      ),
    ).toMatchObject({
      isUnsyncedOrPending: true,
      recommendedCommands: ['trace sync --dry-run', 'trace sync'],
    });
  });

  it('groups records relative to the supplied reference date', () => {
    const groups = groupReportsByDate(
      [report({ generatedAt: '2026-09-14T12:00:00.000Z' })],
      '2026-09-15T12:00:00.000Z',
    );
    expect(groups).toEqual([
      { label: 'Yesterday', reports: [expect.objectContaining({ id: 'report-1' })] },
    ]);
  });
});
