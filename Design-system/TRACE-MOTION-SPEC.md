# TRACE Motion Specification

Motion in TRACE is a state-communication system. It makes lifecycle changes legible, gives actions a physical response, and supplies a small amount of signature identity through the Trace Rail. It never compensates for unclear copy or adds ambient decoration.

## 1. Motion principles

1. **State change first.** Every animation answers what changed and where the user should look.
2. **Short and interruptible.** Default motion is 160–240ms; no animation blocks input.
3. **Spatial continuity.** Repository, finding, report, and drawer transitions preserve context.
4. **One emphasis.** A transition may highlight one new state; do not animate every card.
5. **No fake progress.** Show real lifecycle stages, not invented percentages.
6. **Quiet identity.** Trace Rail line movement is the only recurring signature effect.
7. **Respect reduced motion.** Removing motion must not remove feedback, ordering, or status text.

## 2. Timing and easing

| Use | Duration | Easing |
|---|---:|---|
| hover, focus, color, border | 90–130ms | ease-out |
| button press/release | 130–170ms | ease-out / ease-in |
| row selection, tab indicator | 130–180ms | cubic ease-out |
| drawer, switcher, disclosure | 170–220ms | decelerating ease-out |
| page/context transition | 200–280ms | smooth cubic; no bounce |
| multi-step sync transition | 220–320ms per state | linear continuity with eased node emphasis |

Use the existing TRACE direction: no bounce, perpetual pulse, glow, particle field, or spring-heavy motion. A spring is acceptable only for a tactile press or a short drawer settle when it remains within the timing budget.

## 3. Critical feedback motion

### Repository connection

- On connect, the repository row changes from outlined availability to selected/connected in 180ms.
- The Trace Rail GitHub node fills, then the next local-analysis segment becomes available.
- Success copy appears in the same context; do not redirect without a clear completion state.
- Error holds the row in place and reveals an inline explanation; no shake animation.

### Local analysis

- Show a real stage label: **Starting**, **Analyzing**, **Validating record**, **Complete**, or **Failed**.
- The local node in the rail fills only when valid metadata exists.
- On completion, the primary action changes from Analyze to Review sync with a 180ms label/icon transition.
- On failure, retain the last known state and expose retry; do not animate a false success.

### Sync

The sync control becomes a compact stage indicator:

```text
Starting → Negotiating → Uploading approved record → Verifying → Promoting → Complete
```

- Stage text changes in place; the current node gets a single 220ms emphasis.
- Upload byte/count information appears only if real and does not jump layout.
- Verification uses a short line sweep between Dashboard record nodes; it is not a spinner-only state.
- Completion changes the rail to verified and shows a check with a 180ms reveal.
- Failure turns only the affected segment red, leaves the previous verified node intact, and reveals “Review failure” without flashing the entire page.

### Revocation

- Confirm dialog opens with a 180ms fade/slide from the invoking connection row.
- After confirmation, the row transitions to revoked; the revoke action becomes Reconnect.
- Announce the result in a live region. No destructive shake or full-page reload.

### Freshness change

- When trusted GitHub state changes current → behind, the freshness label and rail node transition together in 180–220ms.
- Show a one-time inline notice: “GitHub has newer changes. Analyze again locally.”
- Unknown → current/behind uses the same status transition; no celebratory animation for an inferred state.

## 4. Orientation motion

### App/page transitions

- Keep the existing short route-enter behavior, but use it only for the page content region.
- Preserve the shell and repository context; do not fade the entire application on every navigation.
- Breadcrumb/route title updates crossfade in 160–200ms.

### Repository switching

- Switcher closes, context bar updates, and content crossfades in one coordinated 220ms transition.
- Keep the page shell fixed so users understand that only the project context changed.
- If the destination is unavailable, show the error in the switcher and retain the current project; do not navigate to a blank page.

### Drawers and report details

- Finding detail drawer enters from the inline row direction on desktop and from the bottom/full-height sheet on mobile.
- Backdrop opacity reaches final value in 160ms; content settles in 200ms.
- Report detail uses route transition on desktop and a sheet/stacked route on mobile.
- Focus moves after the visual open completes; focus restoration is required on close.

### Disclosure and filtering

