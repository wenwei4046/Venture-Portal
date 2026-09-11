# DESIGN.md — HOUZS Venture Portal

**Version:** 3.2
**Last updated:** 2026-09-11
**Maintained by:** HOUZS Venture Portal team
**Status:** v3.2 (Shared statement typography / Walnut palette) — single source of truth for all UI work

> **For coding agents and contributors:** This is the **only** UI design doc. If you're adding a new page or amending an existing one, this file dictates the colors, fonts, components, and page anatomy. Do not invent parallel design notes — extend this doc instead. See `## Implementation rules — read this first` below.

---

## Implementation rules — read this first

These six rules are non-negotiable for any new or amended page. The CSS / Tailwind tokens that back them live in `src/app/globals.css` and `tailwind.config.ts` — already wired up.

1. **Page header.** Every top-level route page starts with this block (no exceptions, even small pages):
   ```tsx
   <div className="page-head">
     <div>
       <div className="page-eyebrow">
         <em>I.</em> SECTION · PAGE NAME
       </div>
       <h1 className="page-title">Page Title</h1>
       <p className="text-graphite text-sm mt-3">…description…</p>
     </div>
     {/* optional right-side action button */}
   </div>
   ```
   The roman numeral inside `<em>` mirrors the sidebar section it belongs to. Eyebrow text is `UPPERCASE · UPPERCASE`, mono.

2. **Money cells use `.num`.** Never hand-roll `font-mono tabular text-ink`. Use `<td className="num">{formatMoney(x)}</td>`. Negatives get `<span className="neg">`. Headline figures use `.statement-amount` (or `.num-hero`) for Inter medium tabular digits; add `.compact` for narrow summary columns. Reserve `--num-ink` for the digit and `--graphite` for supporting units.

3. **Data tables use `.ledger-table`.** `<table className="ledger-table">` with `<th>` / `<td>` only — the class wires up surface bg, zebra rows, accent-bg hover, hairline borders, header padding, right-aligned `.num` cells. Stop writing `<table className="w-full text-sm"><thead><tr className="border-b…">…`.

4. **Section headings use `.sect-head`.** `<div className="sect-head"><h2>…</h2><span className="rule" /><span className="count">N ITEMS</span></div>`. Medium-weight upright sans title + hairline rule extending right + uppercase mono counter.

5. **Colors come from CSS variables, never hex.** Use Tailwind classes (`text-ink`, `text-num-ink`, `bg-paper`, `border-hairline`, `text-accent`, `text-danger`) or `rgb(var(--xxx))` inside SVG. Hardcoded `#xxxxxx` is forbidden outside `globals.css` itself.

6. **A table with five or more columns must fold for mobile.** Below `md` a
   phone has ~343px of content width — enough for two columns and a chevron.
   Mark the demoted columns `m-hide` + `data-label`, wrap the row in
   `<LedgerRow>`, and end the `<thead>` with `<th className="lt-toggle" aria-hidden />`.
   `SortableTable` does it from its column config instead. **Never fold a row
   that a single form wraps** — the panel would duplicate its named inputs and
   the stale hidden copy is what gets submitted; use `.table-scroll` there.
   Full rules, including the four cases that legitimately keep every column,
   are in **Responsive** below. A headline figure uses `.statement-amount`, which scales from 26px to 23px
   and 21px at smaller widths. Narrow summary columns use `.statement-amount.compact` (18px).

### Canonical reference pages

When you're not sure how a pattern looks in code, copy from one of these — they're the v3.0 reference implementation:

| Pattern | Reference file |
|---|---|
| Page header + hero number + ledger table | `src/app/(portal)/fund-out/page.tsx` |
| Multi-column hero summary | `src/app/(portal)/payments/page.tsx` |
| Hero number + side stats | `src/app/(portal)/director-salary/page.tsx` |
| Section-grouped tables | `src/app/(portal)/statements/page.tsx`, `src/app/(portal)/overdue/page.tsx` |
| Tab rail on the header's rule (`.page-head.tabbed` + `SlidingTabs`) | `src/app/(portal)/revenue/_components/config/CommissionSection.tsx`, `src/app/(portal)/revenue/[sub]/hierarchy/_components/HierarchyTabs.tsx` |
| Hero + dept totals + history | `src/app/(portal)/hr-costing/page.tsx` |
| Pure read-only ledger | `src/app/(portal)/audit-log/page.tsx` |
| Monthly payment statement + Salary / Statutory tabs + department tables | `src/app/(portal)/hr-costing/payment/page.tsx`, `_components/Overview.tsx`, `_components/DeptRows.tsx` |
| Sidebar (roman numerals + dot markers) | `src/components/layout/Sidebar.tsx` |
| TopBar (greet + role badge) | `src/components/layout/TopBar.tsx` |
| Mobile nav (bottom tabs + sheet) | `src/components/layout/BottomTabBar.tsx`, `MoreSheet.tsx` |
| Folding a hand-rolled table for mobile | `src/app/(portal)/venture-pool/page.tsx` |
| Folding a config-driven table | `src/components/SortableTable.tsx` |

### Pages still on the legacy v2.0 chrome (clean up when you touch them)

`(portal)/fund-out/[id]`, `/fund-in/[id]`, `/fund-in/new`, `/fund-out/new`, `/payments/[id]`, `/payments/new`, `/payments/dept-requests`, `/payments/payroll-requests`, `/statements/[id]`, `/statements/[id]/print`, `/approvals/[id]`, `/approvals/payroll-run/[id]`, `/approvals/payroll-run/[id]/director-report`, `/billing/contracts/new`, `/billing/contracts/[id]/edit`, `/billing/requests`, `/dept-pool/[slug]`, `/dept-pool/marketing`, `/dept-pool/submissions`, `/dept-pool/contracts/new`, `/director-salary/[directorId]`, `/director-salary/[directorId]/print`, `/hr-costing/staff/*`, `/hr-costing/payroll/*`, `/reports/pnl`, `/reports/fund-summary`, `/reports/base-rate`, `/reports/claims`, `/opex`, `/operating-fund`, plus the HR + Dept Manager branches inside `/dashboard`. Each one inherited the deeper palette automatically but still needs `page-head` / `.num` / `.ledger-table` swap when it next gets edited.

### What to do for "add a new feature" or "amend a page"

1. Open the most similar reference page above and copy the structural pattern.
2. Use existing Server Actions / RPCs unchanged — backend is locked, this doc is **frontend only**.
3. If your page genuinely needs a new component (e.g. a new chart, new modal layout), add it under `## Component Vocabulary` in this doc *before* writing the code.
4. Run `npm run build` before committing — it catches type errors and missing imports.

---

## 设计定位

HOUZS Venture Portal (VP) 是 HOUZS Venture Sdn Bhd 的内部银行系统。Users = Principal + Finance + HR + Dept Manager。Real money, real decisions, real daily use.

**Visual thesis (2.0):**

> **VP is a warm research journal for a family office.** Friendly but precise. The Principal opens it every morning and feels like reading his own handwritten notes, not signing a notarized contract. Same paper aesthetic as old-school banking, less severity. Anthropic-flavored, not Bloomberg terminal.

**Mood:** Institutional calm with warmth. Plaster paper, Walnut surfaces and Harbour blue interactions. Georgia page titles, medium-weight Inter section headings and quiet, aligned figures. The Payment statement is the shared typographic reference.

---

## 不要做的

**AI slop blacklist (hard rejections):**
- Purple/violet/indigo gradients
- 3-column feature grid with icons in colored circles
- Centered everything
- Uniform `rounded-xl` on all elements
- Decorative blobs, floating circles, wavy SVG dividers
- Emoji as design elements (no 🟢🟡🔴⚠️ — use typeset italic + accent color)
- Colored left-border on cards
- Generic "Welcome to VP" / "Unlock your treasury" copy
- Drop shadows on cards (use hairline borders)
- Slate/cool-gray backgrounds (we use warm cream)
- Pure white (`#FFFFFF`) backgrounds
- Inter as display font (Inter is body-only in VP)

