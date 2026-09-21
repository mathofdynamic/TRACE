# TRACE D1 restore rehearsal

## Scope

CF4.6 prepared the recovery procedure and proved a local-only export/import
rehearsal. CF4.8 then proved Cloudflare remote Time Travel on one isolated
synthetic database. The live staging database and bindings were not modified.

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

## CF4.8 remote isolated Time Travel rehearsal (verified)

Date: 2026-09-21

The rehearsal used only the `mathofdynamic2` account and created exactly one
new, unbound database:

- Destination: `trace-restore-rehearsal-20260921`
- Destination ID: `5075dc29-954f-4f65-a38a-0d22e7c076ac`
- Staging source ID: `c4df63bc-8270-4500-9dab-c1c6439efa64`
- Destination region: `EEUR`
- Wrangler: `4.120.1`

The destination ID was checked against the complete account inventory before
use. No Worker, Queue, Pages project, route, GitHub callback, or external
application was bound to it. No RADAR resource was changed.

The destination was migrated with a temporary untracked Wrangler
configuration whose only binding was the destination:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='c5d6cf110905c91fc3eed1abaf8236a2'
.\node_modules\.bin\wrangler.cmd d1 migrations apply DB --remote --config apps/web/wrangler.cf48-restore.jsonc
```

Migrations `0000_cheerful_legion.sql` and `0001_goofy_lester.sql` both applied.
The synthetic dataset used only `cf48-*` identifiers, a nonfunctional
placeholder session token, and no real installation IDs, webhook payloads,
OAuth values, or staging records.

The destination-specific bookmark was captured at approximately
`2026-09-21T17:04:41Z`:

```text
00000000-0000001a-000050ed-90d1f46fc0c152afc1e24ba13ae0fe5d
```

The command is remote by default; the installed Wrangler rejects an unnecessary
`--remote` flag for `time-travel info`:

```powershell
.\node_modules\.bin\wrangler.cmd d1 time-travel info DB --config apps/web/wrangler.cf48-restore.jsonc --json
```

Before restore, the issue was changed from `open` to `closed` and a second
synthetic queued delivery was inserted. The destination was then restored in
place to the recorded bookmark, exactly once:

```powershell
.\node_modules\.bin\wrangler.cmd d1 time-travel restore DB --config apps/web/wrangler.cf48-restore.jsonc --bookmark=00000000-0000001a-000050ed-90d1f46fc0c152afc1e24ba13ae0fe5d --json
```

Cloudflare returned the target bookmark above and previous bookmark
`00000000-ffffffff-000050ed-c13f82fdeaea055dc1ea2f922640b9df`.

Post-restore validation passed:

- migrations: `0000_cheerful_legion.sql`, `0001_goofy_lester.sql`
- tables: 25 SQLite tables, including migration/internal tables and 23 application tables
- representative indexes: 5 present
- `PRAGMA foreign_key_check`: no rows
- synthetic user, placeholder session, organization, membership, installation, selected repository, issue, and original processed delivery: one each
- issue state/title restored to `open` / `CF48 synthetic issue`
- post-bookmark delivery: absent
- recovery metadata: present on the original delivery

The staging database remained unchanged by the restore. Read-only checks still
showed its two migrations, one selected fixture repository, two fixture issues,
one delivery, Worker version `7cfc8de1-0291-47dc-a180-cb691bef2943` at 100%, and
`/api/health` returning HTTP 200.

At the time of the rehearsal, the account had eight databases after creating
the destination. The latest staging rolling metrics were 15,922 rows read and
67 rows written over 24 hours; exact account-wide current-day usage was not
available through Wrangler. Free-plan Time Travel retention is seven days;
bookmarks must be refreshed before future rehearsals. The rehearsal database
remains allocated and unbound for owner-directed cleanup.

This proves remote Time Travel restoration of the TRACE schema and synthetic
records on an isolated database. It does not prove restoration of the live
staging database or a production snapshot.

## CF4.9 production recovery gate

The CF4.8 rehearsal is the only remote restore evidence currently accepted for
release planning. Before production provisioning, capture a fresh bookmark on
the dedicated production D1 and record it with the Worker release SHA. Free
Time Travel retention is seven days, so the bookmark is a recovery reference,
not an indefinite backup. A production incident requires an owner decision:
pause webhook/Queue intake, restore the production database in place to a
validated bookmark, verify migrations/indexes/foreign keys and tenant-scoped
records, then reconcile delivery states with the durable idempotency keys
before re-enabling intake. A Worker rollback alone does not restore data.

Never restore staging or production into the CF4.8 rehearsal database. Do not
replay raw payloads from a restored database; use the normalized delivery
record and the owner-only bounded recovery path. If Queue retention has
expired or D1 is unavailable, mark recovery as blocked rather than claiming
success. A synthetic isolated restore does not prove a production snapshot.

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

## Remote rehearsal procedure (historical plan)

1. Confirm current account identity, Workers plan, D1 quota headroom, and the
   exact staging database ID. Do not use a production database.
2. Capture a fresh read-only bookmark:

   ```powershell
   $env:CLOUDFLARE_ACCOUNT_ID='c5d6cf110905c91fc3eed1abaf8236a2'
   .\node_modules\.bin\wrangler.cmd d1 time-travel info trace-test-staging-db --config apps/web/wrangler.jsonc --env staging --json
   ```

3. Protect current staging state by recording the bookmark, migration list,
   active Worker version, D1 binding, Queue binding, and sanitized row-count
   checks. Do not export tokens, sessions, or raw webhook payloads.
4. Use an owner-approved, separate disposable D1 destination. Time Travel
   currently restores a specified database in place; it does not clone/fork a
   source database into a new destination. Bind the destination only in an
   isolated Wrangler environment; never repoint `trace-test-staging`.
5. If a separate data copy is required, use an approved sanitized SQL
   export/import path. The Wrangler syntax is:

   ```powershell
   .\node_modules\.bin\wrangler.cmd d1 export trace-test-staging-db --remote --output <protected.sql>
   .\node_modules\.bin\wrangler.cmd d1 execute <destination> --remote --file <sanitized.sql> --yes
   ```

   Do not export sessions, credentials, raw webhook payloads, or secrets.
   Both operations consume D1 quota and require explicit approval.

6. Do not run `d1 time-travel restore` against staging. Restore is a
   target-mutating operation and must only run after the target identity and
   bookmark have been independently asserted.
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
quota. Free-plan Time Travel retention is seven days. Stop on error `7500` and
wait for quota recovery rather than retrying in a loop or changing the plan.

## Cleanup boundary

Do not delete staging PostgreSQL, Hyperdrive, pg-boss, the Node worker, the
existing D1, or the existing Queue during a restore rehearsal. Do not rotate
credentials or change GitHub App settings.
