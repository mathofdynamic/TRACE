# TRACE UX/UI Redesign Specification

**Status:** design draft; implementation is intentionally out of scope.

**Evidence base:** the authenticated live-product audit in `.trace-cache/ui-ux-audit/2026-08-14`, including 23 findings, 22 source route patterns, 14 live routes, 8 workflows, and 67 screenshots. The audit scored overall usability 5.5/10. The strongest existing qualities are honest state copy, local-first privacy, provenance, deterministic evidence labels, a serious dark visual tone, and a workable responsive foundation.

## 0. Scope and design north star

This specification changes the product's explanation and interaction model, not its local-first architecture. It does not add cloud source analysis, invent findings, fabricate progress, or turn unknown GitHub state into current state.

TRACE should feel like a premium engineering control system: quiet, exact, operational, and trustworthy. It should stop feeling like a bordered-card inventory or an internal admin panel.

The first-use test is:

> Within ten seconds, a user can identify the selected project, its state, what matters, and the next safe action.

The primary product story is:

```text
CONNECT  →  ANALYZE  →  SYNC  →  UNDERSTAND  →  ACT
```

The interface translates infrastructure into that story. Repository, checkout, artifact, snapshot, provenance, and `remote_head_sha` remain available as technical truth, but are not the default vocabulary.

### Audit baseline

| Dimension | Audit score / observation |
|---|---|
| First-use comprehension | 5/10 |
| Information architecture | 5/10 |
| Navigation | 6/10 |
| Visual hierarchy | 6/10 |
| Product identity | 4/10 |
| Interaction quality | 5/10 |
| Motion/feedback | 4/10 |
| Dashboard usefulness | 6/10 |
| Repository usefulness | 6/10 |
| Reports usefulness | 5/10 |
| Trust/provenance | 7/10 |
| Accessibility | 6/10 |
| Responsive quality | 6/10 |
| Overall usability | 5.5/10 |

### Design principles

1. **State before storage.** Show what the project means now before explaining where it is stored.
2. **One project context.** The selected repository is visible and persistent across authenticated routes.
3. **Action follows explanation.** Every non-terminal state names the reason and the safest next action.
4. **Operations and engineering are different channels.** A checksum failure is not visually equivalent to a code finding.
5. **Evidence beats inference.** Keep deterministic/semantic labels, evidence references, commit, branch, origin, and timestamps honest.
6. **Progressive disclosure.** Managers see the conclusion first; developers can open evidence and technical details without leaving context.
7. **Motion explains change.** Motion is short, stateful feedback, never ambient decoration.
8. **Reduce containers.** Use rails, rows, dividers, timelines, metrics, drawers, and grouped sections before another floating card.
9. **Privacy is product value.** “Source code not uploaded” is visible at the point of sync and provenance, not buried in documentation.
10. **No false completion.** Unsupported, unavailable, empty, stale, and unknown states are distinct.

### Non-goals

- No redesign of the analysis engine or `.trace` contract.
- No new backend feature implied by a visual control. If a capability is not persisted, show it as read-only or explicitly unavailable.
- No individual developer scoring, rankings, surveillance, or decorative analytics.
- No public audit endpoint added for UI convenience.

## 1. Unified project mental model

The application uses four independent axes, then presents one concise composite state. This prevents the current conflation of “connected,” “analyzed,” “synchronized,” and “current.”

| Axis | Values | User-facing question |
|---|---|---|
| GitHub access | `not_connected`, `connected`, `unavailable`, `permission_missing` | Can TRACE see this repository identity? |
| Local analysis | `none`, `available`, `running`, `failed` | Has TRACE learned anything on this computer? |
| Dashboard record | `none`, `syncing`, `verified`, `attention`, `revoked` | Is an approved record available in the dashboard? |
| Freshness | `unknown`, `current`, `behind` | Does the record describe the current default branch? |

The canonical state machine and transition rules live in [TRACE-STATE-MODEL.md](TRACE-STATE-MODEL.md). The default composite labels are:

