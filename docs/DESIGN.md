# DESIGN.md — HOUZS Venture Portal

**Version:** 3.10
**Last updated:** 2026-09-27
**Maintained by:** HOUZS Venture Portal team
**Status:** v3.11 (Sheet theme on HR's whole view — Overview and People included / Walnut shell / approved Product List workspace, with its two settings tabs) — single source of truth for all UI work

> **For coding agents and contributors:** This is the **only** UI design doc. If you're adding a new page or amending an existing one, this file dictates the colors, fonts, components, and page anatomy. Do not invent parallel design notes — extend this doc instead. See `## Implementation rules — read this first` below.

---

## Implementation rules — read this first

### Sheet theme — the portal's new tone, HR's view first (v3.9–v3.10, 2026-09-27)

Comm Cal's month (#151 → #162) is the reference for how the portal now looks,
and the user asked for every page to follow it "so that the software is all
sync with the tone" — starting with the pages HR reads: **HR Costing** (Overview,
Payroll, Payment, Allocation, payslips, import), **Director Salary**, **Director
Pool**, **Revenue** (Comm Cal and every page under a month, Staff Hierarchy,
Rules — not the Product List, which keeps its own workspace) and
**Claims** (v3.9), then the rest of HR's sidebar (v3.10): the **Overview**
(`/dashboard` — one route, so the Principal's, Finance's and a department
manager's dashboards moved with HR's) and **People** (People Management and
every person / account page and form under it, Member Services, Hierarchy,
Roles, Permissions). `lib/sheet-routes.ts` lists the prefixes; extending the
tone to the rest of the portal is adding a prefix there and converting the
page (below).

**What it is.** PortalFrame draws, for those routes, the content column inset
10px around ONE white sheet (`.sheet-frame` › `.sheet`, 16px radius, hairline
border, 24px padding) that stays put while one of these pages replaces another;
the loading skeleton lands on it too. The shell — sidebar rail, greeting bar and
the plaster around the sheet — keeps the Walnut/Harbour palette and follows the
user's theme (#152: the user wanted the shell's colours preserved). Inside the
sheet `.sheet-theme` declares the Comm Cal month's tokens:

- **Lettering is black** (`--ink`, `--num-ink`, `--graphite`, `--muted` are all
  0 0 0). Hierarchy comes from size, weight and surfaces. No italics — `em` and
  `.italic` stand upright on the sheet.
- **Orange `#E99A53` is a surface, never lettering** (2.2:1 on white). It paints
  primary buttons, the active tab's 3px underline over a peach wash
  (`--accent-bg` `#FFF4E7`), the page-head rule, the eyebrow numeral, checkbox
  ticks. `text-accent` renders black (links underline), `hover:text-accent`
  underlines, and anything painted orange carries black lettering even where the
  markup still says `text-white`.
- **Walnut is the one dark object**: the page's primary summary card
  (`tone="primary"`), a salesperson's / statement's person header, dark
  popovers (`bg-ink` renders walnut on the sheet).
- Semantics keep their meaning and their light values in both themes: red
  negatives and errors, green done / increases, amber waiting. A status is a
  **word on a wash** (`.chip alert|ledger|danger|info|accent` with its dot),
  never coloured words alone.
- The sheet is light in both themes, like the Product List: black lettering
  needs a light ground. Components with their own palettes (`.org-canvas`,
  `.pay-board`, `.hero-walnut`) stay at their light values on it.

**How a page is built on it** (reference: `hr-costing/page.tsx`,
`hr-costing/payroll/[period]/page.tsx`, and the month itself):

1. `.page-head` as everywhere (eyebrow `<em>I.</em> SECTION · PAGE`, Georgia
   title); on the sheet the rule is orange and the eyebrow 10px.
2. **Summary cards** (`components/sheet/StatCard.tsx`) instead of a hero, a
   figure strip or tiles: `<StatCards label>` of `<StatCard label value icon
   note tone href?>` — a short bar, the label in small caps, the figure, a note
   and a line icon (`SheetIcon`) at the foot. Exactly one `primary` per row, the
   figure the page is opened for; `danger` / `alert` only while the problem
   holds. A month shown as a hero moves into the eyebrow/title; its status line
   becomes the primary card's note.
3. Sections: `.sect-head` (17px/600 title over the same rule and mono count), or
   `.sheet-heading` + `.sheet-subtitle` for a heading with one sentence.
4. Tables: every `.ledger-table` becomes the month's table automatically — a
   framed well (`216 210 200`, 10px radius), an uppercase 10px/600 header band
   (`235 231 224` over a `207 197 183` rule), white / `#F7F7F5` zebra, peach
   hover, 12px text with 12px `.num` figures, and a peach `<tfoot>` for the
   total. Put a closing total in `<tfoot>`. The payroll grid keeps its own
   geometry and takes only the lettering and the light department bands
   (`.group-btn` is the header band's tone with a walnut marker on the sheet).
   `.table-frame` › `.table-frame-scroll` + `.table-frame-foot` when a table
   needs the month's footer strip. Rows grouped under a label that does not
   fold (Roles' departments) sit under a band row —
   `<tr className="band-row"><td colSpan={n}>Finance <span className="count">4 titles</span></td></tr>`
   — the header band's tone with a walnut marker, the roster's `.group-btn`
   band without the button.
5. Tabs: `SlidingTabs` renders the month's tabs on the sheet by itself (a
   tinted, underlined pick; counts in boxed badges). A hand-built rail uses
   `.sheet-tabs` with `aria-selected` / `aria-current` and `.sheet-count`.
6. `.sheet-toolbar` for a search / filter panel above a table,
   `.sheet-notice` (peach) / `.sheet-warning` (amber) / `.sheet-danger` (red)
   for a callout. A salesperson's payslip or statement opens on the walnut
   person header, as the workbench's person view does (`.hero-walnut`, 12px on
   the sheet): eyebrow row with a status tag, initials, name, title · rank,
   the total on the right.
