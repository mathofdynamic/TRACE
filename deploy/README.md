# TRACE VPS Deployment

This deployment profile targets a Linux VPS with Nginx, native PostgreSQL, a Next.js web process, and a Node worker managed by systemd. It is a reproducible staging/production scaffold, not a completed deployment: domain, TLS, VPS access, GitHub credentials, secret storage, and operational ownership are required.

## Layout

- `systemd/trace-web.service`: Next.js process, bound to loopback.
- `systemd/trace-worker.service`: pg-boss worker.
- `nginx/trace.conf`: TLS-terminated reverse proxy template.
- `scripts/backup-postgres.sh`: compressed PostgreSQL backup.
- `scripts/restore-check.sh`: restore into an isolated database for verification.
- `env/*.example`: environment key inventory without secret values.

## Release sequence

1. Provision separate staging and production Linux users, databases, GitHub Apps, OAuth callbacks, and secrets.
2. Install Node 22, pnpm 11, PostgreSQL 17, Nginx, and systemd units.
3. Build from an immutable commit SHA, run `pnpm db:migrate` after a backup, and validate `/api/health`.
4. Enable only local/deterministic features first. Semantic analysis, comments, sync, and cloud processing remain feature-flagged off until their gates pass.
5. Verify staging, backup restore, rollback, signed webhook fixtures, and operator runbooks before production.

No production command should be run until environment values and ownership are explicitly supplied.
