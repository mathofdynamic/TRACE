'use client';

import React, { useState, useId, useMemo, useRef } from 'react';
import { OverlayPortal, ModalBackdrop, CenteredDialog } from './overlay-portal';
import { TraceSelect } from './trace-select';
import type { DashboardRepository } from '../../../../lib/dashboard';
import {
  type RulePromptDraft,
  INITIAL_RULE_PROMPT_DRAFT,
  generateRulePrompt,
  isRuleDraftValid,
  type RuleScope,
  type RuleSeverity,
  type RuleMode,
} from '../../../../lib/rule-prompt';
import { usePresence, getMotionItemProps } from '../../../../lib/entrance-motion';

export interface RulePromptBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  repositories: DashboardRepository[];
  defaultRepoId?: string;
}

const SCOPE_OPTIONS = [
  { value: 'repository', label: 'Repository (Local workspace)' },
  { value: 'component', label: 'Component / Package Subtree' },
  { value: 'organization', label: 'Organization-wide' },
  { value: 'mandatory_organization', label: 'Mandatory Organization (Non-overridable)' },
  { value: 'workflow', label: 'Workflow / Pipeline' },
];

const SEVERITY_OPTIONS = [
  { value: 'high', label: 'High (Blocks synchronization)' },
  { value: 'medium', label: 'Medium (Warning invariant)' },
  { value: 'low', label: 'Low (Advisory inspection)' },
  { value: 'info', label: 'Info (Informational guideline)' },
];

const MODE_OPTIONS = [
  { value: 'deterministic', label: 'Deterministic (AST / File Pattern Matching)' },
  { value: 'advisory', label: 'Advisory (Model Reasoning Invariant)' },
];

