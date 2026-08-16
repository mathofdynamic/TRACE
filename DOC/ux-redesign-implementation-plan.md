# TRACE UX Redesign Implementation Plan

**Status:** planning only. This document does not authorize implementation, backend changes, deployment, or Git publication.

## 1. Delivery strategy

Implement the redesign as an incremental shell-and-surface migration. Preserve the existing local-first analysis, `.trace` artifact contract, sync protocol, privacy boundary, database projections, and route URLs. Introduce the new state vocabulary and context shell first, then migrate high-impact pages, then secondary surfaces and motion.

Do not begin with a visual reskin. The main risks are state ambiguity, wrong repository context, and false freshness—not color or ornament.

### Dependencies

1. Existing API/projection fields must expose enough data for the four-axis state model.
2. Trusted GitHub default-branch state must remain the only freshness authority.
3. Existing routes and fixtures must be inventoried before component replacement.
4. Existing privacy/security tests remain the release gate.

## 2. Phase 0 — UX foundation and state contract

### Scope

- Adopt terminology and composite states from `TRACE-STATE-MODEL.md`.
- Add shared state selectors/formatters at the view-model boundary, without changing backend meaning.
- Establish surface, typography, status-color, focus, and target-size tokens from the existing TRACE design direction.
- Create `AppShell`, `RepositoryContextBar`, `StatusDot`, `FreshnessState`, `ProvenanceBadge`, `EmptyState`, `ErrorState`, and `TechnicalDetails` contracts.
- Add a route-state fixture matrix for not connected, connected/not analyzed, local-only, syncing, current, behind, unknown, attention, unavailable, and revoked.

### Acceptance criteria

- No route displays “Current” when remote state is missing.
- The same repository/state copy appears in shell, overview, repository, reports, and settings.
- Technical terms are behind progressive disclosure or have the specified product copy.
- Existing source-code exclusion and deterministic classification remain unchanged.
- Keyboard focus and reduced-motion foundations exist before surface migration.

### Risk and impact

**Risk:** contradictory legacy conditionals. **Mitigation:** snapshot each old route state before changing shared selectors. **Impact:** high comprehension improvement with low data risk.

## 3. Phase 1 — Shell, context, repository discovery, and Overview

### Scope

- Replace the first repository landing behavior with persistent selected-project context.
- Implement `RepositorySwitcher` with search, grouping, status rows, recent repositories, and mobile sheet.
- Rebuild `/app` around `ProjectStateHeader`, `TraceRail`, `AttentionGroup`, `MetricStrip`, and project timeline.
- Replace the checkbox-heavy daily repository view; retain multi-select only in setup.
- Add truthful setup states and next action copy.

### Dependencies

- Phase 0 state selectors.
- Existing repository list and selection APIs.
- Route navigation preserving repository context.

### Acceptance criteria

- A first-time user can identify the selected repository, state, and next action within 10 seconds.
- TRACE is not silently replaced by Radar when TRACE contains the meaningful record.
- Search/filtering finds TRACE without source-code knowledge.
- Connected, analyzed, synchronized, stale, unknown, and available rows are distinguishable.
- Desktop, 768px, and 390px layouts have no horizontal overflow and the mobile sheet traps/restores focus.

### Risk and impact

**Risk:** changing selection persistence can alter navigation expectations. **Mitigation:** preserve route IDs and add explicit fallback when a view is unavailable. **Impact:** highest first-use and discoverability gain.

## 4. Phase 2 — Repository command center, Findings, and Reports

### Scope

- Rebuild repository overview around lifecycle, next action, metric strip, findings, reports, and project memory.
- Implement finding rows/detail drawer with evidence, classification, provenance, and no-evidence honesty.
- Implement structured report list/detail with daily/weekly distinctions, repository context, summary metrics, risks, decisions, timeline, and secondary raw Markdown.
- Add operational-vs-engineering attention grouping.

### Dependencies

- Phase 0 state contract.
- Phase 1 persistent repository context.
- Existing finding/report projection payloads and safe Markdown renderer.

### Acceptance criteria

- Repository page answers GitHub state, local analysis, dashboard record, freshness, and next action without implementation vocabulary.
- A finding detail answers why flagged, what changed, why it matters, evidence, provenance, and next review.
- Zero evidence is explicitly stated; no source code appears unexpectedly.
- Reports communicate important changes without opening raw Markdown.
- A checksum failure remains an operational state and cannot masquerade as an engineering finding.

### Risk and impact

**Risk:** creating actions that backend does not persist. **Mitigation:** make unsupported dispositions read-only; do not add fake resolve/dismiss controls. **Impact:** high trust and review usefulness.

## 5. Phase 3 — Secondary intelligence, governance, settings, and state coverage

### Scope

