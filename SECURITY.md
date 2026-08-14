# Security Policy

## Supported versions

TRACE is pre-release. Supported versions will be listed here when versioned releases begin.

## Reporting a vulnerability

**Owner action required:** replace this placeholder with a monitored private reporting channel before public launch. Do not publish exploitable details in a public issue.

Include the affected component, reproduction steps, impact, and sanitized evidence. Do not include credentials, private source code, tokens, or personal data.

## Scope

Security review covers the dashboard, authentication, GitHub App, webhook receiver, worker, local CLI, `.trace` artifact schema, model-provider integration, and synchronization paths.

Hybrid sync accepts only validated source-free `.trace` artifacts. Review the exact eligibility set with `trace sync --dry-run`. Device credentials are separate from browser sessions, scoped, expiring, hashed at rest on the server, and revocable from Dashboard Settings. See `DOC/local-dashboard-workflow.md` for storage and recovery details.

## Data handling expectations

- Never commit secrets, private keys, OAuth tokens, or production credentials.
- Treat repository content, issue text, pull requests, comments, rules, and `.trace` artifacts as untrusted input.
- Do not place raw source code or private model conversations in durable artifacts or logs.
- Report privacy or tenant-isolation concerns through the private channel once configured.
