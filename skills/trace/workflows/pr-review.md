# Pull-request workflow

1. Run `trace changes --json` for deterministic local context.
2. Use `trace pr <number-or-url> --dry-run` only when GitHub access is explicitly requested.
3. Keep provider facts separate from semantic interpretation.
4. Cite PR, commit, file, and check references.
5. Validate artifacts before any authorized write.
