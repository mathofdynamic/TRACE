import { createHash } from 'node:crypto';
import type { EvidenceClassification } from '@trace/core';

export type ActiveChange = {
  id: string;
  repository: string;
  ref: string;
  headSha: string;
  baseSha?: string;
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    symbols?: string[];
    apiSurfaces?: string[];
    schemaObjects?: string[];
    dependencies?: string[];
  }>;
  linkedIssue?: string;
};

export type ConflictType =
  | 'file_overlap'
  | 'symbol_overlap'
  | 'api_overlap'
  | 'schema_overlap'
  | 'dependency_overlap';
export type ConflictStatus =
  | 'detected'
  | 'needs_confirmation'
  | 'acknowledged'
  | 'coordinating'
  | 'sequencing_defined'
  | 'false_positive'
  | 'resolved'
  | 'superseded'
  | 'stale';

export type Conflict = {
  id: string;
  repository: string;
  changes: Array<{ id: string; ref: string; headSha: string }>;
  type: ConflictType;
  affected: string[];
  deterministicEvidence: string[];
  semanticEvidence: string[];
  severity: 'low' | 'medium' | 'high';
  classification: EvidenceClassification;
  confidence: 'high' | 'medium' | 'low';
  status: ConflictStatus;
  firstDetectedAt: string;
  lastEvaluatedAt: string;
  coordinationOwner?: string;
  requiredOrdering?: string;
  resolution?: string;
  provenance: string;
};

function stableId(
  repository: string,
  left: ActiveChange,
  right: ActiveChange,
  type: ConflictType,
  affected: string[],
) {
  return `conflict-${createHash('sha256')
    .update(`${repository}:${left.id}:${right.id}:${type}:${affected.sort().join(',')}`)
    .digest('hex')
    .slice(0, 16)}`;
}

function overlap(left: string[] = [], right: string[] = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

export function selectConflictCandidates(changes: ActiveChange[]) {
  const candidates: Array<{ left: ActiveChange; right: ActiveChange; reasons: string[] }> = [];
  for (let leftIndex = 0; leftIndex < changes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < changes.length; rightIndex += 1) {
      const left = changes[leftIndex]!;
      const right = changes[rightIndex]!;
      if (left.repository !== right.repository) continue;
      const sharedFiles = overlap(
        left.files.map((file) => file.path),
        right.files.map((file) => file.path),
      );
      const sharedSymbols = overlap(
        left.files.flatMap((file) => file.symbols ?? []),
        right.files.flatMap((file) => file.symbols ?? []),
      );
      const reasons = [
        ...(sharedFiles.length ? [`shared files: ${sharedFiles.join(', ')}`] : []),
        ...(sharedSymbols.length ? [`shared symbols: ${sharedSymbols.join(', ')}`] : []),
        ...(left.linkedIssue && left.linkedIssue === right.linkedIssue
          ? [`shared issue: ${left.linkedIssue}`]
          : []),
      ];
      if (reasons.length) candidates.push({ left, right, reasons });
    }
  }
  return candidates;
}

export function detectDeterministicConflicts(left: ActiveChange, right: ActiveChange): Conflict[] {
  if (left.repository !== right.repository) return [];
  const now = new Date().toISOString();
  const results: Conflict[] = [];
  const add = (
    type: ConflictType,
    affected: string[],
    severity: Conflict['severity'],
    evidence: string[],
  ) => {
    if (!affected.length) return;
    results.push({
      id: stableId(left.repository, left, right, type, affected),
      repository: left.repository,
      changes: [left, right].map((change) => ({
        id: change.id,
        ref: change.ref,
        headSha: change.headSha,
      })),
      type,
      affected,
      deterministicEvidence: evidence,
      semanticEvidence: [],
      severity,
      classification: 'deterministic',
      confidence: 'high',
      status: 'needs_confirmation',
      firstDetectedAt: now,
      lastEvaluatedAt: now,
      provenance: 'trace-analysis@0.1',
    });
  };
  const fileOverlap = overlap(
    left.files.map((file) => file.path),
    right.files.map((file) => file.path),
  );
  add(
    'file_overlap',
    fileOverlap,
    'low',
    fileOverlap.map((path) => `file:${path}`),
  );
  const symbols = overlap(
    left.files.flatMap((file) => file.symbols ?? []),
    right.files.flatMap((file) => file.symbols ?? []),
  );
  add(
    'symbol_overlap',
    symbols,
    'medium',
    symbols.map((symbol) => `symbol:${symbol}`),
  );
  const apiSurfaces = overlap(
    left.files.flatMap((file) => file.apiSurfaces ?? []),
    right.files.flatMap((file) => file.apiSurfaces ?? []),
  );
  add(
    'api_overlap',
    apiSurfaces,
    'high',
    apiSurfaces.map((surface) => `api:${surface}`),
  );
  const schemaObjects = overlap(
    left.files.flatMap((file) => file.schemaObjects ?? []),
    right.files.flatMap((file) => file.schemaObjects ?? []),
  );
  add(
    'schema_overlap',
    schemaObjects,
    'high',
    schemaObjects.map((object) => `schema:${object}`),
  );
  const dependencies = overlap(
    left.files.flatMap((file) => file.dependencies ?? []),
    right.files.flatMap((file) => file.dependencies ?? []),
  );
  add(
    'dependency_overlap',
    dependencies,
    'medium',
    dependencies.map((dependency) => `dependency:${dependency}`),
  );
  return results;
}

export function transitionConflict(
  conflict: Conflict,
  status: ConflictStatus,
  details?: { owner?: string; ordering?: string; resolution?: string; headShas?: string[] },
) {
  if (conflict.status === 'resolved' || conflict.status === 'false_positive') {
    if (status !== 'stale' && status !== 'superseded') throw new Error('CONFLICT_TERMINAL_STATE');
  }
  return {
    ...conflict,
    status,
    coordinationOwner: details?.owner ?? conflict.coordinationOwner,
    requiredOrdering: details?.ordering ?? conflict.requiredOrdering,
    resolution: details?.resolution ?? conflict.resolution,
    lastEvaluatedAt: new Date().toISOString(),
    changes: details?.headShas
      ? conflict.changes.map((change, index) => ({
          ...change,
          headSha: details.headShas?.[index] ?? change.headSha,
        }))
      : conflict.changes,
  };
}

export function conflictIsStale(conflict: Conflict, currentHeadShas: string[]) {
  return conflict.changes.some((change, index) => change.headSha !== currentHeadShas[index]);
}

export function renderConflictArtifact(conflict: Conflict) {
  return `# Concurrent-change conflict\n\n- Conflict: **${conflict.id}**\n- Repository: **${conflict.repository}**\n- Type: **${conflict.type}**\n- Severity: **${conflict.severity}**\n- Classification: **${conflict.classification}**\n- Confidence: **${conflict.confidence}**\n- Status: **${conflict.status}**\n\n## Affected surfaces\n\n${conflict.affected.map((item) => `- ${item}`).join('\n')}\n\n## Deterministic evidence\n\n${conflict.deterministicEvidence.map((item) => `- ${item}`).join('\n')}\n\n## Coordination\n\n- Owner: ${conflict.coordinationOwner ?? 'unassigned'}\n- Required ordering: ${conflict.requiredOrdering ?? 'not defined'}\n- Resolution: ${conflict.resolution ?? 'not resolved'}\n\n## Provenance\n\n${conflict.provenance}\n`;
}
