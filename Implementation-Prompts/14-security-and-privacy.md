# Phase 14 — Security and Privacy Hardening

## Role

Act as the security lead for TRACE. Perform architecture review, threat modeling, hardening, and privacy verification across the web app, GitHub App, workers, CLI, `.trace` artifacts, model providers, and hybrid synchronization.

## Objective

Turn the implemented MVP into a defensible security baseline suitable for controlled pilots.

Do not claim certifications. Produce evidence of implemented controls and a clear list of remaining launch blockers.

## Required reading

Read all product/technical/security documents, implementation logs, authentication and GitHub integration, worker sandbox behavior, model abstraction, artifact spec, sync protocol, and rules system.

## 1. Threat model

Create `DOC/security/threat-model.md` using a structured method.

Cover assets:

- source code;
- GitHub installation credentials;
- OAuth sessions;
- model API keys;
- `.trace` artifacts;
- organization rules;
- reports and evidence;
- tenant metadata;
- worker runtime;
- local CLI credentials;
- audit history.

Cover actors:

- anonymous attacker;
- malicious repository contributor;
- compromised user account;
- malicious organization member;
- compromised dependency;
- untrusted model/provider;
- malicious artifact writer;
- cross-tenant attacker;
- leaked CI token.

Cover boundaries:

- browser/web;
- GitHub webhook;
- job queue;
- cloud analysis workspace;
- database;
- object storage;
- model provider;
- local CLI;
- sync API.

Rank risks and document mitigation, owner, status, and residual risk.

## 2. Authentication and sessions

Review and harden:

- OAuth state and redirect validation;
- secure cookies;
- session rotation/revocation;
- CSRF defenses;
- account linking;
- organization membership changes;
- logout and global session revoke;
- privileged-action reauthentication where appropriate;
- rate limiting;
- safe error messages.

Add tests for session fixation, open redirects, CSRF, and authorization bypass.

## 3. Authorization

Create a centralized authorization layer.

Requirements:

- tenant and repository scope on every protected operation;
- role and policy checks server-side;
- object-level authorization;
- denial by default;
- no client-supplied organization trust;
- audit events for privileged changes;
- test matrix for every role.

Use automated tests to attempt cross-tenant access across API, server actions, dashboard loaders, search, sync, and artifact endpoints.

## 4. GitHub security

Verify:

- least-privilege permissions;
- webhook signature validation;
- replay/deduplication;
- body-size limits;
- installation-token lifetime;
- private-key handling;
- fork PR behavior;
- permission-loss handling;
- safe outbound GitHub content;
- no PAT usage;
- rate-limit failure behavior.

Create a documented permission table explaining why each permission is required.

## 5. Prompt injection and untrusted context

Treat all repository and external content as data.

Test attacks in:

- source comments;
- Markdown files;
- PR descriptions;
- issue text;
- commit messages;
- generated `.trace` artifacts;
- rule files;
- dependency metadata.

Controls must include:

- strict system instructions;
- context source labeling;
- tool/path allowlists;
- structured output schemas;
- evidence resolution;
- no model-controlled shell execution;
- no model-controlled network destinations;
- no secret access through analysis context;
- finding verification;
- malicious artifact quarantine.

Document known limits honestly.

## 6. Worker isolation

Review cloud analysis workspace.

Minimum requirements:

- isolated per job/tenant;
- non-root process;
- read-only source where practical;
- temporary filesystem;
- CPU, memory, disk, and time limits;
- restricted network access;
- no Docker socket;
- no host credential mounts;
- cleanup verification;
- cancellation;
- safe archive extraction;
- no project scripts executed by default.

If the current platform cannot provide adequate isolation, mark cloud source analysis as pilot-restricted and require local/hybrid mode until corrected.

## 7. Secret management

Verify:

- secrets stored only in approved environment/secret stores;
- no secrets in Git, database logs, error tracking, artifacts, screenshots, or test snapshots;
- rotation procedure;
- development/prod separation;
- masked admin UI;
- model keys scoped and encrypted where stored;
- CLI keys stored in OS credential storage or documented secure fallback;
- secret scanning in CI and artifact writes.

