# TRACE CLI 0.3.0

Install Node.js 22.14+ and Git, then install the standalone GitHub release package:

```text
npm install --global https://github.com/mathofdynamic/TRACE/releases/download/cli-v0.3.0/mathofdynamic-trace-cli-0.3.0.tgz
trace --version
```

On Windows use `npm.cmd` / `trace.cmd` if PowerShell blocks script shims. Verify the archive against the accompanying SHA256SUMS. No npm registry publication is required.

- **Initialization and previews (#65, #66):** commands requiring initialization fail before creating partial `.trace` state. Dry runs are side-effect free; normal initialized writes retain their behavior.
- **PR briefs (#67):** numbered local briefs have validated source-free dashboard projections and synchronize when their repository, clean branch and current HEAD match. Remote PR facts unavailable to the local workflow remain Not available.
- **Rules (#68):** help truthfully advertises only `list`, `effective`, `validate` and `test`; unsupported subcommands return exit 2.
- **Attribution (#69):** historical commit/branch artifacts stay local and are excluded from current sync. Dirty or unstable analysis never becomes authoritative merely by reverting edits.
- **Real AI metadata review (#70):** `trace analyze --with-ai` invokes an explicitly configured real OpenAI-compatible provider. There is no default vendor, model or endpoint and no fake fallback. `TRACE_AI_PROVIDER`, `TRACE_AI_BASE_URL`, `TRACE_AI_MODEL`, `TRACE_AI_API_KEY` and `TRACE_AI_DATA_POLICY=metadata-only` remain environment-only. Missing configuration fails clearly; malformed/unsafe output and provider failures never persist a semantic artifact. CI uses mocked provider contracts, not paid calls.
- **Privacy:** source is not sent to AI. Only aggregate metadata and opaque evidence IDs/kinds reach the configured provider. Source is not uploaded to TRACE Cloud; `sourceCodeIncluded=false` and `codeSnippetsIncluded=false`. Prompts, raw responses and credentials are never synchronized.
- Existing daily/weekly engineering reports, clean/current sync guards and Windows/Linux standalone packaging remain available. Artifact schema and sync protocol remain **0.1**; no migration is required.

CLI 0.2.0 remains a historical period-report release and predates the real AI contract above. Use 0.3.0 for these guarantees.

See [AI configuration and provenance](https://github.com/mathofdynamic/TRACE/blob/cli-v0.3.0/DOC/ai-analysis.md) and the packaged CLI README for operational details.
