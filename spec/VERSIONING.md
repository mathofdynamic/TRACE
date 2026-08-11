# Versioning

- Specification versions use `MAJOR.MINOR`.
- Artifact metadata uses `schema_version` with the same format.
- 0.x changes are experimental and may require migration.
- Additive fields and extension namespaces are backward-compatible when readers ignore unknown fields.
- Removing, renaming, or changing required field semantics is breaking.
- Migrations must be explicit, deterministic, and preserve provenance; a reader must never silently rewrite an artifact.
- Extensions use namespaced keys such as `x_trace_example` or a provider namespace. Credentials are never valid extension values.
- Human-edited sections must be preserved when generated regions are regenerated.
