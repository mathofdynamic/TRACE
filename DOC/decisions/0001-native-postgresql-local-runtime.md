# ADR 0001: Native PostgreSQL as the Required Windows Local Runtime

- Status: Accepted
- Date: 2026-08-08
- Scope: Phase 01 local development

## Context

TRACE requires PostgreSQL for migrations, Better Auth, and the worker queue foundation. The primary development environment is Windows, and the current user may not have permission to start Windows services. Requiring Docker would add an unnecessary prerequisite and would not solve the service-permission constraint.

## Decision

Use native PostgreSQL 17 as the required local database runtime. The repository provides PowerShell lifecycle scripts. When the installed Windows service cannot be started, `bootstrap-local.ps1` initializes and runs a project-local unprivileged cluster under ignored `.trace-cache/postgres-data`.

The standard local connection is:

```text
postgresql://trace:change-me@127.0.0.1:3002/trace_dev
```

Docker support may be added later as an optional convenience, but it is not part of the required workflow or acceptance gate.

## Consequences

- Local setup works without Docker or administrator rights.
- Local database state is disposable and must never be treated as production data.
- Port `3002` is explicit to avoid collisions with the web application and common local services.
- Linux staging and production will use a separately managed PostgreSQL service and separate credentials.
