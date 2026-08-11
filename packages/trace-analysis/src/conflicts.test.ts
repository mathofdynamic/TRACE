import { describe, expect, it } from 'vitest';
import {
  detectDeterministicConflicts,
  selectConflictCandidates,
  transitionConflict,
} from './conflicts.js';

const change = (id: string, symbols: string[]) => ({
  id,
  repository: 'acme/app',
  ref: id,
  headSha: `${id}-head`,
  files: [{ path: 'src/service.ts', status: 'modified' as const, symbols }],
});

describe('conflict detection', () => {
  it('selects related pairs and separates evidence from confirmation', () => {
    const left = change('pr-1', ['ship']);
    const right = change('pr-2', ['ship']);
    expect(selectConflictCandidates([left, right])).toHaveLength(1);
    const conflicts = detectDeterministicConflicts(left, right);
    expect(conflicts.some((item) => item.type === 'symbol_overlap')).toBe(true);
    expect(conflicts[0]?.status).toBe('needs_confirmation');
    expect(conflicts[0]?.classification).toBe('deterministic');
  });

  it('supports human lifecycle state and head invalidation', () => {
    const [conflict] = detectDeterministicConflicts(
      change('pr-1', ['ship']),
      change('pr-2', ['ship']),
    );
    const resolved = transitionConflict(conflict!, 'resolved', {
      resolution: 'Sequenced manually.',
    });
    expect(resolved.resolution).toContain('Sequenced');
    expect(() => transitionConflict(resolved, 'acknowledged')).toThrow('CONFLICT_TERMINAL_STATE');
  });
});
