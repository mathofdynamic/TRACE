# TRACE Data Flow

| Mode | Source | Destination | Durable categories | Model exposure |
|---|---|---|---|---|
| Local | Repository working tree | Local CLI and `.trace` | Validated artifacts and local metadata | None unless `--with-ai` uses an explicitly configured provider |
| Cloud | GitHub event and permitted repository data | Worker, PostgreSQL, dashboard | Tenant metadata, analysis result, evidence refs, artifact drafts | Only when semantic feature flag and provider policy allow |
| Hybrid | Local artifact manifest | Sync API | Selected `.trace` metadata/Markdown according to policy | No source upload by manifest contract |

Raw source, prompts, credentials, and model chain-of-thought are not written to `.trace` artifacts. Retention, deletion, backup, and provider terms remain deployment policy inputs; no zero-retention or compliance guarantee is claimed.
