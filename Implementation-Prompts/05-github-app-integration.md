# Phase 05 — GitHub App Integration

## Role

Act as a senior backend and integrations engineer with security responsibility.

## Objective

Implement the first real external integration: a GitHub App that can be installed on selected repositories, receive and verify webhook events, persist normalized repository state, and queue safe asynchronous jobs.

Do not implement AI review or `.trace` artifact generation in this phase.

## Required reading

Read the standard documents, the technical overview’s GitHub/security sections, all completed phase logs, and the existing database/auth/job code.

Use official GitHub App and webhook documentation as the implementation source of truth.

## 1. GitHub App configuration

Create documentation and configuration helpers for registering separate development and production GitHub Apps.

Initial repository permissions should be the minimum needed for upcoming MVP work:

- Metadata: read-only
- Contents: read-only initially
- Pull requests: read-only initially
- Issues: read-only
- Checks: read/write only if the phase implements a neutral connection check

Do not request administration, workflows, secrets, members, deployments, or write access to contents before required.

If future `.trace` commits need content write access, document that as a later permission upgrade rather than requesting it now.

Subscribe only to required events:

- installation
- installation_repositories
- repository
- pull_request
- push
- issues
- check_run or check_suite only if needed

## 2. Environment and secret handling

Add typed server-only variables for:

- GitHub App ID;
- client ID;
- client secret where user authorization needs it;
- private key;
- webhook secret;
- app slug;
- setup URL and callback values.

Requirements:

- support multiline private keys safely;
- never expose secrets to client bundles;
- redact values from logs and errors;
- update `.env.example` with placeholders only;
- fail startup on malformed configuration.

## 3. Data model

Add migrations for:

- GitHub installations;
- installation accounts;
- installation repositories;
- repository provider identity;
- installation permission snapshot;
- webhook deliveries;
- normalized pull request snapshots;
- normalized issue references;
- repository connection state.

Requirements:

- tenant scope;
- GitHub numeric IDs stored independently from internal IDs;
- uniqueness constraints;
- soft disconnection state without deleting historical records;
- timestamps for permission and sync changes;
- no raw webhook payloads retained indefinitely by default.

## 4. Installation flow

Complete onboarding steps for:

- start GitHub App installation;
- return from setup URL;
- map installation to the authenticated organization/account;
- list repositories granted to the installation;
- select repositories to activate in TRACE;
- handle user cancellation;
- handle installation owned by an organization where the user lacks authority;
- handle installation already linked elsewhere;
- resume interrupted setup.

Clearly distinguish GitHub OAuth login from GitHub App installation.

## 5. Webhook endpoint

Implement a dedicated route handler that:

- reads the raw request body;
- verifies GitHub’s signature before parsing or processing;
- reads delivery ID and event headers;
- rejects unsupported content types;
- enforces body-size limits;
- deduplicates deliveries;
- persists safe delivery metadata;
- enqueues normalized processing;
- returns quickly;
- never runs repository analysis inline.

Do not log payload bodies.

## 6. Webhook normalization

Create typed event adapters that convert GitHub-specific payloads into internal event types.

Examples:

- `InstallationCreated`
- `InstallationRepositoriesChanged`
- `RepositoryConnected`
- `PullRequestOpened`
- `PullRequestUpdated`
- `PullRequestClosed`
- `PullRequestMerged`
- `BranchPushed`
- `IssueUpdated`

Store only the fields required for product behavior and traceability.

Unknown event actions should be ignored safely and logged at a non-error level.

## 7. Background processing

Register pg-boss jobs for:

- installation synchronization;
- repository synchronization;
- pull request snapshot refresh;
- issue metadata refresh;
- webhook replay.

Requirements:

- stable idempotency keys;
- retry policy;
- exponential or bounded backoff;
- dead-letter or failed-job visibility;
- correlation IDs from webhook through worker logs;
- no duplicate repository or PR records after retry.

## 8. GitHub client abstraction

Implement `packages/trace-github` using Octokit.

Expose narrow operations rather than leaking the full client everywhere:

- get installation repositories;
- get repository metadata;
- get pull request;
- list PR commits;
- list changed files;
- fetch compare data;
- get linked issue information when available;
- get check status;
- create installation token internally.

Add request timeouts, rate-limit handling, and safe error mapping.

Do not cache installation access tokens beyond their safe lifetime.

## 9. Repository connection UI

Replace relevant fixtures with real connection state:

- connected repositories;
- installation account;
- permissions;
- last synchronized time;
- connection errors;
- repository selection;
- disconnect action with confirmation.

Product analysis views may remain fixture-driven until later phases, but connection status must be real and clearly separated.

## 10. Disconnect and permission changes

Handle:

- app uninstalled;
- repository access removed;
- permissions reduced;
- installation suspended;
- repository renamed, transferred, archived, or deleted;
- user disconnect from TRACE without uninstalling the GitHub App.

Do not silently delete durable historical TRACE artifacts.

## Security requirements

- signature verification uses constant-time-safe library behavior;
- least privilege;
- no PATs;
- no private key in logs or database plaintext beyond the configured secret store;
- server-side authorization for installation mapping;
- CSRF-safe setup flow;
- replay-resistant state parameter;
- webhook body limit;
- rate limiting;
- tenant isolation tests;
- no repository source stored in the primary database.

## Tests

Add:

- signed webhook fixtures;
- invalid signature tests;
- duplicate delivery tests;
- all supported action normalization tests;
- installation mapping authorization tests;
- job retry/idempotency tests;
- rate-limit and GitHub API error tests;
- disconnect and permission-loss tests;
- Playwright installation flow using mocked GitHub boundaries;
- database tenant-isolation tests.

Never require a real production GitHub App in automated tests.

## Acceptance criteria

- A development GitHub App can be installed on selected repositories.
- Verified webhook events are acknowledged and queued.
- Duplicate deliveries do not duplicate state or jobs.
- Repository and PR snapshots update correctly.
- Authentication and installation remain separate concepts.
- Permission loss is visible in the dashboard.
- No analysis or comments are published yet.
- Secrets and source code are not logged or stored improperly.
- Full quality gate passes.
- Implementation log is updated.

## Completion response

Return:

- required GitHub App permissions/events;
- owner setup steps;
- data model additions;
- normalized event list;
- webhook security validation;
- tests and commands;
- known limits before Phase 06.
