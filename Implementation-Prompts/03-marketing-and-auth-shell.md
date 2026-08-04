# Phase 03 — Marketing Website and Authentication Shell

## Role

Act as a senior product designer, conversion-focused product writer, and frontend engineer.

## Objective

Build the first public-facing TRACE experience and complete the product authentication flow without implementing GitHub App installation or dashboard data features.

The result must establish a credible brand, explain TRACE accurately, and lead authenticated users into a controlled onboarding state.

## Required reading

Read the standard source documents, the full design specification, the completed Phase 01–02 implementation log, and the current UI package.

## Information architecture

Create these public routes:

```text
/
/product
/security
/specification
/pricing
/docs
/sign-in
/sign-up
/auth/error
/onboarding
```

The docs route may be an intentional early placeholder with real links to repository documents. Do not invent product documentation for unimplemented features.

## 1. Global public shell

Implement:

- compact header;
- TRACE wordmark and original symbol treatment;
- product, security, specification, pricing, and docs navigation;
- sign-in action;
- primary CTA;
- responsive navigation drawer;
- restrained footer.

The header should feel precise and minimal, not like a generic startup navbar.

## 2. Home page

The home page must communicate the product in this order:

### Hero

Primary statement:

> Git is the history of code. TRACE is the history of understanding.

Supporting copy should explain that TRACE connects intent, changes, decisions, risks, and active-work conflicts while preserving portable knowledge inside `.trace`.

Actions:

- primary: start with TRACE;
- secondary: explore `.trace`.

Create an original product visualization showing a change moving through:

```text
Goal → Pull request → Evidence → Conflict/decision → .trace artifact
```

Do not use a fake terminal animation or decorative AI particles.

### Problem section

Explain the downstream bottleneck caused by increasing human and agent-generated changes:

- more changes;
- fixed review capacity;
- lost intent;
- parallel conflicts;
- ephemeral project knowledge.

### Product capabilities

Present a small number of outcome-led capabilities:

- understand what changed and why;
- detect conflicts across active work;
- preserve decisions and risks;
- run cloud, local, or hybrid;
- produce evidence-backed reports.

### `.trace` section

Show a concise, readable directory example and explain portability.

### Execution modes

Explain Cloud, Local Skill, and Hybrid clearly, emphasizing user control.

### Trust section

Explain:

- evidence-backed findings;
- visible uncertainty;
- no individual productivity scoring;
- local mode without required source upload.

### Final CTA

Keep it simple and credible.

## 3. Product page

Provide a deeper nontechnical explanation using the project overview as the source of truth.

Include:

- PR intelligence;
- daily reports;
- concurrent-change conflicts;
- decisions, risks, and incomplete work;
- manager/team/developer outputs;
- dashboard as viewer, not sole data owner.

Do not promise unimplemented integrations or performance numbers.

## 4. Security page

Create a clear security and privacy page that distinguishes:

- current architecture commitments;
- planned certifications or enterprise capabilities;
- local mode;
- cloud mode;
- hybrid sync;
- secrets exclusions;
- model-provider boundaries;
- responsible disclosure link.

Never claim SOC 2, GDPR certification, zero retention, encryption properties, or compliance status unless implemented and verified. Use language such as “designed to support” or “planned” when appropriate.

## 5. Specification page

Explain the proposed open `.trace` standard:

- purpose;
- relationship to Git, `AGENTS.md`, and ADRs;
- human-readable and machine-readable artifacts;
- local/cloud compatibility;
- open direction;
- current experimental status.

Link to the repository and relevant documentation.

## 6. Pricing page

The product is pre-launch. Do not publish fabricated final prices.

Create a clear early-stage pricing model presentation:

- Local/Community: free or planned free core;
- Team Cloud: contact/waitlist or transparent “pricing under validation”;
- Enterprise/Private: contact.

Explain the expected value of each tier without creating unavailable purchase flows.

## 7. Authentication

Complete Better Auth integration for:

- GitHub OAuth sign-in;
- session persistence;
- sign-out;
- protected routes;
- callback errors;
- safe redirect validation;
- account creation on first sign-in.

Requirements:

- no password authentication unless explicitly needed;
- no fake email flow;
- no auth bypass outside tests;
- rate-limit relevant auth endpoints if supported by the selected architecture;
- protect server-side routes, not only client navigation.

## 8. Authentication UI

Create sign-in and sign-up pages using the TRACE design system.

The pages should include:

- concise product context;
- GitHub sign-in button;
- privacy statement;
- clear error state;
- loading state;
- keyboard and screen-reader support.

Avoid large marketing illustrations on auth pages.

## 9. Onboarding shell

After authentication, route new users to `/onboarding`.

This phase implements only:

- welcome step;
- intended usage selection: individual, team, organization;
- preferred execution mode: cloud, local, hybrid, undecided;
- acknowledgement that GitHub App connection comes next;
- save/resume onboarding state.

Do not implement GitHub App installation yet.

## 10. Metadata and quality

Add:

- accurate page metadata;
- Open Graph assets created from original TRACE visuals;
- sitemap and robots behavior;
- semantic headings;
- structured page layouts;
- no-index behavior for auth and onboarding routes;
- fast image loading and no layout shift.

## Responsive requirements

### Desktop

- generous marketing spacing;
- controlled content width;
- product visualization remains crisp and information-rich.

### Tablet

- preserve hierarchy;
- stack complex diagrams intentionally;
- avoid tiny text in screenshots.

### Mobile

- concise copy;
- no horizontal overflow;
- navigation drawer;
- product visualization becomes a vertical flow;
- CTA controls remain reachable and not oversized.

## Motion

Use subtle reveal and state transitions only.

No parallax, floating cards, animated gradients, or autoplay product tours.

## Tests

Add tests for:

- public navigation;
- protected route behavior;
- OAuth initiation;
- safe callback errors;
- onboarding persistence;
- responsive navigation;
- keyboard access;
- metadata and no-index rules;
- no misleading claims in critical security copy through targeted content assertions.

## Acceptance criteria

- The public site clearly differentiates TRACE from an AI comment bot.
- The style matches the design specification.
- Copy does not overstate product maturity.
- Authentication is server-enforced and secure.
- New users reach a resumable onboarding shell.
- The site works at desktop, tablet, and mobile widths.
- Public pages are fast, accessible, and original.
- Implementation log is updated.

## Completion response

Return:

- route map;
- final core messaging;
- authentication flow;
- onboarding state model;
- screenshots at three breakpoints;
- tests and validation results;
- claims deliberately withheld because they are not yet implemented.
