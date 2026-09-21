# TRACE Release Checklist

- [ ] Empty-database migration and upgrade migration pass.
- [ ] `pnpm format:check`, lint, typecheck, unit tests, build, and browser smoke pass.
- [ ] GitHub signed fixtures, duplicate delivery, permission loss, and uninstall behavior pass.
- [ ] `.trace` compatibility and unsafe-path tests pass.
- [ ] Cross-tenant authorization matrix passes.
- [ ] Security headers, secret scan, dependency scan, and prompt-injection suite pass.
- [ ] Quality thresholds in `DOC/quality-thresholds.md` are measured; failed features are disabled.
- [ ] Accessibility and responsive smoke review complete.
- [ ] Staging migration, backup restore, rollback, and queue recovery complete.
- [ ] Production topology, D1-only/no-fallback guard, Free-plan capacity, and
      GitHub callback strategy approved; production resources remain uncreated
      until this gate is closed.
- [ ] Production canary proves D1 auth, tenant isolation, signed webhook ->
      Queue processing, owner recovery, retry/idempotency, and rollback.
- [ ] Feature flags and public claims reviewed.
- [ ] Operator, incident, deletion, rotation, and support ownership confirmed.

## CF4.10 evidence

| Gate                         | Evidence                                                                                                      | Status          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------- |
| Production D1 selection      | `createRequestDatabase()` selects D1 with a valid production binding                                          | PASS locally    |
| Missing production D1        | Missing binding fails closed; webhook returns 503 without pg-boss                                             | PASS locally    |
| Incorrect production driver  | `TRACE_DATABASE_DRIVER=postgres` is rejected in production                                                    | PASS locally    |
| Staging migration parity     | Remote staging reports no pending migrations; deployed version remains `7cfc8de1-0291-47dc-a180-cb691bef2943` | PASS, read-only |
| Current-UTC-day D1 quota     | Account-wide current-day totals are not exposed by available read-only CLI                                    | UNKNOWN         |
| Worker CPU capacity          | Aggregate CPU distribution and limit errors unavailable in this context                                       | UNKNOWN         |
| Queue capacity               | Backlog/retry metrics unavailable through available CLI                                                       | UNKNOWN         |
| Production routing/callbacks | Production hostname and GitHub App callback strategy remain undecided                                         | OPEN            |
| Production cutover           | No production resources or deployment exist                                                                   | NOT RUN         |
