# TRACE Redesign Component Inventory

This inventory defines product-level components and their states. It is not a request to create a generic component library. Each component exists because it carries a distinct piece of the TRACE mental model or a repeated interaction contract.

## 1. Composition rules

- Components consume the four-axis project state defined in [TRACE-STATE-MODEL.md](TRACE-STATE-MODEL.md).
- Components must not infer “current” from a missing remote SHA.
- Technical details are progressive disclosure, not a second visual hierarchy.
- A component with no real backend capability renders an honest unavailable/read-only state, never a fake action.
- Desktop and mobile variants are intentional compositions; mobile is not only CSS stacking.

## 2. Shell and context

### `AppShell`

**Purpose:** persistent authenticated frame.

**Contains:** `Sidebar`, `RepositoryContextBar`, page content, notification/live-region host, optional command trigger.

**States:** authenticated, no repository selected, GitHub unavailable, revoked computer.

**Responsive:** persistent sidebar at wide desktop; compact/drawer navigation at tablet/mobile. The shell remains mounted during project switching.

**Accessibility:** landmarks, one main region, skip link, route title announcement, drawer focus trap and restoration.

### `Sidebar`

**Purpose:** grouped global navigation.

**Groups:** Project, Intelligence, Governance, System.

**States:** active route, attention badge, capability unavailable, collapsed/drawer.

**Behavior:** “Not enabled in this environment” is explanatory text or a disabled item with help, not a bare `Later` pill. Keep active repository context visible above navigation.

**Accessibility:** semantic navigation, active route announced, keyboard roving/standard link focus, 44px rows on touch.

### `RepositoryContextBar`

**Purpose:** persistent selected workspace/repository and composite state.

**Anatomy:** owner/name, repository switcher trigger, state label, compact finding/report count, optional sync action.

**States:** no selection, current, behind, unknown, sync attention, revoked.

**Responsive:** full context on desktop; owner/name + state on mobile, details in the switcher sheet.

**Accessibility:** button label includes selected repository and state; state explanation is available to assistive technology.

### `RepositorySwitcher`

**Purpose:** discover and switch projects without the current checkbox dump.

**Anatomy:** search, grouped rows, status summary, recent repositories, optional filters.

**Row contract:** repository identity, visibility/branch, one status sentence, one action.

**States:** loading, connected groups, available group, no matches, GitHub unavailable, permission missing.

**Interaction:** open with keyboard shortcut or click; arrow-key navigation; Enter selects; Escape closes; destination state is preserved.

**Responsive:** full-screen sheet on 390px; sticky search and close button.

## 3. Project state and attention

### `ProjectStateHeader`

**Purpose:** answer what is happening and what to do next.

**Anatomy:** project identity, composite state, one-sentence explanation, primary/secondary action, `TraceRail`, `OriginAndVerification` disclosure.

**States:** every canonical state in `TRACE-STATE-MODEL.md`.

**Rules:** one primary action; “No action needed” for stable current/no-attention; operational failure is not rendered as a finding.

### `TraceRail`

**Purpose:** explain Connect → Analyze → Sync → Current as four linked nodes.

**States:** complete, active, failed, unknown, revoked.

**Inputs:** access, analysis, dashboard, freshness axes; real operation stage when active.

**Responsive:** horizontal desktop, compact two-row/tablet, vertical/segmented mobile.

**Accessibility:** concise text alternative describing each node and status; no color-only meaning.

### `StatusDot`

**Purpose:** compact non-color-only state marker.

**Variants:** current, attention, failed, unknown, available, revoked, active.

**Contract:** shape/icon and visible label must accompany color; never use a dot without adjacent text in critical state.

### `FreshnessState`

**Purpose:** explain trusted GitHub comparison.

**Labels:** Current with GitHub, Behind the current GitHub branch, Freshness unavailable.

**Expanded detail:** analyzed SHA, trusted remote/default-branch SHA, comparison time, source of GitHub state.

**States:** current, behind, unknown, refresh loading, unavailable.

### `ProvenanceBadge`

**Purpose:** compact origin marker in project/report/finding surfaces.

**Default copy:** `Analyzed on this computer` or `Local analysis` where space is constrained.

**Expanded detail:** generated time, branch, commit, sync time, source/code-snippet exclusion.

### `AttentionGroup`

**Purpose:** prioritize operational and engineering items.

**Groups:** Operations, Engineering.

**Anatomy:** group label, count, ranked rows, “show lower-priority items.”

**States:** attention, all clear, loading, unavailable.

**Rules:** rank by impact and actionability; do not make five items equal-weight cards.

### `MetricStrip`

**Purpose:** concise project facts.

**Metrics:** findings, reports, changed paths/commits when real, last sync, selected branch/commit.

**States:** populated, partial, no record.

**Responsive:** horizontal strip desktop; two-column labeled rows mobile. Not a collection of individually floating cards.

## 4. Intelligence components

### `FindingRow`

**Purpose:** scan and prioritize review items.

**Anatomy:** severity text/icon, title, why-it-matters summary, affected area, evidence count, classification, state, action.

**States:** open/read-only, reviewed if persisted, loading, no evidence, operational failure row.

**Rules:** severity color is supplementary; zero evidence states “No supporting evidence was synchronized.” Never fabricate evidence.

### `FindingDetailDrawer`

**Purpose:** investigate without losing repository context.

**Sections:** Why flagged, What changed, Why it matters, Evidence, Recommended review, Origin and verification, Technical details.

**States:** opening, loaded, no evidence, unavailable, error.

**Responsive:** side drawer desktop; full-height sheet/mobile route. Focus trap, close/escape, focus restoration.

### `EvidenceList`

**Purpose:** show supporting paths/references and classification.

