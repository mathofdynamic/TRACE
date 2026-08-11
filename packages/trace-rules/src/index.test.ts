import { describe, expect, it } from 'vitest';
import {
  evaluateRules,
  mergeEffectiveRules,
  overrideIsActive,
  type RuleDefinition,
} from './index.js';

const rule = (scope: RuleDefinition['scope'], version: number): RuleDefinition => ({
  id: 'tests.related',
  version,
  title: 'Tests',
  purpose: 'Tests',
  scope,
  mode: 'deterministic',
  owner: 'owner',
  status: 'active',
  severity: 'medium',
  evaluator: 'paths-require-tests',
  configuration: { pathPrefix: 'src/' },
  effectiveFrom: '2026-08-08T00:00:00.000Z',
  source: 'test',
  overrideAllowed: true,
  testCases: [],
});

describe('rules', () => {
  it('merges lower-precedence rules predictably', () => {
    expect(
      mergeEffectiveRules([rule('repository', 1), rule('mandatory_organization', 1)])[0]?.scope,
    ).toBe('mandatory_organization');
  });
  it('evaluates deterministic test requirements and expiry', () => {
    const result = evaluateRules(
      {
        repository: { provider: 'git', name: 'x', root: '.' },
        commits: [],
        changedFiles: [{ path: 'src/a.ts', status: 'modified' }],
        additions: 1,
        deletions: 0,
        workingTree: 'dirty',
        evidence: [],
      },
      [rule('repository', 1)],
    );
    expect(result[0]?.status).toBe('fail');
    expect(
      overrideIsActive({
        id: 'o',
        ruleId: 'tests.related',
        scope: 'pull_request',
        target: '1',
        reason: 'test',
        actor: 'u',
        expiresAt: '2020-01-01T00:00:00Z',
        createdAt: '2020-01-01T00:00:00Z',
      }),
    ).toBe(false);
  });
});