**Not doing:**
- ~~Dark mode in Phase 1~~ — Shipped. Warm charcoal palette, not cold inversion
- Chart-first dashboard — type-led, number-first
- Multi-color status rainbows — single rust accent + muted gold + muted green

---

## Typography

> **2026-09-11 — shared Payment statement typography.** The user approved the
> Payment page's numbers, font weights and hierarchy for the rest of the portal.
> Apply this typography within the existing Plaster / Walnut / Harbour palette;
> do not introduce route-specific chrome or a new color theme.

### Font stack

Inter, Chivo Mono and Noto Sans SC are loaded with `next/font` in `layout.tsx`.
Georgia is a system font and needs no download. Every display chain includes
`--font-cjk` for consistent Simplified Chinese fallback.

```css
:root {
  --font-display: Georgia, 'Times New Roman', var(--font-cjk), serif;
  /* --font-sans, --font-mono and --font-cjk come from next/font. */
}
```

Tailwind's legacy `font-serif` continues to alias Inter. Do not change that alias:
existing navigation, controls and labels use it. Actual display titles use
`.page-title` / `h1` or `font-display`. Only page titles use Georgia; sections,
buttons, navigation, labels and figures remain upright sans or mono.

### Roles and scale

| Role | Font | Size / weight | Usage |
|---|---|---|---|
| Page title | Georgia | 36px / 400; 30px below 680px | `.page-title`, visible `h1` |
| Section title | Inter | 18px / 500 | `.sect-head h2`, legacy `h2.font-serif` |
| Subsection title | Inter | 15px / 500 | Legacy `h3.font-serif` |
| Headline amount or count | Inter, tabular digits | 26px / 500; 23px below 1000px; 21px below 680px | `.statement-amount`, `.num-hero`; Payment's `.payment-amount` |
| Compact summary amount | Inter, tabular digits | 18px / 500 | `.statement-amount.compact` in narrow multi-column summaries |
| Dense ledger figures | Chivo Mono, tabular digits | 13.5px / 500 | `.num`; preserve decimal and column alignment |
| Body and navigation | Inter | 13px / 400; active items 500 | Body, `text-sm`, `text-base`; deeper nav labels may be 12.5px |
| Supporting copy | Inter | 12px / 400 | Page descriptions, explanatory text |
| Table header | Inter | 11px / 400 | `.ledger-table thead th`, sentence case |
| Page eyebrow | Chivo Mono | 11px / 500 | `.page-eyebrow`, restrained tracking |
| Dates, IDs, rates and metadata | Chivo Mono | 11–13px / 400–500 | `.tabular`, `.mono`, `font-mono` |
| Buttons | Inter | 12px / 500 | Existing padding and touch targets stay intact |
| CJK | Noto Sans SC | Inherits role | Consistent fallback after the Latin font |

Use medium emphasis for ordinary labels and totals. Tailwind `font-medium` and
`font-semibold` resolve to 500; `font-bold` resolves to 600 for stronger emphasis.
Avoid heavy 700-weight monetary figures and oversized 40–64px dashboard totals.
The legacy size utilities remain available for nonfinancial displays; new KPI
markup must use the semantic amount classes instead of size/weight utility stacks.

Do not replace `.tabular` globally with sans: it also represents dates and
reference codes. A headline value opts into `.statement-amount`; table values
remain `.num`. The amount class does not change color, financial calculations or
status semantics. Preserve existing group bands, zebra rows and responsive table
behavior. Payroll retains its compact row geometry and frozen columns.

Mobile form inputs retain their 16px type and 44px touch-target safeguards.

---

## Color Palette — Walnut (v3.1, 2026-08-31)

> **v3.1 replaced the cream / deep-green / rust palette.** The v3.0 values below the
> Walnut block are kept for reference only — they describe what shipped between
> 2026-04 and 2026-08 and are **no longer live**. Read this section first.

### The three values

| | RGB | Job |
|---|---|---|
| **Plaster** | `242 239 234` | The page. Warm neutral greige — warmth without cream's yellow cast. |
| **Walnut** | `90 62 43` | The **one** dark thing: hero cards, primary buttons, money ink, modal scrim. |
| **Harbour** | `46 92 138` | The **only** signal: active nav, links, focus rings. |

### Rule 1 — a surface is free, a signal is not

`--accent` must stay clear of the red / amber / green lanes, because those three are
load-bearing: `--danger` = overdue, `--alert` = pending, `--ledger` = settled. Users
learn them, so they can't move.

The v3.0 rust accent sat **4° from `--danger`** on the colour wheel (16.7° vs 12.7°),
with `--alert` a further 21° away — three of five meaningful colours crowded into one
25° wedge. An active nav item, an overdue badge and a pending warning were the same
broad hue separated only by lightness, which is why the accent never read as *"you are
here"* rather than *"something's wrong"*. **Minimum gap is now 40°.**

That leaves blue for the accent — and it's why the palette can still be warm. A
*surface* reports no status, so its hue is unconstrained: Walnut owns the hero card,
the buttons, the money ink and the scrim without any of this applying to it.

**Never propose a warm accent.** It is the one colour on the page that has to dodge.

### Rule 2 — dark is limited by area, not hue

Three coloured sidebar rails were tried and rejected (deep green, Prussian, basalt).
The variable that mattered was **area**: a full-height rail is the largest surface in
the app and the only one carrying no numbers, so any weight it holds is weight the
reader carries all day.

So the rail carries **no colour at all** — Plaster one step down (`232 227 219`),
floated as a rounded inset panel so the page colour runs behind it, separated by a
hairline rather than by weight. The dark moved to `.hero-walnut`, a card-sized object
holding the figure the page exists to show.

Corollary worth remembering: a *desaturated* dark never registers as a hue — the eye
files it as black. The fix for "this reads as black" is to **re-saturate**, not to
lighten.

### `.hero-walnut`

The one dark object. Applied to the `lg:col-span-7` hero column on Dashboard, Fund IN,
Fund OUT, Venture Pool and Dept Pool.

It re-declares the palette tokens for its subtree — the same technique as
`.sidebar-contrast` — so markup inside keeps using `text-num-ink` / `text-muted` /
`text-accent` unchanged and inverts for free, including SVG strokes bound to
`rgb(var(--ink))`. **Semantics are re-lit too** (`--danger`, `--ledger`, `--alert`),
because a hero carrying `text-danger` for a negative balance would otherwise render
dark red on dark walnut and disappear.

### Chrome — two floating panels

The sidebar rail and the header are **peers**: same tone (`--chrome`, Plaster one step
down), same 10px inset, same `rounded-panel` corners. Together they are the chrome;
the page runs behind and between them.

`--chrome` has its own token rather than borrowing `--surface-2` (zebra rows, table
headers) so the two can be tuned independently, and `.sidebar-contrast` reads
`var(--chrome)` rather than repeating the literal, so rail and header cannot drift.

**Tune the chrome step by measurement, not by eye.** The first attempt at
`232 227 219` was only **ΔL\* 4.1** from the page — inside the barely-perceptible
band. It looked fine in a mockup and read as *no header at all* on a 60px strip in
the real app. The shipped value `222 215 202` is **ΔL\* 8.3**. Rule of thumb:
ΔL\* ~4 is invisible, ~6 is noticeable, ~8–10 is unambiguously a separate surface.
Keep any future chrome above ~6, and re-tune `.sidebar-contrast`'s `--surface-2`
(nav hover) and `--hairline` alongside it — they sit relative to `--chrome`, and
if it moves without them the hover state silently disappears.

**Why not a bottom border on the header.** The v3.0 rule stopped dead where the
sidebar edge began, leaving an L-shaped band that never closed — the original
complaint this palette answers. Removing it fixed the corner but overshot: on
`bg-paper` the header had no definition at all and dissolved into the page. Giving it
the rail's surface resolves both, because nothing has to butt up against anything.

---

### Legacy v3.0 base (superseded — reference only)

These values come from the v3.0 readability pass. **Always reference via Tailwind classes (`bg-paper`, `text-ink`, `border-hairline`) — never copy the hex into a component.** The hex literals here exist only for designer reference; the runtime uses RGB triplets in `globals.css` so dark mode + `<alpha-value>` work.

