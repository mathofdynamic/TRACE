# TRACE CLI

TRACE runs local deterministic analysis and synchronizes only explicitly allowed,
source-free artifacts. Install Node.js 22.14+ and Git, then install the versioned
package from the official GitHub release (no monorepo build or pnpm required):

```text
npm install --global https://github.com/mathofdynamic/TRACE/releases/download/cli-v0.2.0/mathofdynamic-trace-cli-0.2.0.tgz
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
never sync it as an authoritative committed record. `--with-ai` currently has no
configured real semantic provider.

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

## Period reports (CLI 0.2.0)

CLI 0.2.0 adds verified period engineering reports.

Daily and weekly reports aggregate reachable committed history for one or seven
calendar days ending on `--date` (default today), rather than working-tree edits.
Use `--timezone <IANA zone>` and optional `--github` with an authenticated `gh`
CLI for verified PR/release metadata. Missing data is labelled Not available.
Preview without `--yes`; write or revise the canonical report with `--yes`.
See [Engineering reports](../../DOC/engineering-reports.md) for data coverage,
clean-input publication guards and the dashboard document/provenance contract.


## Release notes — 0.2.0

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
