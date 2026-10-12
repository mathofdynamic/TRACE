# TRACE CLI

TRACE runs local deterministic analysis and synchronizes only explicitly allowed,
source-free artifacts. Install Node.js 22.14+ and Git, then install the versioned
package from the official GitHub release (no monorepo build or pnpm required):

```text
npm install --global https://github.com/mathofdynamic/TRACE/releases/download/cli-v0.3.0/mathofdynamic-trace-cli-0.3.0.tgz
trace --version
```

On Windows, open a fresh terminal after installing Node.js. If PowerShell blocks
npm's script shim, use `npm.cmd` and `trace.cmd`; do not weaken execution policy.
The release includes SHA256SUMS. The package bundles its runtime dependencies and
contains no workspace links, install scripts, native addons, or cloud credentials.
No npm registry publication is claimed; this is the official GitHub release package.

From the repository you want to understand (TRACE itself is valid):

```text
trace init --yes
trace validate
trace analyze
trace validate
```

This is local-only, needs no database or cloud login, and writes `.trace` project
memory without overwriting existing initialization. Keep runtime output under the
repository's existing ignore policy. Dirty checkout analysis is exploratory only;
never sync it as an authoritative committed record. `--with-ai` requires explicit configuration for the metadata-only review described below.

Only when dashboard synchronization is intended, approve the normal device flow:

```text
trace login
trace connect
trace analyze
trace sync --dry-run
trace sync
```

Before sync require a clean committed checkout, fresh clean analysis and a safe
plan for every eligible artifact, with both privacy flags false. Credentials stay
outside the checkout (Windows DPAPI; owner-only files on other platforms). Do not
copy device credentials into CI. See skills/trace in the source repository for the
complete operational guide, provenance, freshness and current product limitations.

For maintainers: `pnpm cli:pack` builds a standalone npm-compatible tarball and
SHA256SUMS in ignored `dist/cli-release/`. Only tested exact-source artifacts should
be released. Windows/Linux CI installs the package into a fresh prefix and uses a
fresh TRACE checkout for acceptance, without production contact.

## Rules

```text
trace rules list
trace rules effective
trace rules validate
trace rules test
```

These commands use the CLI built-in baseline, not synchronized or repository-authored rules. `trace rules --help` lists the supported subcommands. Other rules subcommands return exit 2 with accurate usage. Help and rules commands do not initialize or persist `.trace`.

## Period reports (CLI 0.2.0)

CLI 0.2.0 adds verified period engineering reports.

Daily and weekly reports aggregate reachable committed history for one or seven
calendar days ending on `--date` (default today), rather than working-tree edits.
Use `--timezone <IANA zone>` and optional `--github` with an authenticated `gh`
CLI for verified PR/release metadata. Missing data is labelled Not available.
Preview without `--yes`; write or revise the canonical report with `--yes`.
See [Engineering reports](../../DOC/engineering-reports.md) for data coverage,
clean-input publication guards and the dashboard document/provenance contract.


## Release notes — 0.3.0

See [the 0.3.0 release notes](https://github.com/mathofdynamic/TRACE/releases/tag/cli-v0.3.0) for the complete release contract.

## Historical release notes — 0.2.0

- Daily and trailing seven-day engineering reports aggregate committed period
  history, changed areas and detectable package version transitions.
- Optional `--github` adds verified PR/release metadata using a separately
  authenticated `gh` CLI. Missing sources remain Not available; open PRs are a
  current snapshot, not reconstructed historical state.
- The dashboard reads one validated engineering document, links evidence and
  separates readable sections from Verification & Provenance.
- Dirty/unstable reports remain local-only. Sync excludes reports whose recorded
  clean branch/HEAD differs from the current checkout. Regenerate legacy reports
  before publication; historical artifacts need not be deleted.
- Explicit `--yes` revises the canonical ending-date report while preserving its
  creation time. Artifact schema and sync protocol remain 0.1; no migration is needed.
- Both privacy flags remain false. Release publication requires the existing
  checksum-verified fresh Windows/Linux installation acceptance, now including
  real daily/weekly generation, validation and safe local sync planning.

## Explicit AI metadata review

CLI 0.3.0 includes this contract. The historical CLI 0.2.0 archive predates it; do not treat its legacy AI flag as a real provider feature. Verify installed help describes `TRACE_AI_DATA_POLICY=metadata-only`.

`trace analyze --with-ai` uses the existing OpenAI-compatible adapter with no CLI vendor, endpoint or model defaults. Set these process environment variables through secure environment injection:

- `TRACE_AI_PROVIDER=openai-compatible`
- `TRACE_AI_BASE_URL`: your approved HTTPS API base endpoint (no URL credentials/query/fragment)
- `TRACE_AI_MODEL`: your explicit supported model identifier
- `TRACE_AI_API_KEY`: bearer credential, 16–4096 printable ASCII characters; never `.trace`, tracked files or shell history
- `TRACE_AI_DATA_POLICY=metadata-only`: explicit consent to the described metadata boundary

Only counts, working-tree state and opaque evidence IDs/kinds go directly to that endpoint. No source, diffs, file paths, symbols, commit messages or repository identity are sent. This is metadata inference, not source-level code review. Provider retention is outside TRACE's control. Validated source-free summaries and safe provenance may synchronize to TRACE Cloud; both Cloud source/snippet flags remain false. Prompts, raw responses and credentials are never persisted.

Missing/invalid configuration returns exit 2. Auth, unsupported model, rate limit, unavailable provider, timeout, cancellation, size-limit or malformed/unsafe output failures return exit 1 with sanitized actionable codes; no fixture fallback. Requests/responses are bounded to 64 KiB with a 30-second timeout. CLI uses one attempt, with no automatic paid retries. Other commands reject `--with-ai`. Deterministic analysis remains the default.

See `DOC/ai-analysis.md` for provenance and CI acceptance. Normal CI uses mocked contracts and never needs a paid API call. No live-provider acceptance is claimed by mocked tests.
