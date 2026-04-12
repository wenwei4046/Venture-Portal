# Motion Vocabulary — Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Branch:** main
**Effort:** S (small) — ~370 lines changed, 2 new files, 0 new dependencies

## Goal

Extend the existing motion vocabulary (b9a5bad) to cover 7 additional micro-interaction
points across the portal. Every daily-use interaction (list loading, form errors, modal
opens, tab switches, status changes, overdue alerts, input focus) gets a consistent,
restrained motion treatment that matches the "warm research journal" aesthetic.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Direction | A — Coverage completion | Uniform touch across all interaction points, not signature moments |
| Scope | 7 motions (count-up cancelled) | All 8 candidates minus money count-up |
| Implementation | Hand-rolled CSS + 1 client component | 0 deps, +0.8kb bundle, consistent with b9a5bad |
| Reduced-motion | B — Graded fallback | Decorative motions fully disabled; functional motions get color-only equivalents |

## Motion Vocabulary

### 01. Table Row Stagger

- **Type:** Decorative
- **Duration:** 280ms per row
- **Stagger:** 50ms between rows
- **Easing:** ease-out
- **Transform:** opacity 0→1, translateY 4px→0
- **Trigger:** List mount (each route entry)
- **Where:** fund-in / fund-out / overdue / statements / approvals tbody
- **Cap:** First 12 rows stagger; row 13+ display immediately via `.row-stagger tr:nth-child(n+13) { animation: none; opacity: 1; }`
- **CSS class:** `.row-stagger` on tbody, `style={{ '--i': index }}` on each tr
- **Reduced-motion:** No animation, rows display immediately. No fallback needed (decorative).

### 02. Form Error Shake

- **Type:** Functional
- **Duration:** 360ms
- **Easing:** ease-out
- **Keyframes:** translateX ±4px → ±4px → ±2px → 0 (4 stages)
- **Side effect:** border-color transitions to danger red
- **Trigger:** useFormState error appears, `.shake-once` class added
- **Cleanup:** animationend listener removes class. Re-trigger: remove → force reflow → re-add.
- **Where:** All forms with useFormState (fund-out/new, fund-in/new, billing/contracts/new, billing/contracts/[id]/edit, settings form tabs)
- **Reduced-motion fallback:** Border-color pulse (alert→danger→alert) over 0.5s. No translateX transform. Color transition only.

### 03. Modal Slide-in

- **Type:** Decorative
- **Duration:** 320ms
- **Easing:** cubic-bezier(0.16, 1, 0.3, 1) — ease-out overshoot
- **Transform:** translateY(20px)→0, opacity 0→1
- **Backdrop:** opacity 0→0.4 simultaneously
- **Trigger:** Modal mount (open state true)
- **Where:** Confirm dialogs, approval detail modal, loan create modal
- **Reduced-motion:** Instant appear, no animation.

### 04. Tab Indicator Slide

- **Type:** Decorative
- **Duration:** 280ms
- **Easing:** cubic-bezier(0.4, 0, 0.2, 1) — material standard
- **Property:** CSS transition on left + width
- **Trigger:** Active tab changes
- **Where:** Settings (4 tabs), billing modes (5 tabs)
- **Component:** `<SlidingTabs items={[]} active={n} onChange={fn} />` — client component
- **Init:** useLayoutEffect measures first active tab's offsetLeft + offsetWidth
- **SSR:** Bar starts at position 0 with first tab's width. No visible jump on hydration since first tab is the default active.
- **Reduced-motion:** Bar jumps to new position immediately, no transition.

### 05. Status Pill Morph

- **Type:** Functional
- **Duration:** 480ms
- **Easing:** cubic-bezier(0.4, 0, 0.2, 1)
- **Property:** background-color + color CSS transition
- **Trigger:** Status field changes (approval workflow, loan status, statement status)
- **DOM requirement:** Pill must be the same DOM node (stable React key). Remount = no transition.
- **Text switching:** Immediate text change (no text animation), color transition covers it.
- **Optimistic update:** Approval button click uses `useOptimistic` to locally update pill class before server revalidation. If server returns different status, pill morphs again to real state.
- **Reduced-motion fallback:** Color transition preserved (color changes are not considered motion by WCAG). User still sees the state change.

### 06. Overdue Badge Pulse

- **Type:** Functional
- **Duration:** 1600ms
- **Easing:** ease-out
- **Property:** box-shadow 0→8px→0 (single ripple)
- **Iteration:** 1 (fires once, never loops)
- **Trigger:** Newly detected overdue item appears. `.pulse-once` class added once.
- **Component:** `<OverdueBadge id={string} label={string} />` — small client component (~20 lines). Wraps each overdue badge. Reads sessionStorage on mount, adds `.pulse-once` if ID is new, writes ID to seen set after render. Overdue page.tsx stays server component — only the badge is client.
- **"Seen" tracking:** sessionStorage key `vp-overdue-seen` stores Set<string> of seen IDs. New IDs not in set get `.pulse-once`. After render, new IDs added to set.
- **Session boundary:** Closing tab clears sessionStorage. Next login re-pulses all overdue items — correct behavior (daily login = see "new" overdue).
- **SSR / incognito fallback:** If sessionStorage unavailable, all items pulse (safe default).
- **Reduced-motion fallback:** Static 1px solid warm-gold ring on badge, fades out after 3 seconds. No box-shadow spread animation.

