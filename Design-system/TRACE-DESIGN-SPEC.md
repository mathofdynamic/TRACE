# TRACE Design Specification

## Purpose

This document defines the visual, interaction, motion, and product-design language for TRACE.

It is the authoritative design reference for the dashboard, product website, authentication flows, reports, settings, and future application surfaces.

The goal is not to copy Apple or Cloudflare. The goal is to create an original TRACE interface with the same level of restraint, precision, hierarchy, and tactile polish.

---

# 1. Design concept

TRACE should feel like:

> **An Apple-designed engineering control system: dark, quiet, exact, data-dense, and minimally tactile.**

The system combines three influences:

1. **Modern Apple restraint**
   - strong hierarchy;
   - disciplined whitespace;
   - neutral typography;
   - very little decoration;
   - polished details that are noticed through use rather than display.

2. **Cloudflare’s modern operational clarity**
   - persistent navigation;
   - dense but controlled information;
   - near-black layered surfaces;
   - subtle borders;
   - practical cards, charts, lists, and command controls;
   - clear separation between global navigation and workspace content.

3. **A restrained classic Apple tactile quality**
   - subtle gradients on primary controls;
   - a fine top highlight;
   - minimal lower-edge depth;
   - physical feedback without skeuomorphic decoration.

TRACE must not look like a generic AI startup, a template marketplace dashboard, or a neon developer tool.

---

# 2. Product personality

The interface should communicate:

- precision;
- trust;
- calm control;
- technical authority;
- privacy;
- clarity under complexity;
- premium craftsmanship.

The interface should not communicate:

- playfulness;
- trend chasing;
- artificial futurism;
- surveillance;
- excessive automation;
- visual noise;
- decorative complexity.

TRACE handles high-stakes engineering information. The design must make uncertain findings, evidence, decisions, and risk easy to distinguish.

---

# 3. Core visual principles

## 3.1 Structure before decoration

Hierarchy must come from:

- layout;
- spacing;
- typography;
- contrast;
- alignment;
- borders;
- content grouping.

Do not use gradients, shadows, glows, or illustrations to compensate for weak structure.

## 3.2 Dark-first, not black-everywhere

The product is dark-first, but the interface must use layered near-black and charcoal surfaces. Pure black should be reserved for selected backgrounds or visual depth, not every component.

## 3.3 One controlled accent

Blue is the primary accent.

Use it for:

- primary actions;
- active navigation;
- selected data;
- focus states;
- key links;
- important chart series;
- controlled informational emphasis.

Do not use blue as a general decoration or background wash.

## 3.4 Information density with breathing room

TRACE is a professional tool. It should display meaningful information without oversized empty panels.

Density should come from efficient composition, not cramped text.

## 3.5 Tactility only where interaction benefits

Buttons, segmented controls, toggles, and compact command elements may use slight depth.

Large surfaces, cards, tables, and navigation should remain mostly flat.

## 3.6 Evidence must look stronger than inference

Verified facts, deterministic findings, model interpretations, and uncertain hypotheses must have visibly different treatments.

The visual system must not make speculative AI output look authoritative.

---

# 4. Color system

The following values define the intended relationships. Minor implementation adjustments are allowed only when contrast testing or rendering behavior requires them.

## 4.1 Core dark surfaces

```text
Canvas              #080809
Sidebar             #0B0B0C
Top bar             #0A0A0B
Surface 1           #111112
Surface 2           #151516
Surface 3           #1A1A1C
Elevated control    #1E1E20
Hover surface       #202023
Selected surface    #242428
```

The difference between adjacent surfaces should be subtle but visible on calibrated displays.

## 4.2 Borders and separators

```text
Border subtle       rgba(255,255,255,0.075)
Border default      rgba(255,255,255,0.11)
Border strong       rgba(255,255,255,0.17)
Inset highlight     rgba(255,255,255,0.08)
Dark edge           rgba(0,0,0,0.72)
```