Rotate any exposed development credential immediately.

## 8. Data inventory and flow

Create `DOC/security/data-flow.md` showing data by mode:

- local;
- cloud;
- hybrid.

For each data category specify:

- source;
- destination;
- purpose;
- retention;
- encryption boundary;
- model exposure;
- user control;
- deletion behavior.

The dashboard must show accurate privacy statements based on actual mode and policy.

## 9. Retention and deletion

Implement configurable retention for:

- webhook metadata;
- temporary source workspaces;
- raw model responses;
- artifact copies;
- logs;
- audit events;
- failed jobs;
- local tokens.

Implement:

- account/org deletion workflow;
- repository disconnect;
- sync data deletion;
- token revoke;
- retention job;
- legal-hold placeholder only if clearly unimplemented.

Do not promise immediate deletion where backups cannot support it; document actual behavior.

## 10. Artifact safety

Harden artifact ingestion/writes against:

- path traversal;
- symlink escape;
- unsafe HTML/Markdown;
- secrets;
- oversized files;
- zip/archive bombs where applicable;
- executable content;
- malformed Unicode;
- formula injection in exports;
- malicious links;
- poisoned memory instructions;
- checksum spoofing.

Add quarantine and human-review state for suspicious artifacts.

## 11. Web security

Add/verify:

- strict Content Security Policy;
- frame-ancestor protection;
- HSTS in production;
- secure referrer policy;
- MIME sniffing protection;
- permissions policy;
- safe CORS;
- request size limits;
- rate limiting;
- output encoding;
- safe Markdown rendering;
- dependency vulnerability checks;
- no source maps exposed unintentionally.

## 12. API and sync security

Review:

- token scope;
- replay resistance;
- idempotency;
- request signing if required;
- rate and size limits;
- schema validation;
- upload content type;
- pagination abuse;
- error leakage;
- audit logging;
- object-level authorization;
- revocation propagation.

## 13. Privacy controls

Implement user-visible controls for:

- source-code processing mode;
- model provider;
- what context is sent;
- sync allowlist;
- artifact sensitivity;
- retention;
- analytics/telemetry opt-in;
- export;
- deletion request;
- local-only status.

Do not use dark patterns.

## 14. Dependency and supply-chain controls

Add:

- lockfile integrity;
- dependency review process;
- automated update policy;
- license awareness;
- package provenance where available;
- minimized install scripts;
- build reproducibility checks;
- container image pinning;
- SBOM generation for releases if practical.

## 15. Security testing

Run and document:

- static analysis;
- dependency vulnerability scan;
- secret scan;
- authorization matrix tests;
- webhook attack tests;
- prompt-injection suite;
- artifact fuzzing;
- API fuzz/property tests where useful;
- browser security header tests;
- container scan;
- manual threat-model walkthrough.

Fix critical/high issues. Document lower residual risks with owner and deadline.

## 16. Security documentation

Update:

- `SECURITY.md` with real reporting contact or explicit owner action;
- threat model;
- data flow;
- permission matrix;
- retention policy;
- incident-response runbook;
- key-rotation runbook;
- pilot security limitations;
- public security page to match reality.

## Acceptance criteria

- Threat model covers all execution modes.
- Cross-tenant access tests fail closed.
- GitHub, auth, sync, and artifact paths are hardened.
- Prompt injection cannot cause tool/path/secret escalation in tests.
- Cloud workspace isolation is verified or cloud analysis is restricted.
- Data flows and retention are documented accurately.
- Security headers and scans pass accepted thresholds.
- No false certification or zero-retention claims remain.
- Critical/high findings are resolved before pilot.
- Implementation log is updated.

## Completion response

Return:

- top risks before and after mitigation;
- security tests and tools run;
- vulnerabilities fixed;
- residual risks;
- pilot restrictions;
- owner actions required;
- confirmation that public claims match implemented controls.