| Composite label | Meaning | Primary action |
|---|---|---|
| **Not connected** | No GitHub repository identity is available | Connect GitHub |
| **Connected · Not analyzed** | Repository is known; no local analysis exists | Analyze on this computer |
| **Analysis ready on this computer** | Local `.trace` intelligence exists but is not synchronized | Review sync, then sync |
| **Syncing approved record** | Upload/verification is in progress | View progress; no duplicate action |
| **Synced · Freshness unavailable** | A verified record exists, but trusted GitHub HEAD is unavailable | Refresh GitHub state |
| **Current with GitHub** | Analyzed commit equals trusted default-branch HEAD | Review findings |
| **Behind the current GitHub branch** | A verified record exists for an older commit | Analyze again |
| **Sync needs attention** | A sync was rejected or failed; last verified record remains safe | Review failure / retry |
| **GitHub unavailable** | Repository state cannot currently be verified | Retry GitHub state; keep local work safe |
| **Computer access revoked** | CLI authorization is no longer valid | Reconnect this computer |

### The Trace Rail

Use **Trace Rail** as the signature visual language. It is a compact state diagram, not a progress bar and not decoration:

```text
GitHub         Local analysis       Dashboard record       GitHub freshness
  ● ━━━━━━━━━━━━━ ● ━━━━━━━━━━━━━━━ ● ━━━━━━━━━━━━━━━━━━━ ○
connected       analyzed locally    verified               current/unknown
```

- Four nodes map to the four axes above.
- A filled node means the axis is established; an outlined node means unknown/not yet reached.
- The active segment carries the composite state and one short explanation.
- A failed operation breaks the relevant segment with a red error marker and a recovery action; it does not erase the last verified node.
- On mobile, the rail becomes a compact two-row sequence or a vertical step list with the same order.
- Use it in the project header, repository rows when space allows, and setup completion. Do not repeat it inside every finding or report.

## 2. Information architecture

Keep repository context global, while making the repository page the project command center. Use the following navigation groups:

| Group | Item | Scope and purpose | Empty/unavailable behavior |
|---|---|---|---|
| **PROJECT** | Overview | Selected project’s state, attention, next action, and recent memory | Requires a selected repository; show repository picker if none |
| **PROJECT** | Repositories | Discover, connect, and switch repositories | Separate GitHub setup from everyday switching |
| **INTELLIGENCE** | Changes | Time/PR change stream with attached findings and decisions | Explain that signed PR snapshots create records |
| **INTELLIGENCE** | Findings | Reviewable attention items for the selected project | Explain when local analysis creates findings |
| **INTELLIGENCE** | Reports | Structured daily/weekly project memory | Explain how local report generation and sync create reports |
| **INTELLIGENCE** | Conflicts | Conflict intelligence only when supported by an analysis artifact | State the prerequisite and link to local workflow |
| **INTELLIGENCE** | Decisions | Approved decision records from `.trace` | State the prerequisite; do not imply automatic decisions |
| **GOVERNANCE** | Rules | Team-owned checks and their evaluation state | Show configured vs unavailable distinctly |
| **GOVERNANCE** | Activity | Project activity and security/audit events, separated | Never mix high-volume request logs with project memory |
| **SYSTEM** | Connections | Authorized computers that can sync approved records | Show active/revoked state and reconnect path |
| **SYSTEM** | Settings | Workspace, GitHub, privacy, notifications, advanced settings | Technical details are expandable |
| **SYSTEM** | Documentation | Contextual product and CLI help | Link to the relevant workflow, not a generic dump |

The old `Later` label is replaced with one of three truthful states: **Available**, **No record yet**, or **Not enabled in this environment**. A disabled capability must never look like an empty result.

### Persistent shell

Every authenticated route keeps:

1. App shell and active navigation.
2. Repository context bar: workspace, repository, composite state, and switcher.
3. Optional command/search trigger.
4. Page title and one-sentence purpose.
5. One primary action or an explicit “no action needed” state.

The selected repository persists across routes, reloads, and browser history. A route reached from a finding or report retains the repository and return path.

### Repository context switcher

The switcher is a searchable command surface, not a raw checkbox list.

```text
PROJECT  mathofdynamic / TRACE                         [⌄]
         Current with GitHub · 4 findings · 2 reports

┌ Search repositories…                                ┐
│ CONNECTED                                            │
│ ● TRACE       Current · 4 findings · 2 reports       │
│ ◐ Radar       Connected · Not analyzed               │
│                                                     │
│ AVAILABLE FROM GITHUB                                │
│ ○ sholex       Connect                               │
│ ○ momentum-2   Connect                               │
└─────────────────────────────────────────────────────┘
```

