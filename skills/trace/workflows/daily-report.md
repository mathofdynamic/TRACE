# Daily report workflow

1. Check initialized state using SKILL.md; run `trace init --yes` if authorized and needed, then `trace doctor`.
2. Run `trace changes --json` and inspect deterministic evidence.
3. Run `trace report daily --dry-run`.
4. Review verified facts versus unavailable sources. In the period-report implementation, inspect the selected calendar period, source coverage and linked engineering sections; use optional `--timezone`/`--github` only as documented in SKILL.md.
5. If authorized, run `trace report daily --yes`.
6. Run `trace validate`.

Dirty checkout output is local exploratory work only; DO NOT sync it. Any later
publication must follow SKILL.md: clean committed checkout, fresh clean analysis,
validation, privacy dry-run, and a final cleanliness/HEAD check.