Use one-pixel borders. Avoid thick outlines.

## 4.3 Text

```text
Text primary        #F5F5F7
Text secondary      #B7B7BC
Text tertiary       #8B8B92
Text muted          #66666D
Text disabled       #4B4B51
Text inverse        #FFFFFF
```

Primary text should rarely be pure white across large areas. `#F5F5F7` gives a softer Apple-like result.

## 4.4 Primary blue

```text
Blue bright         #1688FF
Blue primary        #087CF0
Blue deep           #0068D7
Blue dark edge      #0057B8
Blue soft surface   rgba(10,126,255,0.12)
Blue focus ring     rgba(10,132,255,0.42)
```

Blue must remain saturated enough to feel decisive against dark surfaces, but not neon.

## 4.5 Semantic colors

```text
Success             #32D17D
Warning             #F5B942
Danger              #FF5A5F
Info                 #58A6FF
Neutral              #8B8B92
```

Semantic colors should appear in small, meaningful areas:

- status dots;
- compact badges;
- chart points;
- icons;
- left-edge indicators;
- restrained text.

Avoid filling large cards with semantic colors.

## 4.6 Light mode

The MVP may remain dark-first, but all component APIs must avoid hard-coding assumptions that make a future light theme impossible.

A light mode should use warm neutral whites, thin gray borders, black text, and the same restrained blue—not a separate visual identity.

---

# 5. Typography

## 5.1 Typeface direction

Use Kunst Grotesk throughout the interface. Load the webfont from the public
project-provided WOFF2 URLs:

```text
Kunst Grotesk Regular (400)
Kunst Grotesk Medium (500)
```

Do not introduce system-font fallbacks or additional bundled typefaces. Kunst
Grotesk is also used for:

- commit hashes;
- file paths;
- identifiers;
- code symbols;
- structured values.

These technical values must not dominate the interface.

## 5.2 Scale

```text
Display             40–52px / 1.05–1.12
Page title          28–34px / 1.15
Section title       20–24px / 1.25
Card title          15–17px / 1.35
Body                14–15px / 1.5
Compact body        13px / 1.45
Label               12px / 1.3
Micro               11px / 1.25
```

The dashboard should use the compact end of the scale. The marketing website may use the larger end.

## 5.3 Weight

Use weight changes sparingly:

- 400 for body;
- 500 for labels and navigation;
- 600 for titles and important values;
- 700 only for rare display emphasis.

Avoid bold paragraphs.

## 5.4 Numeric content

Use tabular numerals for:

- counts;
- timestamps;
- durations;
- risk scores;
- metrics;
- chart labels.

## 5.5 Text behavior

- Keep line lengths controlled.
- Use sentence case, not title case everywhere.
- Avoid all caps except short technical labels.
- Never truncate critical risk, decision, or evidence text without an expansion path.
- Use calm, factual language.

---

# 6. Spacing system

Use a four-pixel base grid.

```text
2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
```

Primary rules:

- 8px for compact internal gaps;
- 12px for control groups;
- 16px for standard card padding in dense views;
- 20–24px for comfortable card padding;
- 24–32px between major sections;
- 40–64px for marketing composition.

Whitespace must appear intentional. Do not use arbitrary spacing values.

---

# 7. Radius system

TRACE should not make every element a pill.

```text
Small control       6px
Standard control    8px
Card                10px
Large panel         12px
Modal                14px
Pill                 999px only when semantically appropriate
```

Use pills for:

- status chips;
- filters;
- compact segmented controls;
- small identity badges.

Do not use pills for ordinary buttons, cards, table rows, or large navigation items.

---

# 8. Shadows and depth

Depth should be subtle and rare.

## 8.1 Cards

Cards should rely mainly on surface difference and a hairline border.

Example direction:

```text
0 1px 0 rgba(255,255,255,0.025) inset
0 1px 2px rgba(0,0,0,0.20)
```

