# Final Redesign Integration

This document records the controlled migration of the visual redesign into the
real TRACE application. The redesign source is presentation authority only;
the TRACE repository remains authority for authentication, persistence, GitHub,
Local TRACE synchronization, APIs, and deployment configuration.

## Baselines

- Target repository: `mathofdynamic/TRACE`
- Target baseline: `5e41d8e99e74f2c19631b654de174d1b56e6cb57`
- Redesign source: `mathofdynamic/trace-redesign`
- Redesign source commit: `845fd9bb85909e47711a7c12d564d03ee3d34243`

## Real Data Contract Mapping

| UI surface                | Real source                                                                         | Truthful fallback                                                       |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Project context and state | `getAuthenticatedDashboardSummary()` and `deriveTraceProjectState()`                | Not connected, not analyzed, sync attention, freshness unavailable      |
| Repository switcher       | `summary.repositories`, real GitHub installations, persisted repository state       | Connected / not analyzed or connection setup guidance                   |
| Trace Rail                | Repository analysis, latest synchronized record, and trusted GitHub head comparison | Unknown freshness; no synthetic current state                           |
| Findings                  | Persisted dashboard attention/finding projections                                   | No synchronized findings                                                |
| Reports                   | Persisted synchronized report records and approved Markdown content                 | No reports; local analysis/sync instructions                            |
| Changes                   | Persisted change projections and deterministic relationships                        | No synchronized changes                                                 |
| Conflicts                 | Persisted conflict records and deterministic change relationships                   | Analysis unavailable is distinct from zero conflicts                    |
| Activity                  | Real workspace activity records                                                     | Explicit workspace scope and repository labels                          |
| Authorized computers      | `cliConnections` scoped to the authenticated user                                   | No credentials or token hashes are rendered                             |
| Decisions and rules       | Existing synchronized records and prompt builders                                   | Prompt generation remains local and does not persist repository changes |

The redesign adds no mock provider, demo session, fixture fallback, synthetic
metrics, or browser-side fake mutation path. Optional fields added to the
dashboard view model are populated only from existing persisted projections or
deterministic derivation from real fields.

## Deliberate exclusions

The redesign repository's mock dashboard server, mock session route, mock data
provider, scenario switcher, and fixture-only view models were not migrated.
Neither production infrastructure nor database schema was changed for the
visual integration. Local CLI actions remain instructional; the dashboard does
not execute `trace analyze` or `trace sync`.

## Privacy and freshness

The existing source-free synchronization contract remains authoritative:
`sourceCodeIncluded: false` and `codeSnippetsIncluded: false`. GitHub freshness
remains fail-closed: a known matching commit is Current, a known divergent
commit Needs refresh, and unknown GitHub state is Freshness unavailable.
