export interface DecisionPromptDraft {
  repositoryId: string;
  repositoryName: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  consequences: string;
  invariants: string;
  relatedChange: string;
}

export const INITIAL_DECISION_PROMPT_DRAFT: DecisionPromptDraft = {
  repositoryId: '',
  repositoryName: '',
  title: '',
  context: '',
  decision: '',
  rationale: '',
  consequences: '',
  invariants: '',
  relatedChange: '',
};

export function generateDecisionPrompt(draft: DecisionPromptDraft): string {
  const repoName = draft.repositoryName.trim() || '<repository full name>';
  const title = draft.title.trim() || '(Untitled decision)';
  const context = draft.context.trim() || '(No context provided)';
  const decision = draft.decision.trim() || '(No decision recorded)';
  const rationale = draft.rationale.trim() || '(None provided)';
  const consequences = draft.consequences.trim() || '(None provided)';
  const invariants = draft.invariants.trim() || '(None provided)';
  const relatedChange = draft.relatedChange.trim() || '(None provided)';

  return [
    `You are working in repository: ${repoName}.`,
    '',
    'Task:',
    "Record the following architectural decision using this repository's existing TRACE/.trace decision conventions.",
    '',
    'Decision title:',
    title,
    '',
    'Context:',
    context,
    '',
    'Chosen decision:',
    decision,
    '',
    'Rationale:',
    rationale,
    '',
    'Consequences / tradeoffs:',
    consequences,
    '',
    'Constraints / invariants:',
    invariants,
    '',
    'Related change:',
    relatedChange,
    '',
    'Implementation requirements:',
    '1. Inspect the repository and existing `.trace` schema/decision records before writing.',
    '2. Follow existing versioned project conventions; do not invent unsupported fields or IDs.',
    '3. Create or update only the repository-native decision record needed for this decision.',
    '4. Do not modify unrelated source code merely to satisfy the record.',
    '5. Preserve TRACE privacy rules.',
    "6. Validate the resulting record with the repository's existing checks/CLI.",
    '7. Report the exact files changed and validation performed.',
  ].join('\n');
}

export function isDecisionDraftValid(draft: DecisionPromptDraft): boolean {
  return (
    draft.repositoryName.trim().length > 0 &&
    draft.title.trim().length > 0 &&
    draft.context.trim().length > 0 &&
    draft.decision.trim().length > 0
  );
}
