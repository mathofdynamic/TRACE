import type { NormalizedChangeSet } from '@trace/core';

export type RuleScope =
  | 'mandatory_organization'
  | 'organization'
  | 'repository'
  | 'component'
  | 'workflow'
  | 'user';
export type RuleMode = 'deterministic' | 'advisory';
export type RuleStatus =
  | 'draft'
  | 'testing'
  | 'proposed'
  | 'approved'
  | 'active'
  | 'deprecated'
  | 'archived';
export type RuleSeverity = 'info' | 'low' | 'medium' | 'high';

export type RuleDefinition = {
  id: string;
  version: number;
  title: string;
  purpose: string;
  scope: RuleScope;
  mode: RuleMode;
  owner: string;
  status: RuleStatus;
  severity: RuleSeverity;
  evaluator: string;
  configuration: Record<string, unknown>;
  effectiveFrom: string;
  source: string;
  overrideAllowed: boolean;
  testCases: Array<{
    name: string;
    expected: 'pass' | 'fail' | 'needs_context' | 'not_applicable';
  }>;
};

export type RuleEvaluation = {
  ruleId: string;
  status: 'pass' | 'fail' | 'needs_context' | 'not_applicable';
  severity: RuleSeverity;
  evidence: string[];
  remediation?: string;
  evaluatorVersion: string;
  runtimeMs: number;
  error?: string;
};

export type RuleOverride = {
  id: string;
  ruleId: string;
  scope: 'finding' | 'pull_request' | 'path' | 'component' | 'repository';
  target: string;
  reason: string;
  actor: string;
  expiresAt?: string;
  linkedIssue?: string;
  createdAt: string;
};

const scopeRank: Record<RuleScope, number> = {
  mandatory_organization: 0,
  organization: 1,
  repository: 2,
  component: 3,
  workflow: 4,
  user: 5,
};

export function mergeEffectiveRules(rules: RuleDefinition[]) {
  const byId = new Map<string, RuleDefinition>();
  for (const rule of [...rules].sort(
    (a, b) => scopeRank[a.scope] - scopeRank[b.scope] || a.version - b.version,
  )) {
    const existing = byId.get(rule.id);
    if (existing?.scope === 'mandatory_organization' && rule.scope !== 'mandatory_organization')
      continue;
    if (!existing || scopeRank[rule.scope] >= scopeRank[existing.scope]) byId.set(rule.id, rule);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function validateRule(rule: RuleDefinition) {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9._-]{2,80}$/.test(rule.id)) errors.push('Rule ID is not stable or valid.');
  if (!rule.title.trim() || !rule.purpose.trim())
    errors.push('Rule title and purpose are required.');
  if (rule.mode === 'advisory' && rule.severity === 'high')
    errors.push(
      'Advisory rules cannot create high-severity hard failures without deterministic evidence.',
    );
  if (rule.status === 'active' && !['approved', 'active'].includes(rule.status))
    errors.push('Active rules require approval.');
  return errors;
}

export function evaluateRules(
  changeSet: NormalizedChangeSet,
  rules: RuleDefinition[],
): RuleEvaluation[] {
  return mergeEffectiveRules(rules)
    .filter((rule) => rule.status === 'active' || rule.status === 'approved')
    .map((rule) => {
      const started = Date.now();
      const changedPaths = changeSet.changedFiles.map((file) => file.path);
      if (rule.evaluator === 'linked-issue-required') {
        const present = Boolean(
          rule.configuration.issueRef ??
            changeSet.evidence.some((item) => item.type === 'repository'),
        );
        return {
          ruleId: rule.id,
          status: present ? 'pass' : 'fail',
          severity: rule.severity,
          evidence: present ? ['change-set:repository'] : [],
          remediation: present
            ? undefined
            : 'Link an issue or provide an explicit goal before review.',
          evaluatorVersion: 'rules@0.1',
          runtimeMs: Date.now() - started,
        };
      }
      if (rule.evaluator === 'paths-require-tests') {
        const protectedPath = String(rule.configuration.pathPrefix ?? 'src/');
        const touches = changedPaths.some((path) => path.startsWith(protectedPath));
        const hasTests = changedPaths.some((path) =>
          /(^|[/\\])(__tests__|.*\.(test|spec)\.)/.test(path),
        );
        return {
          ruleId: rule.id,
          status: !touches ? 'not_applicable' : hasTests ? 'pass' : 'fail',
          severity: rule.severity,
          evidence: changedPaths
            .filter((path) => path.startsWith(protectedPath))
            .map((path) => `file:${path}`),
          remediation: touches && !hasTests ? 'Add or link a related test.' : undefined,
          evaluatorVersion: 'rules@0.1',
          runtimeMs: Date.now() - started,
        };
      }
      if (rule.evaluator === 'trace-artifacts-valid') {
        return {
          ruleId: rule.id,
          status: changeSet.changedFiles.some((file) => file.path.startsWith('.trace/'))
            ? 'needs_context'
            : 'not_applicable',
          severity: rule.severity,
          evidence: [],
          remediation: 'Run trace validate.',
          evaluatorVersion: 'rules@0.1',
          runtimeMs: Date.now() - started,
        };
      }
      return {
        ruleId: rule.id,
        status: 'needs_context',
        severity: rule.severity,
        evidence: [],
        remediation: 'This evaluator needs a configured adapter.',
        evaluatorVersion: 'rules@0.1',
        runtimeMs: Date.now() - started,
      };
    });
}

export function overrideIsActive(override: RuleOverride, now = new Date()) {
  return !override.expiresAt || new Date(override.expiresAt).getTime() > now.getTime();
}

export const initialRules: RuleDefinition[] = [
  {
    id: 'tests.related',
    version: 1,
    title: 'Related tests',
    purpose: 'Production changes should carry test evidence.',
    scope: 'repository',
    mode: 'deterministic',
    owner: 'repository',
    status: 'active',
    severity: 'medium',
    evaluator: 'paths-require-tests',
    configuration: { pathPrefix: 'src/' },
    effectiveFrom: '2026-08-08T00:00:00.000Z',
    source: '.trace/rules/tests-related.yml',
    overrideAllowed: true,
    testCases: [],
  },
  {
    id: 'goal.linked-issue',
    version: 1,
    title: 'Linked issue',
    purpose: 'Require an explicit goal when configured by the organization.',
    scope: 'organization',
    mode: 'deterministic',
    owner: 'organization',
    status: 'approved',
    severity: 'low',
    evaluator: 'linked-issue-required',
    configuration: {},
    effectiveFrom: '2026-08-08T00:00:00.000Z',
    source: 'organization-policy',
    overrideAllowed: false,
    testCases: [],
  },
];
