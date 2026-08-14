# TRACE Threat Model

## Staging acceptance update — 2026-08-14

The historical staging blocker later in this file is resolved. Migrations `0004`–`0006` are current, device authorization succeeds, and a real local snapshot is projected with source/code-snippet exclusion. Live checks recorded expected fail-closed responses for unsafe paths, unauthorized repositories, checksum mismatches, and stale bases. Revocation and authenticated visual review remain owner-manual because this execution environment has no authenticated browser session. The staging database password supplied for operator migration must be rotated after this acceptance run.

Status: pilot baseline, reviewed 2026-08-08. This is not a certification.

## Assets and boundaries

| Asset                    | Boundary                                   | Primary control                                                                                                                                      | Residual risk                                                    |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Source code              | Local workspace / optional hosted analysis | Read-only workspace, size/path limits, no project command execution                                                                                  | Hosted isolation still requires VPS hardening                    |
| GitHub credentials       | Web/app and worker                         | Separate OAuth/App roles, signed webhooks, no PAT contract                                                                                           | Live key rotation is an owner operation                          |
| `.trace` artifacts       | Repository and sync API                    | Versioned schema, atomic writer, traversal/symlink checks                                                                                            | Human-authored Markdown remains untrusted                        |
| CLI device authorization | Browser session and CLI                    | Short-lived hashed codes, separate scoped token, one-time issuance, expiry and revocation                                                            | Compromised local user account can read its own credential store |
| Artifact sync            | CLI and dashboard API                      | Exact repository binding, bounded JSON, manifest/checksum validation, credential-like content rejection, staged transactional promotion, rate limits | Evidence locators may reveal approved repository paths           |
| Model keys               | Server environment                         | Provider adapter, no durable key logging                                                                                                             | Secret-store integration is deployment-specific                  |
| Tenant metadata          | PostgreSQL                                 | Organization foreign keys and server session boundary                                                                                                | Authorization matrix needs production review                     |
| Worker runtime           | pg-boss process                            | Safe job payloads, no model-controlled shell/network                                                                                                 | Full sandbox quotas are not implemented locally                  |

## Actors

Anonymous attackers, malicious repository contributors, compromised accounts, malicious members, compromised dependencies, untrusted model providers, malicious artifact writers, cross-tenant attackers, and leaked CI tokens are in scope.

## Threat controls

The current bridge hardening keeps freshness fail-closed: trusted default-branch state is compared with the analyzed commit, and unavailable remote state remains unknown. Sync completion uses a transaction and operation-row lock so concurrent retries cannot promote duplicate artifacts. Sync route diagnostics expose only bounded correlation IDs and safe error categories; source, snippets, Markdown bodies, credentials, and token hashes are never logged.

- Webhook bodies are HMAC-SHA256 verified with constant-time comparison, bounded to 1 MB, and deduplicated by delivery ID.
- Repository paths are contained, symlinks are rejected, binary/oversized/secret-like files are excluded, and project scripts are never executed by the analysis engine.
- Repository text and PR text are explicitly treated as untrusted data by the model contract. Structured output and evidence resolution are required.
- Sync manifests carry `sourceCodeIncluded: false` and `codeSnippetsIncluded: false`; policy rejects disallowed artifact types, sensitivity, local-only paths, unsafe/encoded traversal, symlink escapes, secret-like values, executable HTML, and source-like bodies.
- Each non-initial sync names its acknowledged completed base operation. A stale or second device fails closed until the user inspects and explicitly accepts the dashboard base.
- Browser mutations for device approval, repository selection, connection rename, and revocation require an authenticated session and a trusted application `Origin`.
- Dashboard APIs require a server-side session and resolve organizations from membership rather than client-supplied tenant IDs.

Historical note: the following paragraph records the pre-migration staging state.

Staging acceptance on 2026-08-13 verified the Worker health and unauthenticated route boundary, but the first CLI device-start request returned a generic `500` before credential issuance. The staging database migration state is not yet independently verified; live credential and sync claims remain blocked until the designated staging database is migrated and inspected.

## Pilot restrictions

Cloud source analysis remains restricted until a production isolation profile, secret store, monitoring, backup, and authorization review are supplied. Local mode is the verifiable path in this repository.