- Search matches repository name and owner.
- Group by connected/available, then sort connected by recent use.
- Each row exposes one status sentence and one action.
- Switching keeps the route when possible; if the destination lacks the requested view, land on its overview with an explanatory toast.
- Mobile opens a full-height sheet with a close button, focus trap, search field, and 44px rows.
- Setup may multi-select repositories, but everyday switching never uses selection checkboxes.

## 3. Overview (`/app`)

The overview answers: **which project, what state, what matters, what next**. It must not land the user on a repository that merely happens to be first in a list.

### Desktop wireframe

```text
┌ TRACE ─ workspace / TRACE                              ⌄  [Search] ┐
│ Overview                                                         │
│ TRACE                                              Current         │
│ Local analysis is current with GitHub.                            │
│ GitHub ● ━━━━━ Local ● ━━━━━ Dashboard ● ━━━━━ Current ●          │
│ [Review findings]                         [Analyze again]          │
├───────────────────────────────────────────────────────────────────┤
│ NEEDS ATTENTION                                                   │
│ Operations  Sync verification failed                 [Review]      │
│ Engineering  Schema or migration changed             [Open]        │
│ Engineering  Public export surface changed           [Open]        │
│ +2 lower-priority items                                           │
├───────────────────────────────────────────────────────────────────┤
│ PROJECT INTELLIGENCE                                             │
│ 4 findings    2 reports    main @ 4953add…    Last synced 18m ago │
│ [Findings] [Reports] [Changes]                                    │
├───────────────────────────────────────────────────────────────────┤
│ RECENT PROJECT MEMORY                                             │
│ timeline of analysis, sync, report, and review events             │
└───────────────────────────────────────────────────────────────────┘
```

### Behavior

- The first viewport contains the project context, Trace Rail, one primary next action, and the top attention group.
- Operational failures appear in an **Operations** group with retry/safety language. Engineering findings appear in **Engineering** with severity and evidence.
- Group findings by priority; do not give five unrelated items identical weight.
- “No action needed” is an explicit positive state when current and no attention exists.
- The recent-memory timeline is project-level; it does not score people.
- The overview never repeats the full report or every technical metadata field.

### Overview states

- Not connected: repository picker is the primary action.
- Connected/not analyzed: explain that analysis runs locally and show `trace analyze` with a copyable command.
- Analysis ready: show what will be synchronized and link to `trace sync --dry-run`.
- Sync attention: preserve the last verified dashboard state and expose the rejection reason/retry.
- Current: show findings and a review action, not a redundant “sync” CTA.
- Unknown freshness: state why GitHub state is unavailable and offer refresh.

## 4. Repository command center (`/app/repositories/[repositoryId]`)

The repository page tells one coherent story: GitHub identity, local intelligence, dashboard record, freshness, and review priorities.

```text
┌ mathofdynamic / TRACE                              [Manage access] ┐
│ Connected to GitHub · main · Current with GitHub                    │
│ Local analysis · 18m ago · 4953add…                                 │
│ GitHub ● ━━━━━ Local ● ━━━━━ Dashboard ● ━━━━━ Current ●             │
│ [Review findings] [Analyze again] [Technical details]                │
├──────────────────────────────────────────────────────────────────────┤
│ WHAT CHANGED / WHAT MATTERS                                          │
│ 4 findings   2 reports   57 changed paths   10 recent commits        │
├───────────────────────────────┬──────────────────────────────────────┤
│ NEEDS REVIEW                   │ PROJECT MEMORY                       │
│ Finding rows with severity     │ report/change timeline               │
│ and next action                │                                      │
├───────────────────────────────┴──────────────────────────────────────┤
│ REPORTS / CHANGES / FINDINGS (contextual tabs or sections)           │
└──────────────────────────────────────────────────────────────────────┘
```

- Replace “Persisted analysis state is available” with “Saved project intelligence is available.”
- Put commit, branch, generated time, sync time, origin, and privacy boundary under a quiet **Origin and verification** disclosure.
- Use metrics as a single strip, not five separate cards.
- Attach report and finding links to the selected repository automatically.
- A stale state says “Behind the current GitHub branch. Analyze again locally.” It does not claim a commit count unless trusted history calculates it.
- A checksum failure remains visible as an operational attention item while the previous verified snapshot remains labeled current-to-its-commit, not silently discarded.

## 5. Repository discovery and setup (`/app/repositories`)

Separate **Connect repositories** (onboarding/setup) from everyday **Switch project** (persistent context). Reuse row anatomy, but do not use the setup checkbox dump as the daily management page.

