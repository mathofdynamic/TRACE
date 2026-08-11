# Phase 01 — Foundation and Monorepo

## Role

Act as a senior platform engineer. Establish a production-quality repository foundation without implementing TRACE product features.

## Required reading

Read all source documents listed in `Implementation-Prompts/README.md`, then read the completed Phase 00 entry in `IMPLEMENTATION-LOG.md`.

## Objective

Initialize the TypeScript monorepo, local infrastructure, shared configuration, database layer, authentication foundation, background worker shell, and test tooling that later phases require.

The repository must remain simple enough for one developer to run locally.

## Required architecture

Use:

- pnpm workspaces;
- Turborepo;
- strict TypeScript;
- Next.js App Router in `apps/web`;
- Node.js worker in `apps/worker`;
- PostgreSQL;
- Drizzle ORM with committed SQL migrations;
- Better Auth foundation;
- pg-boss job infrastructure;
- Tailwind CSS consuming shared design tokens;
- Vitest;
- Playwright;
- Native PostgreSQL for the required Windows local runtime; Docker Compose may be added as an optional convenience but must not be required.

Do not add Redis, a graph database, a vector database, Kafka, or Kubernetes.

## Target repository structure

```text
apps/
├── web/
└── worker/

packages/
├── config/
├── db/
├── env/
├── logger/
├── ui/
├── trace-core/
├── trace-schema/
├── trace-github/
├── trace-analysis/
├── trace-models/
└── trace-rules/

tooling/
├── eslint/
├── typescript/
└── tailwind/
```

Create packages as valid workspace packages even when they initially expose only a documented public entry point and minimal tests. Do not fill them with speculative abstractions.

## Implementation requirements

### 1. Workspace configuration

Create:

- root `package.json`;
- `pnpm-workspace.yaml`;
- `turbo.json`;
- shared TypeScript configurations;
- shared ESLint configuration;
- Prettier configuration;
- EditorConfig;
- Node version declaration;
- package-manager declaration.

Use stable package versions and pin them in `pnpm-lock.yaml`.

### 2. Root scripts

Provide working scripts for:

- `dev`;
- `build`;
- `typecheck`;
- `lint`;
- `format`;
- `format:check`;
- `test`;
- `test:unit`;
- `test:e2e`;
- `db:generate`;
- `db:migrate`;
- `db:studio` if supported without unsafe defaults;
- `worker:dev`;
- `check` that runs the normal local quality gate.

Scripts must call workspace tasks through Turborepo where appropriate.

### 3. Web application

Initialize `apps/web` with:

- App Router;
- strict server/client boundaries;
- root layout;
- global CSS entry;
- health route at `/api/health`;
- placeholder home page that clearly states the application is under construction;
- no finished marketing design yet;
- no mocked dashboard presented as real functionality.

Health output must contain only safe operational data.

### 4. Worker application

Create a Node worker that:

- validates environment variables at startup;
- connects to PostgreSQL;
- initializes pg-boss;
- registers one safe `system.healthcheck` job;
- supports graceful shutdown;
- emits structured logs;
- exposes no public HTTP server unless needed for container health.

Do not create analysis jobs yet.

### 5. Database package

Create `packages/db` with:

- Drizzle connection factory;
- migrations directory;
- initial tables for users, sessions, accounts, organizations, memberships, and system job/audit foundations as required by authentication and later phases;
- tenant-aware IDs;
- timestamps;
- indexes and foreign keys;
- test database helpers.

Do not create the full product data model yet. Add only tables required for foundation and authentication.

Use generated UUIDs or equivalent stable identifiers. Do not expose sequential database IDs in public URLs.

### 6. Authentication foundation

Configure Better Auth server-side with:

- database adapter;
- secure cookie defaults;
- GitHub OAuth provider configuration through environment variables;
- session retrieval helper;
- no login page design yet;
- no GitHub App installation logic yet.

Separate dashboard authentication from GitHub App installation credentials.

### 7. Environment management

Create:

- a typed environment package;
- `.env.example` containing variable names and safe descriptions only;
- separate server-only and public variable validation;
- startup failures for missing required secrets;
- test defaults that do not use production credentials.

Never expose private keys or GitHub secrets to the browser bundle.

### 8. Logging

Create a small structured logger package that supports:

- service name;
- environment;
- request/job correlation ID;
- severity;
- safe error serialization;
- secret redaction.

Do not log request bodies, OAuth tokens, cookies, repository source, or model prompts by default.

### 9. Local infrastructure

Use native PostgreSQL on Windows. Docker is not a required prerequisite for this repository.

Provide:

- `scripts/postgres/install.ps1` to install PostgreSQL through `winget`;
- `scripts/postgres/bootstrap-local.ps1` to initialize an unprivileged project-local cluster when the Windows service cannot be started by the current user;
- `scripts/postgres/health.ps1` for explicit readiness checks;
- `scripts/postgres/migrate.ps1` and `scripts/postgres/reset.ps1` for database lifecycle operations;
- persistent local data under ignored `.trace-cache/postgres-data`;
- non-production credentials clearly marked for local use;
- explicit ports and troubleshooting documentation; no random port mappings.

The standard local example uses `127.0.0.1:3002` to avoid common collisions with web development ports. A privileged PostgreSQL Windows service remains supported when the owner chooses to start it.

### 10. Testing foundation

Configure:

- Vitest workspaces or equivalent monorepo test setup;
- isolated unit tests;
- database integration test support;
- Playwright with a basic home-page smoke test;
- deterministic test environment variables.

Add tests for environment validation, database connection helpers, health route, and worker job registration.

### 11. Documentation

Update:

- root `README.md` with local development instructions while preserving product positioning;
- `CONTRIBUTING.md` with real commands;
- `IMPLEMENTATION-LOG.md`.

Document prerequisites, setup, migrations, development servers, checks, and troubleshooting.

## Design constraints

Only establish token wiring and global reset. Phase 02 owns the full component system.

The placeholder UI must still follow:

- near-black canvas;
- neutral system typography;
- no purple AI gradients;
- no glassmorphism;
- no generic template branding.

## Security constraints

- Validate all environment variables.
- Keep server-only modules out of client imports.
- Use parameterized database access through Drizzle.
- Redact secrets in errors and logs.
- Do not provide insecure default production secrets.
- Do not add a bypass authentication mode outside test-only code.

## Validation commands

Run and record:

```bash
pnpm install
scripts/postgres/bootstrap-local.ps1
scripts/postgres/health.ps1
pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
pnpm build
pnpm test:e2e
```

Also start the worker and verify the healthcheck job completes once.

## Acceptance criteria

- A fresh clone can be started from documented instructions.
- The monorepo builds without circular package dependencies.
- Web and worker processes start independently.
- PostgreSQL migrations run from an empty database.
- Authentication configuration initializes without exposing secrets.
- The health route and worker health job work.
- Unit and browser smoke tests pass.
- No product feature is falsely presented as complete.
- Documentation and implementation log are updated.

## Completion response

Report:

- final workspace structure;
- dependencies selected and why;
- commands run and outcomes;
- migrations created;
- owner actions required for OAuth configuration;
- known limitations for Phase 02.
