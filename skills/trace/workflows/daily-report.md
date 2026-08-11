# Daily report workflow

1. Run `trace doctor`.
2. Run `trace changes --json` and inspect deterministic evidence.
3. Run `trace report daily --dry-run`.
4. Review known versus unknown sections.
5. If authorized, run `trace report daily`.
6. Run `trace validate`.