### Row anatomy

```text
● mathofdynamic/TRACE                              Current · 4 findings
  Public · main · Last synced 18m ago              [Open]
```

States and actions:

| State | Copy | CTA |
|---|---|---|
| Connected + current | `Current · 4 findings · 2 reports` | Open |
| Connected + behind | `Needs refresh · analyzed commit is behind GitHub` | Open / Analyze again |
| Connected + not analyzed | `Connected · Not analyzed yet` | Analyze locally |
| Connected + local only | `Analysis ready on this computer` | Review sync |
| Available | `Available from GitHub` | Connect |
| Permission missing | `GitHub access required` | Reconnect GitHub |
| GitHub unavailable | `Repository list unavailable` | Retry |

Provide search, owner/name filter, status filter, recent sorting, and a count summary. Multi-select is reserved for setup and has an explicit `Connect selected` action with a confirmation summary.

### Setup lifecycle

1. Workspace context.
2. GitHub connection and permission explanation.
3. Searchable repository selection.
4. Confirmation showing exact repositories and access scope.
5. Completion with next action: analyze locally.

Do not land the owner in Radar after selecting TRACE. When two repositories are connected, open the one with a local/dashboard record or ask the user to choose.

## 6. Findings (`/app/repositories/[repositoryId]/findings` and global Findings)

Findings become a review surface, not an alert dump.

### Collapsed row

```text
HIGH   Schema or migration changed                         Open ▸
       Database structure changed in the analyzed commit.
       20 evidence references · deterministic · main @ 4953add…
       [Review finding]
```

Each row includes severity, title, plain-language why-it-matters, affected area, evidence count, provenance, state, and one action. Severity colors are supplementary; text and icon semantics are required.

### Detail drawer/page

```text
Schema or migration changed                              [Close]
Why TRACE flagged this
  ...
What changed
  ...
Why it matters
  ...
Evidence (20)                                             [Expand all]
  path / reference / deterministic observation
Recommended review
  ...
Origin and verification                                    [Technical details]
  Local analysis · main · commit · generated time
```

Evidence-free findings must say **“No supporting evidence was synchronized for this finding.”** They must not show an empty evidence affordance that implies hidden detail.

Initial supported disposition should remain read-only unless persistence exists. If the product later supports statuses, use `Open`, `Reviewed`, and `Resolved` with an audit trail; never add fake dismiss/resolve controls to an unsupported backend.

## 7. Reports (`/app/reports` and report detail)

Reports are structured project memory. Raw approved Markdown remains accessible, but is secondary.

### Report list

```text
REPORTS                                      TRACE · Current
Readable project memory from local analysis.

TODAY  [Daily] [Weekly] [Repository ▾] [Date ▾]
Weekly report · Aug 10–14                      Local · 57 changes
  4 key areas · 2 risks · 3 decisions          [Open report]
Daily report · Aug 14                           Local · 10 commits
  57 changed paths                             [Open report]
```

### Report detail

```text
Weekly report · Aug 10–14                 TRACE · Local analysis
main @ 4953add… · generated Aug 14 · synced Aug 14
┌ Summary metrics ──────────────────────────────────────────────┐
│ 10 commits   57 paths   4 findings   2 areas needing review    │
└────────────────────────────────────────────────────────────────┘
Key changes → Areas affected → Needs review → Risks → Decisions
Timeline / evidence references
[View approved Markdown] [Technical provenance]
```

Daily emphasizes recency and changed paths; weekly emphasizes patterns, risks, and decisions. Both show repository context, date/window, commit, local origin, freshness, and evidence. A report must communicate its important changes without expanding raw Markdown.

## 8. Changes, conflicts, rules, decisions, and activity

### Changes

Keep the route because signed PR snapshots are a distinct future-ready input. When unavailable, say: **“No signed pull-request snapshots are available. Local analysis and reports are still available.”** Do not show a dead `Later` link. When data exists, group the change stream by time/area and attach findings, risks, and decisions.

### Conflicts

- No records: “No conflict record has been synchronized. Conflicts appear when a supported local conflict analysis is generated.” CTA: View local workflow.
- Zero conflicts: “Conflict analysis completed; no conflicts detected.”
- Active conflict: severity, branches/areas, evidence, and next review action.
- Stale conflict: reuse freshness warning; never present old conflict intelligence as current.

### Rules

