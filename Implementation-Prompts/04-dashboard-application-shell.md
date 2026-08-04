# Phase 04 — Dashboard Application Shell

## Role

Act as a senior product designer and frontend application architect.

## Objective

Build the authenticated TRACE application shell and complete the primary navigation, responsive layout, loading states, empty states, and fixture-driven product views.

This phase establishes how the product feels in daily use. It must not pretend fixture data is connected to GitHub or real analysis.

## Required reading

Read all standard source documents, the design specification, completed phases, and current component library.

## Route structure

Create authenticated routes similar to:

```text
/app
/app/repositories
/app/repositories/[repositoryId]
/app/repositories/[repositoryId]/changes
/app/repositories/[repositoryId]/pull-requests
/app/repositories/[repositoryId]/conflicts
/app/repositories/[repositoryId]/reports
/app/repositories/[repositoryId]/decisions
/app/repositories/[repositoryId]/risks
/app/rules
/app/activity
/app/settings
```

Use route groups and layouts to keep public, auth, onboarding, and application shells separate.

## 1. Desktop application shell

Implement:

- persistent left sidebar;
- organization/project switcher placeholder backed by authenticated account state;
- compact global search/command trigger;
- grouped navigation;
- account and settings entry at the bottom;
- compact top workspace bar;
- breadcrumbs;
- repository context area;
- main content canvas;
- optional right-side contextual drawer.

Use the dimensions and styling direction from the design specification.

## 2. Navigation model

Primary navigation:

- Overview
- Repositories
- Active changes
- Conflicts
- Reports
- Rules

Secondary navigation:

- Activity
- Settings
- Documentation

Repository navigation:

- Summary
- Pull requests
- Changes
- Conflicts
- Reports
- Decisions
- Risks

Selected states must use a restrained surface and small blue cue, not a full bright fill.

## 3. Responsive behavior

### Desktop

- expanded sidebar;
- optional collapse mode;
- multi-column dashboard layouts;
- contextual side panel.

### Tablet

- collapsible sidebar drawer;
- two-column cards where appropriate;
- contextual panel becomes a drawer;
- tables remain usable.

### Mobile

Prioritize:

- report reading;
- conflict review;
- status and findings;
- search;
- simple disposition actions.

Do not force large tables, architecture graphs, or complex rule editors into unusable compressed layouts. Provide intentional mobile alternatives or desktop-required notices.

## 4. Overview page

Use clearly labeled fixture data to create the intended information hierarchy:

1. Needs attention
2. Active changes
3. Open conflicts
4. Latest report
5. Decisions and risk movement
6. Recent activity

Do not lead with vanity counts.

Each fixture surface must display a `Demo data` or development-only indication when running without connected data.

## 5. Repository list

Create a repository table or structured list with:

- repository name;
- provider;
- default branch;
- execution mode;
- last analysis;
- active PR count;
- unresolved conflict count;
- sync state;
- status.

Include:

- search;
- filters;
- sort;
- pagination shell;
- empty state;
- error state;
- loading skeleton;
- mobile row layout.

## 6. Repository summary

Create a repository summary page with:

- repository identity and branch context;
- last successful analysis;
- execution origin;
- current high-priority findings;
- active conflicts;
- latest daily report;
- recent decisions and risks;
- quick links to artifacts;
- connection/setup empty state.

## 7. Pull request view shell

Create the presentation for a future PR intelligence brief:

- intent;
- semantic summary;
- affected components;
- evidence;
- findings by classification;
- requirement linkage;
- conflicts;
- incomplete work;
- recommended action;
- analysis history.

Use fixtures only. Include clear states for:

- analyzing;
- awaiting evidence;
- completed;
- failed;
- cancelled;
- outdated due to new commits.

## 8. Conflict queue shell

Create a data-dense conflict list with:

- involved PRs or changes;
- conflict type;
- affected component;
- severity;
- confidence/classification;
- owner or coordination group;
- status;
- age.

Create a conflict detail panel showing evidence and resolution workflow.

## 9. Report reader

Implement a premium report-reading experience:

- date and time range;
- generation origin;
- review status;
- summary;
- grouped changes;
- decisions;
- risks;
- conflicts;
- incomplete work;
- next actions;
- evidence links;
- raw artifact view.

Markdown must render safely. Do not allow arbitrary embedded scripts or unsafe HTML.

## 10. Decisions and risks shells

Create list and detail views with:

- stable identifier;
- status;
- title;
- affected components;
- owner;
- created/updated dates;
- provenance;
- supersession or resolution;
- linked evidence.

## 11. Command palette

Implement keyboard-first navigation and action discovery.

Commands may include:

- navigate to page;
- open repository;
- find PR, decision, risk, or report fixture;
- open documentation;
- begin connect-repository flow placeholder.

Do not add actions that imply analysis is implemented.

## 12. Global states

Design and implement:

- unauthenticated redirect;
- onboarding required;
- no repositories;
- repository disconnected;
- permission lost;
- service unavailable;
- loading;
- partial data;
- stale analysis;
- no results;
- generic error with trace-safe diagnostics.

## 13. Data boundary

Create typed view models and fixture adapters that can later be replaced by server data.

Do not couple UI components directly to raw database rows or GitHub payloads.

Fixtures must live in a development/test location and must not become production defaults.

## Accessibility

- complete keyboard navigation;
- skip link;
- logical landmark structure;
- focus management for drawers and dialogs;
- screen-reader page announcements;
- accessible table behavior;
- no icon-only critical actions;
- semantic status labels.

## Motion

- subtle sidebar collapse;
- contextual drawer transitions;
- short route-level content transitions only when they do not delay navigation;
- reduced-motion support;
- no animated dashboard background.

## Tests

Add Playwright coverage for:

- desktop and mobile navigation;
- sidebar collapse;
- command palette;
- repository list states;
- PR view states;
- conflict detail drawer;
- report navigation;
- keyboard-only use;
- reduced motion;
- responsive screenshots.

## Acceptance criteria

- Application shell feels like a complete professional control system.
- UI follows TRACE design rather than generic SaaS defaults.
- Data density is useful and not cramped.
- Fixture data is never mistaken for connected product data.
- Every major route has loading, empty, error, and responsive behavior.
- View models can accept future real data without redesign.
- Accessibility and browser tests pass.
- Implementation log is updated.

## Completion response

Provide:

- route and navigation map;
- component and view-model additions;
- screenshots at desktop, tablet, and mobile widths;
- fixture boundaries;
- accessibility results;
- readiness notes for GitHub integration.
