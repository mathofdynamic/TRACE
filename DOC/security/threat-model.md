# TRACE Threat Model

Status: pilot baseline, reviewed 2026-08-08. This is not a certification.

## Assets and boundaries

| Asset | Boundary | Primary control | Residual risk |
|---|---|---|---|
| Source code | Local workspace / optional hosted analysis | Read-only workspace, size/path limits, no project command execution | Hosted isolation still requires VPS hardening |
| GitHub credentials | Web/app and worker | Separate OAuth/App roles, signed webhooks, no PAT contract | Live key rotation is an owner operation |
| `.trace` artifacts | Repository and sync API | Versioned schema, atomic writer, traversal/symlink checks | Human-authored Markdown remains untrusted |
| Model keys | Server environment | Provider adapter, no durable key logging | Secret-store integration is deployment-specific |
| Tenant metadata | PostgreSQL | Organization foreign keys and server session boundary | Authorization matrix needs production review |
| Worker runtime | pg-boss process | Safe job payloads, no model-controlled shell/network | Full sandbox quotas are not implemented locally |

## Actors

Anonymous attackers, malicious repository contributors, compromised accounts, malicious members, compromised dependencies, untrusted model providers, malicious artifact writers, cross-tenant attackers, and leaked CI tokens are in scope.

## Threat controls

- Webhook bodies are HMAC-SHA256 verified with constant-time comparison, bounded to 1 MB, and deduplicated by delivery ID.
- Repository paths are contained, symlinks are rejected, binary/oversized/secret-like files are excluded, and project scripts are never executed by the analysis engine.
- Repository text and PR text are explicitly treated as untrusted data by the model contract. Structured output and evidence resolution are required.
- Sync manifests carry `sourceCodeIncluded: false`; policy rejects disallowed artifact types, sensitivity, and local-only paths.
- Dashboard APIs require a server-side session and resolve organizations from membership rather than client-supplied tenant IDs.

## Pilot restrictions

Cloud source analysis remains restricted until a production isolation profile, secret store, monitoring, backup, and authorization review are supplied. Local mode is the verifiable path in this repository.