Explain which team-owned rules are active, their scope, last evaluation, and pass/warning/fail state. If no synchronized rules exist, distinguish **not configured** from **not enabled in this environment**. Keep evaluator internals under Technical details.

### Decisions

Show approved decision records from `.trace`; state the prerequisite when empty. Do not imply TRACE invents decisions.

### Activity

Use two switchable groups: **Project activity** (analysis, sync, reports, findings) and **Security & access** (device authorization, revocation, repository connection, rejected sync). Keep timestamps, repository, actor class (local computer/GitHub/system), and outcome. Do not mix request-level telemetry with meaningful history.

### Secondary-page wireframes

These are hierarchy contracts, not pixel layouts.

#### Findings

```text
TRACE / Findings                         Current with GitHub
Findings that need a decision or review.
[All] [High] [Medium] [Info] [Open ▾]
HIGH  Schema or migration changed                         [Review]
      Why it matters · 20 evidence references · deterministic
MED   Dependency metadata changed                          [Review]
      Why it matters · 3 evidence references · deterministic
```

#### Conflicts

```text
TRACE / Conflicts                         TRACE · main
Conflict intelligence
No conflict record has been synchronized.
Conflicts appear when a supported local conflict analysis is generated.
[View local workflow]
```

With data, replace the empty block with a summary strip, active conflicts grouped by area/branch, evidence, freshness, and a review action. With a completed zero-conflict analysis, use “No conflicts detected.”

#### Rules

```text
TRACE / Rules                             TRACE · Current
Team-owned governance
Rule                         Scope       Last evaluation   State
Public API review            TRACE       Aug 14             Pass
Migration review             TRACE       Aug 14             Warning
[Technical details]
```

An unconfigured workspace shows what creates rules and whether the evaluator is enabled; it does not show a blank table.

#### Activity

```text
TRACE / Activity                           [Project] [Security]
Meaningful history for mathofdynamic/TRACE
Aug 14  Local analysis completed             main @ 4953add…
Aug 14  Verified dashboard record promoted    Local computer
Aug 14  Finding created                       deterministic
```

The Security tab contains device authorization/revocation, repository connection, rejected sync, checksum, and divergence events. Filters remain visible and scoped.

#### Settings

```text
TRACE / Settings
Workspace                         mathofdynamic
GitHub access                     Connected · 2 repositories
Local TRACE                       2 authorized computers
Privacy & synchronization         Source code excluded
Notifications                     Defaults
Advanced                          [Technical details]
```

Each category opens an inline section or focused subpage; avoid a long undifferentiated card stack.

#### Local connections / Authorized computers

```text
TRACE / Settings / Authorized computers
Computers allowed to send approved TRACE records
TRACE on win32 · Staging · Active · Last used today       [Revoke]
TRACE on win32 · Staging · Active · Last used never       [Rename] [Revoke]
Source code and code snippets are excluded.
[How authorization works]  [Technical details]
```

Revocation confirmation states that local analysis remains available, the last verified dashboard record remains readable, and reconnect is required for future sync.

## 9. Settings and Local Connections

Settings categories:

```text
Workspace
GitHub access
Local TRACE
Privacy & synchronization
Notifications
Advanced / Technical details
```

The local connection surface is renamed **Authorized computers**. Its lead copy is:

> This computer is authorized to send approved TRACE records. Source code and code snippets are excluded by the sync policy.

Each row shows a friendly name, environment, workspace, repositories in scope, last used, expiration, and active/revoked status. Technical token/hash language is never in the default view. Revoke requires confirmation explaining that local analysis remains available, the dashboard keeps the last verified record, and future sync requires reconnecting. A revoked row offers **Reconnect this computer**.

## 10. Terminology and product language

The full translation table is repeated in [TRACE-COMPONENT-INVENTORY.md](TRACE-COMPONENT-INVENTORY.md) where component copy is defined. Default language:

| Technical/current term | Default product term | Technical detail |
|---|---|---|
| Local CLI | TRACE on this computer | CLI command and platform name |
| Local analysis | Analyzed on this computer | analyzer/version |
| Provenance | Origin and verification | artifact provenance fields |
| Artifact | Approved TRACE record | `.trace` record |
| Snapshot | Verified dashboard record | snapshot ID/state |
| Persisted analysis state | Saved project intelligence | storage detail |
| Synchronized | Dashboard copy ready | sync operation ID |
| Freshness | Repository freshness | remote HEAD comparison |
| Current | Current with GitHub | analyzed/remote SHAs |
| Behind GitHub | Behind the current GitHub branch | no precise count unless calculated |
| Device | Authorized computer | connection/device ID |
| Connection | GitHub connection / computer authorization | scope-specific detail |
| Finding | Review item | deterministic/semantic classification |
| Evidence | Supporting evidence | paths/references/count |

