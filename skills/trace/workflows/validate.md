# Validation workflow

1. Check `config.yml` and `schema-version` using SKILL.md; initialize with the real CLI if needed and authorized.
2. Run `trace status --json` and `trace validate --json`.
3. Inspect individual artifacts with `trace inspect <path> --json`.
4. Regenerate CLI-supported artifacts with their generator or report the product issue.
   For explicitly hand-authored artifacts, follow the schema and task authorization.
   Never bypass validation or edit a projection to force synchronization.
