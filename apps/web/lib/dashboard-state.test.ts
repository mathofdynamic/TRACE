import { describe, expect, it } from 'vitest';
import {
  analysisOriginLabel,
  activityContextLabel,
  deriveTraceProjectState,
  isFileEvidenceReference,
  localTraceCommandsForState,
  needsReanalysis,
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

  it('requires re-analysis when a newer GitHub head coexists with a failed sync', () => {
    const state = deriveTraceProjectState(
      {
        ...repository,
        remoteHeadSha: 'new-head',
        latestSync: { ...repository.latestSync!, headCommit: 'old-head', stale: true },
      },
      [
        {
          id: 'sync-failure',
          kind: 'sync-failed',
          severity: 'high',
          title: 'Sync failed',
          detail: 'The approved record was rejected.',
          classification: 'deterministic',
          evidence: [],
          repositoryId: repository.id,
          repositoryName: repository.fullName,
          updatedAt: '2026-08-15T10:01:00.000Z',
        },
      ],
    );

    expect(state.key).toBe('needs-refresh');
    expect(
      needsReanalysis({
        ...repository,
        remoteHeadSha: 'new-head',
        latestSync: { ...repository.latestSync!, headCommit: 'old-head', stale: true },
      }),
    ).toBe(true);
    expect(localTraceCommandsForState(state.key)).toEqual([
      'trace analyze',
      'trace sync --dry-run',
      'trace sync',
    ]);
  });

  it('keeps current sync failures on the recovery workflow without re-analysis', () => {
    const state = deriveTraceProjectState(repository, [
      {
        id: 'sync-failure',
        kind: 'sync-failed',
        severity: 'high',
        title: 'Sync failed',
        detail: 'The approved record was rejected.',
        classification: 'deterministic',
        evidence: [],
        repositoryId: repository.id,
        repositoryName: repository.fullName,
        updatedAt: '2026-08-15T10:01:00.000Z',
      },
    ]);

    expect(state.key).toBe('sync-attention');
    expect(needsReanalysis(repository)).toBe(false);
    expect(localTraceCommandsForState(state.key)).toEqual(['trace sync --dry-run', 'trace sync']);
  });

  it('does not infer re-analysis from missing sync or unknown freshness', () => {
    const locallyAnalyzed = { ...repository, latestSync: null };
    const freshnessUnknown = {
      ...repository,
      latestSync: { ...repository.latestSync!, stale: null },
    };

    expect(deriveTraceProjectState(locallyAnalyzed).key).toBe('analysis-available-locally');
    expect(localTraceCommandsForState(deriveTraceProjectState(locallyAnalyzed).key)).toEqual([
      'trace sync --dry-run',
      'trace sync',
    ]);
    expect(needsReanalysis(locallyAnalyzed)).toBe(false);
    expect(deriveTraceProjectState(freshnessUnknown).key).toBe('synced-freshness-unavailable');
    expect(localTraceCommandsForState(deriveTraceProjectState(freshnessUnknown).key)).toEqual([]);
    expect(needsReanalysis(freshnessUnknown)).toBe(false);
    expect(
      localTraceCommandsForState(
        deriveTraceProjectState({ ...repository, latestSync: null, analysis: null }).key,
      ),
    ).toEqual(['trace analyze']);
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