“Local” remains acceptable as a provenance badge, but never as the only explanation of what happened.

## 11. Empty, error, loading, and progress system

Every state uses four lines: **what happened**, **why**, **what to do next**, **CTA**.

| State | Required message shape |
|---|---|
| Not configured | “GitHub is not connected. Connect it to discover repositories.” |
| Connected, no analysis | “TRACE knows this repository identity, but no local analysis exists yet. Run `trace analyze`.” |
| Local analysis not synced | “Analysis is ready on this computer. Review the approved record, then run `trace sync`.” |
| Synced, zero findings | “Analysis completed; no findings were produced for this commit.” |
| No reports | “No report has been generated for this project. Create a daily or weekly report locally.” |
| No conflicts | “No conflict record has been synchronized” or “No conflicts detected,” never the same sentence. |
| GitHub unavailable | “GitHub state is temporarily unavailable. Your local analysis and last verified dashboard record are safe.” Retry. |
| Worker/API unavailable / 1102 | “TRACE is temporarily unavailable. Nothing in your local `.trace` record was changed.” Retry later. |
| Authentication expired/revoked | “This computer is no longer authorized to sync. Reconnect it.” |
| Checksum rejection | “Sync verification failed. The previous verified dashboard record remains active.” Review details / retry. |
| Divergence | “Local and dashboard records have diverged. Review the base before syncing.” |
| Permission failure | “You do not have access to this repository in the current workspace.” Return to repository selection. |

Async actions expose actual stages only: **Starting → Processing → Verifying → Complete** or **Failed**. No fabricated percentages. Keep the last verified state visible during a failure.

## 12. Visual hierarchy and surface system

### Layout hierarchy

1. Project identity and state.
2. Primary next action.
3. Attention or “all clear” outcome.
4. Core intelligence.
5. Quiet metadata and technical details.

Do not give branch, commit, sync time, origin, and visibility equal weight to the state and finding title.

### Surface levels

| Level | Use | Treatment |
|---|---|---|
| 0 Canvas | page background | `#080809`; no container border |
| 1 Workspace | main content groups, rail area | `#111112` or open layout with separators |
| 2 Interactive | selected row, expanded finding, active control | `#151516`/`#1A1A1C`, subtle border and hover lift |
| 3 Overlay | switcher, drawer, modal, command menu | opaque surface, stronger border/shadow, focus trap |

Use 1px separators, 8–12px radii only where grouping needs them, and a small number of meaningful surfaces. Convert repeated cards into metric strips, section rows, timelines, drawers, or inline status. A page should not read as heading → card → card → card.

### Typography

- Keep the existing neutral sans-serif direction and Kunst Grotesk intent.
- Project identity: 24–32px desktop, 22–26px mobile; sentence case except repository identity.
- Page title: 28–40px desktop, 26–32px mobile; one line where possible.
- Section: 13–15px semibold with clear grouping.
- Body: 14–16px, 1.45–1.6 line height.
- Metadata: 12–13px muted; never below 12px for essential state.
- Commit/path/technical IDs: selective monospace, never the entire product.

### Color semantics

- Canvas/surfaces follow the existing dark palette in `TRACE-DESIGN-SPEC.md`.
- Blue is interaction/information emphasis, not a universal status color.
- Success/current: green plus “Current”/check semantics.
- Warning/needs attention: amber plus text/icon.
- Error/failed: red plus text/icon.
- Unknown/neutral: gray plus explicit “Unknown”/“Unavailable.”
- Finding severity colors are a separate semantic layer and always have text labels.

### Controls

- Primary: blue with restrained tactile depth (subtle top edge, lower shadow, 130–170ms hover/press).
- Secondary: neutral filled/outlined surface.
- Ghost: text/icon action with visible hover and focus.
- Destructive: neutral until intent, then red confirmation; never red by color alone.
- Compact/icon: 44px touch target even when visual glyph is smaller.

## 13. Responsive behavior

Responsive design changes priority, not only width.