- Finding evidence and Technical details expand their own content height; surrounding rows do not reanimate.
- Use a 180ms height/opacity transition only when content measurement is reliable; reduced motion becomes an immediate layout change.
- Filter changes crossfade the result list or replace rows with skeletons only when a real request is pending.
- Never animate a result into a different order without a clear sort/filter label.

## 5. Trace Rail signature

The Trace Rail appears in the project header, repository row when space permits, and setup completion. It does not appear in every component.

### Sequence

```text
● ━━━━━ ● ━━━━━ ● ━━━━━ ○
```

- A completed node draws its short segment from left to right in 220ms on first render after a real state update.
- The active segment has one 90ms opacity/weight emphasis, then settles.
- A failed segment uses a static red break and a visible error label; no pulsing alarm.
- A current freshness node may use a single 120ms ring settle on the first trusted comparison; no recurring animation.

### Prohibited uses

- No looping progress line while the user is idle.
- No glowing nodes, neon trails, particle effects, or decorative graph motion.
- No rail animation on every route load when state has not changed.

## 6. Micro-interactions

| Element | Hover | Focus | Pressed/loading | Success/error |
|---|---|---|---|---|
| Primary button | subtle lift and brighter upper edge | 2px visible blue ring | lower by 1px; label/icon may show spinner | inline status appears; button stays stable |
| Secondary/ghost | surface tint | high-contrast ring | tint darkens | no layout jump |
| Repository row | background and leading status emphasis | row outline + keyboard hint | selected state persists | state label updates in place |
| Sidebar item | muted surface | visible focus | active indicator remains | no pulse except new attention badge |
| Tab | underline slides 130ms | focus ring | active underline fixed | content transition 180ms |
| Finding row | title/chevron emphasis | row focus and expand hint | drawer pending state | status text updates with live region |
| Report row | surface tint | focus and open hint | open transition | detail header confirms repository/date |
| Filter | selected chip/row state | keyboard focus | menu remains anchored | result count updates |
| Copy action | icon tooltip | label announced | check icon replaces copy for 1.2s | “Copied” live-region message |
| Tooltip | 120ms fade after brief hover | available on focus | never blocks target | disappears on escape |
| Context menu | anchored surface | roving focus | destructive item requires confirmation | menu closes after result |
| Retry | same button identity | focus retained | stage label changes | success/error appears near action |
| Revoke | neutral until intent | destructive control focus | confirmation dialog | row becomes revoked/reconnect |

All touch targets remain at least 44×44px, even when the visual control is compact.

## 7. Loading patterns

- Use skeletons only for unknown content layout, not for known empty states.
- Use a quiet inline spinner plus stage text for short requests.
- For analysis/sync, use the rail and stage list so the user knows what is happening.
- Keep the page title, repository context, and last verified data visible during loading.
- A timeout becomes a recoverable error state; it does not leave an endless spinner.
- When a refresh returns no change, show a stable no-change confirmation instead of re-rendering every row.

## 8. Accessibility and reduced motion

With `prefers-reduced-motion: reduce`:

- Disable route fades, rail drawing, row height transitions, drawer slides, and pulsing indicators.
- Preserve immediate status text, icon changes, focus movement, and live-region announcements.
- Keep stage order visible in the sync progress list.

Motion must not be the only way to identify:

- current vs behind;
- success vs failure;
- selected vs available repository;
- open vs closed detail;
- active vs revoked connection.

## 9. Performance guardrails

- Animate `transform`, `opacity`, and compact border/color changes; avoid layout-wide animated shadows.
- Do not animate long Markdown or hundreds of finding rows at once.
- Cancel stale transitions when the user switches projects again.
- Keep one active progress animation per operation.
- Validate at 390px and keyboard-only paths; an animation that shifts focus or causes overflow is a defect.

## 10. Motion acceptance criteria

1. Sync visibly progresses through real stages and ends in complete or failed without a fake percentage.
2. Repository switching preserves shell/context and gives feedback within 220ms.
3. Finding expansion and report opening preserve focus and return focus on close.
4. Freshness changes communicate current/behind/unknown without relying on color or motion.
5. Reduced-motion mode preserves all meaning with immediate transitions.
6. No route uses perpetual ambient animation, neon glow, bounce, or decorative particles.
