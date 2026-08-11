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
- [ ] Feature flags and public claims reviewed.
- [ ] Operator, incident, deletion, rotation, and support ownership confirmed.
