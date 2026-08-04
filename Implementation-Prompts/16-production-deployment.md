# Phase 16 — Production Deployment and Pilot Readiness

## Role

Act as the principal production engineer and release owner for TRACE.

## Objective

Prepare, deploy, and verify the TRACE MVP for a controlled pilot with real teams.

The deployment must preserve local/cloud/hybrid boundaries, least-privilege GitHub access, artifact portability, observability, rollback, and honest product claims.

Do not treat deployment success as product-market validation.

## Required reading

Read all completed implementation logs, the release checklist, threat model, data-flow and retention documents, security findings, performance results, current infrastructure, and public product/security copy.

## 1. Deployment architecture

Deploy these independently scalable roles:

- web application and route handlers;
- background worker;
- PostgreSQL;
- object storage if used;
- isolated cloud analysis runner if enabled;
- scheduled jobs;
- telemetry backend;
- secrets/configuration store.

The implementation may use managed services, containers, or a mixed approach, but it must remain documented and reproducible.

Do not introduce Kubernetes unless current measured scale and operational skill justify it.

## 2. Environment separation

Create distinct environments:

- local;
- test/CI;
- staging;
- production.

Requirements:

- separate databases;
- separate GitHub Apps for development/staging/production where practical;
- separate OAuth callbacks;
- separate secrets;
- separate storage prefixes/buckets;
- no production data in preview environments;
- no shared installation private keys;
- clear environment banners outside production.

## 3. Infrastructure as code

Represent production infrastructure using the selected provider’s supported infrastructure-as-code tooling or a portable alternative.

Include:

- services;
- networking;
- database;
- storage;
- worker scaling;
- scheduled jobs;
- secrets references;
- domains/TLS;
- monitoring;
- backups;
- retention;
- access roles.

Do not commit secret values or generated state containing secrets.

## 4. Build and release artifacts

Create reproducible builds for:

- web application;
- worker;
- CLI package;
- container images where used;
- `.trace` schema package;
- specification bundle.

Requirements:

- immutable version identifiers;
- commit SHA in deployment metadata;
- pinned runtime base images;
- non-root containers;
- health checks;
- SBOM and checksums where practical;
- signed release artifacts if the toolchain supports it;
- no development dependencies or source maps exposed unintentionally.

## 5. Database release process

Implement safe migration workflow:

- backup before significant migration;
- migration preview in staging;
- forward-compatible application rollout where possible;
- lock/timeout behavior;
- operator approval for destructive migrations;
- rollback or forward-fix plan;
- migration status visible in release logs.

Never run uncontrolled schema push against production.

## 6. GitHub App production setup

Document and configure:

- final permissions;
- subscribed events;
- webhook URL;
- callback/setup URLs;
- production private key storage;
- webhook secret rotation;
- app branding;
- privacy policy and terms URLs if required;
- installation troubleshooting;
- rate-limit monitoring;
- uninstall/data handling behavior.

Verify that public copy matches the exact permissions requested.

## 7. Domain and edge configuration

Configure:

- production domain;
- TLS;
- redirects;
- HSTS after validation;
- CDN/static caching rules;
- no caching of private authenticated data;
- WAF/rate-limiting rules where available;
- secure headers;
- robots and sitemap;
- status/health endpoint access policy.

Cloudflare may be used for DNS, CDN, WAF, and edge protection, but the visual design does not require Cloudflare hosting.

## 8. Secrets and access

Create an access matrix for:

- production deploy;
- database administration;
- secret management;
- GitHub App management;
- model-provider keys;
- object storage;
- telemetry;
- incident response.

Requirements:

- least privilege;
- MFA for operator accounts;
- no shared personal credentials;
- rotation schedule;
- break-glass process;
- audit trail;
- removal process for departing operators.

## 9. Observability

Production must expose actionable telemetry for:

- request rate/error/latency;
- webhook signature failures and delivery lag;
- queue depth and failed jobs;
- worker resource usage;
- analysis latency/cancellation;
- model provider errors/cost;
- artifact validation and sync failures;
- database saturation;
- authentication failures;
- permission changes;
- cross-tenant authorization denials;
- cloud analysis cleanup failures.

Alerts must be actionable, deduplicated, and linked to runbooks.

Do not alert on normal user mistakes as incidents.

## 10. Runbooks

Create runbooks for:

- web outage;
- database outage;
- queue backlog;
- worker failure;
- GitHub webhook failure;
- GitHub permission or rate-limit issue;
- model provider outage;
- artifact corruption;
- sync divergence spike;
- secret exposure;
- cross-tenant security concern;
- cloud workspace cleanup failure;
- rollback;
- data deletion request.

