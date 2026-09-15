import type { DashboardChange, DashboardRepository, DashboardSyncedRecord } from './dashboard';

export interface ConflictSide {
  kind: 'pr' | 'system';
  badge: string;
  title: string;
  author?: string | null;
  branch?: string | null;
  area?: string | null;
  assumption: string;
  locus: string;
  url?: string | null;
  changeId?: string;
  changeNumber?: number;
}

export interface PairedConflictModel {
  conflict: DashboardSyncedRecord;
  repository?: DashboardRepository;
  sideA: ConflictSide;
  sideB: ConflictSide;
  sharedBoundary: {
    target: string;
    statement: string;
    actionRequired: string;
  };
  classification: string;
  severity: 'high' | 'medium' | 'low';
  items: DashboardSyncedRecord['items'];
}

function relatedChanges(conflict: DashboardSyncedRecord, changes: DashboardChange[]) {
  const itemChangeIds = new Set(
    conflict.items.flatMap((item) => (item.changeId ? [item.changeId] : [])),
  );
  const itemNumbers = new Set(
    conflict.items.flatMap((item) =>
      typeof item.changeNumber === 'number' ? [item.changeNumber] : [],
    ),
  );
  return changes.filter((change) => itemChangeIds.has(change.id) || itemNumbers.has(change.number));
}

export function resolvePairedConflict(
  conflict: DashboardSyncedRecord,
  changes: DashboardChange[],
  repositories: DashboardRepository[],
): PairedConflictModel {
  const repository = repositories.find((item) => item.id === conflict.repositoryId);
  const related = relatedChanges(conflict, changes);
  const first = related[0];
  const second = related[1];
  const firstItem = conflict.items[0];
  const secondItem = conflict.items[1];
  const severityValue = firstItem?.severity?.toLowerCase();
  const severity: 'high' | 'medium' | 'low' =
    severityValue === 'high' || severityValue === 'low' ? severityValue : 'medium';
  const classification =
    firstItem?.classification === 'deterministic' ? 'Deterministic collision' : 'Recorded conflict';

  const side = (
    change: DashboardChange | undefined,
    item: typeof firstItem,
    fallback: string,
  ): ConflictSide => ({
    kind: change ? 'pr' : 'system',
    badge: change ? `PR #${change.number}` : fallback,
    title: change?.title ?? item?.title ?? conflict.title,
    author: change?.authorLogin ?? null,
    branch: change?.branch ?? null,
    area: change?.affectedAreas?.[0] ?? null,
    assumption: item?.detail ?? conflict.summary,
    locus: item?.evidence?.[0] ?? 'No source locus recorded',
    url: change?.url ?? null,
    changeId: change?.id,
    changeNumber: change?.number,
  });

  return {
    conflict,
    repository,
    classification,
    severity,
    sideA: side(first, firstItem, 'Recorded change'),
    sideB: side(second, secondItem, 'Shared system boundary'),
    sharedBoundary: {
      target: conflict.title,
      statement:
        conflict.summary || 'The synchronized conflict record contains no further summary.',
      actionRequired: 'Review the synchronized evidence and coordinate the affected changes.',
    },
    items: conflict.items,
  };
}