| Width | Shell | Trace Rail | Content priority |
|---|---|---|---|
| 1440+ | persistent sidebar; two-column intelligence | horizontal with labels | state, attention, findings/reports, memory |
| 1024 | compact sidebar or persistent rail; reduce secondary metadata | horizontal, shorter labels | state and next action remain first; secondary sections collapse |
| 768 | drawer navigation; context bar remains | two-row/scrollable rail | one primary action; findings/reports become list + drawer |
| 390 | hamburger/drawer with focus trap; full-screen repository sheet | compact vertical/segmented sequence | selected repo, state, top 3 attention, primary action; all else progressive disclosure |

At 390px:

- No horizontal overflow.
- Every primary action is visible without hunting.
- Repository rows remain 44px minimum.
- Tables become labeled rows; long Markdown is behind disclosure.
- Findings open a full-width detail sheet with a clear close/back action.
- The sidebar is not rendered twice in the accessibility tree.

## 14. Accessibility and trust

- Use one `h1`, ordered headings, landmarks, and semantic lists/tables.
- Every status has text plus icon/shape; never rely on color alone.
- Focus is visible on links, rows, tabs, menu items, drawers, and destructive controls.
- Drawers/modals trap focus, restore focus to the invoking control, and announce their title.
- Async progress and errors use polite/assertive live regions appropriately.
- Keyboard navigation covers repository switching, findings, reports, filters, and retry.
- Minimum interactive target is 44×44px.
- Respect `prefers-reduced-motion`; preserve state changes without animation.
- Contrast must meet the product accessibility target for text, borders, focus, and severity indicators.

### Trust/provenance pattern

Use a compact **Origin and verification** disclosure in the project header and report/finding details:

```text
Analyzed on this computer · main @ 4953add…
Generated Aug 14 · Dashboard copy ready · Current with GitHub
Source code not uploaded · Evidence: deterministic local analysis
```

The default view surfaces only the conclusion and privacy promise. The disclosure exposes exact SHAs, operation IDs, artifact names, evidence paths, and policy details for technical users.

## 15. Persona validation

| Persona | First read | Progressive detail | Success signal |
|---|---|---|---|
| Developer | next finding/action and evidence | paths, references, deterministic observations, command | can review a finding without leaving repository context |
| Tech lead | attention hierarchy, change areas, freshness | risks, reports, decisions, history | can prioritize review work in one visit |
| Engineering manager | project state, why it matters, trend/memory | technical details only when needed | understands whether the project needs attention without CLI vocabulary |
| AI-heavy team | confidence, provenance, current commit, privacy | evidence and synchronization record | trusts rapid local changes are bounded and reviewable |

### Major-page persona checks

| Surface | Developer | Tech lead | Engineering manager | AI-heavy team |
|---|---|---|---|---|
| Overview | reaches findings/evidence | sees ranked attention and freshness | understands project state in one viewport | sees provenance and privacy boundary |
| Repository | inspects commit/evidence | prioritizes risks and reports | understands current/behind meaning | confirms local origin and bounded record |
| Repositories | switches to the right project | compares project attention | recognizes connected vs analyzed | sees which records are safe to sync |
| Findings | opens paths and deterministic detail | reviews impact/action | reads why it matters without internals | verifies evidence and confidence limits |
| Reports | scans affected areas and references | uses weekly risk/decision summary | gets a decision-ready narrative | sees generation, commit, and source policy |
| Settings / Connections | reconnects or revokes safely | checks repository scope | understands what the computer can do | trusts token/privacy boundary without hashes |

## 16. Cross-page consistency, help, and command surface

Persistent components are the shell, repository context, state/Trace Rail summary, primary-action slot, notifications, breadcrumbs, and help entry. Routes do not independently redefine “current,” “local,” or “synchronized.”

Contextual education uses one sentence, a “Why am I seeing this?” disclosure, and a workflow link. Avoid tutorial modals and repeated onboarding overlays.

The command surface is worth keeping only if it searches repository, finding, report, decision, rule, and action. It must show result type, repository, state, and keyboard shortcut; it must not become a generic global search with unscoped technical IDs.

## 17. Page classification and preservation

### Major rethink

- `/app`: unclear first story and equal-weight attention.
- `/app/repositories`: checkbox-heavy discovery, wrong default destination.
- `/app/repositories/[repositoryId]`: disconnected technical metadata and weak next action.
- `/app/reports`: Markdown-first presentation and weak context.

### Structural refinement

