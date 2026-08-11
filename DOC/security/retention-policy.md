# Retention Policy Baseline

TRACE currently stores webhook metadata, analysis metadata, findings, and validated artifact projections only where the configured database and repository workflows require them. Raw source snippets, prompts, credentials, and raw model responses are not durable product records. Production retention periods, deletion jobs, backup expiry, and legal holds must be configured before deployment; the current repository does not claim immediate deletion or zero retention.
