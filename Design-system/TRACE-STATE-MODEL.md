# TRACE State Model

This is the canonical UX state contract for the redesign. It is a presentation and product-language specification; it does not require a new backend model. The implementation should derive these values from existing repository, analysis, sync, authorization, and GitHub records.

## 1. Separate axes

Do not store or infer one overloaded `status` string in the UI. Compose the project state from four axes:

```text
access       = GitHub repository identity and permission
analysis     = local TRACE analysis availability/lifecycle
dashboard    = verified dashboard record and synchronization lifecycle
freshness    = trusted GitHub default-branch comparison
```

| Axis | Allowed values | Authority |
|---|---|---|
| `access` | `not_connected`, `connected`, `unavailable`, `permission_missing` | GitHub integration/repository selection |
| `analysis` | `none`, `available`, `running`, `failed` | local analysis metadata / CLI state |
| `dashboard` | `none`, `syncing`, `verified`, `attention`, `revoked` | sync operation and acknowledged snapshot |
| `freshness` | `unknown`, `current`, `behind` | trusted GitHub default-branch state vs analyzed SHA |

`revoked` is a connection/sync authorization condition. It never deletes local analysis and never invalidates the last verified dashboard record by itself.

## 2. Canonical composite states

The UI uses the highest-priority applicable state while retaining secondary badges for the other axes.

| ID | Predicate | User-facing label | Explanation | Primary action | Secondary action |
|---|---|---|---|---|---|
| `not_connected` | `access=not_connected` | Not connected | TRACE does not have a GitHub repository identity for this project. | Connect GitHub | View documentation |
| `permission_missing` | `access=permission_missing` | GitHub access required | Your workspace cannot currently read this repository. | Reconnect GitHub | Choose another repository |
| `github_unavailable` | `access=unavailable` and no fresh trusted state | GitHub unavailable | GitHub state is temporarily unavailable; local work and the last verified record remain safe. | Retry GitHub state | View local status |
| `connected_unanalyzed` | `access=connected`, `analysis=none`, `dashboard=none` | Connected · Not analyzed | TRACE knows the repository identity, but no local analysis has been created. | Analyze on this computer | Learn about local analysis |
| `analysis_running` | `analysis=running` | Analyzing on this computer | Local analysis is in progress. The dashboard has not changed. | View progress | Cancel if supported |
| `analysis_failed` | `analysis=failed` and no valid local record | Analysis needs attention | Local analysis did not complete; no new dashboard record was created. | Review local error | Retry analysis |
| `analysis_local_only` | `analysis=available`, `dashboard=none` | Analysis ready on this computer | A local record is ready for review; nothing has been uploaded. | Review sync | Run `trace sync --dry-run` |
| `syncing` | `dashboard=syncing` | Syncing approved record | TRACE is negotiating, uploading, verifying, or promoting the approved record. | View progress | — |
| `sync_attention` | `dashboard=attention` | Sync needs attention | The proposed record was rejected or failed; the previous verified record remains active. | Review failure | Retry sync |
| `synced_unknown` | `dashboard=verified`, `freshness=unknown` | Synced · Freshness unavailable | A verified dashboard record exists, but trusted GitHub HEAD cannot be determined. | Refresh GitHub state | Review record |
| `synced_current` | `dashboard=verified`, `freshness=current` | Current with GitHub | The analyzed commit equals trusted default-branch HEAD. | Review findings | View reports |
| `synced_behind` | `dashboard=verified`, `freshness=behind` | Behind the current GitHub branch | GitHub has a different trusted HEAD than the analyzed commit. | Analyze again | Review current record |
| `revoked` | `dashboard=revoked` or active CLI authorization revoked | Computer access revoked | This computer cannot sync until it is authorized again. Local analysis remains available. | Reconnect this computer | View existing dashboard record |

### Presentation rule

The composite label occupies the project header and repository row. Secondary facts appear as compact badges:

```text
Behind the current GitHub branch
Analyzed on this computer · Dashboard copy ready · main @ 4953add…
```

Never show `Current` when `freshness=unknown`. Never show a failed sync as if it were a successful current snapshot. Never erase the prior verified record because a newer staged operation failed.

## 3. Trace Rail mapping

