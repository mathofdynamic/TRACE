# Safety invariants

## Privacy boundary: source code stays local

`trace sync --dry-run --json` must show `sourceCodeIncluded: false` and `codeSnippetsIncluded: false`. The manifest schema only accepts literal `false`. If either is `true`, or the request/response is otherwise unexpected: STOP, do not run `trace sync`, report the output.

Do not: upload repository files; embed raw source/fenced code to get around exclusions; set `include_code_snippets: true`; write secrets/tokens/prompts/env values into Markdown artifacts. `trace validate` checks structure only; it does not scan for secrets, so you must not introduce any.

## Sync eligibility gates (all must pass; first failing reason is reported in `excluded`)

1. safe relative path (`.md`, no `..`, no absolute/backslash/encoded traversal) - "unsafe path"
2. `sync_policy.enabled: true` in config - "sync is disabled in .trace/config.yml"
3. type in `sync_policy.allow` - "artifact type is not allowlisted"
4. `execution_origin: local` - "not locally generated"
5. artifact `sync_policy` not `local_only` - "local-only policy"
6. sensitivity not `confidential`/`restricted` - "sensitivity policy"
7. has a `dashboard` projection - "no dashboard projection"
8. no code snippets (config flag, any ``` fence, or 2+ lines starting with import/export/const/let/var/function/class/interface/enum) - "code snippets are disabled"
9. <= 262144 bytes - "artifact exceeds 256 KiB"
10. analysis: current branch/HEAD and verified clean input provenance; historical, dirty and unverified inputs are excluded. The period-report implementation applies this gate to daily/weekly reports too, including legacy reports without verified input.
    Also: symlinks escaping `.trace` - "symlink escapes .trace"; unparsable files are excluded with the parse error.

Whole-sync limits (schema): 64 artifacts, 2,097,152 bytes total. These are enforced when the manifest is built (connected dry-run and real sync); an unconnected dry-run only lists eligibility.

## Credentials

- Never in `.trace`, repo files, logs, chat, or commits. Do not print, copy, or transfer tokens.
- Stored outside the repository: Linux/macOS `~/.config/trace/credentials.json` (or `$XDG_CONFIG_HOME/trace`, mode 0600); Windows `%LOCALAPPDATA%\TRACE\credentials.dpapi`, protected with DPAPI for the current user. `TRACE_CONFIG_HOME` overrides the directory. Do not read these files.
- `.trace/state/dashboard.json` is a non-secret binding (server, repo id, workspace). It is not a credential.
- `trace login` is the only way to obtain a credential; `trace logout` removes it. If a token may be exposed, tell the user to revoke the device in Dashboard Settings.

## Other guards

- Do not switch cloud targets (`TRACE_CLOUD_URL`, `TRACE_ENVIRONMENT`, `--server`) unless instructed. `staging` without a URL fails closed by design.
- Do not use production for tests; use the repo's fixtures/mocks.
- Do not weaken allowlists, exclusions, or validation to make a sync succeed.

## Publication policy (runtime guards and Skill requirements)

```yaml
publication_policy:
  dirty_analysis_sync: false
  clean_worktree_required: true
  fresh_clean_analysis_required: true
  all_eligible_analysis_verified_clean: true
  real_cli_semantic_provider: false
```

Dirty working-tree analysis is local exploratory work only; DO NOT sync it.
Require empty `git status --porcelain`, then re-analyze the clean committed checkout,
validate, and run the sync privacy dry-run. Recheck clean status and matching HEAD
immediately before authorized sync. Even reverted edits can leave a dirty same-HEAD
artifact: never skip clean regeneration merely because recorded HEAD matches.
Do not commit/reset/pull or change ignore policy without task authorization.
The runtime now records analysis input branch, HEAD and clean/dirty state in a
`check` evidence record (`trace:analysis-input:v1`) using the existing schema.
Dirty or unstable analysis is also marked `local_only`, which older clients refuse.
Sync rejects a dirty checkout. Analysis eligibility requires recorded clean input
and matching current branch/HEAD; historical and legacy/unverified analyses stay
local with explicit exclusion reasons. Reverting edits does not repair the saved
input state: regenerate clean analysis. No historical files are deleted.
`--with-ai` currently uses a fixture/no-provider path, not real AI capability;
provenance must not be presented as model-backed intelligence.

The gate applies to every eligible analysis in the dry-run batch, including older
HEADs. Regenerating current HEAD does not rehabilitate older dirty or unverified
records. If any remain eligible, DO NOT sync the batch; report the blocked plan.
Do not delete/edit artifacts or weaken policy to force publication.