```css
:root {
  --paper:      #F3ECDD;  /* warm cream — page background. Slightly more saturated than v2.0 to make ink/numbers stand out. */
  --surface:    #FAF5EA;  /* lifted paper — card background */
  --surface-2:  #E8DDC4;  /* subtle alt row for striped tables, table headers */
  --hairline:   #C6B99E;  /* warm pencil line — borders and dividers */
  --ink:        #1C160F;  /* dark brown-black — primary body text */
  --graphite:   #5A4E40;  /* warm muted text — secondary */
  --muted:      #85775F;  /* tertiary text — placeholder, disabled */
  --num-ink:    #1A130B;  /* NEW v3.0 — deepest tone, RESERVED for monetary digits + tabular data. */
}
```

> **Why `--num-ink` exists:** Finance users complained that money digits looked "dreamy" in v2.0. By giving digits their own one-tier-deeper color and reserving `--graphite` for the `RM` prefix, cents, and units, the digit jumps off the page. `--ink` stays for body and titles so reading is still calm.

**Token usage map:**

| Token | Use for | Don't use for |
|---|---|---|
| `--paper` | Page bg, sidebar bg | Cards (use `--surface`) |
| `--surface` | Card / panel bg | Page bg |
| `--surface-2` | Zebra rows in tables, table headers, hover bg | Card bg |
| `--hairline` | All borders, dividers, hr | Text |
| `--ink` | Body text, titles, default text | Money digits |
| `--num-ink` | **Money digits only** + hero figures | Body text |
| `--graphite` | Secondary text, RM/cents/units, table cell metadata | Money digits |
| `--muted` | Placeholder, disabled, "—" sentinels | Body text |

### Accent — single rust seal

```css
:root {
  --accent:     #CC5A2E;  /* rust / terracotta — THE accent */
  --accent-bg:  #FBE8DE;  /* rust light tint for hover, active nav, selected */
  --accent-border: #E8B098; /* rust border on focus states */
}
```

**Usage rules for the accent:**
1. Italic serif text of key labels ("*Free pool*", "*Pending your hand*", "*Approve*")
2. Active sidebar nav item (italic serif + `--accent-bg` background)
3. Primary action buttons ("Approve" on approval cards, "Save" on forms)
4. Focus ring on form inputs
5. **Nothing else.** No decorative rust. No rust dividers. No rust icons.

### Semantic colors — muted, not neon

```css
:root {
  --ledger:       #3D6B45;  /* positive — loan fully repaid, statement paid */
  --ledger-bg:    #E7EFE6;
  --alert:        #A07020;  /* warning — late_1 overdue, maturing soon */
  --alert-bg:     #F5EBD3;
  --danger:       #A3371A;  /* rare — late_2 / escalation overdue, critical */
  --danger-bg:    #F8E1D8;
  --info:         #5A6B8A;  /* subtle — pending, draft */
  --info-bg:      #EBEEF3;
}
```

**Semantic rules:**
- **Default status is silent.** Active loans have no color.
- Alerts use italic text + semantic color, never filled pills
- `--danger` is reserved for escalation-stage overdue only. Don't burn it on small errors.
- Overdue label format: `<em class="text-alert">overdue 15d</em>` — italic graphite-warm, not a red pill

### Dark mode — Shipped

**Warm charcoal palette** — not cold inversion. Maintains the journal aesthetic in low light.

**Architecture:** CSS variables (RGB triplets) in `globals.css` → Tailwind references via `rgb(var(--xxx) / <alpha-value>)`. Theme toggle in TopBar. System preference respected by default, manual override via `data-theme` attribute on `<html>`.

**Dark palette:**
| Token | Light (RGB) | Dark (RGB) |
|-------|-------------|------------|
| paper | 243 236 221 | 26 23 20 |
| surface | 250 245 234 | 36 32 25 |
| surface-2 | 232 221 196 | 46 41 34 |
| hairline | 198 185 158 | 61 54 44 |
| ink | 28 22 15 | 232 224 212 |
| graphite | 90 78 64 | 168 155 140 |
| muted | 133 119 95 | 115 103 88 |
| **num-ink** | **26 19 11** | **245 240 232** |
| accent | 204 90 46 | 224 107 58 |
| accent-hover | 181 74 34 | 240 122 72 |

**FOUC prevention:** Inline `<script>` in `<head>` reads localStorage before paint.

**Known limitations:**
- Recharts components (PnLChart, FundPieChart, BaseRateTrendChart) use hardcoded hex colors — chart elements may have reduced contrast in dark mode
- Print pages (statements, director salary) stay light-only (intended for physical printing)

### Contrast verification (v3.0 Finance-readability deepening)

All combinations exceed WCAG AA. Numbers updated for the deeper palette:

**Light mode:**
- `--num-ink` (#1A130B) on `--paper` (#F3ECDD) = **~14.0:1** ✓ (digits jump out)
- `--ink` (#1C160F) on `--paper` = **~13.5:1** ✓
- `--graphite` (#5A4E40) on `--paper` = **~7.0:1** ✓ (was 5.4 in v2.0 — significant improvement)
- `--muted` (#85775F) on `--paper` = **~4.4:1** ✓ (was 3.2 — now passes AA for normal text)
- `--accent` (#CC5A2E) on `--paper` = **~4.7:1** ✓
- `--accent` (#CC5A2E) on `--accent-bg` (#FBE8DE) = **~4.7:1** ✓ (active sidebar item)

**Dark mode:**
- `--num-ink` (245 240 232) on `--paper` (26 23 20) = **~14.5:1** ✓
- `--ink` (E8E0D4) on `--paper` (1A1714) = **12.1:1** ✓
- `--graphite` (A89B8C) on `--paper` = **5.9:1** ✓
- `--accent` (E06B3A) on `--paper` = **4.9:1** ✓

---

## Spacing, Radius, Shadows

### Grid

4px base. Tokens:

```
--space-0: 0
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
```

### Density

- **Table row:** 48px compact (data-dense lists like loans, fund sources)
- **Form row:** 56px comfortable (inputs with labels)
- **Section gap:** 48-56px between major sections
- **Card padding:** 20-24px
- **Max content width:** 1280px (sidebar 220px + main max 1060px)

### Radius — named scale (v3.1, 2026-08-31)

Four steps, each with a job. Scattered `rounded-lg` is what makes an interface look
templated; a named scale is what makes it look designed.

| Tailwind | px | Use for |
|---|---|---|
| `rounded-control` | 6 | Inputs, buttons — deliberately tighter than the default |
| `rounded-md` | 8 | **The default.** ~950 existing uses; carries the general softening |
| `rounded-card` | 12 | Cards, table wells |
| `rounded-panel` | 16 | Modals, the sidebar rail, `.hero-walnut` |
| `rounded-full` | — | Status pills, toggles, avatars |

**The guardrail: round the container, never the rows.** A ledger table lives inside a
`rounded-card` well with `overflow-hidden`, but every `<tr>` inside stays square.
Rounded rows break the vertical alignment the eye uses to scan a column of figures,
and that is the one thing a ledger cannot afford.

> **Supersedes the v3.0 rule** ("absolutely no `rounded-xl` / `rounded-2xl`"). That
> ban existed to keep the portal from drifting toward SaaS-landing-page softness, and
> the concern is still right — which is why 12px and 16px are *named for specific
> jobs* rather than available as free-floating utilities. Overlays and the one dark
> object get the curve; data surfaces do not. Requested by the user 2026-08-31
> ("加一点点的圆弧设计…可能是 pop-up window 什么之类的").

### Shadows

**No shadows on cards.** Elevation comes from hairline borders (`--hairline`), not drop shadows.
The sidebar rail carries none either — a light panel that casts a shadow reads as dirty.
Overlay panels (`shadow-xl`) are the one exception: they float above the page and should say so.

### Scrim

Modal backdrops use `bg-scrim/45`, **never a neutral black.** `--scrim` is Walnut in
light mode and near-black in dark. A neutral overlay grey-washes everything beneath it;
a scrim tinted with the palette's own dark keeps the page looking like itself, just
recessed. (The image lightbox in `AttachmentList` is the deliberate exception — it
wants to go properly dark.)

**Allowed shadows (rare):**
- Modal overlay: `0 10px 40px rgba(26, 22, 19, 0.15)` — warm, subtle
- Dropdown menu: `0 4px 12px rgba(26, 22, 19, 0.08)` — small

**Never:**
- Shadow on cards/panels
- Colored shadows
- Shadow + border combo

---

## Layout — 7+5 Broadsheet

### Dashboard composition

```
┌────────────┬──────────────────────────────────────────┐
│            │  Good morning, Principal.     Wed 9 Apr  │
│  HOUZS     │  ─────────────────────────────────────── │
│  Venture   │                                          │
│  (serif)   │  Free pool              Pending your hand│
│            │                                          │
│  Overview  │  RM 12,847,203.55       ┌──────────────┐│
│  Fund IN   │  (64px serif)           │ NEW LOAN     ││
│  Fund OUT  │                         │ HOUZS Century││
│  ...       │  ───── sparkline ────   │ RM 100,000   ││
│            │                         │ [Approve]    ││
│            │  Above buffer RM 2.8M   └──────────────┘│
│            │                         ... 2 more       │
│            │                                          │
│            │  Subsidiaries                            │
│            │                                          │
│            │  HC     ▮▮▮▮▮▮▮▮▯ RM 2.15M  active     │
│            │  CONTS  ▮▮▮▮▮▮▯▯▯ RM 1.43M  active     │
│            │  ... 5 more                              │
└────────────┴──────────────────────────────────────────┘
```

- **Left sidebar:** 220px fixed, cream background, serif brand mark
- **Main content:** flex-1, left-aligned, 32-48px horizontal padding
- **Hero section:** 7-column + 5-column split (7fr / 5fr)
- **Below fold:** full-width sections, 48-56px vertical gap between

### Settings composition

Settings is a single page driven by a tab key in the URL (`?tab=treasury|overdue|splits|directors|companies|banks|periods|simulator`). Each tab renders its own section component. There are 8 tabs total — see `src/app/(portal)/settings/page.tsx` for the canonical mounting.

Forms use serif section headings + italic subheads + sans labels + mono inputs for numbers. The buffer amount field was removed in mig 57 (no longer applicable). The tier system was removed in mig 63 — no Tier Premiums tab exists.

### Tabbed pages — the rail on the header's rule

A page whose body is a tab rail (Revenue › Rules, Revenue › Staff Hierarchy, 2026-09-05) puts the rail **on the header's rule**, not under a second one: `<div className="page-head tabbed">` drops the header's bottom border and its 64px accent segment, and the `SlidingTabs` nav directly beneath supplies the hairline — its accent indicator under the active tab *is* the header's accent segment, moved to where the reader is. Settings predates this and still stacks two rules; leave it until it is next touched.

The tab is `?tab=<key>`, so a link can open the page on a section. Push it with the browser's own history (`window.history.pushState(null, '', '?tab=…')`) — Next syncs `useSearchParams` from it and no server round trip happens; read the active key from `useSearchParams()` and render the one section. A tab may carry a small mono count (`TabItem.count` — "Team 26").

On a tabbed header the rail takes **`variant="control"`**: labels in the body face — Inter 13px medium, upright, sentence case — each on its own `rounded-t-control` hover surface with the indicator under the label, and the header keeps 18px clear above them. With no rule between the intro and the tabs, plain text labels read as one more line of the intro (user 2026-09-05); the hover surface and the indicator are what make them read as things to pick. The first cut set them in mono caps and the user asked for "正常 formal 的字体" the same day — the control voice (mono caps) stays for table heads, chips and eyebrows, not for tab labels. Rails below a bordered header keep the default `text` variant.

Tabs are for the **sections of one view**. Choosing between *views* of a thing (Comm Cal / Staff Hierarchy / Rules of a sub-department, the four People pages) is navigation and lives in the sidebar — see the 2026-09-01 removals in `nav-config.ts`.

---

## v3.0 utility classes (in `globals.css`)

These are the load-bearing classes that make a page feel "v3.0 ledger-dense" instead of "v2.0 broadsheet". Use them by name; do not re-implement.

| Class | What it does | Where to use |
|---|---|---|
| `.page-head` | Flex container with bottom hairline + 64px accent rule + 28px bottom margin | Wraps every top-level page header (title + optional right-side action). |
| `.page-eyebrow` | Mono uppercase 10.5px label with rust italic roman numeral inside `<em>` | Inside `.page-head`, above the `.page-title`. Format: `<em>I.</em> SECTION · PAGE NAME`. |
| `.page-title` | Instrument Serif 38px ink with negative letter-spacing | The `<h1>` inside `.page-head`. |
| `.sect-head` | Flex baseline row: italic serif title + hairline rule extending right + uppercase mono counter | Section dividers inside a page. Replaces hand-rolled `<h2>` + `<p>` mb-6 pattern. |
| `.num` | Chivo Mono + `tabular-nums` + 13.5px + weight 500 + `--num-ink` | Every money cell in a table or grid. Right-aligns inside `.ledger-table td.num`. |
| `.num.neg` | Same as `.num` but `--danger` red | Negative amounts (`(1,234.56)` style). |
| `.num-hero` | 56px serif + tabular + `--num-ink` + tight letter-spacing; auto-styles `<span class="cents">` and `<span class="unit">` to graphite | Dashboard / page hero figures (Free pool, Total outstanding, etc.). |
| `.ledger-table` | Surface bg + 1px hairline border + 6px radius + zebra rows + `surface-2` thead + accent-bg hover + `td.num` right-align | Every data list table. Replaces ad-hoc `<table className="w-full text-sm">…border-b…hover:bg-surface-2/40`. |
| `.chip` | Rounded pill: 99px radius + 10.5px mono + variant colors (`accent` / `ledger` / `alert` / `danger` / `info`) | Status tags, category labels. Inline only; do not use as button. |

### Roster density (v3.2, 2026-09-01 — People Management)

A directory is not a ledger: its cells are short strings, not figures, so the
money-table padding turned 27 people into two and a half screens. These four
belong together — use them for people and other reference lists, never for
money tables, which keep the roomier default.

| Class | What it does | Where to use |
|---|---|---|
| `.ledger-table.tight` | `table-layout: fixed` + 7px cell padding — one line per person, so names, titles and codes line up on the same vertical edges from the first row to the last. Column widths come from `th.col-*` classes, **not** inline styles | Directory / reference lists. Fixed layout is load-bearing: under auto layout the longest cell sets the column, and a group header's `colspan` keeps folded-away columns alive on a phone. |
| `.group-btn` (in `td.group-cell`) | Full-width button row that folds its group away; carries the count and an amber sub-count. Painted `--band` — walnut lifted a step — with the name reversed out in the text face at 12.5px, uppercase, tracked | Grouped tables where one group is half the list (Marketing is 12 of 27). |
| `--band` / `--band-ink` | Walnut one step lighter, plus the near-white that reads on it | The one dark object that **repeats**. Full `--walnut` is right for a hero card you meet once on a page; six dividers down a roster is a lot of ink, so the band gets its own lighter cut. It also has to be its own token because `--walnut` inverts in dark mode — reusing it there would paint a light band under near-white text. |
| `.mono-tile` / `.mono-tile-lg` / `.mono-tile.linked` | Initials in a rounded tile; `.linked` tints it accent | Standing in for a photograph, and carrying a binary fact — on the roster a tinted tile means "this person can sign in", which is what freed a whole column for `Last seen`. |
| `.icon-btn` (`.solid`, `.danger`) | 28px icon control, 62% opacity resting, full on row hover or focus | Row actions. A pencil reads as a control where the words *Edit* and *Deactivate* in identical grey read as neither — and it stops the destructive one shouting as loudly as the everyday one. `.solid` for a card header, where the icon is the primary control rather than a row affordance. |

Two mobile rules the fixed layout needs, both already in `globals.css`: a
`display: none` header cell still holds its column slot, so `th.col-name` takes
`width: 100%` below 768px to claim what the folded columns would otherwise
split; and it must be a plain percentage — a `calc()` width on a table cell is
treated as auto and the name collapses to 60px.

### Payroll grid (v3.3, 2026-09-05 — HR → Payroll)

The one table where every row is a form: nine editable figures per person,
so it can neither fold for a phone nor shed columns, and the four-line names
and `py-5` rows of the first version put Gross and Net off the right edge of
a 1440 screen. Chosen as "C · Window" out of three mockups (A every column
inline, B six figures and a panel, C both) — the artifact is linked from the
project memory. Everything below lives in `globals.css` under "Payroll grid".

| Class | What it does | Where to use |
|---|---|---|
| `.pg-well > .pg-scroll > table.ledger-table.payroll-grid` | Frozen panes: ✓ · Name · Gross · Net · ▾ stay put on the left (`.pg-st.l0`–`.l4`, offsets derived from the `--w-*` column widths so they cannot drift), the eleven working columns scroll under them in three groups (Earnings · Deductions · Employer, each opened by a `.g1` hairline), the two header rows pin to the top and the totals row to the bottom. The well is its own scroll box in both directions, because a sticky edge only holds inside the element that scrolls. `border-collapse: separate` is load-bearing; frozen cells are painted with the row's own `--row-bg`, an opaque pre-mixed zebra, because a translucent tint shows the scrolled cells through | Any grid where a row is a form and the answer columns must stay in view. Below `md` only ✓ · Name stay frozen and the well stops scrolling inside itself |
| `.pg-in` | The editable figure: `3,000.00` in Chivo Mono like the computed cells beside it, on a `--paper` field one step below the surface so it reads as a recessed box; `.dirty` tints it alert until saved, `.zero` fades a 0.00 to muted so the figures that are actually there stand out. A computed figure stays a bare `.num` with no box — that contrast is how "you can change this one" is told | Figures HR types; never on a computed figure |
| `.pg-band` (`.group-btn` in `td.group-cell`) | The roster's department band, with the Gross / Net subtotal sitting in the frozen block directly under the two columns it sums | Grouped money grids |
| `.pg-win` + `.pg-scrim` | One person's paycheck as a floating window over a scrim (`--scrim` at .42): header with n / N, the month and department, ‹ › to step through people and × / Esc to close; a payslip-shaped body (Earnings · Deductions inputs, a Computed column of ER / EE, PCB or WHT, cost to company, net to bank) and a footer with Payslip and Save. It is a second view of the row's figures, never a copy — the inputs write the row's own edit state, so a change in either place shows in both | Opening a row from a dense grid. The first inline version sat in the same paper tones as the table and read as part of it; the scrim is what makes it unmistakably in front |

### Org chart canvas (v3.4, 2026-09-09 — Revenue › Staff Hierarchy)

The one surface in the portal that is not paper. Measured before the change:
the card was `--surface` on a canvas that was also `--surface` (ΔL* 0.0), the
dot grid was drawn in the card border's own `--hairline`, and the edges used a
token that does not exist and fell back to `#b9b0a2` — so border, dots and
lines sat in one band of grey and the user could not tell the cards from the
background ("颜色太靠近、融入背景了，所以没有层次感"). Chosen as "A · Chart,
with a Move control" in the Slate tone out of two mockups (B was a team board);
the artifact is linked from the project memory. Everything below lives in
`globals.css` under "Org chart canvas".

| Class | What it does | Where to use |
|---|---|---|
| `.org-canvas` | Re-declares the palette for its subtree the way `.hero-walnut` does, as `--cv-*` tokens: a cool **Slate** ground `220 227 234` on the accent's own hue, grid `196 208 220`, pure white cards, cool ink `31 41 51`, slate lines `91 111 132`. Card against ground is ΔL* 10.1 — a separate surface on the Walnut scale (~4 invisible, ~6 noticeable, ~8–10 a surface). A surface may be any hue; this one takes the signal's so a selected or targeted card is one family with the ground. Dark mode keeps the elevation ladder (page darkest, card lightest): the ground there is a step *below* the page. The dots are gone; `<Background variant="lines" gap={48}>` in `--cv-grid` at 55% says "this pans" without competing with the borders | Any canvas of cards on which things are dragged. Never for a table |
| `.org-card` | 220 × 92: name + rank chip (`B · 8%`, or `no rank yet` when the title has no rung on this ladder), the title in small mono caps with `· no downlines` / `· manual` only when true, and the last row **`Upline · NAME ▾`** — a real button that opens the Move popover. Since 2026-09-10 the line every card names is `reports_to`, the same line People draws; there is no dashed "borrowed" line any more. No shadow at rest (DESIGN rule); the one moment a card casts one is while it is being dragged (`.react-flow__node.dragging .org-card`: scale 1.04, −1.5°, shadow). States: `.sel` accent ring, `.can` dashed accent (may take the dragged person), `.forbid` 30% (may not), `.target` accent fill + glow + scale (the card under the pointer), `.target.bad` the same in danger, `.fresh` a fading halo after a move, `.unplaced` dashed border (no rank yet) | Cards on the canvas; the same tokens should be reused when People › Hierarchy adopts the look |
| `.org-pop` | The Move popover: everyone on the chart grouped by tree, the current upline marked, anybody who may not take the mover greyed with the reason (`their downline` / `no downlines` / `lower title`), a name filter, and "Top of their own tree" (the detach) as the last row. Nothing about a rank is asked here (2026-09-10): the rank follows the title and is set on the Team tab. Portalled, anchored to the button that opened it, flips above when there is no room below | Choosing one person out of a tree |
| Motion | Cards rise in one after another when the chart opens (`.org-canvas.enter`, `--i` per card); a re-layout glides through the node state over 500 ms with an overshoot so the edges follow the cards; the line a move just made draws itself (`pathLength="1"` + `.react-flow__edge.fresh`); Fit / Centre / ± animate; the note and selection bar slide in (`.org-slide`). All off under `prefers-reduced-motion` | — |

Two rules the canvas keeps that the rest of the page does not: a card dropped
on empty ground **stays there** (remembered per browser and scheme in
`localStorage`; Tidy or any move clears it, because a moved tree has a new
shape), and the ground is the only non-paper surface — everything around it
(toolbar, note, selection bar, popover) is still in the portal's own tokens.

### Payment statement (v3.7, 2026-09-11 — HR › Payment)

The approved combination uses concept A's reporting and concept B's table hierarchy.
Payment inherits the same Plaster/Walnut/Harbour palette, sidebar and topbar as
the other portal pages, including their dark theme. It must not override shared
theme tokens or reskin the portal shell. `.payment-statement` keeps the serif
Payment title, thin rules, square table surfaces,
shaded headers, right-aligned monetary columns and compact status text. Styles live
in `payment/payment-statement.css` and `_components/payment-tables.css`.

The upper report is one continuous sheet on `--surface`, with a hairline outer
border and a 2px ink top rule. Its three totals sit on a `--surface-2` band; the
reconciliation and dates share the lighter body, separated by a vertical hairline
that becomes horizontal on phones. Keep the header/month rail outside the sheet.
The action footer and contribution table headers/totals get restrained surface
tints. This separates the report from the page without shadows, extra cards,
new colors, or changes to the approved typography. Use 24px desktop / 14px phone
horizontal insets and allow focus rings to extend outside the sheet.
The sheet is an inline-size container: totals and detail columns stack when the
report itself is 680px or narrower, including a tablet with its sidebar pinned.

The shared report remains above two tabs: **Salary** (default) and **Statutory**.
It contains total payroll cost, actual salary paid, statutory outstanding, payroll
reconciliation, expandable contribution breakdown, current HR pool/funding gap,
and payment dates. Paid totals use paid vouchers only; excess paid on one scheme
cannot offset another scheme's outstanding amount. **Changes from the previous
month belongs only to Salary**, including the employee variance disclosure.

Salary shows department totals, people, net salary, status, PV records and the
Alliance file. Statutory shows the four institutions, contribution amount, due
date, status and generation actions. SOCSO and EIS are separate schemes under
PERKESO. The month rail closes only when every positive statutory contribution
is covered by a paid voucher and no active unpaid statutory vouchers remain.

Both tables expose exactly two generation entry points:

- **Generate by Department** includes every remaining eligible employee in the
  chosen department, grouped into one PV per scheme (one salary PV).
- **Manual generate** opens the department's employee selection and creates one
  PV per selected employee per scheme. Manual selection starts empty.

Statutory generation opens a centered native dialog for both entry points, rather
than inserting an editor below the table. Department navigation, employee/date
selection, review and success remain inside that window. The header and totals /
action footer stay visible while the body scrolls. On phones, department choices
wrap and the employee table can scroll horizontally inside the dialog. Use the
existing surface/chrome colors and typography. Native modality blocks background
interaction; lock the portal's scrolling `main` and restore its position and the
trigger's focus on close. Close, Escape and backdrop dismiss the window, except
while generation is in flight. Only explicit confirmation creates PVs.

Inside that window, separate the department rail from the employee workspace:
the grid uses `surface-2` behind the full-height rail, with a `surface` employee
pane and a `hairline` divider. A `paper` body frames the bordered workspace and
tables; the fixed footer uses solid `surface-2`. Use subtle alternating rows and
`accent-bg` plus an inset accent rule for checked employees and the active
department. On phones the rail becomes a horizontal strip above the employee
pane, separated by a bottom rule. Keep the existing typography and amounts.

There is no independent PV-format toggle. Existing coverage cannot be selected
again. Review freezes the selected people, count, amount and payment date before
confirmation; changing the selection requires returning to the form. Statutory
multi-scheme generation is atomic and rechecks coverage and expected totals.
Both staff and director statutory contributions use the HR custody pool.
Stored contribution lines are an immutable audit snapshot shown on the voucher
and PDF. Their voucher permits date/notes edits only, preserving its financial
fields and custody sources. HR access to these detail/download routes is limited
to payroll records; Treasury actions remain permission-gated.

Salary department windows keep status/date text unbroken, support keyboard focus
and contain horizontal overflow. Tabs support arrow keys and retain selections
when switching. On narrow screens the report stacks and tables scroll within
their own containers.

### `.page-head` example (mandatory shape)

```tsx
<div className="page-head">
  <div>
    <div className="page-eyebrow">
      <em>I.</em> TREASURY · LOANS OUT
    </div>
    <h1 className="page-title">Fund OUT</h1>
    <p className="font-serif italic text-graphite text-base mt-3">
      Loans disbursed by HV. <em>Rates lock at creation.</em>
    </p>
  </div>
  <div className="flex items-center gap-3">
    <ExportCSVButton />
    <Link href="/fund-out/new" className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors">
      Record new loan
    </Link>
  </div>
</div>
```

### `.ledger-table` example (mandatory shape for any data list)

```tsx
<table className="ledger-table">
  <thead>
    <tr>
      <th>Company</th>
      <th className="right">Amount</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {rows.map((r) => (
      <tr key={r.id}>
        <td>
          <div className="font-serif text-[15px] text-ink">{r.name}</div>
          <div className="font-mono text-[11px] text-graphite mt-0.5">{r.code}</div>
        </td>
        <td className="num">{formatMoney(r.amount)}</td>
        <td><em className="font-serif text-graphite text-sm">active</em></td>
      </tr>
    ))}
  </tbody>
</table>
```

### `.sect-head` example

```tsx
<div className="sect-head">
  <h2>Subsidiaries</h2>
  <span className="rule" aria-hidden />
  <span className="count">{rows.length} ENTITIES · NET POSITION TODAY</span>
</div>
```

---

## Component Vocabulary

Components required for Phase 1 (many already exist, need restyling):

| Component | Role | Key style notes |
|---|---|---|
| `<Shell>` | Sidebar + TopBar + Main wrapper | Cream bg, hairline dividers |
| `<Sidebar>` | Left nav | Cream bg, serif wordmark, italic-rust active state, sans nav items |
| `<TopBar>` | Greeting + meta + user menu | "Good morning, *Principal*." with italic rust; mono date/period meta |
| `<HeroNumber>` | Big serif money on dashboards | 64px Instrument Serif, italic serif label in rust above, mono meta below |
| `<Sparkline>` | Hairline trend line | 48px height, 1.25px stroke, no axes/legend |
| `<ApprovalCard>` | Pending approval item | Hairline border, serif title, mono amount, italic rust "*Approve*" button + secondary button |
| `<DataTable>` | Fund sources / loans / overdue list | 48px rows, hairline dividers, tabular mono for money, serif heading row |
| `<StatusLabel>` | "*active*" / "*overdue 15d*" / "*pending*" | Italic serif + semantic color (no pill, no bg) |
| `<MoneyCell>` | Money display | Mono tabular, right-aligned in tables |
| `<DateCell>` | Date display | "Wed 9 Apr 2026" serif OR "9 Apr 2026" mono depending on context |
| `<Button variant="seal">` | Primary action (Approve, Save) | Rust `--accent` bg, white text, italic serif font, rounded-md 6px, no shadow |
| `<Button variant="secondary">` | Secondary action | Transparent bg, hairline border, sans graphite text, rounded-md |
| `<Input>` | Form input | Hairline border, cream-2 bg, rust focus ring, mono font for numbers |
| `<Select>` | Dropdown | Same style as Input |
| `<FormField>` | Label + input + helper | Sans label, italic serif helper |
| `<ConfirmDialog>` | Destructive confirmation | Warm modal with subtle shadow, serif title |
| `<Toast>` (Sonner) | Success/error feedback | Cream surface, serif italic message |
| `<EmptyState>` | Zero-data placeholder | Serif italic title, sans body, muted illustration (if any) |
| `<LoadingSkeleton>` | Loading placeholder | Hairline-only, no pulse shimmer, minimal |
| `<Timeline>` | Repayment history, cash flow | Vertical hairline track with dot markers |

### Sidebar nav item pattern (v3.0 editorial)

The Sidebar is its own world — see `src/components/layout/Sidebar.tsx` for the canonical implementation. Three things matter for any nav-item-like surface elsewhere:

- **Group label.** Italic serif accent roman numeral (`I.` `II.` `III.`) + uppercase mono section name + hairline rule extending right.
- **Inactive nav item.** 13px sans graphite + small hairline-grey `3×3` round dot marker on the left at `8px` from edge. Hover deepens both.
- **Active nav item.** 15.5px italic serif accent + `--accent-bg` background + `3×16` rust **vertical bar** on the left at `6px` from edge (replaces the dot).

Do not use the v2.0 inactive-grey + active-rust-bg only. The dot/bar marker is what gives the sidebar weight.

### Hero number pattern (v3.0)

The hero number must use `--num-ink` (not `--ink`) and tabular figures. Wrap cents/units in `--graphite` so the digit dominates. Footer meta is uppercase mono in `--graphite` (not `--muted`).

```tsx
<div>
  <div className="font-serif italic text-accent text-base mb-1">
    Total outstanding
  </div>
  <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
    {formatMoney(total)}
  </div>
  <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
    {count} ACTIVE LOANS
  </div>
</div>
```

For a more elaborate hero with explicit cents/unit treatment, use the `.num-hero` class which auto-styles `<span class="cents">` and `<span class="unit">` to graphite.

### Approval card pattern (v3.0)

```tsx
<div className="border border-hairline rounded-md p-5 bg-surface">
  <div className="text-xs font-sans font-semibold uppercase tracking-wider text-graphite mb-1">
    NEW LOAN · HOUZS CENTURY
  </div>
  <div className="font-serif text-lg text-ink mb-1">Working capital loan</div>
  <div className="font-mono tabular text-md font-semibold text-num-ink mb-3">
    {formatMoney(100000)} · 1.175% /mo · 12m
  </div>
  <div className="text-xs text-muted mb-3">Submitted by Finance · 2h ago</div>
  <button className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-md font-serif italic text-sm">
    Approve
  </button>
  <button className="ml-2 border border-hairline px-4 py-2 rounded-md text-graphite text-sm font-sans">
    Review
  </button>
</div>
```

Note: tier system was removed (mig 63). Don't reintroduce `T1`/`T2`/`T3` labels. Loans show a single rate (Base + custom premium per loan, locked at creation).

---

## Icon Set

**No icons in Phase 1 sidebar.** Text-only nav items. Cleaner, serif labels do the work.

Where icons ARE needed (Phase 1.5 and beyond): **`lucide-react`** only. No emoji. Icon + text + `aria-label`.

Avoid icons for status. Use italic serif + semantic color text instead. E.g., `<em class="text-[--alert]">overdue 15d</em>` not 🟡.

---

## Interaction States

Every data surface must handle 5 states:

### Loading
- Skeleton with hairline outline only, no shimmer. Match the target shape.
- Appear within 100ms of navigation.

### Empty
- Italic serif title + sans description + optional CTA
- First-time empty: "No fund sources yet. Finance can add the first one."
- Filtered empty: "No matches for those filters. Clear filters to see all."
- Zero-alert: CELEBRATE it (e.g., "*All loans current.*" in `--ledger` green), not an empty table

### Error
- Network: "Connection lost. Retrying..." + retry button
- Validation: inline on field, `--danger` text + hairline border (no red background)
- Access: "Your role ({role}) can't access {module}."
- Generic: "Something went wrong. Retry or contact admin."

### Success
- Toast for small confirmations ("Treasury config saved.")
- Inline panel for significant events ("Loan fully repaid. *Close it?*")
- Redirect to detail page after create

### Partial
- Dashboard: "Some sections failed to load. [Retry failed]"
- Statement: "5 of 7 companies generated. [Retry failed]"

### Multi-select — ticks outlive a drill-down

A list with checkboxes reads a row's detail page as part of the same job: you
tick five, one of them is unclear, you open it, you come back and carry on
ticking. So selection is not local `useState` — it lives in
`lib/selection-store.ts`, keyed by the list's own path, and the list restores
it on remount. It expires the moment the reader lands on another nav
destination (a tab switch), never on a drill-down; `PortalFrame` owns that
call. Ids that vanished while the reader was away — the row they just
approved — are pruned, so the count and the bulk total stay honest.

Use `useStickySelection(scope, visibleIds)` — see
`approvals/_components/PendingApprovals.tsx`. Lists whose detail view is a
modal (billing's `InvoicesList`) never unmount and need none of this.

---

## Responsive (mobile shipped 2026-08-31)

Desktop remains the primary target — VP is an office tool — but the whole
portal is usable on a phone. `md` (768px) is the one line that matters: above
it nothing has changed from the desktop design; below it the shell and the
tables reshape.

| Breakpoint | Width | Scope |
|---|---|---|
| Mobile (<768) | supported | Bottom tab bar, folded tables, 16px form controls |
| Tablet (768–1024) | desktop shell | Sidebar rail returns; tables show every column |
| Desktop (≥1024) | primary | Full layout |

### Navigation

Below `md` the sidebar rail is not rendered at all. Navigation is
`BottomTabBar` — four destinations promoted per role plus **更多**, which opens
`MoreSheet` with the full nav grouped exactly as the sidebar groups it.

The four are defined in `components/layout/nav-config.ts` (`TABS_BY_ROLE`),
which is also where `navEntries` now lives so the sidebar, the tab bar and the
sheet cannot drift apart. Principal gets 总览 · 审批 · 付款 · 收款; Finance
swaps 审批 for 发票; HR gets 薪资 · 员工 · 董事; a dept manager gets
账单 · OPEX · 报表. The Approvals tab carries a pending-count badge.

The bar is 54px plus `env(safe-area-inset-bottom)`; the root layout sets
`viewportFit: 'cover'` so that inset resolves on notched phones, and
`PortalFrame` pads the main scroll area by the same amount.

### Tables — the fold

A nine-column voucher list is ~1030px wide; on a 390px phone that is three
sideways screens to read one row. Below `md` a table keeps only the columns
that identify a row and folds the rest into a per-row panel behind a chevron.

**`SortableTable`** derives the split from its column config — `mobile: 'keep'`
pins a column, `mobile: 'drop'` removes it from mobile entirely, and with
neither declared it keeps the first column plus the first right-aligned
(amount) column.

**Hand-rolled tables** use `<LedgerRow>` (`components/LedgerRow.tsx`) plus two
annotations, so the existing desktop markup is untouched:

```tsx
<table className="ledger-table">
  <thead>
    <tr>
      <th>Voucher</th>
      <th className="m-hide">Date</th>
      <th className="num">Amount</th>
      <th className="lt-toggle" aria-hidden />   {/* required */}
    </tr>
  </thead>
  <tbody>
    <LedgerRow>
      <td>{v.voucher_no}</td>
      <td className="m-hide" data-label="Date">{date}</td>
      <td className="num">{formatMoney(v.amount)}</td>
    </LedgerRow>
  </tbody>
</table>
```

- `.m-hide` — this column leaves the mobile grid and appears in the panel,
  titled by its `data-label`. It also works on a whole `<tr>`.
- `<th className="lt-toggle" aria-hidden />` is **not optional**: without it the
  header band stops short of the chevron column and leaves a notch. CSS cannot
  close that gap — a missing cell's area is painted with the *table's*
  background, not the row's or the row group's.
- A summary/total row that is a plain `<tr>` needs `<td className="lt-toggle" />`
  as its last cell so its figures stay under the column above.

**Four kinds of table deliberately keep every column instead:**

1. **A form spans the whole row.** Check this one first — it is the only
   exception that corrupts data rather than merely looking wrong. The panel
   renders each folded cell's children a *second* time, so a `<td>` holding a
   named input produces two fields with the same `name`. `FormData` returns the
   first, which is the hidden copy still carrying the original `defaultValue` —
   the user's edit in the panel is silently discarded and the stale value is
   saved. The commission settings grids (`ProductsSection`,
   `CommissionSection`) span one form across every cell of a row and are exactly
   this shape.

   Those grids now use `RowForm` (`_components/config/ui.tsx`), which keeps the
   `<form>` element out of the table entirely — it is portalled to `<body>` and
   the fields join it through the `form` attribute, because `<form>` is not a
   legal child of `<tbody>` either. **That does not make them foldable.** The
   duplicated cell still produces two inputs with the same `name` pointing at
   the same form, and `FormData` still returns the stale first one. The test is
   "does one form own fields in more than one cell", not "is there a `<form>`
   tag in the row".

   A `<form>` **inside a single cell** is fine — the duplicate is a complete,
   independent form and either copy submits correctly (see `/overdue` and the
   HR-costing submissions table). So is a controlled input that is read from
   React state rather than submitted (`MoneyInput` on the Director Pool
   calculator, the date pickers on `StatutoryTable`).
2. Tables that already expand on tap — the GL statements (`GlReportView`), the
   Chart-of-Account tree, the company statement. A second chevron would fight
   the first; they drop optional comparison columns instead.
3. The reconciliation matching panes, where the row tap selects for pairing.
4. `MonthlyMatrix` — a 12-month grid cannot shed months. It pins the account
   column and scrolls, wrapped in `.table-scroll` for the edge-fade cue.

`.table-scroll` is the escape hatch for any table that genuinely cannot fold.

### Type and controls

The top of the type scale steps down under 768px (`.text-3xl` → 30px,
`.num-hero` → 36px) because a seven-figure sum at 40px wraps onto two lines
with "RM" stranded alone. The canonical hero pattern is
`text-[30px] sm:text-[44px] md:text-hero`.

Every form control is forced to **16px** below 768px. This is not a style
choice: iOS Safari zooms the viewport on focus for anything smaller and does
not zoom back, so every tap on every field left the user pinching out. It ships
with `!important` for that reason — see the comment block in `globals.css`.
Controls also get `min-height: 44px`, which is the touch target the
Accessibility section below asks for.

---

## Accessibility (WCAG AA baseline)

**Non-negotiable:**

1. **No emoji-only status.** Use italic serif text + semantic color + `aria-label`.
2. **Color contrast AA** — verified above.
3. **Keyboard nav** — tab through all interactive, Enter/Space to activate, Escape to close modal.
4. **Focus management** — modal open → focus first input → Escape closes → focus returns to trigger.
5. **Form labels** — every input has `<label for>`, required has visible + `aria-required`.
6. **Table semantics** — `<table>`, `<thead>`, `<tbody>`, `<th scope>`, `aria-sort` on sortable headers.
7. **Live regions** — `aria-live="polite"` for info toasts, `assertive` for error toasts.
8. **Skip link** — "Skip to main content" at top of shell.
9. **Touch targets** — 44×44px min for all buttons.
10. **Language** — `<html lang="en-MY">` default, switch to `zh-MY` on language toggle.
11. **Serif text minimum 14px** for body, 15px for italic serif labels (italic is harder to read).
12. **`prefers-reduced-motion`** disables all non-essential motion.

### Automated checks

Add `@axe-core/react` in dev and `eslint-plugin-jsx-a11y` in CI.

---

## Motion

**Minimal, meaningful motion only.** Three motions exist:

| Motion | Duration | Easing | When |
|---|---|---|---|
| Page fade-in | 200ms | ease-out | Route change |
| Button hover | 120ms | ease-out | Background color tween (no scale) |
| Seal stamp | 250ms | cubic-bezier(0.2, 0.8, 0.4, 1) | Approve button click — rust background fills briefly |
| Form error shake | 300ms | ease-in-out | On submit error only |

**No scroll-linked animations. No parallax. No bounce easing. No decorative motion.**

`@media (prefers-reduced-motion: reduce)` kills everything except opacity transitions.

---

## Writing & Tone

### UI copy style

- **Conversational precision.** "Good morning, *Principal*." not "Welcome back!"
- **Serif italic emphasis** on key labels ("*Free pool*", "*Pending your hand*", "*overdue 15d*")
- **Utility language** — tell users what, where, and what to do
- **Not marketing** — no "unlock", "empower", "delight", "boost"
- **Malaysian English** — "RM 100,000.00", "lock-in period", "contra entries"
- **Bilingual** — EN + 中文 toggle in user settings (default EN)

### Button verbs (italic serif for seal variant)

- *Approve*  (seal variant, italic serif)
- *Save* / *Save Treasury* / *Save Directors* / *Save Companies*
- *Record repayment*
- *Generate statements*
- *Escalate*
- Secondary (sans regular): Review, Cancel, Back

### Money format

| Context | Format | Font |
|---|---|---|
| Tables, detail views | `RM 100,000.00` | Chivo Mono tabular |
| Hero numbers | `RM 12,847,203.55` | Instrument Serif 64px |
| KPI cards | `RM 100K` / `RM 1.2M` | Instrument Serif 28-40px |
| Negative (contra) | `(1,234.56)` | mono + `--danger` color |

### Date format

| Context | Format | Font |
|---|---|---|
| Serif display | "Wed 9 Apr 2026" | Instrument Serif |
| Mono meta | "9 Apr 2026" / "Wed 09:42" | Chivo Mono |
| Form input | ISO `2026-04-09` | mono |
| Period | "April 2026" | serif |

### Bilingual canonical labels

| English | 中文 |
|---|---|
| Internal Ledger | 内部账册 |
| Overview | 综览 |
| Fund IN | 资金流入 |
| Fund OUT | 资金借出 |
| Overdue | 逾期 |
| Statements | 对账单 |
| Dept Pool | 部门账户 |
| Director Salary | 董事薪水 |
| HR Costing | 人事成本 |
| Reports | 报表 |
| Settings | 设定 |
| Free pool | 自由资金池 |
| Pending your hand | 待您批准 |
| Approve | 批准 |
| Review | 审核 |
| overdue | 逾期 |

---

## Implementation Notes

### File organization

```
src/
├── components/
│   ├── ui/            ← primitives (Button, Input, Dialog, Toast) with DESIGN.md styling
│   ├── layout/        ← Shell, Sidebar, TopBar
│   ├── charts/        ← Sparkline wrapper, minimal charts
│   ├── vp/            ← VP-specific (HeroNumber, ApprovalCard, StatusLabel, MoneyCell)
│   └── forms/         ← FormField, NumericInput, DatePicker
```

### Tailwind theme tokens

All tokens exposed via `tailwind.config.ts` theme extend. Use `bg-bg`, `text-ink`, `border-hairline`, `text-accent`, etc. Never hardcode hex values in components except in the config file.

### Google Fonts loading

Loaded in `src/app/layout.tsx` via `next/font/google` for optimal Next.js integration + `font-display: swap` to avoid FOIT.

---

## Review Process

Any new component or design change must check against this doc:

1. Uses tokens from `tailwind.config.ts`? No hardcoded hex.
2. Display text uses `font-serif`? Body uses `font-sans`? Money uses `font-mono`?
3. Handles all 5 interaction states?
4. A11y compliant (keyboard, contrast, labels)?
5. Avoids the AI slop blacklist?
6. Desktop tested at 1280px + 1440px + 1920px?
7. No emoji, no shadows on cards, no rounded-xl, no gradients?

If adding a new component to vocabulary, update this doc first.

---

## Change Log

- **2026-09-10 (latest)** — Memberships per sub-department. Staff Hierarchy is per sub-department: the HOME one (the department's oldest) is the company chart; every other one (IR) is its own tree with its own title per member. The Team tab there gains an **Add to IR** row (person + title held here), a Title picker per row with the company title in small print beneath when it differs, and a **Remove** per row; the chart's footer and intro say which kind of tree it is. Same `.ledger-table` / `RowForm` vocabulary, nothing new in `globals.css`.
- **2026-09-10 (later)** — One line. The Revenue chart draws and moves `reports_to`, the same line People draws; the commission position follows it in the database. The dashed borrowed line, the `not placed` state, the rank select and the "placed first" plan in the popover are gone; a card whose title has no rung on the ladder reads `no rank yet`. See `.org-card` / `.org-pop` under "Org chart canvas (v3.4)".
- **2026-09-10** — Move popover: an upline with no position yet is pickable. The row says `placed first`; picking it shows the plan (them on the ladder at their title's rank, whoever above them on the reporting line who is not on it either, then the mover), every rank a select, one `Place both` / `Place all N` button. The drop label says `→ under NAME · placed first` while the card is in the air. Superseded the same day — see the entry above.
- **2026-09-09 v3.4** — Org chart canvas (Revenue › Staff Hierarchy). The canvas re-declares its palette as `--cv-*` tokens: a cool Slate ground on the accent's hue, white cards, cool ink (card vs ground ΔL* 10.1, from 0.0). Every card's last row is `Upline · NAME ▾`, a button into the Move popover; cards dropped on empty ground stay put; motion on entrance, re-layout, the fresh line and the halo. See "Org chart canvas (v3.4)".
- **2026-04-25 v3.0** — Ledger-Dense / Finance-readability pass. Imported the design exported from claude.ai/design (`design-import/venture/`). Deepened the warm-paper palette (paper #F5EFE4 → #F3ECDD, hairline #DFD4BE → #C6B99E, ink #1A1613 → #1C160F, graphite #6B5F52 → #5A4E40, muted #9E8F7F → #85775F) and introduced a dedicated `--num-ink` (#1A130B) for monetary digits. Added v3.0 utility class layer in `globals.css`: `.num`, `.num-hero`, `.ledger-table`, `.page-head`, `.page-eyebrow`, `.page-title`, `.sect-head`, `.chip`. Sidebar rebuilt with editorial roman numerals + dot/bar markers. TopBar greet enlarged with role badge + ledger green dot. 17 high-traffic pages migrated as reference implementations (Dashboard, Fund IN/OUT, Payments, Statements, Approvals, Overdue, Reconciliation, HR Costing, Director Salary, Settings, Reports, Audit Log, Claims, Dept Pool, Director Pool, Invoice Pool, BillingView). Backend untouched (zero changes to Server Actions / RPCs / Supabase / lib).
- **2026-04-10 v2.0** — Major pivot to Anthropic-flavored warm cream + Instrument Serif + rust accent direction, per design-consultation session. Replaces institutional slate direction from v1.0.
- **2026-04-09 v1.0** — Initial version from /autoplan Phase 2 design review. Proposed slate-cool direction with TBD brand color (navy vs teal).
