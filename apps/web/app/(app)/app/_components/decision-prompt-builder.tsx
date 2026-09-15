'use client';

import React, { useState, useId, useMemo, useRef } from 'react';
import { OverlayPortal, ModalBackdrop, CenteredDialog } from './overlay-portal';
import { TraceSelect } from './trace-select';
import type { DashboardRepository } from '../../../../lib/dashboard';
import {
  type DecisionPromptDraft,
  INITIAL_DECISION_PROMPT_DRAFT,
  generateDecisionPrompt,
  isDecisionDraftValid,
} from '../../../../lib/decision-prompt';
import { usePresence, getMotionItemProps } from '../../../../lib/entrance-motion';

export interface DecisionPromptBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  repositories: DashboardRepository[];
  defaultRepoId?: string;
}

export function DecisionPromptBuilder({
  isOpen,
  onClose,
  repositories,
  defaultRepoId,
}: DecisionPromptBuilderProps) {
  const presence = usePresence(isOpen);
  const initialRepoId = defaultRepoId || (repositories[0]?.id ?? '');
  const initialRepoName =
    repositories.find((r) => r.id === initialRepoId)?.fullName ||
    repositories.find((r) => r.id === initialRepoId)?.name ||
    '';

  const [draft, setDraft] = useState<DecisionPromptDraft>(() => ({
    ...INITIAL_DECISION_PROMPT_DRAFT,
    repositoryId: initialRepoId,
    repositoryName: initialRepoName,
  }));

  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const titleInputId = useId();
  const repoSelectId = useId();
  const contextId = useId();
  const decisionId = useId();
  const rationaleId = useId();
  const consequencesId = useId();
  const invariantsId = useId();
  const relatedChangeId = useId();
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

  const handleFieldChange = (field: keyof DecisionPromptDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleClearDraft = () => {
    setDraft({
      ...INITIAL_DECISION_PROMPT_DRAFT,
      repositoryId: repositories[0]?.id ?? '',
      repositoryName: repositories[0]?.fullName || repositories[0]?.name || '',
    });
    setCopied(false);
  };

  const generatedPrompt = useMemo(() => generateDecisionPrompt(draft), [draft]);
  const isValid = useMemo(() => isDecisionDraftValid(draft), [draft]);

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
                  <span className="prompt-builder-tag">ADR SPECIFICATION</span>
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
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div>
                    <h2 id={dialogTitleId} className="prompt-builder-title">
                      Draft Architectural Decision Prompt
                    </h2>
                    <p id={dialogDescId} className="prompt-builder-description">
                      Generate an evidence-backed ADR prompt for your coding agent or terminal.
                      TRACE dashboard is a verification surface â€” decisions appear here once
                      synced from local records.
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
                {/* Section 1: Target Repository & Decision Title */}
                <div className="prompt-section" {...getMotionItemProps(1)}>
                  <div className="prompt-section-header">
                    <span className="prompt-section-num">01</span>
                    <span className="prompt-section-title">Context &amp; Identification</span>
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
                      <code>.trace/</code> conventions.
                    </span>
                  </div>

                  <div className="prompt-form-group">
                    <label htmlFor={titleInputId} className="prompt-form-label">
                      Decision Title <span className="req-marker">*</span>
                    </label>
                    <input
                      ref={titleInputRef}
                      id={titleInputId}
                      type="text"
                      className="prompt-form-input"
                      placeholder="e.g. Migrate Session Tokens to Ephemeral Ed25519 Signatures"
                      value={draft.title}
                      onChange={(e) => handleFieldChange('title', e.target.value)}
                    />
                  </div>
                </div>

                {/* Section 2: Core Invariants & Decision Choice */}
                <div className="prompt-section prompt-section--featured" {...getMotionItemProps(2)}>
                  <div className="prompt-section-header">
                    <span className="prompt-section-num">02</span>
                    <span className="prompt-section-title">
                      Architectural Boundary &amp; Choice
                    </span>
                  </div>

                  <div className="prompt-form-group">
                    <label htmlFor={contextId} className="prompt-form-label">
                      Context &amp; Problem Motivation <span className="req-marker">*</span>
                    </label>
                    <textarea
                      id={contextId}
                      className="prompt-form-textarea"
                      rows={3}
                      placeholder="Describe the architectural challenge, background constraints, or triggering issue..."
                      value={draft.context}
                      onChange={(e) => handleFieldChange('context', e.target.value)}
                    />
                  </div>

                  <div className="prompt-form-group">
                    <label htmlFor={decisionId} className="prompt-form-label">
                      Chosen Decision &amp; Mandatory Rules <span className="req-marker">*</span>
                    </label>
                    <textarea
                      id={decisionId}
                      className="prompt-form-textarea"
                      rows={3}
                      placeholder="State the exact architectural choice, boundary invariants, and mandatory rules..."
                      value={draft.decision}
                      onChange={(e) => handleFieldChange('decision', e.target.value)}
                    />
                  </div>
                </div>

                {/* Section 3: Rationale, Tradeoffs & Metadata */}
                <div className="prompt-section" {...getMotionItemProps(3)}>
                  <div className="prompt-section-header">
                    <span className="prompt-section-num">03</span>
                    <span className="prompt-section-title">
                      Rationale &amp; Supporting Metadata{' '}
                      <span className="prompt-section-opt">(Recommended)</span>
                    </span>
                  </div>

                  <div className="prompt-form-grid-2">
                    <div className="prompt-form-group">
                      <label htmlFor={rationaleId} className="prompt-form-label">
                        Rationale <span className="rec-marker">(Optional)</span>
                      </label>
                      <textarea
                        id={rationaleId}
                        className="prompt-form-textarea prompt-form-textarea--sm"
                        rows={2}
                        placeholder="Why this option was selected over viable alternatives..."
                        value={draft.rationale}
                        onChange={(e) => handleFieldChange('rationale', e.target.value)}
                      />
                    </div>

                    <div className="prompt-form-group">
                      <label htmlFor={consequencesId} className="prompt-form-label">
                        Consequences &amp; Tradeoffs <span className="rec-marker">(Optional)</span>
                      </label>
                      <textarea
                        id={consequencesId}
                        className="prompt-form-textarea prompt-form-textarea--sm"
                        rows={2}
                        placeholder="Positive consequences, operational costs, or intentional limitations..."
                        value={draft.consequences}
                        onChange={(e) => handleFieldChange('consequences', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="prompt-form-grid-2">
                    <div className="prompt-form-group">
                      <label htmlFor={invariantsId} className="prompt-form-label">
                        Constraints &amp; Invariants <span className="rec-marker">(Optional)</span>
                      </label>
                      <textarea
                        id={invariantsId}
                        className="prompt-form-textarea prompt-form-textarea--sm"
                        rows={2}
                        placeholder="Forbidden patterns, strict layer boundaries, or runtime guarantees..."
                        value={draft.invariants}
                        onChange={(e) => handleFieldChange('invariants', e.target.value)}
                      />
                    </div>

                    <div className="prompt-form-group">
                      <label htmlFor={relatedChangeId} className="prompt-form-label">
                        Related PR / Change Reference <span className="rec-marker">(Optional)</span>
                      </label>
                      <input
                        id={relatedChangeId}
                        type="text"
                        className="prompt-form-input"
                        placeholder="e.g. PR #104 or branch feat/ed25519-auth"
                        value={draft.relatedChange}
                        onChange={(e) => handleFieldChange('relatedChange', e.target.value)}
                      />
                    </div>
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
                      finished, run <code>trace analyze &amp;&amp; trace sync</code>. This Decisions
                      surface will reflect the record immediately upon sync.
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
                      ? 'Fill required fields (Repository, Title, Context, Decision)'
                      : 'Copy deterministic prompt to clipboard'
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
