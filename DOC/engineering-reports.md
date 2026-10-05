# Engineering reports

Available in TRACE CLI 0.2.0. Artifact schema and sync protocol remain 0.1.
Install the versioned GitHub release using the CLI README instructions.

Daily reports cover one calendar day. Weekly reports cover seven calendar days
ending on the selected date: October 5 covers September 29 through October 5.
Boundaries are inclusive start/exclusive end, timezone-aware, and capped at
collection time for an unfinished day. UTC is the default; use an IANA timezone
explicitly. These reports run on demand, not on a background schedule.

```text
trace init --yes
trace report daily --date 2026-10-05 --timezone Asia/Tehran --yes
trace report weekly --date 2026-10-05 --timezone Asia/Tehran --github --yes
trace validate
trace analyze
trace sync --dry-run --json
trace sync
```

`--github` requires a separately authenticated `gh` CLI. It reads metadata only:
merged PR event times, currently open PRs, published releases, and the default
branch HEAD. Open PRs are labelled as the inventory at generation time, never as
reconstructed historical open state. Missing authentication, failed pagination,
or unavailable metadata produces **Not available**, not a zero. GitHub access is
optional; local reporting works without network access. No TRACE credential is
forwarded to GitHub. Report generation neither logs in nor changes credentials.

Git aggregation walks reachable committed history and filters by committer time,
not the last ten commits or current working tree. Changed paths are deduplicated
across period commits; merge paths compare every parent. Shallow/inaccessible
history cannot establish complete counts. Package manifest version transitions
are detected locally, without uploading manifest source. Commit subjects and PR
titles remain attributed descriptions; TRACE does not infer importance or intent.

Local TRACE data is a partial inventory, not a complete event ledger. Valid,
nonsecret projected records updated in the period may supply decisions and
attention. Findings come only from analyses with consistent recorded clean-input
provenance. Counts describe recorded observations, not unresolved issues or proof
of no risks. Confidential, restricted, local-only, foreign-repository and
code-bearing records are excluded from aggregation.

The portable artifact contains readable Markdown plus one schema-validated
`trace:engineering-report:v1` evidence document. It records period boundaries,
source coverage, all report sections, and linked evidence. Existing artifacts stay
readable; legacy reports without clean-input provenance require explicit regeneration before sync; the optional evidence metadata extension does not change sync protocol
or database tables. Explicit regeneration updates the canonical date-based file,
preserving its creation timestamp and updating revision time. Historical files are
not deleted or fabricated.

Reports with dirty/changing generation inputs remain local-only, even after edits
are reverted. Clean reports must still match their recorded branch/HEAD before
sync; regenerate after HEAD changes. Always run a fresh clean analysis and inspect
both privacy flags before publishing. Source code and snippets remain excluded.

The dashboard's **Structured Document** renders human sections and evidence links.
Canonical YAML, raw hashes, boundaries and artifact metadata belong exclusively
in **Verification & Provenance**. Freshness is separate from data completeness.
No individual rankings or productivity scores are produced.