Each runbook should include detection, immediate containment, diagnosis, recovery, validation, and communication.

## 11. Backups and recovery

Configure and test:

- PostgreSQL automated backups;
- point-in-time recovery where available;
- object-storage versioning/retention where applicable;
- encryption;
- restore into isolated staging;
- documented recovery objectives appropriate to pilot;
- periodic restore verification.

Repository-native `.trace` artifacts reduce lock-in but do not replace operational database backups.

## 12. Feature flags and pilot controls

Create server-side flags for high-risk or costly features:

- cloud source analysis;
- semantic PR findings;
- semantic conflict detection;
- GitHub comment publication;
- content write/commit proposals;
- automatic report schedule;
- hybrid sync;
- organization-level mandatory rules.

Flags must support organization/repository scope and audit changes.

Default uncertain or unproven features to safe states.

## 13. Pilot onboarding

Create an operator-assisted pilot flow for the first teams:

- eligibility and use-case confirmation;
- GitHub installation;
- repository selection;
- execution mode;
- data-flow explanation;
- rule setup;
- model/provider setup;
- first PR analysis;
- first daily report;
- feedback and support channel;
- exit/export process.

Do not onboard regulated enterprise customers under unsupported compliance claims.

## 14. Product analytics

Implement privacy-respecting product metrics for validating demand:

- installation activation;
- repository connected;
- first valid artifact;
- first PR brief;
- first report read;
- evidence opened;
- finding disposition;
- conflict confirmed/rejected/resolved;
- rule created/tested;
- sync enabled;
- retention/churn.

Metrics should be organization/team level by default and must not rank developers.

Provide opt-out/consent behavior consistent with product policy.

## 15. Public documentation and legal readiness

Before public pilot, ensure:

- accurate privacy policy;
- terms/status appropriate to pilot;
- security page matches implementation;
- supported regions/providers documented;
- subprocessors/model-provider handling disclosed where applicable;
- CLI/spec license decided;
- data export and deletion described;
- known limitations published;
- no fabricated testimonials, customer logos, certifications, or performance claims.

Escalate legal questions to qualified counsel rather than inventing terms.

## 16. Staging verification

Run full release checklist in staging with a dedicated test GitHub organization and repositories.

Verify:

- auth;
- installation;
- webhooks;
- jobs;
- PR brief;
- conflict detection;
- reports;
- `.trace` artifact flow;
- local CLI;
- hybrid sync;
- rules;
- permission loss;
- uninstall;
- deletion;
- backup restore;
- rollback;
- observability alerts;
- responsive/accessibility smoke tests.

## 17. Production rollout

Use a controlled rollout:

1. internal repository;
2. private design-partner repository;
3. small pilot cohort;
4. wider invitation only after quality thresholds hold.

Monitor:

- finding rejection;
- report readership;
- confirmed conflict value;
- analysis latency/cost;
- support burden;
- security/privacy incidents;
- installation retention.

Pause rollout when quality or trust falls below documented thresholds.

## 18. Rollback

Provide rollback for:

- web/worker version;
- feature flags;
- GitHub publication;
- model/provider;
- database migration where possible;
- artifact writer version;
- schema reader compatibility.

Rollback must not delete repository artifacts or corrupt historical provenance.

## 19. Final pilot gate

The MVP is pilot-ready only when:

- release checklist passes;
- no unresolved critical/high security issue;
- backup restore succeeds;
- cross-tenant tests pass;
- analysis quality thresholds pass or features are disabled;
- public claims are accurate;
- incident owner exists;
- support path exists;
- data export and deletion work;
- local mode works independently;
- rollback is tested.

## Acceptance criteria

- Staging and production environments are reproducible and separated.
- GitHub App permissions and public explanations match.
- Deployments, migrations, rollback, backups, and alerts are tested.
- High-risk capabilities are feature-flagged.
- Pilot onboarding and exit are documented.
- Product analytics measure value without employee surveillance.
- No certification or privacy claim exceeds implemented behavior.
- First pilot teams can use cloud, local, or hybrid paths safely.
- Implementation log records release version, deployment, and limitations.

## Completion response

Return:

- production architecture diagram;
- environment/provider inventory;
- deployment and rollback results;
- GitHub App permission table;
- security/release gate status;
- active feature flags;
- pilot limitations;
- operator and owner actions;
- exact deployed version and commit SHA.
