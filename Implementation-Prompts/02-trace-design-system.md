# Phase 02 — TRACE Design System

## Role

Act as a senior product designer and frontend systems engineer. Build the reusable TRACE visual system before page-level feature work.

## Required reading

Read:

- all standard source documents;
- `Design-system/TRACE-DESIGN-SPEC.md` completely;
- existing files in `Design-system/`;
- Phase 01 implementation log and actual code.

Treat the existing Apple reference files as inspiration only. Do not copy proprietary Apple assets, typography, or layouts.

## Objective

Implement a dark-first, Apple-quality, Cloudflare-like operational UI system that is original to TRACE.

The system must be usable across marketing, authentication, dashboard, tables, findings, reports, and settings without drifting into generic SaaS styling.

## Deliverables

### 1. Token architecture

Create shared design tokens for:

- dark surfaces;
- future light surfaces;
- text hierarchy;
- borders;
- primary blue;
- semantic colors;
- spacing;
- radii;
- shadows;
- typography;
- motion durations and easing;
- z-index layers;
- breakpoints.

Requirements:

- source tokens live in one authoritative package or file;
- Tailwind consumes the same tokens;
- CSS custom properties are available at runtime;
- components do not duplicate literal colors;
- dark mode is complete;
- light tokens may be marked experimental but must remain structurally compatible.

### 2. Typography

Use a licensed system-font stack.

Implement:

- display;
- page title;
- section title;
- card title;
- body;
- compact body;
- label;
- micro text;
- tabular numeric style;
- restrained monospace style for identifiers.

Do not bundle SF Pro or other unlicensed Apple fonts.

### 3. Core controls

Implement accessible, typed components in `packages/ui`:

- `Button` with primary, secondary, tertiary, destructive, and icon variants;
- `Input`;
- `Textarea`;
- `Select`;
- `Checkbox`;
- `RadioGroup`;
- `Switch`;
- `SegmentedControl`;
- `SearchField`;
- `DateRangeTrigger` shell;
- `Badge`;
- `StatusDot`;
- `Tooltip`;
- `DropdownMenu`;
- `Popover`;
- `Dialog`;
- `AlertDialog`;
- `Drawer`;
- `Toast`.

Use accessible primitives where useful, but create custom TRACE visuals. Do not paste default shadcn component styling.

### 4. Primary tactile button

Implement the primary button exactly according to the design specification:

- subtle vertical blue gradient;
- fine top inset highlight;
- darker lower inset edge;
- restrained shadow;
- compact radius;
- crisp white text;
- hover, active, focus, disabled, and loading states;
- reduced-motion support.

The button must not look glossy, neon, or heavily skeuomorphic.

Create visual tests or snapshots that protect the layer structure.

### 5. Layout and data components

Implement:

- `Card` and `CardSection`;
- `PageHeader`;
- `MetricCard`;
- `EmptyState`;
- `Skeleton`;
- `DataTable` foundation;
- `Timeline` foundation;
- `Tabs`;
- `Breadcrumbs`;
- `SidebarNavItem`;
- `CommandDialog` foundation;
- `CodeReference`;
- `ReportSurface`;
- `FindingRow`;
- `EvidenceList`;
- `ProvenanceBadge`;
- `ExecutionOriginBadge`;
- `AnalysisProgress`.

These components may use fixture content but must not implement product data fetching.

### 6. State coverage

Every interactive component must include:

- default;
- hover;
- focus-visible;
- active;
- disabled;
- loading where applicable;
- error where applicable;
- reduced-motion behavior.

### 7. Development gallery

Create a development-only component gallery route.

Requirements:

- not indexed;
- unavailable or protected in production;
- shows every component and state;
- includes dark surfaces next to one another to expose contrast errors;
- includes a density test with tables and long labels;
- includes keyboard-navigation notes;
- includes the exact primary button reference.

Do not add Storybook unless there is a concrete reason that outweighs its maintenance cost.

### 8. Icons

Select one consistent open-source icon library.

Create a wrapper that standardizes:

- supported sizes;
- stroke width;
- accessible labels;
- decorative behavior.

Do not mix icon families.

### 9. Motion

Implement shared motion utilities for:

- micro feedback;
- panel appearance;
- drawer/dialog transitions;
- layout continuity;
- reduced motion.

Use CSS transitions by default. Add a motion library only if a required interaction cannot be implemented cleanly without it.

### 10. Accessibility

Meet these requirements:

- WCAG AA contrast;
- keyboard access;
- visible focus rings;
- correct labels and descriptions;
- status not conveyed by color alone;
- screen-reader-safe loading states;
- touch targets appropriate for compact professional UI;
- no critical hover-only content.

### 11. Documentation

Create `packages/ui/README.md` containing:

- component principles;
- token usage;
- composition examples;
- anti-patterns;
- accessibility expectations;
- how to add a component;
- how to review visual fidelity.

Update `IMPLEMENTATION-LOG.md`.

## Visual constraints

Prohibited:

- purple/blue AI gradients;
- neon glow;
- glassmorphism as a base pattern;
- huge radii;
- excessive pills;
- card grids with no hierarchy;
- copying Cloudflare page structure;
- arbitrary Tailwind colors;
- excessive animation;
- large decorative shadows;
- emoji as product iconography.

## Testing

Add:

- unit tests for variant and state behavior;
- accessibility tests for major controls;
- Playwright tests for keyboard navigation and focus;
- visual screenshots for the component gallery at desktop and mobile widths;
- reduced-motion checks.

## Validation commands

Run the full Phase 01 quality gate plus the component gallery browser tests.

## Acceptance criteria

- The primary button matches the intended restrained classic Apple depth.
- The interface looks original, dark, precise, and operational.
- Components are accessible and keyboard usable.
- No component hard-codes independent design values.
- Dense tables and long content remain readable.
- Responsive behavior is demonstrated.
- The gallery exposes every state.
- Production builds do not expose the development gallery unintentionally.
- Documentation and implementation log are updated.

## Completion response

Provide:

- token map;
- component inventory;
- gallery route;
- visual test artifacts;
- accessibility validation;
- deviations from the design spec and reasons.