- Findings: add investigation/action/evidence model.
- Changes: make signed-snapshot prerequisite truthful and useful.
- Conflicts: teach prerequisite and distinguish no record from no conflict.
- Rules: explain governance scope and evaluation state.
- Decisions: clarify approved artifact prerequisite.
- Activity: split project memory from security/audit.
- Settings/Connections: translate device and privacy concepts.

### Polish or keep largely unchanged

- Dark tone, shell foundation, responsive baseline, reduced-motion support, privacy boundary, provenance grouping, deterministic labels, authentication/error surfaces, and public documentation structure should be preserved and refined rather than replaced.

## 18. Audit finding → redesign requirement mapping

| Finding | Requirement | Spec section |
|---|---|---|
| F-001 High | First viewport states project, lifecycle, meaning, and next action | 1, 3, 19 |
| F-002 High | Default to useful selected project; searchable status-aware switcher | 2, 5 |
| F-003 High | Separate GitHub, local analysis, dashboard record, and freshness axes | 1, TRACE-STATE-MODEL |
| F-004 High | Operational attention state preserves last verified record and exposes recovery | 3, 11 |
| F-005 High | Dedicated unavailable/1102 state explains safety and retry; track reliability separately | 11, implementation plan QA |
| F-006 Medium | Replace `Later` with Available/No record/Not enabled | 2, 8 |
| F-007 Medium | Translate infrastructure terms; technical details remain available | 10, 12 |
| F-008 Medium | Structured report summaries; Markdown secondary | 7 |
| F-009 Medium | Finding rows/detail drawer with evidence, why, confidence, and action | 6 |
| F-010 Medium | Search/filter/group repository discovery | 2, 5 |
| F-011 Medium | Surface levels, metric strips, rows, timelines, fewer isolated cards | 12 |
| F-012 Medium | Critical feedback, orientation transitions, and Trace Rail motion | TRACE-MOTION-SPEC |
| F-013 Medium | Explicit 768/390 priority and progressive disclosure | 13 |
| F-014 Medium | Single drawer DOM, focus trap, restoration, keyboard behavior | 13, 14 |
| F-015 Low | Formal empty-state taxonomy with prerequisite/action | 11 |
| F-016 Low | Behind GitHub explains cause and Analyze again action | 1, 4, 11 |
| F-017 Low | Group attention by Operations/Engineering and priority | 3 |
| F-018 Observation | Early pilot label remains secondary/internal, not primary identity | 12, implementation plan |
| F-019 Observation | Report cards always show repository context | 7 |
| F-020 Observation | Distinguish gated capability from empty data | 2, 8, 11 |
| F-021 Strength | Preserve explicit source/code-snippet exclusion | 0, 14 |
| F-022 Strength | Preserve compact provenance with progressive disclosure | 4, 14 |
| F-023 Strength | Preserve deterministic finding classification and evidence honesty | 6, 14 |

## 19. Future implementation acceptance criteria

1. A first-time user identifies selected repository, composite state, and primary next action within 10 seconds from `/app`.
2. From Overview, a user reaches `mathofdynamic/TRACE` in no more than three intentional interactions without source-code knowledge.
3. A connected-but-unanalysed repository explains what is missing, why local analysis is required, and how to start it.
4. A local-only record explains what will be synchronized and exposes `trace sync --dry-run` before upload.
5. Current, behind, unknown, unavailable, revoked, and sync-failed states are visually and textually distinct; unknown never maps to current.
6. Every operational failure explains whether the local record is safe and whether retry is appropriate.
7. A finding detail answers why it matters, what changed, evidence available, provenance, confidence/classification, and what to review next. Zero evidence is explicit.
8. Reports communicate key changes, affected areas, risks, and decisions without requiring raw Markdown expansion.
9. Overview separates operational failures from engineering findings and gives each a proportionate priority.
10. Every async action has real starting/processing/verifying/success/failure feedback; no fabricated percentages.
11. At 390px there is no horizontal overflow; navigation, repository switching, primary actions, findings, reports, and drawers are keyboard/touch usable.
12. Keyboard focus, live regions, dialog focus restoration, semantic headings, target size, contrast, color-independent state, and reduced motion are verified.
13. The visual system uses fewer isolated bordered cards and establishes a recognizable Trace Rail without decorative noise.
14. Privacy copy makes source-code/code-snippet exclusion visible wherever sync and provenance are reviewed.
15. Existing honest empty states, local-first behavior, deterministic labels, provenance, and project-level activity remain intact.
