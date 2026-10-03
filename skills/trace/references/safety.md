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
