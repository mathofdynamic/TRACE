# Pull-request workflow

1. Check initialized state using SKILL.md, then run `trace changes --json`.
2. Preview with `trace pr <number> --base <ref> --base-sha <sha> --json`.
   The CLI uses supplied local context; it does not fetch GitHub PR facts or parse a PR URL.
3. Keep verified provider facts separate from interpretation; cite evidence.
4. If a durable brief is authorized, use `trace pr <number> --base <ref> --base-sha <sha> --write --yes`.
5. Run `trace validate`. The current PR brief has no dashboard projection and is excluded from sync; do not add one manually.