## 8.2 Elevated popovers

```text
0 18px 50px rgba(0,0,0,0.45)
0 0 0 1px rgba(255,255,255,0.10)
0 1px 0 rgba(255,255,255,0.06) inset
```

## 8.3 Forbidden depth treatments

- large blurred shadows on every card;
- colored glows;
- blue ambient halos;
- glass panels floating over gradients;
- deep three-dimensional neumorphism.

---

# 9. Primary button specification

The primary button is the clearest expression of TRACE’s restrained classic Apple influence.

It should feel slightly tactile without becoming glossy or retro.

## 9.1 Construction

The visual layers should be:

1. fine top inset highlight;
2. very subtle bright-to-deep blue vertical gradient;
3. controlled blue border;
4. small lower dark edge;
5. restrained outer shadow;
6. crisp white text and icon.

## 9.2 Reference values

```css
background:
  linear-gradient(
    180deg,
    #1688ff 0%,
    #087cf0 48%,
    #0068d7 100%
  );

border: 1px solid #005fca;
border-radius: 8px;
color: #ffffff;
box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.28),
  inset 0 -1px 0 rgba(0, 40, 100, 0.34),
  0 1px 1px rgba(0, 0, 0, 0.35),
  0 4px 12px rgba(0, 70, 180, 0.18);
```

The gradient and highlight must remain subtle at normal viewing size.

## 9.3 Interaction states

### Hover

- raise brightness slightly;
- increase top highlight slightly;
- move no more than one pixel upward;
- keep shadow restrained.

### Active

- remove upward translation;
- darken gradient;
- reduce outer shadow;
- use a slightly stronger internal lower edge;
- optional one-pixel downward compression.

### Focus

- visible blue focus ring outside the control;
- never rely on color change alone.

### Disabled

- remove strong depth;
- lower contrast;
- preserve label readability;
- no hover motion.

## 9.4 Button sizing

```text
Small               30–32px height
Default             36px height
Large               42–44px height
Horizontal padding  12–18px
Icon gap            6–8px
```

Primary product buttons should remain compact. Marketing CTAs may use the large size.

---

# 10. Secondary and tertiary buttons

## 10.1 Secondary

- dark raised surface;
- one-pixel neutral border;
- small top inset highlight;
- no colored glow;
- white or secondary text.

## 10.2 Tertiary

- flat or nearly flat;
- transparent background;
- hover surface only;
- used for low-priority actions.

## 10.3 Destructive

Destructive actions should not use a permanently saturated red button unless the action is immediate and irreversible.

Prefer a neutral button with a red label until the final confirmation step.

---

# 11. Application shell

## 11.1 Desktop structure

The default application shell should use:

- persistent left sidebar;
- compact top workspace bar;
- primary content canvas;
- optional contextual right panel;
- responsive command/search entry.

Suggested dimensions:

```text
Sidebar expanded    240–264px
Sidebar collapsed   64–72px
Top bar              52–60px
Content max width   1440–1600px where appropriate
```

Full-width tables and graphs may exceed the normal content column.

## 11.2 Sidebar

The sidebar should include:

- organization/project switcher;
- command search;
- primary navigation;
- grouped secondary navigation;
- account/settings area at the bottom.

Characteristics:

- slightly different surface from canvas;
- right-side one-pixel separator;
- compact navigation rows;
- restrained selected state;
- no oversized icons;
- no decorative gradients.

Selected navigation should use:

- a lighter surface;
- brighter text;
- optional small blue indicator;
- no full blue background.

## 11.3 Top bar

The top bar contains context and actions, not decoration.

Possible content:

- breadcrumbs;
- repository/branch context;
- date or report range;
- sync status;
- compact primary action;
- account or help controls.

---

# 12. Page composition

## 12.1 Page header

A page header should contain:

- concise title;
- one-sentence explanation only when needed;
- key scope or time range;
- one primary action;
- limited secondary actions.

