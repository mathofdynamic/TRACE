# `.trace` specification v0.1

`.trace` is an experimental, repository-native artifact contract for preserving evidence-backed understanding around software change. Git remains the history of code. `.trace` records reports, decisions, risks, conflicts, provenance, and synchronization state.

Version 0.1 is intentionally small. Readers must preserve unknown fields under extension namespaces and must not treat model inference as deterministic evidence.

## Canonical layout

```text
.trace/
├── README.md
├── config.yml
├── schema-version
├── reports/daily/
├── reports/weekly/
├── pull-requests/
├── decisions/
├── risks/
├── debt/
├── state/
└── indexes/
```

Markdown artifacts are durable and intended for Git. Indexes and sync state are rebuildable. Local caches, credentials, raw source, prompts, conversations, executables, binaries, and unsafe HTML are prohibited.

Supported artifact types are `daily_report`, `weekly_report`, `pr_brief`, `decision`, `risk`, `debt`, `conflict`, `rule`, `index`, `open_pr_state`, and `sync_state`.

The schema package is the reference validator. The format is independent from the TRACE database and model provider.
