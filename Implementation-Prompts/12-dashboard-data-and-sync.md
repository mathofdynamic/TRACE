# Phase 12 — Dashboard Data and Hybrid Synchronization

## Role

Act as a senior distributed-systems and product-data engineer.

## Objective

Complete the production data path from repository artifacts and analysis runs into the TRACE dashboard, including selective hybrid synchronization from local environments without requiring source-code upload.

## Required reading

Read the technical source-of-truth rules, artifact specification, local CLI, report/PR/conflict data contracts, dashboard shell, and privacy requirements.

## 1. Operational data model completion

Add migrations and repositories for:

- analysis runs;
- artifacts and artifact revisions;
- evidence references;
- findings and dispositions;
- conflicts and lifecycle events;
- decisions, risks, and debt projections;
- report projections;
- sync targets and policies;
- sync events;
- artifact divergence;
- audit events;
- model invocation metadata without raw private prompts.

Requirements:

- tenant isolation;
- stable external artifact IDs;
- repository commit/path/checksum references;
- revision history;
- soft deletion and retention state;
- indexes for dashboard queries;
- no raw source-code storage in primary tables.

## 2. Artifact ingestion

Implement a single ingestion path for artifacts produced by:

- cloud workers;
- local CLI;
- CI;
- compatible third-party writers.

Ingestion must:

- authenticate origin;
- validate specification version;
- validate schema and path;
- scan/redact according to policy;
- calculate checksum;
- detect duplicate revision;
- detect divergence;
- store artifact metadata and searchable projection;
- preserve raw portable artifact only in approved storage;
- record audit event;
- reject unsupported or unsafe content with actionable errors.

Do not trust `generator` metadata as authentication.

## 3. Hybrid sync protocol

Design a versioned sync API.

Support:

- capability negotiation;
- repository registration;
- artifact manifest upload;
- server response listing missing/changed artifacts;
- selective artifact upload;
- dry-run preview;
- field/artifact policy enforcement;
- idempotency;
- resumable retry;
- conflict response;
- deletion/tombstone where allowed;
- explicit no-source-code contract.

Do not upload whole repositories, Git packs, embeddings, or caches.

## 4. Local authentication

Implement secure CLI authentication suitable for humans and CI.

Human path may use a browser-based device or one-time flow.

CI path should use scoped project/repository tokens or workload identity where practical.

Requirements:

- tokens stored in OS credential storage where available;
- never stored in `.trace`;
- scoped permissions;
- revocation;
- expiry/rotation;
- no token in command output or logs;
- organization and repository binding;
- separate read and write scopes.

## 5. Sync policy

Allow project administrators to configure:

- permitted artifact types;
- excluded fields;
- sensitivity maximum;
- local-only paths;
- whether raw Markdown or only structured projection syncs;
- retention;
- allowed execution origins;
- approval requirement;
- automatic sync schedule;
- destination organization/repository mapping.

The CLI must show effective policy and upload preview.

## 6. Redaction

Implement deterministic redaction before network transfer.

Support:

- secret patterns;
- configured regex/pattern rules;
- email/user identity minimization where requested;
- internal URL redaction;
- path-based exclusions;
- artifact sensitivity labels;
- manual redaction markers.

Redaction must produce a manifest describing what categories were removed without exposing removed values.

## 7. Divergence handling

Detect when:

- repository artifact changed after cloud ingestion;
- cloud has a newer revision;
- local and cloud both edited managed sections;
- artifact was removed locally;
- commit reference no longer exists;
- dashboard overlay is pending repository write.

Provide states:

- in_sync;
- local_ahead;
- cloud_ahead;
- diverged;
- pending_repository_write;
- rejected_by_policy;
- invalid;
- deleted/tombstoned.

Do not auto-resolve durable-record divergence destructively.

## 8. Dashboard real-data completion

Remove remaining production fixture dependencies.

Complete:

- organization overview;
- repository status;
- active changes;
- PR intelligence;
- conflicts;
- reports;
- decisions;
- risks;
- activity;
- sync state;
- analysis history;
- artifact viewer;
- evidence viewer;
- search.

Use server-side authorization for every query/action.

## 9. Search

Implement initial PostgreSQL-backed search across:

- artifact titles and summaries;
- IDs;
- repository;
- PR/issue references;
- components;
- decision/risk text;
- evidence metadata.

Do not add a vector database in this phase.

Rank exact identifiers and current records above historical text.

Respect tenant and repository permissions.

## 10. Reconciliation

Add scheduled reconciliation for:

- GitHub repository state;
- repository artifact checksum when content access permits;
- local sync manifests;
- stale open PR data;
- unresolved divergence;
- orphaned projections;
- disconnected repositories.

Jobs must be bounded, resumable, and observable.

## 11. Audit history

Record meaningful actions:

- artifact uploaded;
- artifact accepted/rejected;
- sync policy changed;
- finding disposition changed;
- conflict resolved;
- local token issued/revoked;
- repository disconnected;
- cloud-generated repository update proposed.

Avoid logging sensitive content.

## 12. UX requirements

Create clear UI for:

- source origin;
- last sync;
- code-not-uploaded statement only when true for that mode;
- policy preview;
- divergence resolution;
- invalid artifact remediation;
- token management;
- execution history;
- upload scope.

Do not use vague privacy claims. Show exact data categories.

## 13. API requirements

- versioned endpoints;
- typed request/response schemas;
- rate limits;
- idempotency keys;
- pagination;
- consistent errors;
- request size limits;
- correlation IDs;
- audit logging;
- no internal database shape exposed as public contract.

## Tests

Add:

- artifact ingestion for every type;
- invalid schema/version;
- duplicate/idempotent upload;
- redaction;
- policy rejection;
- token scope/isolation;
- cross-tenant access attempts;
- divergence states;
- interrupted/resumed sync;
- reconciliation;
- search authorization;
- dashboard real-data E2E;
- no-source-content network assertions for hybrid fixtures.

## Acceptance criteria

- All major dashboard views use real indexed data.
- Local artifacts can sync selectively without source repository upload.
- Users can inspect exactly what will sync.
- Invalid or unsafe artifacts are rejected.
- Divergence is visible and never silently overwritten.
- Search respects tenant/repository boundaries.
- CLI credentials are secure and revocable.
- Audit history is useful without leaking private content.
- Fixture data remains test/dev-only.
- Implementation log is updated.

## Completion response

Return:

- sync protocol summary;
- data categories transferred;
- redaction behavior;
- divergence model;
- dashboard routes now using real data;
- security and E2E results;
- remaining governance needs.