Do not create oversized hero sections inside the application.

## 12.2 Summary region

Use compact metric cards only when the metric affects a decision.

Avoid vanity counters.

## 12.3 Main content

Prefer clear sections:

- attention required;
- active changes;
- conflicts;
- reports;
- decisions and risks;
- evidence and history.

Important information should appear before general activity.

---

# 13. Cards and panels

## 13.1 Default card

- `Surface 1` or `Surface 2`;
- subtle border;
- 10px radius;
- 16–20px padding;
- minimal shadow;
- aligned title and actions;
- no decorative header gradient.

## 13.2 Interactive card

Hover should use:

- one-level lighter surface;
- slightly stronger border;
- optional one-pixel translation;
- no large elevation change.

## 13.3 Attention card

Use a small semantic indicator:

- left border;
- icon;
- status badge;
- highlighted title.

Do not tint the entire card heavily.

## 13.4 Empty state

Empty states should be restrained and useful:

- simple monochrome icon or diagram;
- one clear sentence;
- one next action;
- no cartoon illustrations.

---

# 14. Tables and dense data

Tables are a primary TRACE interface, not a secondary component.

Requirements:

- sticky headers where useful;
- compact but readable row height;
- clear column alignment;
- tabular numeric values;
- subtle row separators;
- hover state without zebra-striping by default;
- sortable and filterable columns;
- keyboard-accessible row actions;
- responsive fallback for narrow screens.

Avoid:

- excessive borders around every cell;
- large row padding;
- many colored badges in one row;
- hiding critical evidence inside unlabeled icon buttons.

---

# 15. Lists and timelines

Change history, decisions, risks, and analysis runs should use structured lists or timelines.

A timeline item may include:

- timestamp;
- event type;
- concise title;
- actor or execution origin;
- status;
- evidence count;
- expandable details.

The timeline line and dots must remain subtle. Content is primary.

---

# 16. Findings, evidence, and confidence

## 16.1 Finding hierarchy

Findings should display:

- severity;
- classification;
- concise title;
- explanation;
- affected surface;
- evidence;
- recommended action;
- disposition controls.

## 16.2 Classification treatments

### Deterministic

- neutral or green verified indicator;
- label: `Verified rule` or equivalent;
- strongest evidence styling.

### Correlated

- blue informational indicator;
- label showing connected evidence.

### Semantic

- restrained violet-blue or neutral AI indicator;
- clearly labeled as interpretation;
- evidence visible nearby.

### Uncertain

- warning-neutral treatment;
- explicit uncertainty language;
- no red critical styling unless deterministic evidence supports severity.

## 16.3 Evidence drawer

Evidence should open in a structured drawer or side panel showing:

- source type;
- repository location;
- commit/PR/issue link;
- freshness;
- excerpt when safe;
- reason it was selected;
- deterministic or inferred relationship.

---

# 17. Forms and inputs

## 17.1 Input style

- dark inset surface;
- subtle border;
- small top internal shadow;
- 8px radius;
- clear placeholder contrast;
- blue focus ring;
- compact height.

## 17.2 Validation

Errors should appear next to the field with a clear correction path.

Do not show only a red border.

## 17.3 Long rule editing

Rule and configuration editors should use:

- split view where helpful;
- syntax highlighting;
- validation status;
- preview of affected repositories or components;
- change history;
- safe test mode.

---

# 18. Search and command interface

TRACE should provide a command/search surface inspired by high-quality system launchers.

It may support:

- search reports;
- open repository;
- inspect PR;
- find decision or risk;
- run analysis;
- navigate settings;
- filter by component or owner.

Design:

- compact global trigger;
- large centered command panel when opened;
- grouped results;
- strong keyboard navigation;
- clear shortcuts;
- subtle selection surface;
- no excessive blur.

---

# 19. Charts and data visualization

Charts should answer a specific question.

Use:

