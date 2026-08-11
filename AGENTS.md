# TRACE Agent Instructions

## Before implementation

- Read `README.md`, `DOC/project-overview.md`, `DOC/technical-overview.md`, and `Design-system/TRACE-DESIGN-SPEC.md`.
- Read `Implementation-Prompts/README.md` and the current phase prompt.
- Read the completed phase entry in `IMPLEMENTATION-LOG.md` before continuing.
- Inspect the repository and existing configuration before editing.

## Implementation discipline

- Execute phases in order. Do not implement future-phase features early.
- Treat `.trace/` as runtime output unless an explicit fixture path is allowlisted.
- Preserve one artifact contract across local, cloud, CI, and hybrid execution.
- Collect deterministic facts before model inference and label inference clearly.
- Produce sparse, evidence-backed output. Do not optimize for AI comment volume.
- Never implement individual developer scoring, rankings, or surveillance metrics.
- Validate every generated path and reject path traversal, unsafe files, and secrets.
- Keep GitHub webhook handling signed, deduplicated, idempotent, and asynchronous.
- Keep server-only secrets and source content out of browser bundles, logs, and artifacts.
- Add tests and update `IMPLEMENTATION-LOG.md` in every phase.
- Never claim a command passed unless it was executed successfully.
- Do not commit, push, or open a pull request without explicit human authorization.

## Product quality

- Follow the TRACE design specification. Avoid generic SaaS styling, purple AI gradients, and decorative noise.
- Implement loading, empty, error, success, disabled, focus, reduced-motion, responsive, and accessible states.
- Keep fixtures visibly identified and never present planned behavior as complete functionality.
