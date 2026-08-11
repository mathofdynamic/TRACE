# TRACE local runtime skill

Use the repository `trace` CLI as the orchestration boundary. Do not recreate `.trace` artifacts manually when a CLI command exists.

## Rules

- Run deterministic collection before interpretation.
- Cite evidence references in every finding or report.
- Keep credentials, prompts, raw source duplication, and private conversations out of `.trace`.
- Use `--dry-run` before durable writes unless the user explicitly authorizes the write.
- Validate `.trace` after every write.
- Mark unknown intent and uncertain semantic output explicitly.
- Local mode does not require TRACE Cloud login or hidden network calls.
- Do not request or expose private chain-of-thought.

## Workflows

Load only the workflow needed from `workflows/`. The CLI is canonical for init, changes, validation, reports, PR shells, diagnostics, and sync status.

Cloud and hybrid behavior must be explicit. Repository artifacts remain the durable source of truth; dashboard state is an overlay or projection unless a later specification says otherwise.