- thin lines;
- subtle grid lines;
- restrained axis labels;
- one blue primary series;
- neutral comparison series;
- semantic color only where meaningful;
- clear tooltips;
- direct labels when possible.

Avoid:

- gradients under every line;
- rainbow palettes;
- three-dimensional charts;
- decorative animations;
- charts for simple values that could be text.

All chart colors must remain distinguishable without relying only on hue.

---

# 20. Motion system

Motion should explain state and preserve context.

## 20.1 Durations

```text
Micro feedback      90–130ms
Controls             130–170ms
Panels               170–220ms
Page transition      200–280ms
Complex layout       240–320ms maximum
```

## 20.2 Easing

Use restrained ease-out curves for entrances and standard ease-in-out for state changes.

Avoid exaggerated springs.

## 20.3 Approved motion

- opacity transition;
- one-to-four-pixel translation;
- slight scale between 0.98 and 1;
- height/width interpolation where context benefits;
- shared-element continuity;
- loading progress;
- chart drawing only when it improves comprehension.

## 20.4 Forbidden motion

- bouncing;
- floating idle objects;
- pulsing neon glows;
- large parallax inside the application;
- rotating decorative gradients;
- long cinematic transitions;
- repeated animation on ordinary navigation.

## 20.5 Reduced motion

Every animation must respect reduced-motion preferences.

Under reduced motion:

- remove translation and scale;
- keep short opacity transitions where useful;
- disable chart-drawing animation;
- preserve instant state clarity.

---

# 21. Loading and progress

Analysis can take time. Loading states must communicate useful progress without fabricating certainty.

Use explicit stages such as:

- collecting changes;
- mapping affected components;
- running rules;
- analyzing intent;
- validating findings;
- generating artifacts.

Use skeletons for content layout and progress indicators for known workflows.

Do not use a generic spinner for long-running analysis without status text.

---

# 22. Responsive behavior

## 22.1 Desktop

Primary experience. Preserve density and multi-panel workflows.

## 22.2 Tablet

- collapsible sidebar;
- contextual panels become drawers;
- cards may move from four to two columns;
- tables retain horizontal scroll or switch to structured rows.

## 22.3 Mobile

Mobile is for monitoring and light action, not full repository administration.

Prioritize:

- report reading;
- alert review;
- finding disposition;
- simple search;
- status checks.

Complex rule editing, large diff views, and graph inspection may present a clear desktop-required state rather than a broken mobile experience.

---

# 23. Accessibility

Minimum requirements:

- WCAG AA contrast for text and controls;
- complete keyboard navigation;
- visible focus states;
- semantic HTML;
- accessible names for icon buttons;
- status conveyed by text and icon, not color alone;
- reduced-motion support;
- logical heading structure;
- table headers and scope;
- screen-reader announcements for job completion and errors;
- minimum practical touch target size;
- no hidden critical information available only on hover.

Accessibility is part of visual quality, not a final compliance pass.

---

# 24. Iconography

Use a consistent, restrained outline icon set.

Characteristics:

- 1.5–2px optical stroke;
- compact geometry;
- rounded joins where appropriate;
- no filled multicolor illustrations;
- consistent 16px, 18px, and 20px sizes.

Icons support labels; they do not replace labels for unfamiliar actions.

---

# 25. Marketing website direction

The public website should share the product’s visual identity but use more space and stronger narrative composition.

## 25.1 Hero

- near-black background;
- precise large headline;
- limited supporting copy;
- one primary and one secondary action;
- original product visualization;
- no floating AI or code clichés.

## 25.2 Product visualization

Use real TRACE concepts:

- active change graph;
- conflict brief;
- daily report;
- `.trace` artifact flow;
- local/cloud/hybrid modes;
- evidence panel.

## 25.3 Background treatment

Mostly solid near-black.

Optional detail:

- extremely subtle radial light;
- one faint technical grid or line structure;
- no visible gradient spectacle.