- Refine Changes, Conflicts, Rules, Decisions, and Activity with prerequisite-aware empty states.
- Split Activity into project memory and security/access history.
- Rework Settings into Workspace, GitHub, Local TRACE, Privacy & synchronization, Notifications, and Advanced.
- Rename Local Connections to Authorized computers and explain scope/revocation/reconnect.
- Implement complete loading, error, unavailable, permission, revoked, divergence, and 1102 states.

### Dependencies

- Shared `EmptyState`, `ErrorState`, `OperationProgress`, and `TechnicalDetails`.
- Existing audit/projection data and capability flags.

### Acceptance criteria

- Every empty route explains what creates its data and the next action.
- `Not enabled in this environment` is not confused with an empty result.
- Activity does not mix project memory with security/audit noise.
- Revocation explains local safety and reconnection without exposing secrets.
- Cloudflare 1102 and API failures are user-readable and remain tracked as reliability incidents.

### Risk and impact

**Risk:** secondary routes may expose unsupported concepts. **Mitigation:** retain explicit unavailable/read-only states until a real data contract exists. **Impact:** reduced dead ends and technical confusion.

## 6. Phase 4 — Motion, identity, and tactile refinement

### Scope

- Implement critical feedback and orientation transitions from `TRACE-MOTION-SPEC.md`.
- Introduce Trace Rail progression in project header, repository rows, and setup completion.
- Add button/row/tab/disclosure/copy/retry/revocation micro-interactions.
- Reduce card fragmentation through metric strips, dividers, grouped rows, timelines, and drawers.
- Apply surface-depth, typography, semantic color, focus, and reduced-motion refinements.

### Dependencies

- Stable Phase 1–3 DOM and state transitions.
- Real async operation stages; no invented progress.

### Acceptance criteria

- Sync shows real lifecycle stages and preserves the last verified record on failure.
- Repository switching provides feedback without shell reload or context loss.
- Drawers preserve and restore focus.
- Trace Rail is restrained, non-looping, and meaningful.
- Reduced-motion mode retains all status meaning immediately.

### Risk and impact

**Risk:** motion hides state or adds performance cost. **Mitigation:** animate only opacity/transform/compact state changes; test with reduced motion and slow devices. **Impact:** perceived quality and orientation, not product correctness.

## 7. Phase 5 — Responsive, accessibility, and release QA

### Scope

- Validate 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 on every major route.
- Keyboard-only and screen-reader-oriented pass for shell, switcher, findings, reports, drawers, filters, and revocation.
- Test state matrix and route persistence.
- Test privacy boundary, source/code-snippet exclusion, Markdown sanitization, path/checksum validation, auth/revocation, and error recovery.
- Review empty/loading/error/success states with real and synthetic fixtures clearly labeled.

### Acceptance criteria

- No horizontal overflow at 390px.
- Focus is visible and restored after drawer/modal close.
- Every status is understandable without color or motion.
- All async actions have starting, processing, complete, and failed outcomes.
- `pnpm check`, E2E, bridge/security tests, schema/migration tests, and build remain green.
- No runtime `.trace` output, credentials, local DB data, or authenticated screenshots enter tracked source.

### Risk and impact

**Risk:** visual QA catches layout regressions late. **Mitigation:** snapshot each phase at all required widths and make responsive review part of each PR. **Impact:** release confidence.

## 8. Migration and compatibility strategy

1. Keep current URLs and route parameters; migrate composition behind the same route boundaries.
2. Keep API/database contracts unchanged unless a real missing field blocks an already-supported state. Any contract change requires a separate scoped implementation phase.
3. Render old and new surfaces behind a development-only route/state comparison during migration, never as user-visible duplicate UI.
4. Preserve raw approved Markdown as a fallback and link; do not delete existing artifacts.
5. Keep fixtures visibly labeled and never let them stand in for live synchronized intelligence.
6. Remove compatibility shims only after route/state regression coverage proves the new surface is complete.

## 9. Test matrix

### State matrix

Test each major page with:

```text
not connected
connected / not analyzed
analysis local only
syncing
sync attention
synced / current
synced / behind
synced / freshness unknown
GitHub unavailable
revoked computer
```

### Persona matrix

- Developer: finding evidence and next review action.
- Tech lead: attention ranking, changes, freshness, reports.
- Engineering manager: project state and meaning without CLI vocabulary.
- AI-heavy team: provenance, current commit, privacy, review confidence.

### Interaction matrix

- repository switch/search/filter;
- analyze/sync/retry;
- finding expand/close/focus restoration;
- report open/raw Markdown disclosure;
- freshness refresh;
- revoke/reconnect;
- error recovery and no-change refresh;
- keyboard, touch, reduced motion.

## 10. PR boundaries for the future implementation

- Keep each phase in a focused PR or an intentionally bounded series; do not mix product redesign with backend architecture changes.
- Do not add UI controls for unsupported server behavior.
- Do not deploy production as part of redesign implementation.
- Preserve the staging acceptance path: login → connect → analyze → dry run → sync → dashboard.
- Review screenshots and audit mapping in each implementation PR before moving to the next phase.
