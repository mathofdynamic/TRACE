# RFC 0001: Initial artifact contract

- Status: Accepted for experimental v0.1
- Scope: Portable local-first artifacts

## Decision

Every durable Markdown artifact has YAML front matter validated by `@trace/schema`. Common metadata contains identity, repository, provenance, evidence, review status, sensitivity, sync policy, and supersession links. The body is human-readable Markdown with no raw HTML or executable content.

Stable IDs are lowercase kebab-case with a short semantic prefix and deterministic suffix where generated. Filenames are date-based for reports, PR-number-based for PR briefs, and stable-ID-based for decisions, risks, debt, and conflicts.

## Open questions

- Whether the first public schema should standardize a richer repository identity provider registry.
- Whether signatures belong in v0.2 or remain deployment-specific.
- How much human-managed content should be preserved by future merge-aware writers.
