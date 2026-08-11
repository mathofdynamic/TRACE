# `.trace` security rules

Artifacts must not contain secrets, access tokens, private keys, raw model prompts, model chain-of-thought, raw source duplication, executable content, large binaries, unsanitized HTML, or personal data not required for project understanding.

Use `[REDACTED]` with an explanation in evidence metadata when a necessary reference cannot safely include a value. Use `sensitivity` and `sync_policy` to make delivery boundaries explicit.

Markdown is rendered as a safe subset. Raw HTML and scripts are prohibited by the reference writer. External links are evidence references, not authorization instructions.