### 07. Input Focus Glow

- **Type:** Decorative
- **Duration:** 200ms
- **Easing:** ease-out
- **Property:** border-color + box-shadow transition
- **Glow value:** `0 0 0 3px rgb(var(--accent) / 0.12)` (accent CSS variable at 12% opacity — auto-adapts to dark mode)
- **Trigger:** `:focus` pseudo-class (zero JS)
- **Where:** All input / textarea / select elements (global rule in globals.css)
- **Reduced-motion:** border-color and glow appear instantly (no transition). Focus state still visible.

## File Changes

### New (2 files)
- `src/components/motion/SlidingTabs.tsx` — ~50 line client component
- `src/components/motion/OverdueBadge.tsx` — ~20 line client component (sessionStorage pulse tracking)

### Modified — CSS (1 file)
- `src/app/globals.css` — +~150 lines in motion section:
  - 7 keyframe definitions
  - 7 motion classes
  - `@media (prefers-reduced-motion: reduce)` block with functional fallbacks
  - Global `input:focus / textarea:focus / select:focus` rule

### Modified — Pages (class additions + minor wiring)
- `src/app/(portal)/fund-in/page.tsx` — tbody `.row-stagger` + `--i` variable
- `src/app/(portal)/fund-out/page.tsx` — same
- `src/app/(portal)/overdue/page.tsx` — tbody `.row-stagger` + overdue badges wrapped in `<OverdueBadge>` client component
- `src/app/(portal)/statements/page.tsx` — tbody `.row-stagger`
- `src/app/(portal)/approvals/page.tsx` — tbody `.row-stagger`
- `src/app/(portal)/approvals/[id]/page.tsx` — status pill `.status-morph` + `useOptimistic` wiring
- `src/app/(portal)/settings/page.tsx` — tab container → `<SlidingTabs>`
- `src/app/(portal)/billing/page.tsx` — billing mode container → `<SlidingTabs>`

### Modified — Forms (shake trigger)
- All forms with `useFormState`: fund-out/new, fund-in/new, billing/contracts/new, billing/contracts/[id]/edit, settings form tabs
- Each: +~8 lines useEffect to toggle `.shake-once` on error

### New — Tests (2 files)
- `src/components/motion/SlidingTabs.test.tsx` — 3 unit tests (render, callback, bar element)
- `src/components/motion/OverdueBadge.test.tsx` — 2 unit tests (renders label, applies pulse-once class)

### Not changing
- ~~Money count-up~~ — cancelled
- `package.json` — no new dependencies
- Existing b9a5bad motion (page-enter / skeleton / nav-link hover / button press / card hover) — preserved as-is
- `middleware.ts` — untouched
- Database / migrations — untouched
- Server actions internals — untouched

## Reduced-Motion Strategy

Graded approach (Decision B):

| Motion | Type | Reduced-motion behavior |
|---|---|---|
| Table stagger | Deco | Disabled (instant display) |
| Modal slide-in | Deco | Disabled (instant appear) |
| Tab indicator | Deco | Disabled (instant jump) |
| Focus glow | Deco | Disabled (instant glow, no transition) |
| Form shake | **Fn** | Border color pulse (alert→danger→alert, 0.5s) — no transform |
| Status morph | **Fn** | Color transition preserved (not classified as motion by WCAG) |
| Overdue pulse | **Fn** | Static warm-gold 1px ring, fades after 3s — no box-shadow spread |

Implementation: All inside the existing `@media (prefers-reduced-motion: reduce)` block in globals.css. Functional fallbacks as separate rules within that block.

## Edge Cases

- **Table stagger cap:** 12 rows max. Row 13+ via `nth-child(n+13)` override.
- **Form shake re-trigger:** Remove class → force reflow → re-add. Handled in useEffect.
- **Status morph DOM stability:** useOptimistic ensures same DOM node during approval flow.
- **Overdue sessionStorage unavailable:** Fall back to pulsing all items.
- **SSR hydration:** 5 pure-CSS motions = zero risk. SlidingTabs SSR fallback = bar at first tab position. OverdueBadge renders badge server-side with no class, client adds `.pulse-once` after hydration — no mismatch.
- **Dark mode:** All colors via CSS variables — auto-adapts, zero extra work.

## Testing

### Unit (Vitest)
- `SlidingTabs.test.tsx`: renders correct tab count, fires onChange, bar element has style properties

### CSS Regression (Playwright MCP)
- Verify classes present: `.row-stagger`, `--i` variable, `.shake-once`, `.status-morph`, `.pulse-once`
- Verify focus glow: input:focus border-color = accent

### Reduced-Motion (Playwright MCP)
- Emulate `reducedMotion: 'reduce'`
- Functional fallbacks: shake border color present, status color changes, overdue ring present
- Decorative: computed animation-duration = 0.01ms

### Not testing
- Visual snapshot comparison (timing-dependent, flaky)
- Performance benchmark (CSS animations < 1ms paint, not worth quantifying)