```text
GitHub identity  →  Local analysis  →  Dashboard record  →  GitHub freshness
      access             analysis            dashboard             freshness
```

Node and segment semantics:

| Rail part | Complete | Active | Failed/unknown |
|---|---|---|---|
| GitHub node | repository identity and permission confirmed | connection request in progress | red only for access failure; amber/gray for unavailable |
| Local node | valid local analysis metadata exists | analysis running | red for analysis failure |
| Dashboard node | acknowledged verified snapshot exists | sync stages in progress | red for rejection; prior node remains visible |
| Freshness node | trusted remote HEAD matches analyzed SHA | refresh in progress | outlined gray for unknown; amber for behind |

The rail is explanatory. It must not imply that a local analysis automatically uploads or that GitHub access automatically analyzes.

## 4. Event transitions

```text
not_connected
  └─ connect GitHub → connected_unanalyzed

connected_unanalyzed
  └─ trace analyze → analysis_running → analysis_local_only | analysis_failed

analysis_local_only
  └─ sync dry-run → analysis_local_only
  └─ sync → syncing → synced_unknown | sync_attention | revoked

synced_unknown
  └─ trusted GitHub refresh → synced_current | synced_behind | github_unavailable

synced_current
  └─ remote HEAD changes → synced_behind
  └─ new local analysis → analysis_local_only (if not synced yet)
  └─ failed new sync → sync_attention, prior snapshot remains current-to-its-commit

synced_behind
  └─ analyze again → analysis_running → analysis_local_only
  └─ refresh GitHub → synced_current | github_unavailable

sync_attention
  └─ retry same valid operation → syncing → verified state
  └─ checksum/divergence/revocation → remain attention with specific recovery

any authorized state
  └─ device revoked → revoked
revoked
  └─ successful login/reconnect → prior repository state restored, sync still required if local record is newer
```

## 5. Priority and composition

When multiple events coexist, use this display priority:

1. Access/security block (`revoked`, permission missing).
2. Data safety/operation failure (`sync_attention`, analysis failure).
3. Current lifecycle (`syncing`, analysis running).
4. Freshness (`behind`, unknown, current).
5. Baseline connection (`connected`, not analyzed).

This priority affects the main label only. The header still exposes secondary axis badges so a user can see, for example, **Sync needs attention** plus **Last verified record: main @ 4953add…**.

## 6. Operational versus engineering state

Operational state describes whether TRACE can safely obtain or verify intelligence:

- sync rejected;
- checksum mismatch;
- authorization revoked;
- GitHub/API unavailable;
- divergence.

Engineering state describes what the intelligence says:

- schema changed;
- public export changed;
- context bounded;
- conflicts;
- risks;
- decisions.

Overview and repository pages must render these in separate groups. An operational failure is not a finding and must not compete with a finding solely by severity color.

## 7. Empty and unknown semantics

| Condition | Correct wording | Incorrect shortcut |
|---|---|---|
| No conflict artifact | No conflict record has been synchronized | No conflicts |
| Conflict artifact with zero rows | Conflict analysis completed; no conflicts detected | Nothing here yet |
| No report | No report has been generated for this project | No reports (without next step) |
| GitHub HEAD missing | Freshness unavailable | Current |
| No local analysis | Not analyzed on this computer | Synced/empty |
| Failed new sync | Sync needs attention; previous verified record remains active | Sync complete |

## 8. Accessibility contract

Every composite state must expose:

- visible text label;
- non-color icon/shape;
- a short explanation;
- a primary action or “No action needed”;
- an accessible status announcement when it changes.

The rail receives a concise accessible description such as: “Connected to GitHub, analyzed locally, dashboard record verified, freshness behind GitHub.” Reduced motion removes segment animation but preserves the sequence and state labels.

## 9. Acceptance tests for the state model

1. Connected + no analysis cannot render “Current.”
2. Verified + unknown remote HEAD renders “Freshness unavailable,” never current.
3. A checksum rejection leaves the previous verified snapshot readable and visible.
4. Revoking a computer prevents sync but does not delete `.trace` or existing dashboard intelligence.
5. A new remote default-branch SHA changes current → behind without requiring local CLI output.
6. Re-analysis followed by successful sync returns behind → current only when trusted SHAs match.
7. Every state in the table has a copy, primary action, and safe recovery path.
