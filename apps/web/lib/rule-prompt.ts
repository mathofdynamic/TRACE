export type RuleScope =
  | 'repository'
  | 'component'
  | 'organization'
  | 'mandatory_organization'
  | 'workflow';
export type RuleSeverity = 'high' | 'medium' | 'low' | 'info';
export type RuleMode = 'deterministic' | 'advisory';

export interface RulePromptDraft {
  repositoryId: string;
  repositoryName: string;
  ruleId: string;
  title: string;
  purpose: string;
  scope: RuleScope;
  severity: RuleSeverity;
  mode: RuleMode;
  targetPaths: string;
  remediation: string;
  overrideAllowed: boolean;
}

export const INITIAL_RULE_PROMPT_DRAFT: RulePromptDraft = {
  repositoryId: '',
  repositoryName: '',
  ruleId: '',
  title: '',
  purpose: '',
  scope: 'repository',
  severity: 'high',
  mode: 'deterministic',
  targetPaths: '',
  remediation: '',
  overrideAllowed: true,
};

export function generateRulePrompt(draft: RulePromptDraft): string {
  const repoName = draft.repositoryName.trim() || '<repository full name>';
  const ruleId = draft.ruleId.trim() || '(Auto-slug from title or rule.domain.name)';
  const title = draft.title.trim() || '(Untitled rule)';
  const purpose = draft.purpose.trim() || '(No purpose provided)';
  const scope = draft.scope;
  const severity = draft.severity.toUpperCase();
  const mode =
    draft.mode === 'deterministic'
      ? 'Deterministic AST / Pattern Matching'
      : 'Advisory Language Model Reasoning';
  const targetPaths = draft.targetPaths.trim() || '(All repository files or specified paths)';
  const remediation = draft.remediation.trim() || '(None specified)';
  const overridePolicy = draft.overrideAllowed
    ? 'Allowed with justification'
    : 'Strictly prohibited';

  return [
    `You are working in repository: ${repoName}.`,
    '',
    'Task:',
    "Define and record the following repository governance rule / boundary policy using this repository's existing TRACE/.trace rule conventions.",
    '',
    'Rule ID:',
    ruleId,
    '',
    'Rule Title:',
    title,
    '',
    'Purpose & Boundary Invariant:',
    purpose,
    '',
    'Rule Policy Specifications:',
    `- Severity: ${severity}`,
    `- Enforcement Mode: ${mode}`,
    `- Scope: ${scope}`,
    `- Target Loci / Path Matchers: ${targetPaths}`,
    `- Override Policy: ${overridePolicy}`,
    '',
    'Remediation Guidance:',
    remediation,
    '',
    'Implementation requirements:',
    '1. Inspect the repository and existing `.trace/rules/` schema/records or configuration before writing.',
    '2. Follow existing versioned project conventions; use stable, lowercase dot-separated rule IDs.',
    '3. Create or update the repository-native governance rule definition with deterministic matchers.',
    '4. Do not modify unrelated source code merely to satisfy the rule record.',
    '5. Preserve TRACE privacy rules and local-first verification guarantees.',
    "6. Validate the resulting rule definition with the repository's existing checks/CLI (e.g. `trace rules check`).",
    '7. Report the exact files created/changed and verification output performed.',
  ].join('\n');
}

export function isRuleDraftValid(draft: RulePromptDraft): boolean {
  return (
    draft.repositoryName.trim().length > 0 &&
    draft.title.trim().length > 0 &&
    draft.purpose.trim().length > 0
  );
}
