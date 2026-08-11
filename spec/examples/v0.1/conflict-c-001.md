---
artifact_type: conflict
created_at: '2026-08-08T08:30:00Z'
evidence:
  - locator: 'github:example/atlas-ts/compare/feature-a...feature-b'
    provider: github
    type: branch
execution_origin: local
finding_classification: deterministic
generator: trace-example/0.1
id: conflict-c-001
repository:
  default_branch: main
  name: atlas-ts
  owner: example
  provider: github
review_status: pending
schema_version: '0.1'
sensitivity: internal
source_refs: []
sync_policy: repository_authoritative
updated_at: '2026-08-08T08:30:00Z'
---

# Conflict C-001 — Shared configuration edit

## Evidence

Two active branches touch the same configuration path. This example asserts only a deterministic overlap.
