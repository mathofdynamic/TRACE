import { describe, expect, it } from 'vitest';
import {
  analysisOriginLabel,
  activityContextLabel,
  deriveTraceProjectState,
  isFileEvidenceReference,
  localTraceCommandsForState,
  presentFindingDetail,
} from './dashboard-state';
import type { DashboardRepository } from './dashboard';

const repository: DashboardRepository = {
  id: 'repo-1',
  fullName: 'mathofdynamic/TRACE',
  owner: 'mathofdynamic',
  name: 'TRACE',
  defaultBranch: 'main',
  visibility: 'public',
  state: 'active',
  remoteHeadSha: 'abc',
  lastSynchronizedAt: '2026-08-15T10:00:00.000Z',
  latestSync: {
    operationId: 'op-1',
    branch: 'main',
    headCommit: 'abc',
    traceVersion: 'TRACE 0.1.0',
    schemaVersion: '1',
    completedAt: '2026-08-15T10:00:00.000Z',
    stale: false,
  },
  analysis: { id: 'analysis-1', status: 'completed', updatedAt: '2026-08-15T10:00:00.000Z' },
};

describe('deriveTraceProjectState', () => {
  it('fails closed when freshness is unavailable', () => {
    expect(
      deriveTraceProjectState({
        ...repository,
        latestSync: { ...repository.latestSync!, stale: null },
      }).key,
    ).toBe('synced-freshness-unavailable');
  });

  it('distinguishes current from needs refresh', () => {
    expect(deriveTraceProjectState(repository).key).toBe('current');
    expect(
      deriveTraceProjectState({
        ...repository,
        latestSync: { ...repository.latestSync!, stale: true },
      }).key,
    ).toBe('needs-refresh');
  });

  it('distinguishes a connected repository from a local analysis ready to sync', () => {
    expect(deriveTraceProjectState({ ...repository, latestSync: null, analysis: null }).key).toBe(
      'connected-not-analyzed',
    );
    expect(deriveTraceProjectState({ ...repository, latestSync: null }).key).toBe(
      'analysis-available-locally',
    );
  });

  it('derives only the commands supported by each project state', () => {
    expect(localTraceCommandsForState('connected-not-analyzed')).toEqual(['trace analyze']);
    expect(localTraceCommandsForState('analysis-failed')).toEqual(['trace analyze']);
    expect(localTraceCommandsForState('analysis-available-locally')).toEqual([
      'trace sync --dry-run',
      'trace sync',
    ]);
    expect(localTraceCommandsForState('needs-refresh')).toEqual([
      'trace analyze',
      'trace sync --dry-run',
      'trace sync',
    ]);
    expect(localTraceCommandsForState('current')).toEqual([]);
    expect(localTraceCommandsForState('synced-freshness-unavailable')).toEqual([]);
  });

  it('keeps finding copy advisory and distinguishes evidence records from file locations', () => {
    expect(presentFindingDetail('Review before the next change is accepted.')).toBe(
      'Review before the next change is accepted.',
    );
    expect(
      presentFindingDetail(
        'A deterministic local record requires review before the next change is accepted.',
      ),
    ).toBe(
      'TRACE detected this deterministically and recommends reviewing it before the change is considered complete.',
    );
    expect(presentFindingDetail('This requires review before the next change is accepted.')).toBe(
      'TRACE detected this deterministically and recommends reviewing it before the change is considered complete.',
    );
    expect(analysisOriginLabel({ ...repository, latestSync: null, analysis: null })).toBeNull();
    expect(
      analysisOriginLabel({
        ...repository,
        latestSync: null,
        analysis: { ...repository.analysis!, status: 'completed' },
      }),
    ).toBe('Local analysis');
    expect(analysisOriginLabel(repository)).toBe('Local analysis');
    expect(isFileEvidenceReference('packages/trace-core/src/sync.ts')).toBe(true);
    expect(isFileEvidenceReference('evidence/dependency-metadata-changed.md')).toBe(false);
    expect(activityContextLabel('mathofdynamic/Radar')).toBe('Repository - mathofdynamic/Radar');
    expect(activityContextLabel(null)).toBe('Workspace');
  });
});
