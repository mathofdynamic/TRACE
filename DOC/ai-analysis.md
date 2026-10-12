# AI analysis contract

`trace analyze --with-ai` performs real model-backed review of bounded metadata through the existing OpenAI-compatible provider interface. It does not review source implementation. There is no vendor/model/endpoint default in the CLI, and no implicit fake provider.

Configure `TRACE_AI_PROVIDER=openai-compatible`, `TRACE_AI_BASE_URL`, `TRACE_AI_MODEL`, `TRACE_AI_API_KEY` and `TRACE_AI_DATA_POLICY=metadata-only` in the process environment. The base URL must be HTTPS without URL credentials, query or fragment. Model identifiers use bounded letters/digits and `._:/-`; credential-like names are rejected. Bearer credentials must be 16–4096 printable ASCII characters. Keys must remain outside `.trace`, tracked files, artifacts and logs. No CLI device credential is reused. Configuration examples and installation guidance are in packages/trace-cli/README.md.

The older published CLI 0.2.0 archive predates this fix. Installed help must explicitly describe `TRACE_AI_DATA_POLICY=metadata-only`; the version number alone is not a capability check. Use the reviewed source/candidate or a release containing this contract.

## Two distinct boundaries

Before a call, explicit metadata-only consent is required. The model endpoint receives:

- aggregate change/addition/deletion/production/test/finding counts;
- working-tree state;
- opaque evidence IDs and categories.

It receives no source, patches/diffs, file paths, symbols, commit messages or repository identity. Request authorization carries only the explicit provider credential over HTTPS. Redirects are rejected. Provider retention of this metadata follows the provider's policy; TRACE does not claim control over upstream retention.

TRACE Cloud may receive a schema-validated source-free plain-text summary and safe provenance, alongside the existing deterministic findings. It receives no provider prompts, raw responses, source or credentials. `sourceCodeIncluded=false` and `codeSnippetsIncluded=false` remain transport requirements. Semantic claims must reference supplied evidence IDs and remain inference; metadata-only review cannot establish source-level behavior.

## Provenance and attribution

`analysis.provenance` and artifact check evidence `trace:semantic-analysis:v1` record enabled/disabled status, adapter identity, requested model, endpoint fingerprint, metadata-only input scope, source sent to provider, separate Cloud source/snippet flags, engine/parser versions, and start/completion timestamps. The endpoint fingerprint supports comparison without storing its private URL. Artifacts retain existing branch/HEAD/input evidence. Dirty, stale, transient or unstable input remains non-authoritative under the existing gate.

## Failures and limits

No configuration or invalid configuration returns exit 2. Missing configuration lists required variable names without printing values. Provider auth, unavailable, unsupported model/config, rate limit, timeout, cancellation, size-limit or malformed/unsafe response failures return exit 1 with static actionable codes. No fake fallback, partial semantic artifact, raw provider error or response is emitted. Existing artifacts are preserved on failure.

The CLI makes one attempt. Request and response bytes are each bounded to 64 KiB; a 30-second abort covers the network request and body. The shared provider interface supports bounded transient retries only when explicitly requested. Structured responses reject code/Markdown/HTML/paths/credentials, unexpected structure and citations absent from the supplied evidence. Only the validated value is used; response envelopes/prompts are discarded.

Deterministic analysis stays available without configuration and makes no model call. PR/report/rules and other commands reject `--with-ai` rather than ignoring it or producing fixtures.

## Acceptance

Normal CI uses mocked HTTP/provider-contract tests for valid output, configuration, auth, availability, rate limits, timeout/abort, response bounds, malformed/unsafe output, evidence validation, privacy and attribution. Installed candidate acceptance checks explicit missing-configuration failure and deterministic behavior. These are not live paid-provider acceptance. Live use is opt-in through the explicit configuration above; no paid API calls or provider secrets are required in CI. Fake providers are explicit unit-test fixtures only, never a production fallback.
