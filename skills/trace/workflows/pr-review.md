# Pull-request workflow

1. Check initialized state using SKILL.md, then run `trace changes --json`.
2. Preview with `trace pr <number> --base <ref> --base-sha <sha> --json`.
   The CLI uses supplied local context; it does not fetch GitHub PR facts or parse a PR URL.
3. Keep verified provider facts separate from interpretation; cite evidence.
4. If a durable brief is authorized, generate or regenerate its per-PR snapshot with `trace pr <number> --base <ref> --base-sha <sha> --write --yes`.
5. Run `trace validate`. Generated briefs synchronize only from clean, stable current HEAD/branch. Preview sync and check its privacy flags; regenerate old projection-free briefs instead of editing them.

Dirty checkout output is local exploratory work only; DO NOT sync it. Any later
publication must follow SKILL.md: clean committed checkout, fresh clean analysis,
validation, privacy dry-run, and a final cleanliness/HEAD check.