export function RulePromptBuilder({
  isOpen,
  onClose,
  repositories,
  defaultRepoId,
}: RulePromptBuilderProps) {
  const presence = usePresence(isOpen);
  const initialRepoId = defaultRepoId || (repositories[0]?.id ?? '');
  const initialRepoName =
    repositories.find((r) => r.id === initialRepoId)?.fullName ||
    repositories.find((r) => r.id === initialRepoId)?.name ||
    '';

  const [draft, setDraft] = useState<RulePromptDraft>(() => ({
    ...INITIAL_RULE_PROMPT_DRAFT,
    repositoryId: initialRepoId,
    repositoryName: initialRepoName,
  }));

  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const titleInputId = useId();
  const repoSelectId = useId();
  const ruleIdInputId = useId();
  const purposeId = useId();
  const scopeSelectId = useId();
  const severitySelectId = useId();
  const modeSelectId = useId();
  const targetPathsId = useId();
  const remediationId = useId();
  const overrideSelectId = useId();
  const dialogTitleId = useId();
  const dialogDescId = useId();

  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleRepoChange = (repoId: string) => {
    const found = repositories.find((r) => r.id === repoId);
    setDraft((prev) => ({
      ...prev,
      repositoryId: repoId,
      repositoryName: found?.fullName || found?.name || repoId,
    }));
  };

  const handleFieldChange = <K extends keyof RulePromptDraft>(
    field: K,
    value: RulePromptDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleClearDraft = () => {
    setDraft({
      ...INITIAL_RULE_PROMPT_DRAFT,
      repositoryId: repositories[0]?.id ?? '',
      repositoryName: repositories[0]?.fullName || repositories[0]?.name || '',
    });
    setCopied(false);
  };

  const generatedPrompt = useMemo(() => generateRulePrompt(draft), [draft]);
  const isValid = useMemo(() => isRuleDraftValid(draft), [draft]);

  const handleCopyPrompt = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(generatedPrompt);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      // Fallback
    }
  };

  if (!presence.isMounted) return null;

  return (
    <OverlayPortal>
      <ModalBackdrop onClose={onClose}>
        <CenteredDialog
          onClose={onClose}
          titleId={dialogTitleId}
          descriptionId={dialogDescId}
          size="lg"
          className="decision-builder-dialog"
          initialFocusRef={titleInputRef}
        >
          <div className="prompt-builder-surface">
            {/* Modal Header */}
            <header className="prompt-builder-header" {...getMotionItemProps(0)}>
              <div className="prompt-builder-header__copy">
                <div className="prompt-builder-badge-row">
                  <span className="prompt-builder-tag">GOVERNANCE POLICY</span>
                  <span className="prompt-builder-notice-pill">
                    Browser does not mutate repository
                  </span>
                </div>
                <div className="prompt-builder-title-row">
                  <div className="prompt-builder-icon-badge" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <polyline points="9 12 11 14 15 10" />
                    </svg>
                  </div>
                  <div>
                    <h2 id={dialogTitleId} className="prompt-builder-title">
                      Draft Governance Rule Prompt
                    </h2>
                    <p id={dialogDescId} className="prompt-builder-description">
                      Generate a deterministic boundary contract or invariant specification for your
                      repository. TRACE dashboard is a verification surface â€” rules appear here
                      once synced from local <code>.trace/rules/</code> records.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="prompt-builder-close-btn"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            {/* Modal Body: 2-Column Split */}
            <div className="prompt-builder-body">
              {/* Form Column */}
              <div className="prompt-builder-form">
                {/* Section 1: Target Repository & Identifier */}
                <div className="prompt-section" {...getMotionItemProps(1)}>
                  <div className="prompt-section-header">
                    <span className="prompt-section-num">01</span>
                    <span className="prompt-section-title">
                      Target Context &amp; Identification
                    </span>
                  </div>

                  <div className="prompt-form-group">
                    <label htmlFor={repoSelectId} className="prompt-form-label">
                      Target Repository <span className="req-marker">*</span>
                    </label>
                    <TraceSelect
                      id={repoSelectId}
                      value={draft.repositoryId}
                      onChange={handleRepoChange}
                      ariaLabel="Target Repository"
                      options={repositories.map((r) => ({
                        value: r.id,
                        label: r.fullName || r.name,
                      }))}
                    />
                    <span className="prompt-form-hint">
                      Prompt instructs the agent to inspect this repository&apos;s local{' '}
                      <code>.trace/rules/</code> conventions.
                    </span>
                  </div>

                  <div className="prompt-form-grid-2">
                    <div className="prompt-form-group">
                      <label htmlFor={titleInputId} className="prompt-form-label">
                        Rule Title <span className="req-marker">*</span>
                      </label>
                      <input
                        ref={titleInputRef}
                        id={titleInputId}
                        type="text"
                        className="prompt-form-input"
                        placeholder="e.g. Database Migration Backward Compatibility"
                        value={draft.title}
                        onChange={(e) => handleFieldChange('title', e.target.value)}
                      />
                    </div>

                    <div className="prompt-form-group">
                      <label htmlFor={ruleIdInputId} className="prompt-form-label">
                        Rule ID <span className="rec-marker">(Optional slug)</span>
                      </label>
                      <input
                        id={ruleIdInputId}
                        type="text"
                        className="prompt-form-input font-mono"
                        placeholder="e.g. rule.db.backward-compatibility"
                        value={draft.ruleId}
                        onChange={(e) => handleFieldChange('ruleId', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Purpose & Boundary Invariant */}
                <div className="prompt-section prompt-section--featured" {...getMotionItemProps(2)}>
                  <div className="prompt-section-header">
                    <span className="prompt-section-num">02</span>
                    <span className="prompt-section-title">Purpose &amp; Boundary Invariant</span>
                  </div>

                  <div className="prompt-form-group">
                    <label htmlFor={purposeId} className="prompt-form-label">
                      Boundary Invariant Specification <span className="req-marker">*</span>
                    </label>
                    <textarea
                      id={purposeId}
                      className="prompt-form-textarea"
                      rows={3}
                      placeholder="State the explicit architectural constraint, security boundary, or invariant being enforced..."
                      value={draft.purpose}
                      onChange={(e) => handleFieldChange('purpose', e.target.value)}
                    />
                  </div>
                </div>

                {/* Section 3: Enforcement & Policy Matrix */}
                <div className="prompt-section" {...getMotionItemProps(3)}>
                  <div className="prompt-section-header">
                    <span className="prompt-section-num">03</span>
                    <span className="prompt-section-title">
                      Policy &amp; Enforcement Configuration
                    </span>
                  </div>

                  <div className="prompt-form-grid-2">
                    <div className="prompt-form-group">
                      <label htmlFor={severitySelectId} className="prompt-form-label">
                        Severity Level <span className="req-marker">*</span>
                      </label>
                      <TraceSelect
                        id={severitySelectId}
                        value={draft.severity}
                        onChange={(val) => handleFieldChange('severity', val as RuleSeverity)}
                        ariaLabel="Severity Level"
                        options={SEVERITY_OPTIONS}
                      />
                    </div>

                    <div className="prompt-form-group">
                      <label htmlFor={modeSelectId} className="prompt-form-label">
                        Enforcement Mode <span className="req-marker">*</span>
                      </label>
                      <TraceSelect
                        id={modeSelectId}
                        value={draft.mode}
                        onChange={(val) => handleFieldChange('mode', val as RuleMode)}
                        ariaLabel="Enforcement Mode"
                        options={MODE_OPTIONS}
                      />
                    </div>
                  </div>

                  <div className="prompt-form-grid-2">
                    <div className="prompt-form-group">
                      <label htmlFor={scopeSelectId} className="prompt-form-label">
                        Scope <span className="req-marker">*</span>
                      </label>
                      <TraceSelect
                        id={scopeSelectId}
                        value={draft.scope}
                        onChange={(val) => handleFieldChange('scope', val as RuleScope)}
                        ariaLabel="Rule Scope"
                        options={SCOPE_OPTIONS}
                      />
                    </div>

                    <div className="prompt-form-group">
                      <label htmlFor={overrideSelectId} className="prompt-form-label">
                        Override Policy
                      </label>
                      <TraceSelect
                        id={overrideSelectId}
                        value={draft.overrideAllowed ? 'allowed' : 'prohibited'}
                        onChange={(val) => handleFieldChange('overrideAllowed', val === 'allowed')}
                        ariaLabel="Override Policy"
                        options={[
                          { value: 'allowed', label: 'Allowed with justification' },
                          { value: 'prohibited', label: 'Strictly prohibited' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="prompt-form-group">
                    <label htmlFor={targetPathsId} className="prompt-form-label">
                      Target Path Loci <span className="rec-marker">(Glob pattern matchers)</span>
                    </label>
                    <input
                      id={targetPathsId}
                      type="text"
                      className="prompt-form-input font-mono"
                      placeholder="e.g. migrations/**, packages/db/src/**, src/api/contracts/**"
                      value={draft.targetPaths}
                      onChange={(e) => handleFieldChange('targetPaths', e.target.value)}
                    />
                  </div>

                  <div className="prompt-form-group">
                    <label htmlFor={remediationId} className="prompt-form-label">
                      Remediation Guidance <span className="rec-marker">(Recommended)</span>
                    </label>
                    <textarea
                      id={remediationId}
                      className="prompt-form-textarea prompt-form-textarea--sm"
                      rows={2}
                      placeholder="Actionable steps or code patterns to resolve violations when this rule triggers..."
                      value={draft.remediation}
                      onChange={(e) => handleFieldChange('remediation', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Generated Prompt Preview Column */}
              <div className="prompt-builder-preview-col" {...getMotionItemProps(4)}>
                <div className="prompt-preview-card">
                  <div className="prompt-preview-card__header">
                    <div className="prompt-preview-status">
                      <span className="status-indicator-dot" />
                      <span className="prompt-preview-label">Deterministic Output</span>
                    </div>

                    <div className="prompt-preview-actions">
                      <button
                        type="button"
                        className="prompt-preview-toggle-btn"
                        onClick={() => setShowPreview(!showPreview)}
                      >
                        {showPreview ? 'Compact' : 'Expand'}
                      </button>

                      <button
                        type="button"
                        className="prompt-preview-quick-copy"
                        onClick={handleCopyPrompt}
                        disabled={!isValid}
                        title={!isValid ? 'Complete required fields' : 'Copy prompt to clipboard'}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div
                    className={`prompt-code-container ${showPreview ? 'prompt-code-container--expanded' : ''}`}
                  >
                    <pre className="prompt-code-block">{generatedPrompt}</pre>
                  </div>
                </div>

                {/* Truthful synchronization guidance */}
                <div className="prompt-guidance-box">
                  <div className="guidance-icon" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </div>
                  <div className="guidance-copy">
                    <strong>Local Synchronization Workflow</strong>
                    <p>
                      Execute this prompt in your local terminal or agentic coding tool. When
                      finished, run <code>trace rules check &amp;&amp; trace sync</code>. This Rules
                      surface will reflect the policy immediately upon sync.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <footer className="prompt-builder-footer" {...getMotionItemProps(5)}>
              <div className="prompt-builder-footer__left">
                <button
                  type="button"
                  className="trace-button trace-button--secondary"
                  onClick={handleClearDraft}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ marginRight: '6px' }}
                  >
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear draft
                </button>
              </div>

              <div className="prompt-builder-footer__actions">
                <button
                  type="button"
                  className="trace-button trace-button--secondary"
                  onClick={onClose}
                >
                  Close
                </button>

                <button
                  type="button"
                  className="trace-button trace-button--primary"
                  onClick={handleCopyPrompt}
                  disabled={!isValid}
                  title={
                    !isValid
                      ? 'Fill required fields (Repository, Title, Purpose)'
                      : 'Copy deterministic rule prompt to clipboard'
                  }
                >
                  {copied ? (
                    <>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        style={{ marginRight: '6px' }}
                      >
                        <polyline points="3 8 7 12 13 4" />
                      </svg>
                      Copied agent prompt!
                    </>
                  ) : (
                    <>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        style={{ marginRight: '6px' }}
                      >
                        <rect x="5" y="5" width="9" height="9" rx="1.5" />
                        <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
                      </svg>
                      Copy agent prompt
                    </>
                  )}
                </button>
              </div>
            </footer>
          </div>
        </CenteredDialog>
      </ModalBackdrop>
    </OverlayPortal>
  );
}