**Anatomy:** count, path/reference, deterministic/semantic label, expandable detail.

**States:** populated, zero evidence, partially available, loading.

**Rules:** no raw source snippets unless product policy explicitly allows them; default remains source-free.

### `ReportRow`

**Purpose:** scan report history.

**Anatomy:** daily/weekly type, date/window, repository, local origin, summary metric, freshness, open action.

**States:** available, loading, no reports, unavailable.

### `ReportSummary`

**Purpose:** turn an approved report into structured intelligence.

**Sections:** summary metrics, key changes, areas affected, needs review, risks, decisions, timeline, evidence.

**States:** populated, partial, no generated report, stale, raw-only fallback.

**Rules:** raw Markdown is secondary under `View approved Markdown`; context is always visible.

### `Timeline`

**Purpose:** project memory and meaningful activity.

**Variants:** project timeline, report timeline, change timeline.

**Event contract:** timestamp, event kind, repository/project, actor class (local computer/GitHub/system), outcome, link.

**Rules:** no individual productivity ranking; no request-level noise.

### `ChangeStream`

**Purpose:** display signed pull-request/change snapshots when the capability exists.

**States:** available, empty prerequisite, unavailable in environment, loading.

**Anatomy:** time/area grouping, change summary, linked findings/risks/decisions.

## 5. Empty, error, and progress components

### `EmptyState`

**Purpose:** teach a truthful absence.

**Required slots:** what happened, why, what creates the data, primary CTA, secondary help.

**Variants:** not configured, no analysis, local-only, no reports, no conflicts, no findings, no repository, permission missing.

**Prohibition:** no generic “Nothing here yet” without a prerequisite and next action.

### `ErrorState`

**Purpose:** explain failure and preserve trust.

**Required slots:** failed operation, data-safety statement, retry/reconnect action, technical details disclosure, correlation/reference ID when safe.

**Variants:** GitHub unavailable, Worker/API/1102, auth revoked, checksum rejection, divergence, permission, analysis failure.

### `OperationProgress`

**Purpose:** show real asynchronous stages.

**Stages:** Starting, Processing/Negotiating, Uploading approved record, Verifying, Promoting, Complete, Failed.

**Rules:** no fake percentage; last verified data remains visible; state changes announced.

### `FreshnessNotice`

**Purpose:** contextual current/behind/unknown explanation.

**States:** current confirmation, behind action, unknown reason, refresh in progress.

## 6. Setup, system, and governance

### `RepositorySetup`

**Purpose:** onboarding GitHub and selecting repositories.

**Stages:** workspace, GitHub connection, searchable selection, confirmation, complete/next analyze.

**States:** GitHub connected, list loading, permission failure, selection empty, connected repositories.

**Rule:** do not reuse raw checkbox list as everyday repository management.

### `ConnectionRow`

**Purpose:** authorized computer management.

**Copy:** “This computer can send approved TRACE records.”

**Fields:** friendly name, environment, workspace, repository scope, last used, expiration, active/revoked.

**Actions:** Rename, Revoke, Reconnect. Revoke confirmation explains local/dashboard safety.

### `ConnectionDetail`

**Purpose:** expanded security explanation.

**Default hidden:** token/hash identifiers, protocol details, server IDs.

**Visible:** privacy boundary, scope, last used, expiration, audit link if available.

### `RuleStatusRow`

**Purpose:** show team-owned governance state.

**Fields:** rule name, scope, last evaluation, pass/warning/fail, source, applicable repository.

**States:** configured, no rules, not enabled, evaluation pending, failed.

### `ActivityGroup`

**Purpose:** separate project memory from security/access history.

**Filters:** group, repository, outcome, date.

**States:** populated, empty, loading, unavailable.

### `TechnicalDetails`

**Purpose:** preserve exact engineering truth without dominating the default view.

**Content:** SHAs, operation IDs, artifact/snapshot identifiers, evidence paths, environment, policy fields.

**Behavior:** disclosure remembers open state only within the page; never exposes secrets, tokens, token hashes, raw source, or session data.

## 7. Navigation and utility components

### `CommandMenu`

**Purpose:** search repositories, findings, reports, decisions, rules, and safe actions.

**Result anatomy:** type, title, repository, state, shortcut/action.

**States:** empty query, results, no match, unavailable, loading.

### `Breadcrumbs`

**Purpose:** preserve repository and detail context.

**Rule:** mobile may collapse intermediate segments but must retain repository and current item.

### `Toast/LiveRegion`

**Purpose:** short non-blocking confirmation/error.

**Rule:** never use a toast as the only explanation for sync failure, revocation, or freshness change; keep inline state too.

### `ConfirmDialog`

**Purpose:** destructive/recovery confirmation.

**Uses:** revoke, disconnect, retry after divergence where needed.

**Accessibility:** labelled title, consequence, cancel/default focus, escape, focus restoration.

## 8. Component state matrix

Every stateful component must cover:

```text
loading · populated · empty · unavailable · error · success/current
focused · hovered · pressed · disabled · reduced-motion
desktop · tablet · mobile
```

The state model decides semantic copy; the motion spec decides transitions; the component inventory decides composition. No component may create its own “current,” “local,” or “synchronized” terminology.

## 9. Implementation acceptance

1. `RepositorySwitcher`, `RepositoryContextBar`, `ProjectStateHeader`, and `TraceRail` render the same selected repository and composite state on every route.
2. Every async component exposes real loading, success, and failure states.
3. Drawers/sheets have one accessible DOM instance, focus trap, close/escape, and restoration.
4. Empty/error components always provide why + next action.
5. Findings and reports remain useful at 390px without horizontal overflow.
6. Technical details remain available but never expose credentials, token hashes, raw source, or snippets by default.