7. Overlays portalled to `<body>` (PaycheckWindow, the commission editor, the
   hierarchy's Move popover and context menu) carry `sheet-theme` on their
   portal root, because they render outside the sheet.

Every sheet override in `globals.css` is written `:where(.sheet-theme) <base
selector>`, so it has exactly the specificity of the rule it replaces: a page's
own utilities keep the power they had. Don't add a sheet rule with more weight
than its base.

### Product List workspace — approved 2026-09-24

The user's approved Product List design supersedes the older restrictions on
white surfaces and warm accents **within `/revenue/products` and its visible
shell**. Since 2026-09-27 the same tokens are the sheet theme's (above) on HR's
view; the Product List is the one route that also re-tones the shell.
`.product-theme` scopes the tokens in `globals.css`; the user's theme preference
is not rewritten.

- Keep the existing light brown sidebar and greeting bar (`#DED7CA`), on a
  light neutral gray base (`#F3F3F1`). The content panel and inputs are white.
- Use the lighter orange (`#E99A53`) for actions, active tab rules and markers.
  The current sidebar item has a pale orange background (`#FFF4E7`) and a narrow
  orange marker. It is not a solid orange block.
- **All text is standard black (`#000000`)**, including the sidebar, title,
  buttons, placeholders, labels, prices and supporting copy. Establish hierarchy
  with surfaces, spacing and weight. Status remains explicit in words and can
  use coloured borders/backgrounds; it must not depend on coloured text.
- Place category chips and search/model/tier controls in one shallow gray
  filter panel (`#F6F6F4`), with a divider between the two rows. Keep the main
  Product List tabs outside this panel.
- Use a stronger table header (`#EBE7E0`), subtle white / `#F7F7F5` alternating
  rows, and a footer. The wide sheets scroll internally in both directions,
  with a sticky header and a frozen first column: Combo Pricing fills the
  remaining window, SKU Master (and Costing gaps) take a whole screen — see
  *One screen* below; on mobile a fixed-height window.
- **Lists scroll with the page (2026-09-27).** Modular and Maintenance only grow
  downward, so they grow with their rows and the page's own scrollbar moves them,
  as the ERP's Products page does — no box inside the page. A table there keeps
  its header stuck to the top of the page and scrolls sideways inside its card
  only while it is wider than the card. `productTabScroll` names each tab's mode;
  a new tab that only grows downward belongs on the page.
- SKU Master is for finding SKUs and maintaining prices: omit pricing summary
  cards, calculator labels/filters, category ratios and the long introduction.
  Sofa prices remain the ERP-ordered size columns and P1/P2/P3 tiers. Sofa,
  Mattress and Bedframe — whose models gather several SKUs — each carry a model
  filter, as on the ERP; the other categories are one SKU per model and do not.
  Preserve raw size labels, but omit the `DEFAULT` size and flat
  fallback price columns. Omit Status throughout SKU Master. Hidden saved
  defaults and fallback prices survive edits to visible prices; other product
  categories retain their ordinary Price column.
- Retain portal-owned price writes, permission checks and existing pricing
  semantics. No ERP source price becomes a portal cost through this restyle.
- Modular is a board of model cards grouped by category, in the ERP's order, and
  **inside a category by branding** (2026-09-27): the ERP's branding — the
  model's own, else its SKUs' — named by the brand register's code when the
  register knows it (DUNLOPILLO sits under DUNLOP, the word on its cards), A→Z,
  the unbranded together last as *No branding*. Each run of cards opens on a
  small heading: the eyebrow's orange dash (grey for *No branding*), the
  branding in caps and its count, then a hairline to the edge. A category where
  nothing is branded has no such headings. A heading counts its whole group
  even while *Show more* holds some cards back, and ‹ › steps through the
  models in the order they are drawn. The margin ladder chosen in a model's
  window never moves its card — the branding is the ERP's fact
  (`modular-board.ts`). A card opens the model in a floating one-sheet window
  with fixed save/cancel controls; on phones the window fills the screen. Empty
  ERP allowlists are unrestricted; empty portal selections mean none. Keep
  inactive saved selections visible so they can be removed.
- Maintenance keeps the ERP's Bedframe/Sofa pool order and values, with a separate
  fabric view. An option pool has no search box — the largest holds about twenty
  values and the ERP's Maintenance lists have none; the fabric view keeps its
  search and tier filters. Fabrics expose both category tiers, using the shared
  tier and then P2 when a category mapping is absent. All rows remain reachable
  with Load more. Every priced pool reads *Charge (RM)* with an *Edit charges*
  button (2026-10-06: a price there is the customer's, never a cost), and the
  note under the toolbar says what a price in that pool does — per frame for a
  bed frame, ONCE per sofa for a sofa; blank or 0 is FOC (free for a special).
- Combo Pricing retains module slots, alternatives, repeated modules, tiers and
  effective dates. Match equivalent size keys without losing their raw labels or
  historical price columns. A blank clears a price; zero remains a stored zero.
- Preserve drafts across filters and require a keep/discard choice before tab or
  model switches. Disable competing actions while a save is running. Save errors
  retain edits, and partially successful maintenance batches retry only failures.
- Costing gaps is a searchable work list with reason filters and a direct SKU
  lookup. Sum lines and revenue; do not sum per-code bill counts, which overlap.
- **Two settings tabs close the rail (2026-09-27): Costing Setting and Add-on /
  KPI Items.** Both are per sub-department — the filter panel holds one row of
  sub-department chips (`?sub=`, carried from one of the two tabs to the other;
  switching with unsaved changes asks keep/discard like a tab switch) — and
  both scroll with the page. Under the panel a card holds the sub-department's
  own figure: the ratio every SKU's cost is divided by, with a worked RM 1,000
  example, or the KPI switch — On on the ledger green wash, Off on the amber
  one — and a link to Rules, where it is set. Then the workspace's own rhythm:
  heading and count, *Edit ratios* / *Edit items*, then *Cancel changes* and
  *Save N changes*. While editing, a peach picker panel sits above the table:
  a search that shows nothing until something is typed (twenty results at
  most, *narrow the search* beyond), what is already listed marked *On the
  list*; Costing Setting ticks SKUs and adds them at one ratio, Add-on / KPI
  Items adds one at a time from SKU Master, Bed frame specials or Sofa
  specials, at the amount typed beside the search. Added rows land at the top
  on the peach wash with a NEW chip; a row being removed fades and says so,
  with *Keep* to undo. Nothing is written until Save; a failed save keeps
  every draft, and a good one keeps them on screen, read-only, until the
  refreshed list arrives — never the list from before the save.
- **One screen, not the remainder (2026-09-27).** SKU Master and Costing gaps
  hold the count row, its notes and the table in a stage exactly one screen tall
  (`.sku-stage`) instead of the space the filters leave: the page scrolls again,
  one turn of the wheel slides the filters away and the table fills the screen.
  A downward wheel over the table moves the page first, so rows never scroll
  inside a frame whose bottom is below the screen; upward is the browser's own.
  Phones keep the fixed-height window.
- **The columns are the reader's (2026-09-27).** On those two tables a header
  dragged onto another swaps their places (an orange bar shows where it lands)
  and a header's right edge drags wider or narrower; double-clicking the edge
  fits the column to its widest cell; from the keyboard ←/→ on the focused edge
  resizes and Alt+←/→ moves. Whichever column stands first is the frozen one; a
  sofa's seat-size prices stay behind the rest, in the ERP's order. The table
  opens at its natural widths and then holds them, so widening one column never
  squeezes another — a blank last column takes the slack. Each table (and the
  sofa sheet apart) keeps its layout in this browser only, in a cookie scoped to
  the Product List so the server renders it; *Reset columns* in the footer puts
  it back. `ColumnTable` / `useColumnLayout`.

The light workspace remains light when opened from a dark-mode route so black
text retains contrast. The preference still applies when leaving Product List.

### Shared portal rules

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
| **Sheet page: summary cards + ledger table with `tfoot` + status chips** | `src/app/(portal)/hr-costing/page.tsx` |
| Sheet page with a working grid under its cards | `src/app/(portal)/hr-costing/payroll/[period]/page.tsx` |
| The design source of the sheet (cards, rail, framed tables, person header) | `src/app/(portal)/revenue/[sub]/[period]/_components/CommissionWorkbench.tsx`, `CommissionMonthSummary.tsx` |
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

**A rail in the middle of a page** (Comm Cal's month, 2026-09-17) is the same mechanism one level down: three sections that were stacked — *Sales by venue*, *Sales by person*, *Open Bill* — become a `text`-variant rail after the rest of the page, because only one of them is ever being read and stacking them meant scrolling the whole of one to reach the next. There the **rail is the section heading**: its labels are the `.sect-head` titles those sections carried, so each panel drops its own heading and opens on its explanation instead — two titles for one thing is the thing to avoid. The counts move to `TabItem.count`. A panel with tables of its own keeps `.sect-head` for them, one level under the rail.

Render every panel on the server and hand them to the client rail as nodes (`openBill={<Panel … />}`), rather than making the rail fetch: switching then costs a re-render, the panels stay Server Components, and `?tab=` still opens the page where somebody meant to send it. (`MonthBreakdownTabs` was the reference until 2026-09-27, when the month's mid-page rail went with the section it sat in — see *The payroll bar* below.) Server-built children handed to a client component as a list need their own `key`s, or React warns that "each child in a list" has none.

**2026-09-26 — the month's cuts moved up into the workbench.** Comm Cal's month now reads top-down as ONE table design: the commission workbench's rail (`CommissionWorkbench`, its own `.tabs` style) carries *Total Sales Orders · KPI Items · Open Bill · Below deposit · Sales by venue*, every panel built from `.tableFrame` / `.table` with a sticky first column and a sticky right-hand answer column (Total commission, Allocated bonus, **Still to collect**, Sales value), a `tfoot` subtotal and the `.tableFooter` strip. A panel that summarises (KPI, Below deposit) opens on a `.sectionHeading` + `.subtitle` and a `.summaryGrid` of four figures; a salesperson's page adds the same *Below deposit* tab beside Personal / Overriding. Sales by venue is read-only — nothing is picked in a report table. The mid-page rail keeps only what the saved run and HR add (Open Bill cost, Upsales & drops) — until 2026-09-27, below.

**2026-09-27 — the payroll bar.** The month page works its commission out live; payroll holds only what was sent, and the page had left that to a folded *Payroll & source tools* section at its foot — so the live figure read as money already in payroll. That section is gone (the saved run's walnut hero, its warnings, *Recompute & sync payroll*, the Open Bill cost and hand-typed upsales rail, the payroll-adjustment table) and one card under the month's summary cards says what payroll holds (`PayrollBar`, `.payroll*` in `commission-workbench.module.css`):

- a white card with a **4px left rule in the state's tone** — accent: not sent yet · `--ledger`: in payroll and matching · `--alert`: in payroll but the live figure has moved · `--danger`: something to settle first · muted walnut-sand: settled by hand, or the payroll month closed; a dot of the same tone leads the title;
- eyebrow `PAYROLL · SEPTEMBER 2026` and a 13px title that names the state with its money (*Not in payroll yet* / *In payroll · RM 91,971.90*) on **one line — the bar is folded to it** (since 2026-09-28, below); open, one sentence says why and — when something stops the send — the list of those things, by name;
- **no button.** It shipped with one whole-month action (`Send RM 91,971.90 to payroll`, *Take back*) and lost it the same day: the user's Send is per salesperson — tick five and send them, or send everybody not yet sent — so it belongs to the per-person close, not to a card about the month;
- under the sentence, while the month is open, one line with the way to HR's side: *A salesperson sent from here shows on HR › Payroll → as Completed; HR's Submit to Finance sends them on.* A month HR has Total Closed says so instead, and that only the Principal can reopen it (the unified Payroll, 2026-09-27);
- ~~a filter-grey foot row, *This month pays*~~ — the month's real switches (`SchemeSwitches`) moved to Review settings on 2026-09-28 (below).

The bar shows the month **as saved**: a draft on the screen (unsaved Open Bill picks, the current-team preview) changes the cards and tables, never the bar's figures, and the bar says so. It is part of the month overview, so it hides on a salesperson's page like the cards do.

**2026-09-28 — quiet until asked.** The user met the month as a stack of explanations (太显眼了): the bar's three paragraphs above the tabs, the RM 0 box listing every bill above the list, and the same three switches twice — *This month pays* in the bar's foot, saved, and *Calculation setup* in Review settings, preview checkboxes that saved nothing (保留一个就好). Now:

- **A fold is one line.** The payroll bar and *Bills priced RM 0* are each a `<details>` whose `<summary>` is the whole visible box: a 7px chevron at the left that points right while shut and down while open (`.fold` / `.foldMark` in `commission-workbench.module.css`, the native marker hidden), the thing's name and its state, and at most one small tag saying why it is worth opening — the payroll bar's *N to settle* (danger-bg), *Moved since* (alert-bg) or *Payroll closed* (quiet). The summary lights `--surface-2` (the RM 0 box: `--alert-bg`) under the pointer. Open, the body sits under a hairline, indented to the title. Closed by default, every visit; nothing remembers it.
- **One set of switches, in Review settings.** Its panel opens on *This month pays* in a white `.monthPays` box (the switches exactly as they were), then one `.settingsLine` — *Live calculation · 2026-09* badge, *Same Revenue Team rules as Arena*, *View rules ↗* — the carried-orders note, and the one preview left, *Use current team & dated rules for preview* ("A preview — nothing is saved"). The *Calculation setup* fold and its KPI / Open Bill / Margin checkboxes are gone, and so is a session's old draft of them. While any draft is open (unsaved picks, the current-team preview) the summary carries a small **Draft** tag (`.draftTag`, accent border on accent-bg), because *Reset draft* lives inside.
- Wherever the page used to send the reader to *This month pays, in the payroll bar* it now says *Review settings › This month pays* — the Open Bill and KPI tabs when the month pays neither, and the unsaved-picks toolbar.

**2026-09-30 — the month's review panels join the rail.** *Drops and upsells the ERP found* and *Possible double claims* sat stacked between the month's header and its cards; the user circled both and asked for two tabs (把这两个 move 去 … 让它们形成两个 tab). They are the rail's last two tabs: **Drops & upsells** (`?view=changes` — the ERP's changes, then *Bills of another month's fair* under them) and **Double claims** (`?view=claims`). The page builds both on the server and hands them to the workbench (`reviews={{ changes, claims }}`, each `{ panel, count }`); a tab whose panel is absent is not drawn, and a link to it opens the month's first view.

- **The count is what waits on a person** — changes to answer, bills to move, groups not yet checked — and while it is not zero the tab's badge takes the alert tone (`.alertBadge`: `--alert` text on `--alert-bg`, alert-tinted border) where every other badge stays neutral. Empty, the tab says so in words rather than vanishing.
- **Both panels speak the workbench's table design**, not the bordered-surface vocabulary they had above the cards: `.sectionHeading` + `.subtitle`, a four-figure `.summaryGrid`, `.tableFrame` / `.table` with a sticky first column, primary *Pay in {month}* and ghost *Not a change* / *Undo*.
- **A double claim is a card that answers "why?" first** (`double-claims.module.css`): a mono paper-number pill, a verdict `.chip` (danger — *Would pay twice*, *Same sale twice*; alert — *Second bill on the paper*, *Same number only*; info — *One sale, two documents*; ledger — *Settled*), the card's own 4px left rule in the same tone, a 15px one-sentence headline; **Why it is here** — the findings as a bulleted list with accent markers; **What to do** in an accent-bg box; the bills **side by side** — one column per bill, labels in a sticky first column, a *Match* column (`✓ Same` ledger · `≠ Differs` danger · `? Can't tell` info, the gap in small print under it), cells that wrap and sit at the top, never cut to the ledger's 520px scroll height; then a **History** timeline per bill on `--surface-2` — a dot and a hairline spine per event, mono time above the sentence, green dot for paid, red for not paid yet. The card closes on *Checked — separate sales* (a `.button`, bottom right). The tab opens on a *Would be paid twice* total and four figures: to check · would pay twice · probably separate · checked.
- The months list's *N possible double claims* is a link to that month's tab, and a bill opened from the tab leads back with **← Double claims**.
- **What the check cannot see is named, not left out** (2026-10-03): the month's bills whose Ref No. names no paper number sit under the cards in an alert-tone `<details>` (`.unreadable`, the `.carried` block's paper) — *N bills of September 2026 cannot be checked · RM X* and one line of why in the summary; open, one sentence of what to do and a small table (Bill · Ref No. · Salesperson · Sales value). They do not count on the tab's badge: nothing there is a claim.

**2026-10-03 — Sales by venue becomes Sales exhibition.** A result is read by the brand at a fair, not by the hall (user: 我是看 brand 来区分那一场 exhibition 的 result) — the same venue, organiser and days with another brand is another exhibition. The tab (`?view=exhibition`; an old `?view=venue` link still opens it) keeps the workbench table design and gains a sticky first column **Brand** before Venue · Event · Organizer · Salespeople · Bills · Sales value: one row per brand's booth at each fair, biggest first — a bill sits under the booth picked in the ERP whatever its goods, so the Brand here can differ from the ledger's Brand column, which is the goods'. Bills that name no brand read *No brand*, a place no fair claims *Not linked*, both in the muted tone. The toolbar adds a brand `<select>` beside the search — *All brands*, the brands on the tab, *No brand* last — written to `?brand=` like the ledger's, and the `tfoot` counts *exhibitions*. A row's venue opens exactly its bills on All bills (`?fair=…&brand=…`), whose header names the exhibition — *ZANOTTI · PENANG WATERFRONT CONVENTION CENTRE*, then *Every bill of this exhibition — MLE · 25–27 Sep* — and leads back with **← Sales exhibition**.

**2026-09-27 — the workbench stands in the URL.** Every step inside it is a history entry, pushed the same way as a tab: `?view=` names the cut (`kpi` · `open` · `deposit` · `exhibition`, `venue` before 2026-10-03; none is Total Sales Orders), `?person=` the salesperson whose ledger is open and `?orders=` which of their tables (`overriding` · `deposit`; none is Personal). Not `?tab=` — on this page that is the mid-page rail's. The table's search box, brand and sort ride along as `?q=` / `?brand=` / `?sort=`, written with `replaceState` as they change, so they never add an entry. Opening a bill therefore leaves an entry that says whose ledger it was, and Back lands there (it used to land on the list of people). A bill's link carries the way back (`?from=`), and the bill's page puts it first on its header — **← ANTHONY** (or *← Below deposit*), then *All bills* — as a `ReturnLink`: an ordinary link that steps Back instead when the previous history entry is that very page, so returning never stacks the ledger on top of itself. `lib/commission/workbench-nav.ts` owns the keys and checks `?from=` (a month page of the same sub-department, nothing else). The ledger's column choice is kept for the month in the tab's session.

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

The one table where every row is a form: sixteen editable figures per person
since 2026-09-30 (nine inputs, and every statutory figure on both sides),
so it can neither fold for a phone nor shed columns, and the four-line names
and `py-5` rows of the first version put Gross and Net off the right edge of
a 1440 screen. Chosen as "C · Window" out of three mockups (A every column
inline, B six figures and a panel, C both) — the artifact is linked from the
project memory. Everything below lives in `globals.css` under "Payroll grid".

| Class | What it does | Where to use |
|---|---|---|
| `.pg-well > .pg-scroll > table.ledger-table.payroll-grid` | Frozen panes: ✓ · Name · Status · Gross · Net · ⋯ stay put on the left (`.pg-st.l0`–`.l5`, offsets derived from the `--w-*` column widths so they cannot drift), the fifteen working columns scroll under them in three groups — Earnings (5) · Deductions (Unpaid · Deduct · SKBBK · EPF EE · SOCSO EE · EIS EE · PCB) · Employer (EPF · SOCSO · EIS ER), each opened by a `.g1` hairline — the two header rows pin to the top and the totals row to the bottom. The well is its own scroll box in both directions, because a sticky edge only holds inside the element that scrolls. `border-collapse: separate` is load-bearing; frozen cells are painted with the row's own `--row-bg`, an opaque pre-mixed zebra, because a translucent tint shows the scrolled cells through | Any grid where a row is a form and the answer columns must stay in view. Below `md` only ✓ · Name stay frozen and the well stops scrolling inside itself |
| `.pg-in` | The editable figure: `3,000.00` in Chivo Mono like the computed cells beside it, on a `--paper` field one step below the surface so it reads as a recessed box; `.dirty` tints it alert until saved, `.zero` fades a 0.00 to muted so the figures that are actually there stand out. A computed figure stays a bare `.num` with no box — that contrast is how "you can change this one" is told. Since 2026-09-30 every statutory figure is one (EPF / SOCSO / EIS on both sides, PCB): only Gross, Net, Revenue's Net basic / Balance and the paycheck's pro-rata and cost to company are left computed | Figures HR types; never on a computed figure |
| `.pg-in.manual` (+ `.num.manual`, `.ro.manual`) | A statutory figure somebody typed over JADUAL: a 3.5px `--accent` dot in the field's top-left corner (clear of the right-aligned digits, inside the 6px radius), and a title saying it stays until *Reset statutory to JADUAL*. It survives `.dirty` and `:focus` (declared after both, whose `background` shorthand would wipe it). A row past draft shows the bare figure with the dot on its left, centred on the line. The legend above the well carries it as *typed over JADUAL* (`.pg-legend i.mn`) | Only a figure that overrides a computed default and stays until reset |
| `.pg-band` (`.group-btn` in `td.group-cell`) | The roster's department band, with the Gross / Net subtotal sitting in the frozen block directly under the two columns it sums | Grouped money grids |
| `td.pg-status` (the frozen **Status** column, `--w-status` 138px, since 2026-09-27) | Where each person's pay stands, as one chip: `Draft` (muted) · `Open on Comm Cal` / `On Director Salary` (muted — completed elsewhere) · `Completed 27 Sep` (ledger) · `Submitted #2` (alert — with Finance) · `Paid` (ledger) · `Resubmit · editing` / `Resubmit ready` (accent). The detail — when, by which batch, what happens next — is the cell's tooltip. The band's status cell says `3 sent · 2 ready`; the frozen offsets run `.l0`–`.l5` | Any grid whose rows move through a lifecycle |
| `.icon-btn.more` + right-click | Every row's ⋯ — the only button at the end of the row besides a dirty row's Save; the paycheck ▾ that sat beside it went 2026-09-30, since the menu's *Open paycheck* and the name itself open the same window — and a right-click anywhere on the row open the same paper menu (`PayrollRowMenu`, on the hierarchy's `MenuPanel` — see "Bill context menu"): *Open paycheck* / *Open on Comm Cal* / *Open on Director Salary*, *Complete*, *Unlock*, *Reset statutory to JADUAL* (a draft whose statutory was typed or came from the InfoTech file; its line names the typed figures), **Resubmit…** (adjacent confirmation, then the row unlocks: amounts only go up, the next batch sends the difference) and *Put back as sent*. Shift + right-click keeps the browser's menu | Rows with more than one action |
| `.pg-win` + `.pg-scrim` | One person's paycheck as a floating window over a scrim (`--scrim` at .42): header with n / N, the month and department, ‹ › to step through people and × / Esc to close; a payslip-shaped body — Earnings; Deductions (unpaid leave, deduction, SKBBK, then EPF / SOCSO / EIS employee and PCB — *Withholding tax* read-only in its place when the People record says so); Employer (EPF / SOCSO / EIS) with *Reset to JADUAL* beneath while a clean draft has typed figures; then Computed (pro-rata, cost to company, gross, net to bank) — and a footer with Payslip and Save. It is a second view of the row's figures, never a copy — the inputs write the row's own edit state, so a change in either place shows in both. Opened by the name or the ⋯ menu; closing hands focus back to the name | Opening a row from a dense grid. The first inline version sat in the same paper tones as the table and read as part of it; the scrim is what makes it unmistakably in front |

### Payroll batches (2026-09-27 — HR › Payroll, the unified Payroll)

HR › Payroll holds everybody's pay: staff keyed here, the Revenue team closed on
Comm Cal, Directors Completed on Director Salary (a *Director* department band,
read-only, the name a link to Director Salary). The page's rules:

- **The header's actions never turn into a state.** `Submit to Finance · N`
  (accent) sends the people Completed since the last press and stays there for
  the next group; with nobody Completed it is disabled with *Nobody completed and
  waiting* beneath. Its confirmation is an inline panel, not a modal: headcount,
  CTC, a department × people × CTC table and one sentence on top-ups (`1 resubmit
  · 1 second payroll send only the difference`). *Total
  Close* (hairline button) sits beside it, disabled with the names still waiting
  in its tooltip; a closed month shows a ledger chip in the status line and, for
  the Principal alone, *Reopen month* (asks why).
- **The status line** under the title: `N staff · M directors` then one chip
  per state present — `draft` (plain), `completed` (accent), `with Finance`
  (alert), `paid` (ledger), `resubmitting` (accent), `second payroll` (accent).
- **Submitted to Finance** (a `.sect-head` section between the cards and the
  grid, only once a batch exists): one `.ledger-table` row per batch — `#N`
  (`the whole month` under a batch from before batches, `2 resubmits · 1 second
  payroll`), when and
  by whom, who (`Finance 3 · HR 5`, department headcounts only — never a
  name, never a person's pay), CTC, and the funding as a chip + one line:
  *Waiting for Finance* (alert) · *Funding PV with Principal* (alert, `RM x of y
  funded`) · *Funded* (ledger) · *No funding request* (danger, with *File request
  again*) · *Sent back by Finance* (danger, the row at 60%). The approval state
  lives here, per batch.
- **Selection** is for what the page itself can do: tick → *Complete N* (accent),
  *Unlock N* (hairline), *Delete N* (danger wash), *Clear*; a row with none of
  those has a disabled tick whose tooltip says where it is completed. A
  completed or submitted row shows bare figures, like any submitted row always
  did.
- **Director Salary** renames its Submit to *Complete*; its Submission tab's
  heading follows the directors (*Not completed yet* · *Completed 27 Sep 2026
  16:40* · *With Finance* · *Paid*) with a link to HR › Payroll, and the InfoTech
  grid shows a status chip and locks a director past draft. Finance's *Payroll
  Requests* label each request `BATCH #2 · HR 5`, and *打回 HR 重做* sends back
  that batch alone. HR › Payment's funding slot links to the batches; a
  resubmitted person reads as the remainder still to pay.
- **Resubmit and Second payroll** (2026-09-27, later): the row menu offers both on
  somebody already sent, two adjacent items with their own inline
  confirmations — *Resubmit…* (small: *A correction to what was sent*) and
  *Second payroll…* (small: *A planned second payment for {month} (e.g. the
  15th)*). They unlock alike; only the words differ, and the status chip says
  which (*Second payroll · editing* / *Second payroll ready*). A row that can
  take neither shows one disabled *Resubmit · Second payroll* item with the
  reason.
- **Department mode** (2026-09-30): a department is a *Cost center* or
  *Centralized*. Its switch is `.dept-mode-switch` — a 30px pill holding a
  34×20 track and the current mode's name, on (accent track, accent wash) =
  Centralized. On a department's own page it sits in a `.dept-mode` strip right
  under the page head: `HR · DEPARTMENT MODE` eyebrow, the switch, then one line
  on what the mode means; in Settings › Departments it is the *Mode* column's
  cell. Flipping it never acts at once — an inline `.dept-mode-ask` panel (accent
  wash) says what will happen (*HR leaves Billing Allocation … 3 splits on
  payroll still in draft will be cleared*) with *Switch to Centralized* and
  *Cancel*. Somebody who may not switch sees it disabled and *Switched by the
  Principal.*
- **Billing Allocation follows the grid** (2026-09-30): one card per payroll row
  of a cost-center department, in the grid's order (centralized departments are
  named under the title instead — *Not listed: Marketing (12) and Revenue
  Department (32) — centralized …*), with the status chip beside the name in the grid's words
  (`Draft` plain · `Completed 30 Sep` ledger · `With Finance` alert · `Paid`
  ledger · `Resubmit · editing` / `Resubmit ready` accent · `Closed for good`).
  Past draft a card is frozen — company selects and % inputs disabled, no
  *+ Company* / *Save* / ✕ — and its foot names the way back instead of the
  buttons: *Locked with their pay · Unlock them on HR › Payroll to change it*
  (or *Reopen them on Comm Cal* / *Resubmit them on HR › Payroll*). The status
  line under the title counts them (`… · 3 locked with their payroll`), and
  *Copy from last month* hides once nobody can take a split.

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
| `.org-pop` | The Move popover: everyone on the chart grouped by tree, the current upline marked, anybody who may not take the mover greyed with the reason (`their downline` / `no downlines` / `lower title`), a name filter, and "Top of their own tree" (the detach) as the last row — since 2026-09-11 with `reports to PETER · KRIS · no override` beneath it when the sub-department has directors. Nothing about a rank is asked here (2026-09-10): the rank follows the title and is set on the Team tab. Portalled, anchored to the button that opened it, flips above when there is no room below | Choosing one person out of a tree |
| `.space-director` (+ `.space-rail-label`, `.org-card .oc-role`, `.space-director-line`, `.space-director-bus`, `.space-director-dot`, `.space-department-heading .space-heads`) | The Revenue Director layer (2026-09-11), drawn since 2026-09-12 as a **rail** (design A of the Director Line artifact): every director ONCE, A→Z, in one row above all the sub-department frames, centred over their union, 48 px above the highest frame (`directorRail` in `lib/hierarchy-space-layout.ts`; cards `SPACE_DIRECTOR_X_GAP` 24 apart), under the label `REVENUE DIRECTORS · REPORTING ONLY` in the canvas's mono caps. Same family as a member card — name, `no rank` where the rank chip sits, the title badge and the top border in the `head` tone — but the last row reads **`Directs · Fair · IR`** (every sub-department they direct) in the slot a member's Upline button occupies, and it is HTML in the viewport portal, not a node: nothing can be dropped on it, it takes no upline, it stands where the frames put it and re-centres as they are dragged. From its bottom edge one **dashed** line per sub-department it directs: a drop (`.space-director-line`) to a bus 24 px below the cards, the bus (`.space-director-bus`, one per frame — two directors of one frame join on the same bar and share one landing) across to the frame's top-centre and down to its **top edge**, where a dot (`.space-director-dot`, r 3.5, `--cv-line`) lands. A director's lines leave the card 50 px apart, and a bar within 64 px of another takes a level 18 px higher (PETER's line to IR); nothing is drawn inside the frame, so no line can cross a team. The frame's header gains `Reports to KRIS · PETER` (`.space-heads`, mono-caps key), and a leader's own last row still reads `Reports to · KRIS · PETER` (italic, the `top` style) instead of `Top of team` | The head of a department, above every frame they direct. Never for anybody with a rank |
| Motion | Cards rise in one after another when the chart opens (`.org-canvas.enter`, `--i` per card); a re-layout glides through the node state over 500 ms with an overshoot so the edges follow the cards; the line a move just made draws itself (`pathLength="1"` + `.react-flow__edge.fresh`); Fit / Centre / ± animate; the note and selection bar slide in (`.org-slide`). All off under `prefers-reduced-motion` | — |

**Membership context menu (2026-09-20).** `PersonContextMenu` uses compact,
portalled paper menus: 13px Inter, surface background, hairline border, 8px
corners and the small dropdown shadow. `Add to department ›` expands beside
the right-click menu, listing sub-departments under their main department's
name. Existing memberships remain visible and disabled. Choosing a destination
opens another adjacent menu of that sub-department's active member titles.
The source card's title is marked `Current title` when offered; the user may
choose any title on the destination's ladder. Only clicking a title adds the
membership, and that title applies only to the new sub-department. The server
rechecks the selected title and destination ladder when saving. Destinations
without available titles are disabled with a reason. Hover and click both open
submenus when there is room beside them, but hover never saves. There is no
scrim or modal. A new membership starts without a personal upline; its title
and reporting/override line are independent of the person's other departments.
Panels flip left and clamp vertically at window edges; if neither side fits,
the child replaces its parent in place with a Back row only on click or Right
arrow, so hovering cannot move a save option underneath the pointer. Arrow keys navigate,
Right opens, Left/Escape goes back one level, and outside click dismisses the
whole menu. Team-row and selection-bar buttons open the same destination menu
at their own button. Original memberships are retained.

`Change title ›` is a second root-menu action for the card's current
sub-department. Its adjacent menu lists only that sub-department's active
ladder titles and marks the current title as selected and disabled. A change
keeps that membership's upline and rate mode; its rank follows the existing
Team rules. Home sub-departments show the People Management instruction
instead, because their title is the company title. Other sub-departments and
the company role are not changed by this shortcut.

`Remove employee ›` opens three choices beside the card menu: `Move to other
department`, `Remove from this department`, and `Terminate employee`. Moving
offers sibling sub-departments and, with People Management permission, other
main departments. A new destination asks for one of its available titles;
an existing destination keeps its own title and reporting line. Moving across
main departments changes the company department and title, clears the old
company reporting line, and ends memberships in the old department. Home
membership still follows the roster and cannot be removed on its own.
Every exit ends in a small adjacent confirmation panel naming the employee
and affected department. Termination also asks for the last working day and
marks the employee inactive, retaining their record and payroll history.
Neither hovering nor selecting a destination writes data. A Cancel/Back row
is always available before saving; errors stay in the panel for retry. Use
the existing menu placement and keyboard behavior, with danger text only on
the final removal/termination control. There is no centered dialog or scrim.

**Bill context menu (2026-09-27).** Revenue › Sales orders (`[period]/orders`)
gives every bill the same paper menu (`BillContextMenu`, built on the
hierarchy's `MenuPanel` and `membership-controls.module.css` — not a second
menu style). Right-click anywhere on the row opens it at the pointer; the ⋯
beside the order number opens it at the button, because a right-click alone
is invisible on a phone and to a keyboard (it shows on row hover, always on a
coarse pointer). The browser keeps its own menu for Shift + right-click, when
text is selected (Copy), inside a form control, and on a control with its own
right-click (*Share…*); a right-click on a link adds *Open link in new tab* for
that link. Rows: the heading `ORDER · SALESPERSON`, *Open bill*, *Open bill in
new tab*, then the one write — *Don't count this bill…*, which opens an
adjacent confirmation (what it takes out, an optional *Why*, Cancel, and the
danger-text confirm), or *Count this bill again* (one click, with who took it
out, when and why beneath it). A bill the ERP or the not-ours list keeps out,
or a month whose run has paid, shows the row disabled with its reason. After a
write the table says what happened above itself, with *Undo* for a bill just
taken out. An excluded row reads `Not counted` (tooltip: who, when, why) behind
*Show excluded*.

*Brand for the margin…* (2026-09-27) is the menu's second write, and it is
there only for a live bill that NOTHING names a brand for — no Branding, no
pick in the ERP, no branded fair, no branded line — or one given its brand here.
Its small line says which: *Nothing on this bill names a brand* / *Picked here:
Zanotti*. It opens an adjacent panel, like the confirmation: the heading
*Which brand is ORDER for?*, one sentence (pick the fair's brand; it stays
through every ERP re-send), one plain button per brand the scheme has a margin
ladder for (the picked one disabled and marked *(picked)*), *Take the pick off*
when there is one, and Cancel. One click writes it; the table then says
*ORDER now follows Zanotti's margin ladder.* A paid month or a closed
salesperson shows the row disabled with the reason.

The same menu sits on a salesperson's ledger on Comm Cal's month (2026-09-27) — Personal, Overriding and Below deposit — and on the month's *Below deposit* tab: the same right-click, the same ⋯ (`useBillMenu`), the same notice with *Undo* (`BillCountNotice`). An Overriding row's heading names the downline who wrote the bill. An upsale or a drop is not a bill and has no menu. A bill carried in from an earlier month answers to that month's run: paid there, the write is disabled with the reason. The ledger's own per-bill button is the same lasting write since the same day (*Don't count*, a ghost button; it was a review draft that changed nothing) and answers on the same notice.

*Share this bill…* (2026-09-30) is the menu's first write, above *Don't count*, on every bill a menu opens on. Its small line reads *With another salesperson — a part each*, or the holders once shared (*ADRIAN 50% · ANTHONY 50%*). It opens an adjacent form panel in the confirmation's paper: the heading *Share ORDER*, one sentence (whose bill it is; each holder is paid on their part at their own rate and their upline earns the override on it), **Share with** — a select of the sub-department's team, the owner never offered, somebody already holding a part marked *— holds 50%*, somebody closed this month greyed *— closed for September 2026* — and **Their part** — a number field with a trailing %, 50 to start, or the holder's own part, or half of what the owner still keeps. A line under them says what Save would leave (*ADRIAN 50% · ANTHONY 50%*) or why it cannot (*That leaves ADRIAN nothing — the owner always keeps a part.*); then Cancel and **Save** (the peach primary row, `.menu button.primary`; Enter in the field saves too); then, once shared, a *Shared now* group of *Stop sharing with ANTHONY* rows (*ADRIAN takes the 50% back*). The select starts with the focus (`data-autofocus` — `MenuPanel` focuses it before the first button, and Tab walks selects too). The table then says what happened above itself — *ORDER is shared: ADRIAN 50% · ANTHONY 50%.* — with **Open ANTHONY** (on Comm Cal: that ledger, where the part now sits; the line stays) and *Undo* (`BillShareNotice`). A paid month, or anybody on the bill closed, shows the row disabled with the reason; the menu's heading names every holder (`ORDER · ADRIAN + ANTHONY`).

On the ledger a shared bill is one row per holder, each their own part: under the order number a peach tag says whose bill it is from the row's holder (`From ADRIAN's bill` / `Shared with ANTHONY`, `.shareNote`), the **Sales person** column (an optional column since 2026-09-30, after *Ref No.* since 2026-10-03) names every holder on a line of their own with their part in mono (`.holders`, the ledger's own person in bold), and Sales value reads *50% of RM 8,250.00* under the part. A bill with one salesperson shows just the name. Overriding names the downline in its own column and skips Sales person. The bill's page header reads *shared ADRIAN 50% · ANTHONY 50%* where it names the salesperson.

Two rules the canvas keeps that the rest of the page does not: a card dropped
on empty ground **stays there** (remembered per browser and scheme in
`localStorage`; Tidy or any move clears it, because a moved tree has a new
shape), and the ground is the only non-paper surface — everything around it
(toolbar, note, selection bar, popover) is still in the portal's own tokens.

### Payment statement (v3.7, 2026-09-11 — HR › Payment)

> **On the sheet since v3.9 (2026-09-27).** The information architecture below
> stands; its LOOK follows "Sheet theme": the three headline figures are summary
> cards (Total payroll cost the walnut one), reconciliation / funding / dates sit
> in one framed panel with the next action in its footer strip, Salary /
> Statutory are `.sheet-tabs` with counts, the statement tables are the sheet's
> tables, and the current month on the rail is an orange underline on a peach
> wash. Where this section says ink top rule, grey totals band, square tables,
> Georgia override or Walnut/Harbour, read the sheet's equivalent.

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

Salary comparisons use `--ledger` green for increases and `--danger` red for
decreases, for both monetary differences and percentages. Apply the same direction
colors to department rows, employee movements and department detail windows,
including notable movements. Flat changes and missing prior-month figures remain
neutral; statutory due dates and pending approval statuses retain their amber.

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
action footer stay visible. Selection uses a bounded window height with a fixed
department rail, payment-date fields and table header; only the employee table
scrolls. The rail has its own overflow for short windows or many departments.
Changing departments resets the table's scroll position without clearing its
saved selections or date. Review and results retain the scrolling dialog body.
On phones, department choices use a fixed horizontal scrolling strip above the
employee pane, and table overflow stays inside that pane. Use the
same fixed rail in short landscape windows; when the viewport is no taller than
560px, the right pane scrolls its date fields and table together so the table
remains reachable. Use the
existing surface/chrome colors and typography. Native modality blocks background
interaction; lock the portal's scrolling `main` and restore its position and the
trigger's focus on close. Close, Escape and backdrop dismiss the window, except
while generation is in flight. Only explicit confirmation creates PVs.

Inside that window, separate the department rail from the employee workspace:
the grid uses `surface-2` behind the full-height rail, with a `surface` employee
pane and a `hairline` divider. A `paper` body frames the bordered workspace and
tables; the fixed footer uses solid `surface-2`. Use subtle alternating rows and
`accent-bg` plus an inset accent rule for checked employees and the active
department. On phones the rail becomes a single horizontal strip above the employee
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

### Navigation feedback (v3.8, 2026-09-26 — every page)

A click is answered before the page it opens has arrived. The Houzs ERP feels instant because it is a single-page app: a page renders in the frame it is clicked and fetches its data behind a skeleton, from a 30-second cache. The portal renders on the server, so it answers the same way in four steps:

| # | What the reader sees | When | Where |
|---|---|---|---|
| 1 | **The row lights up** — the sidebar row (or phone tab) takes the accent, its marker grows out of the dot, and a light sweeps across it | the frame of the click, until the page commits | `NavRow` / `PendingSweep` in `Sidebar.tsx`, `TabFace` in `BottomTabBar.tsx`, `WarmLink` for a link picked from a rail or list inside a page, read from next/link's `useLinkStatus()`; `.nav-row-pending`, `.nav-marker-grow`, `.nav-tab-grow`, `.warm-link-pending` |
| 2 | **The skeleton of the page that is coming** — ledger / record / form / chart, picked from the destination's path. Its header and section heads are the real `.page-head` / `.sect-head`, so the rule and its accent segment sit exactly where the page's own will and only the words are still loading. One shimmer pinned to the viewport sweeps every bar together | ~20 ms after the click, until the content has streamed in | `RouteSkeleton` (what every `loading.tsx` renders), `lib/route-skeleton.ts`; `.route-skeleton .skeleton` |
| 3 | **The progress line** — 2 px of accent along the top edge with a glowing head. Leaps to ~20 % in 200 ms, is past half by 0.7 s, crawls toward 92 % and never gets there; runs out to the end and fades the moment the page lands. Hidden for its first 120 ms, so a page that lands at once never flashes it | while a navigation has not committed, or any route skeleton is on screen | `NavProgress` (root layout, every surface), `lib/nav-progress.ts`, started by `src/instrumentation-client.ts`; `.nav-progress` |
| 4 | **The page settles in** — the page (or its skeleton) rises 6 px into place in 220 ms, and the page's first blocks fade in one after another, 45 ms apart, header first | whenever a page is inserted under `.route-surface` (PortalFrame's content column) | `route-in` / `route-fade` in `globals.css` |

A navigation that keeps its page on screen — a `?tab=` switch, a link nothing had prefetched — **dims the page being left** to 60 % after 150 ms (`html[data-nav-pending] .route-surface`), so it reads as being replaced rather than as a click that did nothing.

Rules:

- **Every route folder with child routes has a `loading.tsx` that renders `RouteSkeleton`.** Next commits a navigation at once only when the part of the tree that changes sits under a loading boundary of its own — the one in the deepest folder the two URLs share (`/team/people` → `/team/hierarchy` needs `team/loading.tsx`). Without it the page being left stays frozen until the server answers: 0.2–1.4 s of a dead click on production before v3.8. `src/app/route-boundaries.test.ts` fails when a folder lacks one.
- **A page already in memory opens with no skeleton at all**: visited in the last 30 s (`staleTimes.dynamic`, `next.config.ts`), or warmed because the pointer rested 120 ms on its sidebar link (`lib/nav-warm.ts` — one link at a time, never a page that writes the audit log as it renders). Inside a page the same warm is `WarmLink` (`components/layout/WarmLink.tsx`): a month on Comm Cal, a month on HR › Payment's rail — the links somebody picks one after another, to pages that take a server round trip to render. React keeps a skeleton up for at least 300 ms once it shows, so the warm is what makes a fast page feel instant.
- **Motion here is feedback, never decoration.** Each of the four answers a click or reports a wait; none plays at rest. Under `prefers-reduced-motion` the line appears without travelling and everything else lands at its end state.

### Update prompt (2026-10-06 — every surface)

When a release lands while the portal or the member app is open, an **ink pill** drops in at the top centre (`calc(safe-area-top + 10px)`), over the progress line, sheets and tab bars (`z-index: 90`): **A new version is ready.** · **Update** · **×** (*Not now*). Update reloads the page; × hides the pill until the app next comes back to the screen. The pill is `--ink` with `--paper` text, and the Update button is the pill turned inside out (`--paper` on `--ink`), so the dark theme inverts it with no colour of its own. It drops 8 px and fades in over 220 ms (none under reduced motion), `role="status"`, and it is never printed.

When it shows (`components/pwa/UpdatePrompt.tsx`, `lib/app-update.ts`): the app asks the server which build is live on load, on every return to the screen, when the network comes back and every five minutes while in view — a HEAD to `/sw.js`, whose `X-App-Version` is the build's own name. It **never reloads by itself while somebody is looking**. In the **Revenue app only**, back after 30 minutes or more away, it loads the new build at once — unless the focus was still in a field or something was typed in the ten minutes before leaving, when it only offers. Its screens are read from the server and the quote is kept in the tab's session storage, so a reload loses nothing there. **The portal is only ever offered the new build**: a page like HR › Payroll holds edits until *Save all*, and an edit made long before the tab was left is invisible to any check — the person presses Update when their work is saved. A page that guards unsaved changes (`beforeunload`) still asks before any reload.

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

### Closing — a lock you can see (2026-09-27 — Revenue › Comm Cal's month)

A salesperson's month is **closed** when somebody has checked it: their
commission is locked at that figure. Three pieces, in `close-controls.module.css`:

- **The close bar** above Total Sales Orders' list: a lock tile (orange-bg),
  "N of M closed" + "RM … locked" and a thin walnut meter; the actions on the
  right — *Close N ticked* (accent), *Reopen N* (white), *Clear ticks* (quiet
  underline), or with nothing ticked *Close the N still open* / *Close all N*.
  Several at once never happen on one click: the actions give way to an
  **inline confirm strip** (accent-bg, accent border) that names the people and
  the RM, with *Close N* / *Cancel*. Done: the bar turns ledger-green, the
  tile a check, "September 2026 is closed — all N salespeople". A reason it
  cannot close (a draft on screen, a month settled by hand) sits under it and
  disables the buttons; *moved since* gets an alert-bg line naming who.
- **The list**: the tick lives in the first (sticky) cell beside the name, the
  header tick takes every row shown (indeterminate when some are). A closed
  row carries a small green **CLOSED** tag with a lock under the name, a faint
  green wash, and the close's own figures; *Closed · moved since* (alert tag)
  adds `Live now RM …` under the total. The ticks are the multi-select below —
  `useStickySelection`, scoped to the month's path.
- **The ledger's walnut header**, in the empty middle: *Close NAME* (cream
  `#ffe1bd` on walnut, lock icon) and *Close & next →* (ghost), with "Locks RM …
  for September 2026" under them — one person closes without asking. Closed:
  a green stamp (CLOSED · when · who) and a ghost *Reopen*; the top-right pill
  reads *Closed*, the total *Total commission · locked*, the take-home card
  "Based on the closed commission"; a moved close adds `Live now RM … (+RM …)`
  and an alert box above the cards listing the bills and overrides that moved.
  Phone: the controls stack full width under the name.
- **Bills priced RM 0** (paid, but the ERP prices their goods at RM 0 — they
  earn nothing): an alert-bg box above the close bar, folded to its headline
  since 2026-09-28 (see *quiet until asked* under the payroll bar) (*N bills are paid but
  priced RM 0 in the ERP*, each bill as a mono link, its salesperson as a
  quiet link to the ledger, *paid RM …*), an alert tag *N bills RM 0* under
  the name, the same box in the ledger and *Priced RM 0 in the ERP* under the
  bill's number. The bulk confirm strip adds an alert line naming whose; one
  person's *Close* turns into *Close anyway* / *Cancel* with the bills named.

### ERP link card (2026-09-13 — Revenue › Comm Cal, Fair only)

A `.sect-head` section ("Houzs ERP link", counter `LINKED` / `NOT LINKED`)
holding one bordered `bg-surface` card in the Settings composition. Unlinked:
a hint, one `type=password` field ("API key from the ERP", never echoed back)
and the seal button *Link*, with the receiver address in mono beneath and a
text *Copy*. Linked: serif "Houzs ERP" title, mono meta line (`key ····a1b2 ·
pasted by · date`), a `.chip` on the right (`ledger` Receiving once a delivery
has landed, `info` Waiting for the ERP before), two facts (The ERP sends to —
mono address + Copy; Last delivery — `formatAgo`, ticking), and text actions
(accent "Replace key", danger "Unlink"). No test button here: the ERP's own
page proves the key. `src/app/(portal)/revenue/_components/ErpLinkPanel.tsx`.

### Product List — the mirror beside the portal's decisions (2026-09-24 — Revenue › Product List)

The ERP's Products catalogue is presented in the approved light workspace
defined under Implementation rules above. A plain tab rail contains *SKU
Master* · *Modular* · *Maintenance* · *Combo Pricing* · *Costing gaps*.
Switching uses `?tab=`; the server loads the selected tab. Tab counts, summary
cards and the long mirror introduction are omitted. A short notice reports
an unsuccessful catalogue delivery when relevant.

THE SPLIT IS VISIBLE: what the ERP says EXISTS is plain text (code, description,
model, category, the ERP's allowed options as chips); what the portal DECIDES
is an input — a price (`.num` right-aligned, `MONEY_INPUT`), a tick, a chip that
toggles. Row status uses explicit black text: **New**, **Inactive** (off in
the ERP), or **Removed from ERP** (retired, retained for historical references).
Filters sit in the shared gray `.sku-filters` panel above the
`.ledger-table.sku-table` — a bounded window on the wide sheets, the page's own
scroll on the lists (Modular, Maintenance). Modular opens a model in
`ModelEditor` — its SKUs (compartments / sizes) and each option list as tick
chips, what the ERP allows first and anything ticked here that it no longer
allows after. Saving reports the result; a price moves margins only
from that moment — a landed month waits for Recost.
`src/app/(portal)/revenue/products/_components/`.

### Revenue member C release (2026-09-16)

The authenticated `/member` workspace now uses the approved white, orange, brown
and amber C direction. Mobile keeps Today / Insight / Quote / Arena / Profile;
desktop uses a 224px sidebar, wider content and responsive two-column sections.
Quote remains available only to eligible memberships. Native safe-area insets and
a white browser theme colour join the header to the device chrome. Press and page
motion respect reduced-motion preferences. Principal Revenue View uses the same
Today / Insight / Quote / Arena / Profile navigation and an explicit department
and member selector for performance reads. Its signed-in name, profile and audit
identity remain Principal. The context names the selected member and stays
read-only; employee self-service writes never inherit it. Today labels department
commission separately from that member's sales, KPI and brand margins. Profile
keeps Team income, Team map/list, Requests, Memos and management access available
on phones as well as PC.

Principal performance calls use separate authenticated read RPCs, which require
the stored active Principal role and an eligible current membership. Calculation
helpers are shared with the unchanged employee self-scoped entry points. Arena
highlights the selected member by name instead of “You”; saved brand weeks can be
viewed but only the member can save them. Team List follows the selected member's
branch; Map retains every authorized department branch and centres on the selected
membership. A department without members can still open the map and management
pages. Department/member changes clear prior results and discard late responses.

Today keeps income first, the bell-marked attention section next, then sales/KPI
progress and brand margins. `member_kpi_summary` supplies the actual combined
quantity, eligible product breakdown and first configured monthly threshold;
preview quantities and the illustrative 10-item threshold never feed live accounts.
Today and Insight share real cleared-order brand margins and brand-specific order
entry. Incomplete cost/order coverage stays pending. Insight has Personal and Team
views, month selection, brand-based order filters, order details and team facts.

Insight, Arena and recent Income orders share the private `member_order_facts`
calculation. It resolves the latest committed document before ownership,
cancellation and date filters, then recognizes the department's released month
or the current open month. Historical views never repeat unreleased carry-over.
Item groups and KPI codes match without case or surrounding-space differences;
enabled KPI rules use recognition month-end. Deposit thresholds round to cents.
Only positive commissionable goods revenue weights margin; KPI-only revenue and
nonpositive goods returns are not missing-cost orders. Recent Income retains its
source-month window, and the 200-order detail cap never truncates aggregate totals.
These are performance reads; commission statements and payment records are unchanged.

Live Arena uses `member_arena_snapshot` for Monthly / Quarterly / Annual sales,
margin and KPI rankings, including brand filters and the approved medal podium.
Brand weeks are saved through an authenticated own-membership RPC, choosing 4 or 5
weeks and quantities for the four approved brands. List membership stays limited
to self and descendants; Map still includes all authorised departments.

The user explicitly deferred Fair event-source integration on 2026-09-16. Weekly
finishes, historical Fair records and their Championship settlement remain pending
until reliable event identity and complete score sources exist. No fictional
points, inferred Fair boundaries or preview scoring policies run against live data.
`/member/preview?design=live` provides the responsive layout with clearly labelled
sample data behind the existing preview access gate; it is not an authenticated
member snapshot.

### The Revenue app — built to the prototype (2026-10-05)

`/member` is now `components/member/app/RevenueApp.tsx`, rebuilt screen by screen
from the user's Claude Design prototype (Revenue Mobile, kept outside the repo).
The prototype is the source of truth for layout, colour and wording, and every
button in it does something; the NUMBERS never come from it — margin bands per
brand, the Revenue cost divisor, KPI, Championship points and claim rates are
VP's. The member C release above describes the screens this replaced.

- **Palette** — its own tokens, `--rv-*` under `[data-revenue-app]` in
  `globals.css` (peach glow, walnut honours card, metals, tree colours). Nothing
  in the app writes a hex; the portal's walnut tokens are not used inside it.
  Tailwind's preflight is undone for the app (`app/base.module.css`), and the
  portal's global `h1` / input / 44px phone-input rules stop at its edge.
- **Shell** — Today · Insight · Quote · Arena · Profile on a phone; on a desktop
  (`@container rv`, 1024px+) a 240px sidebar, the page, and a 400px panel rail
  that sheets, View as and the quote calculator open into. Sheets slide up on a
  phone and sit in the rail on a desktop.
- **Checked against the prototype** — every page and sheet is screenshotted on
  the prototype's own data (`/member/preview?app=proto&device=ios|android|desktop`)
  beside the prototype itself and diffed; a tab is done when its states differ by
  ≤ 0.05% (the desktop header's date is the usual remainder).
- **Never says how the cost is made up** (2026-10-05, user: wording like that
  leaks our info) — the prototype's note under the quote's *Additional fee* is
  gone, and Insight's bills and brand footnotes, the Arena's margin board and
  the Commission scheme sheet keep the rest of their sentence without "team
  cost (cost ÷ 0.7)" / "the Revenue Team's cost". The in-repo prototype and its
  copy deck were changed to match, and `components/member/cost-basis-wording.
  test.ts` fails on any such line in the member app.
- **Where it deliberately differs** — phone inputs stay 16px (iOS zooms on less);
  a figure the scheme does not pay says so (*KPI · Not counted*, *Commission
  only*) instead of RM 0.00; a request HR sent back has *Update and send again*;
  Profile keeps *Install the app* where the browser can install (the prototype has
  no row for it); forms start empty where the prototype pre-picked an example.
- **Phone type one step smaller** (2026-10-06, user: on a phone the text read a
  size too big) — every font-size is the prototype's px times `--rv-type`: 1 on a
  desktop, .92 on a phone (`.screen` in `app/shell.module.css`), so 13px reads 12
  and *Hello, …* 25.8 instead of 28. Spacing, icons and control heights stay the
  prototype's, and inputs stay 16px. A new size is written
  `calc(Npx * var(--rv-type))`; `app/type-scale.test.ts` fails on a plain px. The
  prototype comparison (`.design/revenue-app/tools/shoot-app.mjs`) draws the app
  at `--rv-type: 1`, so it still checks the layout against the prototype.
- **While it loads** (2026-10-06, user: not the old *Preparing your Revenue
  workspace…* page) — `/member`'s `loading.tsx` is the app's own frame
  (`app/shell/AppLoading.tsx`): the phone header where the app has one (Today —
  the wordmark alone, held at the capsule's 46px so nothing moves when the app
  lands), the real bottom bar lit on the URL's tab, the sidebar and an empty top
  bar on a desktop, and one 28px spinner (`--rv-accent` on `--rv-orange-bg`)
  where the page will be. The frame is `inert`. The prototype has no loading
  state; this is ours. (The old page's beige band and scroll were `.login`'s 8vh
  margin collapsing through `.workspace`.) Held on screen at
  `/member/preview?app=loading&page=…`.
- **Directors stand side by side** — the prototype's family chart (Team &
  capacity) drew ONE director above the line of uplines. A sub-department with
  two (Fair: KRIS and PETER) is one level, labelled `DIRECTORS`: the cards in a
  row 24px apart, a bar under them and one line down to the top of the tree —
  the portal's director rail, in the app's tree colours. Stacked, they read as
  one reporting to the other. When that row would start off a phone's screen,
  the chart opens on its middle instead of its left edge; with one director it
  is exactly the prototype.
- **A row's sheet on a desktop is a peek** (2026-10-06) — the sheets that show one
  row of the page behind them (a bill on Insight, an order's commission, a finish,
  a person on Team, a request, a memo — `peek` on `Sheet`) leave that page live
  beside the rail: clicking another row swaps what the panel shows in one click,
  and any other click on the page still closes it and does what it says. The
  prototype's desktop dim was transparent but still covered the page, so the first
  click on another bill only closed the panel (user: 点一次它其实是先关掉右边的
  bar). Pickers (month, sub-department, brand) keep the covering dim; a phone keeps
  the dim for every sheet.
- **A sofa's leg height and specials** (2026-10-06, user: the revamp had left
  them out) — the sofa sheet adds *Leg height* and *Specials* after *Fabric*.
  The same day every option priced on Maintenance became the customer's, so
  *Leg height* is drawn as a bed frame's heights are: an *FOC · Free of charge*
  chip plus each leg turned ON on Modular that Maintenance charges (*6" · + RM
  100*), captioned *Once per sofa · not in margin*; no charged leg, no row.
  *Specials* are toggle chips — one with a charge carries its *+ RM x* under the
  name — captioned *Once per sofa · not in margin* when any is charged, else
  *For every sofa in this quote*. One build makes every sofa in the cart, so
  only what every sofa model in it was turned ON for is offered. A bed frame's
  *Specials* row shows charges the same way (*Charged on top · not in margin*).
  A special is named in words, so its chip grows to them (`.chipWords`). The
  customer quote's *Sofa build* line names them, a bed frame line carries its
  own build in brackets, and the card's **Total** is step 2's *Customer pays*:
  *Add-on items* and *Option charges* rows sit above the fee when there are any
  (step 2's line reads *Option charges · not in margin*).
- **Today is the live month (2026-10-06)** — the prototype's Today on 3 October
  read *September · Estimated income*; the user wants the month on the calendar,
  so the hero, its three figures and *Your Arena* are the current month, and a
  tap opens Insight or the Arena on it. While the engine works the figure out the
  hero reads *RM —* / *Working out October's commission…*, never the fixed
  salary alone. Insight and the Arena still open on the month being closed.
- **The family chart fits real names** — the prototype's chart was a fixed
  580px with the direct reports spread across all of it, and its cards are
  buttons, which never wrap in this app (`button{white-space:nowrap}`, the
  prototype's own rule). Its data never noticed; ours did: two people below sat
  at the two edges of a phone and *Senior Revenue Specialist* ran out of its card
  and off the screen. Now the chart is as wide as its widest row and never
  narrower than the screen (`.chart` `width: max-content; min-width: 100%`), a
  direct report keeps a 145px column (the prototype's 580 shared by four, so four
  are drawn exactly as before) and fewer stay together under the member; a card's
  name and title wrap inside it; a dashed card under a direct report grows to its
  text from the prototype's 112px up to its column (137px) and wraps past that.
- **Pull to refresh (2026-10-06)** — nothing on screen changes on its own. A
  drag down from the top of the page past 64px (finger ÷ 2) and let go reads
  everything again: a 38px white dot with the refresh arc comes out from under
  the header, turns accent once armed, rests 52px down spinning while the reads
  run, and the page underneath stays exactly as it was — no "Loading…" — until
  the new data swaps in. A refresh that could not read leaves the page and says
  *Couldn't refresh. Pull down to try again.* in a walnut pill for 4s. Coming
  back after 10 minutes away refreshes once the same way. Not while a sheet is
  open; the browser's own pull-to-reload is switched off on the app — so when
  the server no longer knows the page's actions (a release went out since it
  was opened), the pull loads the whole page again instead: the new app and
  its data. Never over something unsaved (a form, brand weeks not saved); then
  the pill asks for another pull.

### Revenue Arena design comparison (2026-09-13, revised proposal)

`/member/preview?design=compare` offers two interactive proposals, A and C, with C
selected by default. Current and B were removed from the comparison controls.
The comparison remains illustrative; the separate C release above governs the
authenticated member workspace. Commission rules, ERP sync and payroll are
untouched. The existing preview access gate remains in force. All comparison
Arena facts are fictional as of 30 Sep 2026.

- **A — Espresso & Clay:** espresso / burnt orange / olive / slate blue, warm sand
  canvas, ivory cards and deep brown type. Four Light/Mid/Deep families live in
  scoped globals tokens. Legacy B deep links remain compatible but are not offered.
- **C — Orange & Brown (combined user selection):** keeps the continuous layout
  from Warm Canvas, now on pure white (`#FFFFFF`) with espresso ink, vivid orange,
  cocoa and amber accents. Headers, filters, own results, ranking lists, contribution
  ledger and brand-week forms remain open sections. Large 56px rounded metric
  tiles (48px on narrow phones) use solid orange, cocoa and amber with 28px glyphs.
  Labels use 17px semibold type, supporting amounts 15px and ranks 34px bold,
  with compact adjustments for narrow phones. The icon sits beside both text lines.
  Orange Sales values and cocoa / amber Margin and KPI values enrich the page while
  white remains dominant. The approved A podium is brought into C as a distinct
  rounded gold-framed card. Silver uses warm neutral grey without a blue cast;
  A/B retain their original treatments.
- **Shared mobile tabs (2026-09-14):** Today / Insight / Quote / Arena / Profile
  preserve the chosen design. Insight replaces Income in this navigation and
  reuses the latest merged Insight implementation (PR #119), including personal
  and team views, order filters, KPI quantities and monthly quick insights.
  Both comparison entry points use the same A/C chooser
  and device frame. Today, Quote and account pages reuse `MemberWorkspace` with
  demo-only preview styling; income details, requests and quote calculations remain
  available. Header, bottom navigation, warm accents and page motion match Arena.
- **My team visibility (2026-09-16):** Member list includes only the signed-in
  person's own membership nodes and their full reporting subtree (direct and
  indirect reports). Search and member-detail entry points use that filtered list;
  ancestors, siblings and unrelated branches are not list entries. Traversal uses
  membership IDs within each scheme/department, so another membership belonging to
  the same staff member does not inherit access. The fallback membership data is
  filtered by the same rule. Map retains all departments and their public names,
  titles and reporting lines. This list scope does not remove the wider map data
  that members are already authorised to view.
- **Today simplification (2026-09-15):** Remove the full “Your next great offer”
  promotion, Quick quote button and cart caption from Today. The Quote navigation
  destination remains available. The revised order (2026-09-16) is greeting,
  orange income hero, “Needs your attention”, monthly progress, then brand Margin.
  Attention retains its warm amber side rule in C and existing actions/count;
  a warm orange bell tile beside the heading makes the section easier to spot.
  Remove “View all progress”; detailed progress remains in Insight.
- **One combined KPI threshold (2026-09-16):** The Today preview shows a single
  combined quantity, shared threshold and attained/pending status, followed by
  Pillow and Protector quantity-only breakdowns. No individual target, remaining
  count or product progress bar. The explicit illustrative policy is 10 combined
  Pillow/Protector units in any mix: 5+5 or 10+0 both hit; 18+9 displays 27 items.
  Missing counts remain pending. Eligibility is explicitly configured for the
  preview, never inferred from which rows happen to be visible. Production must
  use the scheme's eligible KPI product codes and effective monthly threshold
  ladder; `MemberKpi.target` represents the next unmet rung and cannot identify
  a threshold already achieved. Payroll and live configuration are unchanged.
- **Brand margin navigation (2026-09-15):** Today's “This month's margin” and
  Insight's “Margin” use the same open brand rows: brand name, margin percentage,
  tier or pending-cost status, and a chevron. Tap a brand to open the existing
  Sales orders screen with that brand selected; there is no separate “View orders
  and margins” action on Today. Preview Today and Insight use the same order-derived
  brand margins so their figures agree. A partially costed brand is marked pending,
  not as having qualified for a tier. Insight preserves the selected person, period
  and fair when opening a brand. Order filtering and grouping use Brand / All brands
  instead of Bedroom, Living and Dining categories; brand selection survives order
  detail and back navigation. Existing sales and KPI detail flows remain available.
- References: [brown/orange/off-white](https://uk.pinterest.com/pin/120682465013311762/),
  [Sunset Dunes](https://in.pinterest.com/pin/sunset-dunes-colour-palette-in-orange-and-brown--609885974561005108/),
  [mobile colour palette](https://ca.pinterest.com/pin/corona-mobile-app-design-ios-health-hex-colors--816699713665427298/).
  Adapted palettes, not claims of a most-effective CRM palette.
- In A/B, title, own performance and list are separate ivory cards with visible hairline
  borders/shallow shadows. 22–24px main corners, 14–18px controls, pill selectors,
  Inter type and spacious rows. A/C Arena and Insight page entry uses a240ms
  slide/fade; Today, Quote and Profile use a220ms arrival. Shared header/navigation,
  buttons, links, selects and disclosures have gentle140ms press feedback with
  160ms colour transitions. Disabled controls stay still. Filter-result changes
  use190ms transitions. Reduced motion disables these effects; navigation is never
  delayed and form drafts remain intact.

**Device preview.** The comparison offers iPhone (default), Android and Browser
review modes. Simulated OS status/gesture bars sit outside the iframe and remain
fixed while its content scrolls; their colours match the product header. Switching
device mode preserves the current iframe page; switching design remounts it.
The full handset uses a fixed tall aspect ratio: 390 × 844 at the default iPhone
width, or 390 × 867 for the Android example. It is never shortened to fit the
desktop panel. **Fit phone** scales the entire device uniformly into the remaining
review space; **100%** keeps its original dimensions and lets the review scroll.
Changing fit mode or width preserves the iframe document and active page. The
dimension/scale caption describes the whole device including simulated OS bars.
The actual product header remains sticky, includes `env()` safe-area padding and
uses `viewport-fit=cover`. The preview route's `generateViewport` supplies a light
colour scheme and matching theme colour for Arena designs: ivory for A, pure
white for C and slightly warmer cream for B. The simulated device frame receives
the selected palette too, so its status/gesture bars stay white in C. Other
preview routes retain their inherited theme.
Implementation references: [WebKit safe-area guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
and [Chrome themed browser guidance](https://developer.chrome.com/docs/lighthouse/pwa/themed-omnibox/).
Actual OS/browser chrome remains browser-dependent; the simulated preview does
not prove integration on a physical device.

#### Confirmed architecture and record meaning

**Arena → Sales / Margin / KPI + Championship (the accumulated total).**
Championship is an additive points total, not a percentage or a 0–100 weighted
average. There is no fourth independent Brand Ranking and no Area Ranking.

**Ranking-first home (2026-09-13 user revision).** Arena has separate performance
and Championship destinations, without a Rankings / Championship segmented bar
on either page. The default shows the person's
actual Total Sales rank and RM amount, Total Margin rank and percentage, and KPI
rank and quantity together in a three-row ivory card. All three ranks update for
the selected Monthly / Quarterly / Annual window. Clicking a row opens that
metric's total board, even if a brand subview was previously selected. Homepage
period selectors are a compact pair of dropdowns so the three ranks are immediately
visible. A compact Championship entry below the three ranks opens the points
overview. Championship keeps a static points hero and seven-contribution breakdown,
including the monthly Highest Fair Record award.
Only the Top3 section's “View full ranking” action opens the separate Championship
standings page; the points hero is not clickable and the duplicate lower ranking
action is removed. The full standings list is removed from the overview.
Championship's back button returns to Arena;
the standings page's back button returns to Championship. There is no points hero
or point-gap banner on Rankings home. The former orange score-slot explanation
remains removed beneath the breakdown; accounting rules stay inside collapsed
supporting rules and reflect the seven contributions.

**Podium presentation (2026-09-13 user revision).** Ranking details show a compact
top-three podium immediately after their period / brand controls and before the
person's own result card. Apply it to Total Sales, Sales by Brand, Total Margin,
Margin by Brand, KPI, Championship overview and standings, and Highest Fair
Record. Fair results uses the distinct finish-count presentation below, with no
single-event RM podium. Highest Fair Record has no period controls. The homepage
retains its three personal-rank rows, keeping those actual positions immediately
visible.

Use a2 /1 /3 arrangement in a rounded22px card with a thin gold frame, inset gold
rim and shallow shadow in A/B/C. This podium is the deliberate framed feature
within C's otherwise continuous white page. The champion stands higher in the centre with a trophy seal, laurel
detail and muted gold; second uses silver/slate and third bronze/clay medal badges.
Double metallic avatar rings and inset podium platforms add depth. Circular initials, full names and
the actual formatted sales / margin / quantity / points accompany the ranks.
Small semantic medal tokens complement the existing four-family palette. Avoid
confetti, neon, continuous shimmer or cartoon decoration. Podium movement follows
the destination/filter timings above and respects reduced motion. Performance pages retain their complete ranking
below; list positions1–3 repeat the medal colours. Only Championship's Top3
“View full ranking” action opens its separate full standings page.

Podiums use the current board's actual competition ranks, never the first three
array indices. Show every eligible positive finite result tied at positions1–3.
An untied board keeps the2 /1 /3 steps. With ties, use equal-width individual
medal lanes in rank order, labelled with the actual joint place; wrap additional
winners into rows instead of stacking everyone inside one narrow podium column.
A skipped rank does not receive an invented occupant.
No sales / pending / unassigned results are not awarded podium places. Changing
the period or brand updates the podium from the same facts as the full list;
presentation does not alter scores, record semantics or tie accounting.

Performance boards list actual rank and actual metric only. On the person's
detail card, show a large `Rank 2` on the left and the sales amount (or margin /
KPI quantity) on the right. Sales and Margin Brand cards contain no contribution
formula and no “Edit my brand weeks” link. All performance pages, including KPI,
show only actual metrics/ranks; their collapsed “About this ranking” content
explains the metric and ranking, not points or incentive awards. All point detail
belongs to Championship and the simulator. In those destinations, use `≈` for
formulas affected by rounding or cent reconciliation and keep its explanation
collapsed. Longer periods sum monthly contributions, never apply one quarterly
percentage. The orange brand-share explanation and all-brands subtotal remain
removed from performance cards.

**My brand weeks — self-entry (user revision, 2026-09-13).** A separate entry
below the homepage's three ranks opens a monthly form. There are no edit links
on Brand performance cards. Salespeople manually select4 or5 weeks using mutually
exclusive tick/radio controls, then use +/- whole-week counters for Akemi,
Dunlopillo (the user's “dullpo”), Zanotti and Ergotex. The form defaults to an
empty4-week draft, never a detected calendar or sales-order allocation. Show
allocated / selected weeks and each brand's live percentage. Zero is allowed;
negative/fractional values and totals other than exactly4/5 cannot be saved.
Changing5 to4 preserves entered counts and asks the user to reduce an overage;
it never silently removes a brand. Changes apply only on Save.

This revision authorizes the salesperson's own reported brand weeks as the share
source for the current design, replacing automatic detection or mandatory manager
confirmation proposed earlier. Example1 Akemi +3 Zanotti in a4-week month yields
25% /75% regardless of order counts. Both Brand Sales and Brand Margin, including
Brand Margin incentives, use the same saved monthly shares. Raw metric values,
rank positions, Venue results and KPI awards do not change from this entry.
Quarter/Annual read the month-specific contributions; no cross-month overwrite.
The current form uses whole-week totals; earlier mixed-fair half-day alternatives
are future policy options, not an additional input requirement in this form.

Preview implementation stores valid plans on this browser/device, scoped to demo
employee Jia and YYYY-MM, shared across A/B/C designs. Saving updates the fictional
score model and persists after refresh. Invalid input or failed browser storage
does not replace an existing saved plan; error feedback keeps the draft editable.
Unfilled months retain clearly fictional fixture shares in the demonstration.
There are no live employee submissions or backend writes in this preview. A live
release will require authenticated employee/month persistence and a declared
edit/settlement policy; the user has not requested another approval step here.

| Main destination | Subviews |
|---|---|
| Sales Ranking | Total Sales; By Brand (Akemi, Ergotex, Zanotti, Dunlopillo); Fair results |
| Margin Ranking | Total Margin; By Brand (the same four brands); actual margin results |
| KPI Ranking | All eligible KPI quantities together; actual quantity results |
| Championship | Sales + Margin + KPI + Highest Fair Record contributions, including monthly Tier / threshold incentives; full standings through Top3 |
| Highest Fair Record | Current all-time single-fair best per person; monthly closing rank awards recorded in Championship |

The user's “Danopillow” appears to refer to existing **Dunlopillo / DUNLOP**;
preview uses that canonical brand, rather than creating a fifth production brand.
Brand Sales defaults to top 5 rank positions (including boundary ties), with an
explicit all-sellers button and the current person's position even outside top 5.
All assigned people are scored through last place. Unassigned / pending rows remain
visible as such. Underlying weekly fair finishes compare actual sales within one
exact event: venue ID + start/end dates, not a loose calendar week containing
overlapping events.

**Fair results replaces Sales By Venue (user revision, 2026-09-15).** The Sales
subview summarises how often each person finishes first, second or third across
their own completed weekly fairs in the selected Monthly / Quarterly / Annual
window. It does not ask the user to pick one venue. Show the current person's
gold / silver / bronze counts prominently, with an expandable list of actual
weekly results: fair name, venue, start/end dates, achieved sales and actual finish.
Normally each person has 4 or 5 eligible personal events per month; a quarter or
year counts the person's completed events in that longer window, never every
parallel company fair.

Below the personal summary, include all 26 eligible sellers in a finish-count
table, ordered by first-place count, then second-place count, then third-place
count. Preserve a stable name order for equal counts; do not invent another
overall rank from this sorting. Keep fourth-or-lower finishes separate from medal
counts. Ties use each fair's actual competition positions: joint first counts as
a first-place finish for both people, and a skipped second place stays skipped.
Only positive, finite, eligible completed results can receive medals. Pending,
unranked or zero results must not be promoted into a medal or an invented finish;
show their actual status in the weekly detail. There is no venue picker or RM
event podium in this subview.

This is a presentation of real fair finishes, not a new points formula. The
existing monthly venue contribution remains the mean of that person's eligible
assigned fair-rank awards. All point amounts, formulas and accumulation detail
remain in Championship; Fair results shows performance and finish counts only.

**Confirmed cohort and concurrent events (user clarification).** 28 people include
2 Revenue Directors who are excluded; the competitive cohort is26 salespeople.
One salesperson may enter at most ONE fair per global calendar week: normally4
personal events per month, or5 in a five-week month. The company's approximately30
events are parallel capacity, never30 personal opportunities. Enforce a unique
(salesperson, competition week) assignment across venues and exclude Directors
from both rank positions and score denominators.

If every event can hold at most6 sellers,26 simultaneous attendees need at least
ceil(26/6)=5 events. Three or four events work only if some have larger capacities
or not everyone attends. Model capacity from actual per-event rosters, not a fixed
company event count. A weekly fair only has ranks1 through its actual participant
count: a six-person fair ends at rank6 (16pts), not rank26's6.25-point floor.

Fictional schedules use five concurrent venues with6/5/5/5/5 people, giving20
company events in September and25 in August; these are demonstrative schedules,
not claimed actual30-event history. Each seller has4/5 respectively. Actual
Friday–Sunday dates are used; the Sunday end date is the unique competition week.
31July–2August counts once in August, avoiding duplicate assignments at month
boundaries. Q3 has13 personal weekends, not the company's65 sample events.
Real event dates can differ; a production roster needs a stable shared week ID.

**Highest Fair Record — current record board and monthly award (user revision,
2026-09-15).** This revision supersedes the earlier no-points policy. For each
person, select the largest positive net-sales amount from one completed fair
(usually three days) across all known history. January RM100k still leads in
August unless beaten. Never sum fairs, reset the personal best each month, or
limit the record search to the current year. Show the record's actual venue and
dates; label pending or incomplete history rather than silently replacing it with
zero. Preview fixtures include Daniel's January 2026 RM100k and Sarah's
December 2025 RM80k explicitly.

The record board always shows the latest available all-time personal bests and
refreshes as completed-fair results become available. It has no Monthly,
Quarterly or Annual filters. The current prototype uses fictional history as of
30 Sep 2026; this is not a live ERP connection or a claim that records are freshly
synced. Individual rows and the podium show sales records and ranks; point
details belong to Championship.

At each monthly close, take an as-of snapshot of this board and award the same
rank ladder as the other contributions: 25 / 22.5 / 20.5 / 18.75 and onward through
all qualifying places. An untied first-place holder earns 25 for that month;
remaining first next month earns 25 again. The historical sales amount itself is
still counted only as one personal-best record. Ties split occupied rank-point
slots under the common tie rule. A valid positive historical best can qualify
without new fair sales that month if the salesperson remains in the eligible
cohort; current-month zero activity does not erase that surviving record.

The seventh Championship component is `fairRecord`, with a 25-point monthly base
maximum and no Tier or KPI incentive. Quarter and Annual sum the already-posted
monthly record awards alongside the other components. A new record after a
month's cutoff can change the current board and later awards, but cannot rewrite
an earlier closed month's snapshot. Production snapshot identity, rule versions,
idempotent posting and explicit correction handling are specified below; the
prototype makes no backend submissions or persisted settlement writes.

#### Proposed rank ladder and additive accounting

The earlier 100/70/50 ladder is superseded by this closer proposal:

| Place | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rank points | 25 | 22.5 | 20.5 | 18.75 | 17.25 | 16 | 15 | 14 | 13.25 | 12.5 |

11–20: 12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5. Qualified 21+: 6.25.
The entire original ladder and all Arena incentives are scaled to one quarter:
25% higher than the previous one-fifth preview scale, following the user's request
for a modest increase. This is a change of point units,
not a claim that a smaller numeral mathematically makes catching up easier.
Small decimals are intentional; assignment shares already create fractional points.
Known assigned zero activity is ranked at the bottom with 0 points; a valid
positive result is needed for participation points. For `fairRecord`, that result
is the positive historical personal best, not new activity in the closing month.
No assignment is N/A for assignment-based contributions; missing
facts are Pending. Do not turn missing data into 0 or remove it silently from a
person's denominator. Equal results share competition rank and split occupied
point slots: tied first gets (25+22.5)/2=23.75 each, next is third. Keep original
metrics for qualification; tie precision is declared separately from display.

**Seven fixed contributions, directly added:**

| Contribution | Base maximum/month | Monthly extra maximum |
|---|---:|---:|
| Sales · Brand contribution | 25 | 0 |
| Sales · Venue contribution | 25 | 0 |
| Sales · Total sales | 25 | 0 |
| Margin · Brand contribution | 25 | 12.5 |
| Margin · Total margin | 25 | 12.5 |
| KPI quantity | 25 | 5 |
| Highest Fair Record (`fairRecord`) | 25 | 0 |
| **Championship sum** | **175** | **30** |

`Championship = SalesBrand + SalesVenue + SalesTotal + MarginBrand + MarginTotal + KPI + FairRecord`

No overall percentage weighting or division by 100. The maximum in this proposed
configuration is 205 per full month; quarter maximum 615; full-year maximum 2,460.
The demo annual view is Jan–Sep, not a completed full year. Sales has 75 possible
points, Margin 75 including both incentives, KPI 30 and Highest Fair Record 25.
This deliberately
keeps Sales and Margin influential; if the business wants different influence,
change future score budgets openly rather than silently rescaling the total.

A brand contribution combines all reported brands into ONE budget:

`Brand contribution = Σ(reported weeks for brand / selected 4 or 5 weeks × that brand's rank points)`

Brand margin incentive uses the same shares. Example: 3 weeks of Tier 2 (+12.5),
1 week of Tier 1 (+5) → brand extra 10.63 after shared-budget rounding, not 17.5
and not four full bonuses. Brand result screens show actual rank and amount;
brand-week shares, point formulas and the all-brands combined contribution belong
to Championship and the simulator. Quarterly brand
contributions sum the monthly share-weighted results, never reweight all months
using a single end-of-quarter share.

Both Sales by Brand and Margin by Brand use this rule. Example: Akemi third
(20.5) at75% + Zanotti eighth (14) at25% gives18.875 before rounding; the posted
contributions are15.38+3.5=18.88, not the two full awards totaling34.5.
A single-brand third contributes20.5 at100%. Equal third-place rank awards across
any whole-week allocation mix still contribute exactly20.5. The same principle covers floor points
and brand Tier incentives; a short second assignment cannot mint an extra budget.
Round each month's weighted brand budget to two decimals, separately for base
rank awards and incentives. Allocate those cents across brands by deterministic
largest remainder: floor each exact brand share to cents, then assign the remaining
cents to the largest fractional remainders, breaking equal remainders in a stable
brand order. The posted brand amounts therefore sum exactly to the rounded budget
and to Championship, without adding cents through independent brand rounding.
For example, four equal Tier2 shares receive3.13,3.13,3.12,3.12 points, totaling
exactly12.50. Keep the complete reconciliation explanation in collapsed rules.

The current form requires reported brand weeks to sum to the selected4/5 weeks.
If a later policy supports mixed-brand fairs with fractional hours/day shares,
those shares must sum to physical working time; never claim three full days for
EACH brand in one three-day fair.

**Orders establish sales attribution; saved brand weeks establish current shares.** Do not
substitute order count, revenue proportion, item quantity or presence of a brand
in the orders for the salesperson's reported brand weeks. Three Zanotti orders and ten Akemi orders
can coexist with three Zanotti weeks and one Akemi week: equal-length fairs still
give Zanotti75% / Akemi25%. The API can suggest a mismatch for review but cannot
infer that share from these sales facts.

**Future mixed-fair policy option, outside the current whole-week form.**
Each person's confirmed physical Fair has one working-time allowance. For an
actually mixed-brand fair, confirm assigned days/hours or a declared responsibility
split. A confirmed half/half fair contributes0.5 to each brand, never a full fair
to each. Z / Z / A / mixed(A0.5,Z0.5) gives Z62.5%, A37.5%. Selling one incidental
second-brand item does not automatically establish50% work. If duties cannot be
separated, an agreed equal-share policy is a rule choice requiring confirmation,
not a fact inferred by the API. A missing allocation is Pending; do not guess
by order count or reweight remaining brands. A confirmed allocation must exist
independently of sales, including zero-sale attendance, and be frozen before
results except traceable corrections to genuine roster errors.

A venue contribution is the mean of event-rank points across the month's eligible
assigned events. Four events do not add four full 25-point budgets. Known attended
zero sales / unapproved no-show count as zero with their scheduled denominator;
approved leave or no assignment is excluded by a frozen pre-event rule. Missing
venue data makes the slot Pending. This is one Sales contribution, not a separate
Fair Championship league; `fairRecord` is a separate monthly award based on the
historical-best board. Venue amounts always rank
normally across brands, as requested. Field-size/duration differences still need
comparable-event eligibility; winning a one-person event should not mint 25 points.

Only the person's4/5 assigned events enter that mean. Four wins yield25 venue
points; four second places yield22.5. Five wins still yield25, five seconds22.5.
Do not divide by company30 events, pad unassigned parallel events with zeroes, or
automatically divide a four-week month by5. Approved leave / no-show policy and
minimum sample are fixed before results; schedule/cohort rotation must also avoid
repeatedly giving some people much easier two-person fields than others' six-person
fields. The scoring scheme reduces, but cannot erase, those opportunity differences.

**Cross-discipline comeback example (monthly, no other incentives).**

| Contribution | Seller A | Seller B |
|---|---:|---:|
| Sales brand | 25 | 22.5 |
| Sales venue | 25 | 22.5 |
| Total sales | 25 | 22.5 |
| Margin brand | 18.75 | 20.5 |
| Total margin | 18.75 | 20.5 |
| KPI rank | 17.25 | 20.5 |
| Highest Fair Record | 6.25 | 6.25 |
| Base sum | 136 | 135.25 |
| KPI threshold extra | 0 | 5 |
| Championship | 136 | **140.25** |

B has no Sales first places but passes A by4.25 through stronger other dimensions
and one monthly KPI incentive. Both receive the same 6.25 record-floor award from
positive historical results at qualifying places 21 or lower, so that contribution
does not change their relative gap. Without the KPI incentive B trails by only
0.75. These
are hypothetical point results, not claims about future outcomes; the interactive
study lets the reviewer toggle that threshold and switch4/5-week assignments.

#### Brand assignment fairness and the size of the score

The user explicitly removed **Fair points**, the target-attainment scoring mode.
It is removed from the model, controls and simulator. All awards now follow actual
sales / actual margin / quantity rank. There is no hidden alternate scoring rank,
target multiplier or invented daily target. The interactive study now explains
brand assignment shares and the cross-discipline comeback example.

Recommended current proposal: retain one Sales Brand budget and one Margin Brand
budget, allocating each by the salesperson's saved monthly brand weeks. This
prevents extra-entry stacking without requiring a second ranking system. Count
reported zero-sale weeks in the denominator; a zero-sale brand earns no award
and its share is not redistributed. The preview permits the requested self-entry.
A production settlement policy should address retrospective edits or omissions
of weaker brands; the current UI does not claim to verify reported attendance.

This does **not** remove raw performance ranking bias. A seller assigned Zanotti
for one week still competes in its monthly sales board against a four-week seller.
Smaller/weaker brand cohorts also offer easier high ranks. Total Sales favours
higher-volume brands; blended margin and the existing all-brands Tier requirement
retain brand-mix effects. KPI has no duplicate brand award issue but still depends
on assignment opportunity. Fair rosters and comparable cohorts remain necessary.

Simpler alternative for discussion: keep Sales/Margin Brand boards as honours
with no Championship contribution or brand incentive. This removes brand-entry
farming entirely but changes the seven-contribution architecture, leaves total
sales/margin opportunity bias, and requires explicitly reconsidering category
budgets. It is not silently applied to the preview. Best-brand-only, adding every
brand's complete award, and post-result primary-brand choice are not recommended.

The user referenced F1 to reduce discouraging total numbers. The official
[F1 scoring guide](https://www.formula1.com/en/latest/article/the-beginners-guide-to-the-f1-drivers-championship.53MjXJzTDxQnfxfoCLnxNZ)
awards25/18/15/12/10/8/6/4/2/1 for a full-points Grand Prix. That steep ladder
gives eighth only4 versus the winner's25 and is unsuitable for the requested
close competition. F1 also accumulates totals into hundreds across a season;
compare per-event awards and the season length, not one event against our year.

Arena instead scales its complete close ladder AND bonuses to one quarter: max25
base per contribution, Tier5/12.5, KPI5. The latest revision raises every award
by25% over the previous preview while preserving its relative gaps. The
second-place gap is2.5 and eighth-place gap is11; a former100–200-point deficit
becomes25–50. Scaling changes presentation, not relative comeback difficulty. With
rounding at posting boundaries tiny ties can change; there is no strategic boost.
UI should prioritise the gap to the next higher place and actual remaining
threshold opportunities instead of presenting only the distance to champion.
Do not promise a comeback when the available points cannot cover the deficit.
Monthly is the default competition window. Quarterly/Annual still sum monthly
ledgers and can grow to hundreds; they must not be divided or silently reset.
No artificial catch-up bonus, hidden handicap, or reduced reward for the leader.

The proposal UI is Fair-only. It does not apply these thresholds to IR;
IR requires its own competition definition. Existing Current app access is unchanged.

Pilot entry gates should be announced before assignments: at least5 comparable
assigned sellers in each scoring brand cohort, and at least3 assigned selling
days plus3 distinct usable orders for an individual's monthly brand-margin score.
These are proposed pilot values, not configured production rules. Do not use a
single RM10k minimum across very different brands. Low sample results can display
as provisional, not automatically earn first-place25 plusTier12.5. If the planned
roster cannot satisfy the common rules, fix the schedule/cohort design before the
season or keep that cohort's Championship provisional; do not remove one brand
and renormalize only the affected employee after seeing results. All margin data
needed for a monthly incentive must be known, including audited manual margins.
Real order-count/completeness gates are a backend requirement, not implemented
against live orders by this fictional UI preview.

#### Margin tiers and KPI incentives — checked against Fair code

Reuse **qualification thresholds**, not cash payout amounts. The repository helpers
are `src/lib/commission/engine.ts:155` (`kpiThresholdPct`) and `:317`
(`marginIncentiveAcrossBrands`). Points remain a separate, versioned Arena policy.

- By-brand Margin: calculate the month's goods margin for that brand, then test
  its own configured incentive tiers. The total Margin incentive requires EVERY
  sold brand to clear the corresponding tier in its own ladder, using common
  `bandKey` intersection. A high total percentage cannot cover a weak brand.
- Example: Akemi45% and Zanotti38%, with36%/43% ladders, yields total Tier1; Akemi45%
  and Zanotti35% yields no total tier. Individual brand incentive remains possible.
- Proposed Arena extras: Tier1 total+5; Tier2 total+12.5, highest eligible only.
  Tier2 is not +5+12.5 unless the user selects that stacking variant. This option
  was asked explicitly; until answered, preview labels highest-only as a proposal.
  The cash commission rule DOES stack RM1,000 + RM1,500; it is not reused as points.
- Current final repository seeds copy36%/43% to AKEMI/ERGOTEX/ZANOTTI/DUNLOP
  (`20260903010000_dunlopillo_brand_and_akemi_ladder_copy.sql:37`). Live editable
  values were not queried. The older Zanotti33% example is not the final seed.
  If actual brands have different achievable margins but identical thresholds,
  Tier incentives still favour high-margin brands; confirm/calibrate per-brand
  tiers explicitly before claiming equal incentive opportunity.
- KPI counts quantity of configured KPI items, no brand split. Current Fair code
  includes eligible giveaway quantities; Arena preserves this definition. Missing
  or returned/cancelled units need traceable adjustments. The repo seed is10 units
  for a20% cash uplift; Arena separately proposes once-monthly +5 points at that
  threshold. Do not calculate Arena points as `bonusPct ×100`, or count each
  additional block of10 as another bonus.
- Margin includes the real cost of gifted KPI goods and excludes transport/disposal.
  Audited manual margin overrides derived cost and contributes implied cost to the
  monthly blend. Missing costs/brand/tier ladder block incentive with a reason;
  they are not a zero-percent margin. Qualification uses unrounded values with
  the engine's boundary tolerance; rounding a displayed35.999% to36% cannot earn
  a tier. Per-bill commission penalties do not become Arena point deductions.
- Because+12.5 is substantial relative to the new rank gaps, explicitly show
  “rank points + incentive = total.” A10th-place12.5 plusTier2 bonus12.5 can tie
  first-place25 without incentive. This is a threshold-achievement reward as well
  as a placement competition. Backtest that intended strength before prizes.

#### Monthly / Quarterly / Annual accounting and record closure

**Rank-award events occur monthly only**, after a published settlement window.
For each person store seven component bases, monthly incentives, eligibility and
rule/roster versions. The `fairRecord` component also references its monthly
closing snapshot and the source completed-fair record. Championship Monthly sums
that month's components;
Quarterly sums its three monthly ledgers; Annual sums the year's monthly ledgers.
Do not re-award rank points or Tier/KPI extras at quarter/year end. Raw performance
views still aggregate their selected date range and rank those displayed metrics,
except Fair results counts finishes and Highest Fair Record always shows the
current all-time board without time filters. They show no point details.
Championship and the simulator label period points
as accumulated MONTHLY awards. No monthly
margin percentages or monthly rank numbers are averaged to obtain raw period margin.

Live current-month estimates can change with new orders; reaching a threshold does
not irreversibly award a bonus mid-month. Final monthly results are idempotent by
(staff, month, programme, rule version, score slot). Quarter/year read those same
entries, not independent award jobs. Corrections append an auditable reversal /
replacement linked to the original award and update dependent totals once.

For `fairRecord`, a production closing snapshot must have a stable snapshot ID,
cutoff time in Kuala Lumpur, eligible cohort, programme/rule version and source
event/result identifiers. The closing award references that immutable snapshot;
re-running the same close must not mint another record award. Quarter/Annual
read the posted month ledger rather than re-ranking the latest record board for
past months. A later, better fair result updates current history and future
snapshots only. A correction to facts that were already in a closed snapshot is
an explicit, auditable reversal/replacement linked to the original snapshot and
award, not a silent historical overwrite. These are requirements for a future
live implementation; the fictional preview calculates examples without a
settlement service or production writes.

Use Kuala Lumpur dates. Define a stable Arena recognition date for each eligible
order; the current payroll statement pool includes previously deferred orders, so
it is not automatically a calendar-month sales feed. Fair record/event ranking
uses explicit event identity and completed event end date. Freeze ownership,
returns/cancellations, attendance and roster before finalizing. Proposed review
window is7 days after close with completed sync; late refunds/corrections create a
visible revision and re-evaluate affected records and monthly bonuses. Historical
records do not reset; corrections can invalidate a former record transparently.

For new joiners or unequal season length, accumulated Championship intentionally
rewards more eligible months. Show months counted and separate newcomer honours
if desired; do not conceal this by renaming the total an average. Unknown source
coverage remains pending. A departed person's valid historical record persists
unless an explicitly published record-eligibility rule says otherwise.

#### ERP readiness and prototype boundaries

Individual order dates, brand, staff, quantities, costs and raw snapshots are
supported by `src/lib/erp-sync/contract.ts:192,252`. Existing `sales_location` is
branch (KL/PG/SRW/SBH); `event_date` is an Open Bill day, not a multi-day fair ID.
No verified venue/event roster/brand-assignment feed was found. Therefore the
prototype's rank points, historical records and incentive awards are examples,
not production standings. All source fact/brand allocations in fixtures reconcile.

**Read-only API crosscheck, 2026-09-13.** The documented integration is ERP PUSH
(`docs/erp-sync/contract.md:49`): POST sales-orders receiver; GET on that route is405
(`src/app/api/erp/v1/sales-orders/route.ts:105`), plus a GET health endpoint. No
source ERP read/catalogue endpoint is configured in this workspace. A metadata-only
GET of Portal's configured PostgREST OpenAPI returned200 and confirmed exposed
`sales_orders` has location/order_date/event_date/brand_code/raw/erp_created_at,
but no dedicated fair/venue ID or event start/end and no exposed Fair catalogue.
No customer or order field values were read. This describes Portal's integration;
it does not prove that Houzs ERP source lacks a Fair catalogue or unused event
fields inside its raw header. The source catalogue endpoint/schema remains unverified.

The user subsequently confirmed the ERP order-entry UI has a Venue dropdown:
salespeople transcribe handwritten fair orders after the event, selecting the
applicable venue (sometimes with a brand-specific option such as Zanotti).
This confirms the source UI has selectable venue data. Its actual option ID,
date fields, brand mapping and catalogue API shape have not yet been provided.
The selected option reference is the integration fact to request; do not substitute
ERP entry/creation date or assume that the displayed venue label is a unique event.

Existing mapper reads `header.so_date` for order date (`contract.ts:252`),
`header.sales_location` for branch description (`:283`), and `created_at` separately
(`:287`). The latest ingest migration
`20260911020000_commission_order_sub_departments.sql:533,648` still derives the
commission period from so_date and initially defaults event_date to order_date.
Do not claim current integration already attributes late orders to their Fair.

Required Arena attribution contract: a physical venue ID plus canonical
`fair_event_id`, event start/end and timezone, with a source-to-canonical event
mapping. One location hosts repeated fairs; venue name alone is insufficient.
Orders reference the chosen event, brands come from validated order lines. A
Monday-created SO selecting the previous Friday–Sunday event belongs to that
event's week and monthly event cutoff, regardless of its creation date. Preserve
both timestamps for audit. A late order received after settlement corrects the
original Arena month once via its ledger; it does not earn points in both months
or silently change payroll recognition.

Same event and employee may have multiple brands. Sum their net sales once for
Venue, and allocate original lines to each Brand board. Two source venue IDs with
matching dates do not prove one physical Fair or two brands: verify mapping of
brand booths/aliases to their canonical event. Merge aliases for participation
only after confirmation; genuine distinct events overlapping for one employee
are a roster conflict to review, not two automatic weekly awards. Both brand
identity and event identity require independent source evidence. A sales-only
feed also misses unsold/scheduled fairs and zero-sale attendees; it cannot supply
a complete Fair/roster catalogue by itself. UI fixtures remain illustrative.

Before implementation: verify order→staff→event attribution, stable fair/venue ID,
exact start/end, per-brand assignment days/hours, cancelled/returned units/value,
cost completeness, source history and editable threshold values. Current margin
bands lack an as-of filter, unlike the KPI threshold load; freeze an Arena rule
snapshot for history. Existing monthly Insight uses current staff/hierarchy and
commission carry-forward, so it cannot be blindly summed into historical awards.
ERP changes to locked payroll months are held; Arena corrections must not reopen
payroll implicitly. Preserve production brand identities and source composite IDs.

Preview source: `src/components/member/design-preview/arena-model.ts`, separate
UI routes inside the existing preview gate, and a toy brand contribution study.
Pure tests cover close ladder/ties/zero-activity, uniform point-unit scaling, fixed score
budgets, inclusive tier boundaries, cross-brand tier intersection, once-monthly
KPI bonus, additive totals, monthly ledger rollup, four-brand reconciliation and
historical records surviving months and years. No live awards, rules or data changed.


### Revenue hierarchy spaces (approved 2026-09-11)

Staff Hierarchy's chart combines the active sub-departments of the same parent
department on one pannable canvas. Each sub-department has a labeled rounded
outer frame; each reporting tree has a quieter rounded rectangular frame
that grows with its measured, magnetically aligned members. Team frames have
free world coordinates, not slots in a fixed page grid. Use the existing chart palette with
restrained blue, violet and warm neutral department tints, paired with names.
These categorical surfaces are the approved hierarchy-specific treatment.
Within a card, a subdued title badge pairs the full title with a small mnemonic;
rank and pay chips stay neutral. Title styling follows that membership's title,
including when the same person holds different titles in different regions.
The approved title colors are purple for Team Leader (including Senior Team
Leader), red for Team Assistant (including Senior Team Assistant), orange for
Senior Revenue Specialist, and yellow for Revenue Specialist. Use pale tinted
badge fills and readable dark text; yellow uses dark ochre text. Dark mode keeps
the same color families with lighter text.

Dragging a team border or heading moves the whole team freely on the canvas.
Individual cards return to their hierarchy slots after blank-space drops;
the frame stays steady while a card is being carried. Hold over a specific
person for 450ms to arm a reporting-line change,
with the target and intended upline shown before release. A valid drop transfers
the member and their subtree, then aligns the affected teams around their
existing leaders. Frames grow or shrink smoothly to fit those memberships. Failed
or cancelled transfers return to their starting positions. Blank-space drops
never detach a member; choose Top of team in the Upline menu for that action.

Dragging a team or department headline or border, with either mouse button
or touch, translates that entire group. Headings also support arrow keys.
Escape, cancelled pointers and lost pointer capture restore its starting
layout. On release, overlapping teams and departments move aside as intact
groups. Tidy aligns member rows and separates overlaps while retaining each
team's freely chosen leader origin. Transfers use a gentle 500ms spring, while neighboring groups
settle over 500ms without overshoot. Rounded connectors and a fading landing
halo reinforce the move. When needed, the camera eases out over 400ms, then
focuses the destination after settling; pointer or wheel input cancels this
automatic camera movement. Respect reduced motion throughout.

Targeted drops, Upline menus and connectors use the existing validated Server
Actions with same-department, cycle, title, capacity and permission checks.
Namespace every node by scheme and person: arrangement is a browser preference,
and an accepted transfer changes only that membership's reporting line.
Department shortcuts and other-membership links focus a region without changing
the route's editable Team tab.

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
- On navigation: the route skeleton — the destination's own shape, the real header rule, one shimmer across every bar — within ~20 ms of the click. See "Navigation feedback (v3.8)".
- Inside a page (a panel filling in after the page has landed): `.skeleton` bars matching the target shape.
- Never a spinner in place of a page.

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

**Minimal, meaningful motion only.** These motions exist:

| Motion | Duration | Easing | When |
|---|---|---|---|
| Page settle-in | 220ms, blocks 45ms apart | cubic-bezier(0.2, 0.8, 0.2, 1) | Route change — `route-in` / `route-fade` (v3.8) |
| Navigation feedback | row at once · line after 120ms · finish 480ms | line: cubic-bezier(0.08, 0.82, 0.17, 1) over 8s | Click → the page lands: pending row, route skeleton, progress line — "Navigation feedback (v3.8)" |
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

A month is always three letters — *Sep*, never *Sept*. `formatDate()` (dayjs)
writes it so; a page that needs an `Intl` format for a locale's order or clock
goes through `formatIntlDate()` (`lib/utils.ts`), because en-GB and en-MY spell
September *Sept* in current ICU and every other month in three letters
(2026-10-03: the Arena's Fair results read *closed on 13 Sept* beside its brand
weeks' *Closed 13 Sep*).

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

- **2026-10-06 (Revenue app · while it loads)** — opening or refreshing the Revenue app no longer shows the old *HOUZS VENTURE · Preparing your Revenue workspace…* page (with a beige band above it and a page that scrolled): it shows the app's own frame — the phone header on Today, the bottom bar lit on the tab being opened (the sidebar on a desktop) — and one orange spinner where the page will be. When the app lands, nothing in the frame moves. See *While it loads*.
- **2026-10-06 (Revenue app · pull to refresh)** — the minute's background refresh is gone: the app changes only when pulled (or on return after 10 minutes away). The pull's dot, its armed and spinning states and the *Couldn't refresh* pill are under *Pull to refresh* in the Revenue app section.
- **2026-10-06 (update prompt)** — every surface gains *A new version is ready* · Update · ×: an ink pill at the top centre when a release lands while the app is open (installed apps are resumed from memory, so a phone could keep last week's build — and its reads fail once a release replaces its Server Actions). In the Revenue app, after 30+ minutes away it reloads on return unless a form was being filled; the portal only ever offers it (a payroll grid may hold edits not yet saved). See *Update prompt*.
- **2026-10-06 (Revenue app · phone type one step smaller)** — on a phone every text in the Revenue app is one step smaller than the prototype's: each font-size is the prototype's px times `--rv-type`, .92 on a phone (13px → 12, the greeting 28px → 25.8) and 1 on a desktop, which is unchanged. Spacing, icons, control heights and the 16px inputs stay as they were. One number tunes it (`.screen` in `app/shell.module.css`); `app/type-scale.test.ts` keeps every size on it. See *The Revenue app — built to the prototype*.
- **2026-10-06 (every option price is a charge)** — Product List › Maintenance: every priced pool reads *Charge (RM)* / *Edit charges*, with a note per pool (per frame, or once per sofa); a negative price is refused. The Quote: a sofa's *Leg height* is FOC + the charged legs (*Once per sofa · not in margin*), every special chip carries its *+ RM x*, and step 2 / the customer quote say *Option charges*. Comm Cal's bill page says a sofa line's share: *incl. RM 10.00 for Nylon Fabric — RM 50.00 once for the sofa, spread over its 5 pieces*.
- **2026-10-06 (Revenue app · family chart on a phone)** — Team & capacity on a phone put KAR JUN's two direct reports at the two edges of the screen, and MELVIN CHONG's *Senior Revenue Specialist* ran out of his card and off it: the chart was a fixed 580px with the reports spread across it, and the cards (buttons) never wrapped. The chart now takes the width of its widest row (never less than the screen), a report keeps a 145px column so fewer sit together under the member, card text wraps, and the dashed cards below grow to their text (112–137px). Four reports — the prototype — are drawn exactly as before; its dashed cards are a few px wider, because their text used to run past the border. See *The family chart fits real names*.
- **2026-10-06 (Revenue app · sofa leg height & specials)** — the Quote's sofa sheet regains the old builder's *Leg height* and *Specials* (only what Modular turned ON for every sofa model in the cart), as chips after *Fabric*; specials' chips wrap their words (`.chipWords`, bed frame specials too). The customer quote names the sofa build and each bed frame's own build, and its Total now equals step 2's *Customer pays* (*Add-on items* / *Bed frame options* rows when present). See *A sofa's leg height and specials*.
- **2026-10-06 (Revenue app · a row's sheet on a desktop)** — on a desktop, clicking another bill while one is open in the right-hand panel shows that bill at once; it used to take two clicks, the first only closing the panel. The same for every sheet that shows one row of the page beside it (Commission by order, My honours, Team & capacity, Requests, Memos). A click elsewhere on the page still closes the panel, and now also does what was clicked; the list scrolls under the mouse wheel while the panel is open. Pickers and phone sheets are unchanged (see *The Revenue app — built to the prototype*).
- **2026-10-06 (Revenue app · directors side by side)** — Team & capacity's *Your Revenue family* drew Fair's two directors one above the other (KRIS, then PETER, then the member), as if PETER reported to KRIS. A level now holds peers: `DIRECTORS` over KRIS and PETER in one row (`.peers` / `.peer`, 156px a card), joined under their cards by the same 2px bar the direct reports hang from, one line down to the next level. One director is drawn exactly as before. On a phone, a row that would start off-screen opens the chart on its middle. See *Directors stand side by side*.
- **2026-10-05 (Revenue app · no cost basis)** — the quote's step 2 ends at the *Additional fee* field: the grey note under it ("Fees such as delivery or disposal … Margin uses the Fair team cost basis (cost ÷ 0.7).") is gone. Insight's bills footnote, its brand footnote, the Arena's margin-board basis and the Commission scheme sheet's note lose only their "team cost (cost ÷ 0.7)" / "Revenue Team's cost" clause. See *Never says how the cost is made up*.
- **2026-10-05 (Revenue app · Profile finished)** — the two Profile chips the prototype left without a page now lead somewhere: **My brand weeks** is a page of the app's own parts (a block per month, a row per fair weekend: *Week N* and its days, four brand buttons — the picked one in the accent fill — and a note: *Open until 11 Oct* / *Closed 13 Sep · auto-located: Akemi* in amber, then the booth's venue), one *Save brand weeks* button; **Commission scheme** is a sheet built from the person sheet (avatar, *Rate · Fixed salary · Since* cells, then each brand's margin ladder as rows with the range on the right). My income on a claim-form month says *Claim form month · portal's working*. People › Member services gains **Claim rates**: three fields (base, rate per spot, Airbnb per person per night) over a ledger table of regions with their spots and what the route pays, *Add region*, Discard / Save.
- **2026-10-05 (the Revenue app)** — `/member` is rebuilt to the Claude Design prototype (see *The Revenue app — built to the prototype*): Today, Insight, Quote (bed frame options as customer charges), Arena (Championship points, booth-by-booth Fair results) and Profile (My income live from Comm Cal until the close, Commission by order, My honours, Team & capacity, Requests with RQ numbers and claim forms, Memos, View as). Its own `--rv-*` palette under `[data-revenue-app]`; every rule number is VP's.
- **2026-10-03 (brand weeks back office · Sep)** — People › Member services gains a **Brand weeks** tab after *Capacity & waiting list* (the portal page only, for whoever reviews member requests — HR and the Principal): a `.sheet-toolbar` (Department, Month, Refresh — locked while changes are unsaved, with a line saying so) over a `.table-frame` ledger table. **Member** first (name, title, *No member login*, *Saved 3 Oct · HR Manager* or *· by the member*), then one column per fair weekend (*Week 1* · *4–6 Sep* · *Closed 13 Sep* / *Open until 6 Oct*). Each cell is a brand `<select>` (*Not picked* · Akemi · Dunlopillo · Zanotti · Ergotex) over two 11px lines: what is stored — *Picked*, *Unconfirmed · ZANOTTI*, *Auto-located · AKEMI*, *No bills*, or *No DUNLOP booth this week — no place scores* — and the booths written at that week with their bills (*AKEMI 5 · ZANOTTI 2*), the one that earns the points bold over an orange underline, each booth's title giving venue, bills and sales. A changed cell takes the peach wash with an orange left edge and reads *Changed · not saved yet*; the frame's foot counts *N of M weeks picked · N changes not saved* beside **Discard** and the orange **Save N changes**, which saves every changed member at once and reads the month again. Every closed week stays settable here. Dates: a month is three letters everywhere (*Sep*, not *Sept*) — see "Date format".
- **2026-10-03 (Arena booths)** — Member app › Arena: *My brand weeks* is one row per fair weekend — **Week N**, *Weekend of 4–6 Sep* under it, and a brand `<select>` (*Not picked* · Akemi · Dunlopillo · Zanotti · Ergotex; 44px, the arena's hue-1 surface) — replacing the four −/+ steppers and the 4 / 5 weeks toggle; the line under them counts *N of M weeks picked*, and the Arena home card says the same. Each row says when its week closes — *Open until 6 Oct*, *Closed 13 Sep*, *Closed 27 Sep · auto-located: ZANOTTI* — and a closed week's select is disabled for the member; with every week closed the Save button gives way to a line saying the back office changes them. In the Principal's view of a member the same form is the back office: the member's name as an `h2`, a *Back office · any week can be changed here, closed ones too* line, every select live. *Championship & Fair results* ranks booth by booth: each weekly result reads *AKEMI · MID VALLEY*, a finish placed by guess carries a small secondary-tone *Unconfirmed · pick the brand week by 6 Oct* or, once the week has closed, *Auto-located · the brand week closed on 13 Sep*. A seller is ranked on every board they sold at but only one place a week earns points, so a board off their brand week appears in their weekly list with its real place in the finish chip (*8th*) — the medal colour withheld — and *No points · not this week's scoring booth* under the venue; the medal card's remainder line counts *Other booths, no points*. Notes join the unplaced-bills one — how many finishes wait on a brand week, how many were auto-located, and what is ranked with no points. The Highest Fair Record names the booth.
- **2026-10-03 (sales exhibition)** — Comm Cal's month: *Sales by venue* becomes **Sales exhibition** — one row per brand at each fair (a sticky **Brand** column first, then Venue · Event · Organizer · Salespeople · Bills · Sales value), a brand filter beside the search, the `tfoot` counting exhibitions. A row's venue opens exactly that exhibition's bills on All bills, whose header names it (*BRAND · VENUE*, organiser · days under it) and leads back with *← Sales exhibition*. See "Tabbed pages".
- **2026-10-03 (Ref No.)** — Every list of bills on Comm Cal carries **Ref No.** — the handwritten bill's number (HC13369) beside the ERP's own (HC-SO-2609-400), the field the ERP labels *Ref No.* — as the first optional column after the sticky *Sales order*: All bills, a salesperson's Personal / Overriding / Below deposit, the month's Below deposit and Open Bill tabs, and *Not counted* (user: follow erp sales order number, but with reference hc123123). The cell is the Ref No. as typed (`PaperRefCell`); a cell carrying several papers adds a muted *Checked as HC12443* (the number double claims match on), and a bill the check cannot match says so in the alert tone — *No Ref No. in the ERP* or, under a Ref No. that names no paper, *Not a paper number*. The search boxes find a bill by it; the bill page's header leads with *Ref HC13369*. The Double claims tab names the month's bills it cannot check, in an alert-tone `<details>` with their own small table. See "Tabbed pages".
- **2026-09-30 (payroll: every figure a field)** — HR › Payroll's Deductions group gains EPF EE · SOCSO EE · EIS EE · PCB as `.pg-in` fields beside Unpaid · Deduct · SKBBK, and the Employer group's EPF · SOCSO · EIS become fields too (user: 在这个 payroll tab 那边，所有的东西基本上都应该是可以被 editable 的). A figure somebody typed keeps an accent dot (`.pg-in.manual`, legend *typed over JADUAL*) and stays through later edits until *Reset statutory to JADUAL* (⋯ menu, paycheck). The paycheck window's read-only *Computed · ER / EE* column becomes an Employer section of fields over a Computed block of pro-rata, cost to company, gross and net. The row's ▾ is gone — the name and the ⋯ menu's *Open paycheck* already opened the same window. See "Payroll grid".
- **2026-09-30 (the split follows the payroll)** — HR › Billing Allocation reads like the Payroll grid it belongs to: its cards come in the grid's order, each carries the person's payroll status chip, and a card past draft freezes with a one-line way back at its foot instead of *+ Company* / *Save*. See "Payroll batches".
- **2026-09-30 (department mode)** — A department is a cost center or centralized, and says so: the `.dept-mode` strip under the page head of HR Costing, Service Billing, Director Pool and the new Revenue › Department page, and a *Mode* column in Settings › Departments — the same pill switch everywhere, asking inline before it acts. Billing Allocation lists cost-center people only and names the centralized departments it leaves out. See "Payroll batches".
- **2026-09-30 (review tabs)** — Comm Cal's month: *Drops and upsells the ERP found* and *Possible double claims* leave the top of the page for the end of the workbench rail — **Drops & upsells** (`?view=changes`, with *Bills of another month's fair* under it) and **Double claims** (`?view=claims`), both in the workbench's table design, each tab's count in an alert-tone badge while something waits. Every double claim is now a card that says why it is there — verdict chip, headline, findings, *What to do*, the bills side by side with a Match column, and each bill's history as a timeline (`double-claims.module.css`). The months list links its double-claim count to the tab; a bill opened from it leads back with *← Double claims*. See "Tabbed pages".
- **2026-09-30 (share)** — A bill is shared from its right-click. The bill menu on a salesperson's ledger and on Sales orders gains *Share this bill…* above *Don't count*: an adjacent form panel — **Share with** (the team, the owner never offered, somebody closed greyed with why), **Their part** (a % field, 50 to start), a line saying what Save leaves, Cancel / **Save** (a new peach primary row, `.menu button.primary`) and *Stop sharing with …* rows once shared. The notice above the table names the holders, with **Open NAME** and *Undo*. On the ledger a shared row carries a peach `From ADRIAN's bill` / `Shared with ANTHONY` tag under its number, a new first optional column **Sales person** names every holder with their part, and Sales value says *50% of RM X*. See "Bill context menu".
- **2026-09-28 (quiet until asked)** — Comm Cal's month folds what it explains. The payroll bar is one line (chevron · `PAYROLL · SEPTEMBER 2026` · dot + state · one tag: *N to settle* / *Moved since* / *Payroll closed*) and opens on a click; *Bills priced RM 0* folds to its headline the same way (`.fold` / `.foldMark`). The month's real switches (*This month pays*) leave the bar's foot for the top of **Review settings** (`.monthPays`), whose *Calculation setup* fold and preview-only KPI / Open Bill / Margin checkboxes are removed — one set of switches on the page; the current-team preview stays, and the summary shows a *Draft* tag while a draft is open. See "The payroll bar" under Tabbed pages.
- **2026-09-27 (director pay)** — Revenue Directors are paid. Rules gains a tenth tab, **Directors** (section X, shown while the sub-department has a director): one `.ledger-table` row per director — name with title · code under it, *Fixed amount · RM*, *Incentive when Commissionable value reaches · RM*, *Incentive · RM*, the row's Save — and a foot line naming the Revenue Director rung's rate (or a `sheet-warning` when the ladder has none). The Title ladder's title picker offers only titles without a rung, the head as *Revenue Director · heads the department*; its row reads *Always* under Can recruit and *Own bills only · no override · no gate* across the two gate columns. Comm Cal: a director with a rung reads *Revenue Director* / *Rank SS · 12% · own bills only · no override* in the Title / rank cell and the hero, the total adds *Includes RM X director pay*, and a `.notice` above their ledger (`DirectorPayNote`) names the fixed amount and whether the month's Commissionable value has reached the incentive threshold, and by how much it is short.
- **2026-09-27 (brand)** — A bill with no brand gets one by hand. The bill menu on Sales orders and on a salesperson’s ledger gains *Brand for the margin…*, shown only on a live bill that nothing names a brand for (or one given its brand there): an adjacent panel with one plain button per margin-ladder brand, *Take the pick off*, and Cancel, the same paper as the *Don’t count* confirmation. The result is one status line above the table. See “Bill context menu”.
- **2026-09-27 (second payroll)** — HR › Payroll's row menu gains *Second payroll…* beside *Resubmit…*: the same unlock, recorded as a planned second payment (a sub-department that pays on the 15th) rather than a correction. The status chip, the header's status line, the Submit confirmation, *Submitted to Finance* and Finance's request labels name each kind (`1 resubmit · 1 second payroll`). See "Payroll batches".
- **2026-09-27 (unified Payroll)** — HR › Payroll holds everybody's pay and moves it person by person. The grid gains a frozen **Status** column (`td.pg-status`, offsets `.l0`–`.l5`), a ⋯ and right-click menu per row (*Resubmit…*), a *Director* band, and a selection bar of *Complete / Unlock / Delete*; the header's *Submit to Finance · N* stays pressable after every batch, *Total Close* sits beside it, and a new **Submitted to Finance** section lists each batch with its funding. Director Salary's *Submit to Finance* is *Complete*; Comm Cal's payroll bar (no button since the entry below) gains one line — a salesperson sent from here shows on *HR › Payroll →* as Completed — and names a Total Closed month as such. See "Payroll batches".
- **2026-09-27 (night)** — The payroll bar sends nothing. Its whole-month *Send RM X to payroll* / *Update payroll* / *Take back* lived a few hours: the user's Send is per salesperson (tick five and send them, or send everybody not yet sent — somebody already sent is never sent again), which is the per-person close's, not a card about the month. The bar keeps its state, its reasons by name, the draft note and *This month pays*; `.payrollActions` / `.payrollConfirm` / `.payrollDone` / `.payrollError` went with the button.
- **2026-09-27 v3.11** — Product List gains **Costing Setting** and **Add-on / KPI Items**, per sub-department: a chip row for the sub-department, a card for its own figure (the cost ratio at work on RM 1,000, or the KPI switch with a link to Rules), and a peach picker panel above the table while editing. Both scroll with the page. See "Product List workspace".
- **2026-09-27 (close)** — Comm Cal's month can be **closed** salesperson by salesperson: ticks in the list's first column, a close bar above it (progress, *Close N ticked* / *Close the N still open* / *Reopen N* behind an inline confirm strip, green once everybody is closed), a **CLOSED** tag and the locked figures on a closed row, and *Close NAME* / *Close & next →* in the empty middle of the ledger's walnut header, which turns into a green CLOSED stamp with *Reopen*. See "Closing — a lock you can see".
- **2026-09-27 (later)** — Comm Cal's workbench stands in the URL (`?view=` · `?person=` · `?orders=`, search / brand / sort as `?q=` `?brand=` `?sort=`), so Back from a bill returns to the salesperson's ledger it was opened from; bill links carry `?from=` and the bill page's header leads with **← NAME** (`ReturnLink`, which steps Back when that is where the reader came from), then *All bills*. The bill context menu joins a salesperson's Personal / Overriding / Below deposit tables and the month's Below deposit tab. See "Tabbed pages" and "Bill context menu".
- **2026-09-27 v3.10** — The sheet reaches the rest of HR's sidebar: the **Overview** and **People**. `/dashboard` is one route for every role, so all four dashboards moved together and each now opens on a page head and summary cards — Principal / Finance: Venture Pool (primary, the old walnut hero), Pool, Lent out and the approvals queue; HR: Employment list, Payroll (primary), Director salary, HR Pool balance, each opening where the work is done; a department manager: Pool balance (primary) and the month's five figures. The approval lists, the margin panel (two small ledgers closing on Net spread / Net interest), the subsidiaries (now with an *All subsidiaries* total), alerts and bank accounts (total in the foot) became the month's tables; Billing & dept pool and Director salary became card rows. People: the roster opens on cards (Active staff primary) above one `.sheet-toolbar`; the person pages, forms and InfoTech import, Hierarchy (the Revenue hierarchy's toolbar, chips for statuses), Roles (department band rows, `.band-row`), Permissions and Member Services follow the same rules. See "Sheet theme".
- **2026-09-27 (night)** — A pencil on a folded box. Comm Cal's *Salary calculation · current preview* keeps its `<details>` fold and gains a 30px outlined icon button pinned to the box's top-right corner (a sibling of the details, never inside the summary). It opens an editor inside the box, above the table: an orange-bordered white panel of one-row lines — type select · description · `RM` amount (mono, right-aligned) · ✕ — then *+ Add line* on the left and *Cancel* / *Save lines* (the accent button) on the right. The table below recomputes as the lines are typed, and a pay line in it is marked by a 3px orange rule on its first cell. Where the month can no longer change the pencil stays, dimmed (`aria-disabled`), and pressing it says why. On a phone a line takes two rows: the type beside its ✕, then description and amount.
- **2026-09-27 (payroll bar)** — Comm Cal's month says what payroll holds. The folded *Payroll & source tools* section at the foot of the month (saved-run hero, warnings, *Recompute & sync payroll*, Open Bill cost / Upsales & drops rail, payroll adjustments) is removed; a **payroll bar** under the summary cards names the state (not sent · in payroll · moved since · closed · settled by hand) with a 4px tone rule and dot, lists what stops a send by name, carries one amount-bearing action (*Send RM X to payroll* / *Update payroll to RM X*) plus a ghost *Take back* with inline confirm, and holds the month's switches in a grey foot row. *Drops and upsells the ERP found* gains a *Paid in {month}* list with Undo. A salesperson's ledger keeps its per-bill button, now the real *Don't count* (a ghost button; the notice above the table carries Undo), and *Show not counted* opens a small table under the ledger with *Count again* per bill. The Brand column names the bill's own brand only. See "The payroll bar" under Tabbed pages.
- **2026-09-27 (evening)** — Product List › Modular splits each category by branding. Under the category's chip every branding gets its own run of cards and a small heading (orange dash, the branding and its count, a hairline): Mattress reads AKEMI · DUNLOP · ERGOTEX · MYLATEX · *No branding*, Sofa ZANOTTI · *No branding*, and Accessory finds its AK- and DL- pieces by their SKUs' branding. The unbranded close the category together under a grey dash; a category with no branding at all is drawn as before. Category and branding headings count their whole group, and ‹ › follows the drawn order. See "Product List workspace".
- **2026-09-27** — Product List: SKU Master and Costing gaps get a table one screen tall. Their count row, notes and table sit in `.sku-stage` (100vh less the greeting bar and the page's padding) instead of the space the filters leave, the page scrolls again, and a downward wheel over the table moves the page first until the stage fills the screen. Their columns become the reader's (`ColumnTable`): drag a header onto another to swap them (orange insertion bar), drag a header's right edge to resize (a divider shows on hover), double-click it to fit, ←/→ and Alt+←/→ from the keyboard, *Reset columns* in the footer. The first column is always the frozen one; the table opens at its natural widths and then holds them (fixed layout, a blank last column takes the slack). Kept per table in the browser. See "Product List workspace".
- **2026-09-27 (later)** — Product List lists scroll with the page. Modular and Maintenance grow with their rows and the portal's own scrollbar moves them, as on the ERP's Products page; only the wide sheets (SKU Master, Combo Pricing) keep the fixed window dragged both ways (`productTabScroll`, `data-scroll` on `.product-page`). A page-scrolled table's header sticks to the top of the page — its panel is `overflow: clip`, never `hidden`, which would be a scroll box — and `PageScrolledTable` scrolls it sideways inside its card only while it is wider than the card (always on a phone). Maintenance's option pools have no search box; Fabrics keeps its own. SKU Master's model filter joins Mattress and Bedframe. See "Product List workspace".
- **2026-09-27 v3.9** — The sheet theme, HR's view first. Every page under HR Costing, Director Salary, Director Pool, Revenue (bar the Product List) and Claims sits on one white sheet in Comm Cal's month's tone: black lettering, orange `#E99A53` for actions / active tabs / markers only, walnut for the one dark object, summary cards (`StatCard`) instead of heroes and figure strips, the month's table on every `.ledger-table`, the month's tabs on every `SlidingTabs`, statuses as chips. The shell keeps its colours. PortalFrame draws the sheet (`lib/sheet-routes.ts`); the month page's workbench module no longer draws its own. The ledger skeleton opens with empty cards on these routes, and the month page's *Bills of another month's fair* (`FairMovesPanel`, the same day) is drawn in the sheet's vocabulary. See "Sheet theme".
- **2026-09-27** — Revenue › Venues removed: the ERP names every bill's fair (venue, organiser, days), so there is nothing left to type. The one person's step it held — moving bills into their fair's month — is a panel on the month page, *Bills of another month's fair* (`FairMovesPanel`), in the same bordered-surface vocabulary as *Drops and upsells the ERP found*: a serif heading with a mono alert count, an italic explanation, one `.ledger-table` (Bill · Salesperson · Fair · Move · Sales value, the move's status as a small mono label), and one accent button *Move the N confirmed*.
- **2026-09-26 (later)** — Comm Cal's month in one table design. *Below deposit* and *Sales by venue* join the workbench's rail (Total Sales Orders · KPI Items · Open Bill · Below deposit · Sales by venue), both in the workbench table (`.tableFrame` / `.table`, sticky first and answer columns, `tfoot`, `.tableFooter`); a salesperson's page gains *Below deposit* beside Personal / Overriding; the Total Sales Orders table gains *Group sales* between Commissionable value and Upsell, with the run's promotion preview as `.badge` tags under the rank. The saved run's `.ledger-table`, the *Waiting on a deposit* section and *Sales by person* are gone, and Sales by venue lost its organiser dropdown and *same place as…*. See "Tabbed pages".
- **2026-09-26 v3.8** — Navigation feedback. A click inside a section used to leave the page frozen for 0.2–1.4 s (only a change of top-level section showed a skeleton). Now every route folder with child routes has a `loading.tsx`, and every navigation answers in four steps: the clicked row lights up with a sweep, the skeleton of the page that is coming (ledger / record / form / chart, real `.page-head` and `.sect-head`, one viewport-pinned shimmer), a 2 px accent progress line with a glowing head, and the page settling in (rise 6px, blocks 45ms apart). A kept page dims while it is being replaced. The line replaced `nextjs-toploader`, which stopped when a skeleton moved the URL and still wore the rust accent. See "Navigation feedback (v3.8)". Later the same day: `WarmLink` brings the sidebar's warm and sweep to the month links inside Comm Cal and HR › Payment.
- **2026-09-24** — The Product List mirrors the ERP's Products page item by item (SKU Master / Modular / Maintenance / Combo Pricing + Costing gaps on one `control` rail) and keeps the portal's own prices and ticks as the page's only inputs; see "Product List — the mirror beside the portal's decisions". The member calculator's builder gains the Modular dropdowns in its own editorial vocabulary: a sofa build's *Leg height* select and *Sofa specials* tick list under the seat height and tier, and a *Bed frame build* section (divan / leg / total height / gap selects two a row, specials as ticks) — only what every model of that kind in the cart was ticked for; blank = *Not chosen* (`.optionGrid`, `.specials` in `MemberQuoteCatalog.module.css`). People › Member Services › Product options became a pointer card to Modular.
- **2026-09-17** — A rail in the middle of a page. Comm Cal's month ends in one `text`-variant `SlidingTabs` rail instead of three stacked sections: *Sales by venue* · *Sales by person* · **Open Bill**, with the counts on the tabs. The rail is the section heading — the panels dropped the `.sect-head` titles its labels now carry — and every panel is server-rendered and handed to the client rail as a node, so `?tab=` switches with a `pushState` and a re-render. The new Open Bill panel is three `.ledger-table`s (by rank with a `tfoot` total, by salesperson, every picked bill) plus the read-only pick chip in `OpenBillPicker`'s vocabulary: dashed alert for the importer's guess, solid accent for a decision. See "Tabbed pages".
- **2026-09-12** — Director rail. The Revenue chart's directors moved out of the frames (design A, the user's pick from the Director Line artifact): every director once, on a rail above all the sub-department frames under `REVENUE DIRECTORS · REPORTING ONLY`, one dashed line per frame they direct landing on the frame's top edge with a dot — two directors of one frame joined on a bus bar, PETER's second line to IR on a bus of its own — and `Reports to KRIS · PETER` on the frame's header. The row of director cards inside each frame and the fan of one line per team leader (11 teams × 2 directors = 22 lines on Fair, crossing the team frames whatever Tidy did) are gone; the leader cards, the popover's detach row, the footer and the move note keep their "reports to" wording. See `.space-director` under "Org chart canvas (v3.4)".
- **2026-09-11** — Revenue Director. A title may head its department (People › Roles, a **Head** tick per row): it stands above the commission ladder — never offered on the Title ladder, never a member, `no rank` — and is who a sub-department reports to. Staff Hierarchy's Team tab opens with a **Reports to** section (the directors as chips with Remove, and an add row of the department's heads); the chart draws each director as a card in a row of its own under the sub-department frame's header with a dashed line down to every team leader (`.space-director`, `.space-director-line`), a leader's last row reads `Reports to · KRIS · PETER` instead of `Top of team`, and the footer, the popover's detach row and the move note say the same. People › Hierarchy draws the same dashed line from the home sub-department's directors to the top of every Revenue tree (legend: *Reports to the department's director · no override*), the Table says it under the picker, and a card whose title heads the department carries `· heads the department`. See `.space-director` under "Org chart canvas (v3.4)".
- **2026-09-10** — Memberships per sub-department. Staff Hierarchy is per sub-department: the HOME one (the department's oldest) is the company chart; every other one (IR) is its own tree with its own title per member. The Team tab there gains an **Add to IR** row (person + title held here), a Title picker per row with the company title in small print beneath when it differs, and a **Remove** per row; the chart's footer and intro say which kind of tree it is. Same `.ledger-table` / `RowForm` vocabulary, nothing new in `globals.css`.
- **2026-09-10 (later)** — One line. The Revenue chart draws and moves `reports_to`, the same line People draws; the commission position follows it in the database. The dashed borrowed line, the `not placed` state, the rank select and the "placed first" plan in the popover are gone; a card whose title has no rung on the ladder reads `no rank yet`. See `.org-card` / `.org-pop` under "Org chart canvas (v3.4)".
- **2026-09-10** — Move popover: an upline with no position yet is pickable. The row says `placed first`; picking it shows the plan (them on the ladder at their title's rank, whoever above them on the reporting line who is not on it either, then the mover), every rank a select, one `Place both` / `Place all N` button. The drop label says `→ under NAME · placed first` while the card is in the air. Superseded the same day — see the entry above.
- **2026-09-09 v3.4** — Org chart canvas (Revenue › Staff Hierarchy). The canvas re-declares its palette as `--cv-*` tokens: a cool Slate ground on the accent's hue, white cards, cool ink (card vs ground ΔL* 10.1, from 0.0). Every card's last row is `Upline · NAME ▾`, a button into the Move popover; cards dropped on empty ground stay put; motion on entrance, re-layout, the fresh line and the halo. See "Org chart canvas (v3.4)".
- **2026-04-25 v3.0** — Ledger-Dense / Finance-readability pass. Imported the design exported from claude.ai/design (`design-import/venture/`). Deepened the warm-paper palette (paper #F5EFE4 → #F3ECDD, hairline #DFD4BE → #C6B99E, ink #1A1613 → #1C160F, graphite #6B5F52 → #5A4E40, muted #9E8F7F → #85775F) and introduced a dedicated `--num-ink` (#1A130B) for monetary digits. Added v3.0 utility class layer in `globals.css`: `.num`, `.num-hero`, `.ledger-table`, `.page-head`, `.page-eyebrow`, `.page-title`, `.sect-head`, `.chip`. Sidebar rebuilt with editorial roman numerals + dot/bar markers. TopBar greet enlarged with role badge + ledger green dot. 17 high-traffic pages migrated as reference implementations (Dashboard, Fund IN/OUT, Payments, Statements, Approvals, Overdue, Reconciliation, HR Costing, Director Salary, Settings, Reports, Audit Log, Claims, Dept Pool, Director Pool, Invoice Pool, BillingView). Backend untouched (zero changes to Server Actions / RPCs / Supabase / lib).
- **2026-04-10 v2.0** — Major pivot to Anthropic-flavored warm cream + Instrument Serif + rust accent direction, per design-consultation session. Replaces institutional slate direction from v1.0.
- **2026-04-09 v1.0** — Initial version from /autoplan Phase 2 design review. Proposed slate-cool direction with TBD brand color (navy vs teal).
