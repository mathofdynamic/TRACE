# TRACE D1 restore rehearsal

## Scope

This run prepared the recovery procedure and proved a local-only export/import
rehearsal. No remote database was restored, no staging binding changed, and no
new Cloudflare resource was created.

Staging reference:

- Database: `trace-test-staging-db`
- Database ID: `c4df63bc-8270-4500-9dab-c1c6439efa64`
- Migration state: `0000_cheerful_legion.sql` and `0001_goofy_lester.sql`
- Recorded pre-migration Time Travel bookmark:
  `0000001d-0000000e-000050ed-f80c5c6a592cb2aa08e001e3a89d423a`
- Latest read-only bookmark observed during CF4.6:
  `0000002b-00000000-000050ed-1ad1bdd45d0a05ac6caaf8943197f7f9`

The older bookmark is retained as historical recovery evidence. The latest
bookmark is the current read-only reference and must be re-queried immediately
before any future remote rehearsal.

## Local-only rehearsal (verified)

The isolated Wrangler D1 environments `trace-cf46-source` and
`trace-cf46-restore` were created locally from migrations `0000` and `0001`.
The source contained only disposable fixture values. A local D1 export was
created, data was imported into the separately migrated restore database, and
the following matched after import:

- users: 1
- sessions: 1
- installations: 1
- repositories: 1
- selected repositories: 1
- issues: 1
- webhook deliveries: 1
- recovery metadata: present on the delivery
- representative unique indexes: present
- `PRAGMA foreign_key_check`: no rows

This proves the local export/import tooling and schema shape only. It does not
prove Cloudflare remote Time Travel restoration.

## Remote rehearsal procedure (not executed)

1. Confirm current account identity, Workers plan, D1 quota headroom, and the
   exact staging database ID. Do not use a production database.
2. Capture a fresh read-only bookmark:

   ```powershell
   $env:CLOUDFLARE_ACCOUNT_ID='c5d6cf110905c91fc3eed1abaf8236a2'
   .\node_modules\.bin\wrangler.cmd d1 time-travel info trace-test-staging-db --remote --config apps/web/wrangler.jsonc --env staging --json
   ```

3. Protect current staging state by recording the bookmark, migration list,
   active Worker version, D1 binding, Queue binding, and sanitized row-count
   checks. Do not export tokens, sessions, or raw webhook payloads.
4. Use an owner-approved, separate disposable D1 destination. Creating that
   destination is a remote resource mutation and was intentionally not done in
   CF4.6. Bind it only in an isolated Wrangler environment; never repoint
   `trace-test-staging`.
5. Prefer a supported Cloudflare database copy/fork operation if the account
   exposes one. If no isolated copy operation is available, use a remote SQL
   export and import into the approved destination. Both paths consume D1
   quota and require explicit resource/quota approval.
6. Do not run `d1 time-travel restore` against staging. Wrangler exposes restore
   by bookmark/timestamp for a target database; it is a target-mutating
   operation. Use it only when the destination is isolated and the owner has
   approved the exact target and bookmark.
7. Apply/verify schema in the destination, then validate indexes, foreign keys,
   sessions, installations, selected repository, issues, webhook deliveries,
   and recovery fields. Compare counts and stable identifiers without exposing
   secrets.
8. Test the recovered database with a read-only or isolated Worker binding.
   Do not attach the live Queue, accept GitHub callbacks, or allow replayed
   messages to reach staging.
9. Record the validation result and either discard the isolated destination
   through the normal owner-approved process or retain it as a rollback
   reference. Never reset the live staging database as part of rehearsal.

## Rollback and failure limits

The prior staging Worker remains the application rollback point. A D1 restore
is separate from Worker rollback and can change target data; it requires an
explicit owner decision. During a D1 outage, recovery listing/replay cannot be
considered successful, and after Queue retention expires an old message may no
longer be replayable. The current Workers Free account has a finite daily D1
row-read quota; remote export, migration, restore, and validation all consume
quota. Stop on error `7500` and wait for quota recovery rather than retrying in
a loop or changing the plan.

## Cleanup boundary

Do not delete staging PostgreSQL, Hyperdrive, pg-boss, the Node worker, the
existing D1, or the existing Queue during a restore rehearsal. Do not rotate
credentials or change GitHub App settings.
