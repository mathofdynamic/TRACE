# TRACE Data Flow

## Staging acceptance update — 2026-08-14

The historical staging blocker later in this file is resolved. Migrations `0004`–`0006` are current, and the staging Worker completes the real device authorization and local-to-dashboard path. The final `mathofdynamic/TRACE` snapshot contains only approved local `.trace` artifacts and projection metadata; live dry-run and sync results reported `sourceCodeIncluded: false` and `codeSnippetsIncluded: false`. Traversal, unauthorized repository, checksum, divergence, and controlled offline checks were exercised without replacing the verified snapshot. Browser-session revocation and visual dashboard review still require an owner-authenticated browser.

| Mode        | Source                                     | Destination                                               | Durable categories                                                    | Model exposure                                                                     |
| ----------- | ------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Local       | Repository working tree                    | Local CLI and `.trace`                                    | Validated artifacts and local metadata                                | None unless `--with-ai` uses an explicitly configured provider                     |
| Hybrid sync | Approved `.trace` artifacts                | CLI → authenticated sync API → staged PostgreSQL snapshot | Source-free Markdown projections, checksums, branch/commit provenance | Raw source, code snippets, prompts, credentials, confidential/restricted artifacts |
| Cloud       | GitHub event and permitted repository data | Worker, PostgreSQL, dashboard                             | Tenant metadata, analysis result, evidence refs, artifact drafts      | Only when semantic feature flag and provider policy allow                          |
| Hybrid      | Local artifact manifest                    | Sync API                                                  | Selected `.trace` metadata/Markdown according to policy               | No source upload by manifest contract                                              |

Raw source, prompts, credentials, and model chain-of-thought are not written to synchronized `.trace` artifacts. The CLI sends a manifest first, uploads only server-requested deltas, and leaves uploads invisible until a checksum-verified transaction promotes a complete snapshot. Retention, deletion, backup, and provider terms remain deployment policy inputs; no zero-retention or compliance guarantee is claimed.

## Staging acceptance boundary

Current hardening status: trusted repository freshness comes from the existing default-branch push webhook or an authenticated GitHub App metadata refresh during repository selection. The dashboard compares that remote head with the analyzed commit and displays `Freshness unknown` when remote state is unavailable. Sync route failures carry bounded correlation IDs and category-only logs; artifact bodies, source, snippets, credentials, and token hashes are excluded from logs. The hardening changes are local until the next staging Worker deployment.

The original deployment and migration blocker is documented in the historical paragraph below.

On 2026-08-13 the staging Worker was deployed at version `2a87b573-fb0b-4938-9419-de74dc273a7e` and its health and unauthenticated route boundaries were verified. The first bridge request, `POST /api/cli/device/start`, returned the generic `500` route error before issuing a credential. Therefore no staging credential, source-free artifact, or dashboard projection is claimed as live until the designated staging database has migrations `0004`–`0006` applied and verified.