---

# 26. Product copy style

Copy should be:

- direct;
- factual;
- calm;
- specific;
- brief;
- free of exaggerated AI claims.

Avoid:

- “revolutionary”;
- “10x developer”;
- “magic”;
- “supercharge everything”;
- anthropomorphizing TRACE as an infallible engineer;
- surveillance language.

Prefer:

- “Evidence found”;
- “Needs review”;
- “Possible conflict”;
- “Verified by rule”;
- “Generated locally”;
- “Source code not synchronized”;
- “Decision superseded”;
- “Missing context.”

---

# 27. Anti-patterns

The following are prohibited unless a documented exception is approved:

- generic Tailwind SaaS template appearance;
- glassmorphism across primary layout;
- excessive backdrop blur;
- neon blue glow;
- gradient borders around cards;
- purple-to-blue AI gradients;
- every control as a pill;
- giant dashboard numbers without context;
- excessive cards inside cards;
- large empty dashboard areas;
- decorative 3D objects;
- overuse of monospace;
- hidden actions behind many unlabeled icons;
- animated noise backgrounds;
- shallow “AI sparkle” branding;
- copying Apple or Cloudflare layouts directly.

---

# 28. Initial component inventory

The shared design system should include:

## Foundations

- color tokens;
- type scale;
- spacing;
- radii;
- shadows;
- motion tokens;
- breakpoints;
- z-index layers.

## Controls

- primary button;
- secondary button;
- tertiary button;
- icon button;
- destructive action;
- input;
- textarea;
- select;
- checkbox;
- radio;
- switch;
- segmented control;
- date range control;
- search field.

## Navigation

- application sidebar;
- organization switcher;
- breadcrumb;
- tabs;
- command palette;
- mobile navigation.

## Data display

- card;
- metric card;
- table;
- status badge;
- finding row;
- evidence list;
- timeline;
- activity item;
- report reader;
- code reference;
- chart container;
- empty state;
- skeleton.

## Overlays

- dialog;
- alert dialog;
- drawer;
- popover;
- dropdown menu;
- tooltip;
- toast.

## TRACE-specific

- conflict brief;
- PR intelligence summary;
- provenance badge;
- execution-origin badge;
- evidence drawer;
- rule result;
- decision record;
- risk record;
- artifact status;
- sync status;
- analysis progress.

---

# 29. Design review checklist

A page is not complete until all answers are satisfactory.

## Hierarchy

- Is the most important action obvious?
- Is attention directed by layout rather than decoration?
- Can a user understand the page in five seconds?

## Density

- Does the page provide enough useful information?
- Are cards being used only when grouping is necessary?
- Is any large area visually attractive but functionally empty?

## Visual fidelity

- Are surfaces subtly layered?
- Are borders and shadows restrained?
- Is blue used selectively?
- Does the primary button retain its tactile quality without looking glossy?

## Trust

- Are deterministic facts and AI interpretations visually distinct?
- Is evidence accessible?
- Is uncertainty explicit?

## Interaction

- Are hover, focus, active, loading, empty, error, disabled, and success states designed?
- Is keyboard behavior complete?
- Does motion preserve context?

## Responsiveness

- Does the page remain coherent at desktop, tablet, and mobile widths?
- Are dense elements intentionally adapted rather than merely compressed?

## Accessibility

- Is contrast sufficient?
- Are focus states visible?
- Are labels and status meanings available without color?
- Is reduced motion supported?

## Originality

- Does the result feel like TRACE rather than an Apple, Cloudflare, Linear, Vercel, or generic dashboard clone?

---

# 30. Final visual definition

TRACE should look and behave like a tool designed for continuous professional use:

- dark and quiet;
- exact but not sterile;
- dense but not cramped;
- premium but not decorative;
- tactile only where touch matters;
- original while informed by exceptional product design.

The interface should make complex software change easier to understand without competing with the information it presents.
