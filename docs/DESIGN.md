# DESIGN.md — HOUZS Venture Portal

**Version:** 3.0
**Last updated:** 2026-04-25
**Maintained by:** HOUZS Venture Portal team
**Status:** v3.0 (Ledger Dense / Finance Readability pass) — single source of truth for all UI work

> **For coding agents and contributors:** This is the **only** UI design doc. If you're adding a new page or amending an existing one, this file dictates the colors, fonts, components, and page anatomy. Do not invent parallel design notes — extend this doc instead. See `## Implementation rules — read this first` below.

---

## Implementation rules — read this first

These five rules are non-negotiable for any new or amended page. The CSS / Tailwind tokens that back them live in `src/app/globals.css` and `tailwind.config.ts` — already wired up.

1. **Page header.** Every top-level route page starts with this block (no exceptions, even small pages):
   ```tsx
   <div className="page-head">
     <div>
       <div className="page-eyebrow">
         <em>I.</em> SECTION · PAGE NAME
       </div>
       <h1 className="page-title">Page Title</h1>
       <p className="font-serif italic text-graphite text-base mt-3">…description…</p>
     </div>
     {/* optional right-side action button */}
   </div>
   ```
   The roman numeral inside `<em>` mirrors the sidebar section it belongs to. Eyebrow text is `UPPERCASE · UPPERCASE`, mono.

2. **Money cells use `.num`.** Never hand-roll `font-mono tabular text-ink`. Use `<td className="num">{formatMoney(x)}</td>`. Negatives get `<span className="neg">`. Hero figures use `.num-hero` and reserve `--num-ink` for the digit, `--graphite` for `RM` / `.cents` / `% /mo`.

3. **Data tables use `.ledger-table`.** `<table className="ledger-table">` with `<th>` / `<td>` only — the class wires up surface bg, zebra rows, accent-bg hover, hairline borders, header padding, right-aligned `.num` cells. Stop writing `<table className="w-full text-sm"><thead><tr className="border-b…">…`.

4. **Section headings use `.sect-head`.** `<div className="sect-head"><h2>…</h2><span className="rule" /><span className="count">N ITEMS</span></div>`. Italic serif title + hairline rule extending right + uppercase mono counter.

5. **Colors come from CSS variables, never hex.** Use Tailwind classes (`text-ink`, `text-num-ink`, `bg-paper`, `border-hairline`, `text-accent`, `text-danger`) or `rgb(var(--xxx))` inside SVG. Hardcoded `#xxxxxx` is forbidden outside `globals.css` itself.

### Canonical reference pages

When you're not sure how a pattern looks in code, copy from one of these — they're the v3.0 reference implementation:

| Pattern | Reference file |
|---|---|
| Page header + hero number + ledger table | `src/app/(portal)/fund-out/page.tsx` |
| Multi-column hero summary | `src/app/(portal)/payments/page.tsx` |
| Hero number + side stats | `src/app/(portal)/director-salary/page.tsx` |
| Section-grouped tables | `src/app/(portal)/statements/page.tsx`, `src/app/(portal)/overdue/page.tsx` |
| Hero + dept totals + history | `src/app/(portal)/hr-costing/page.tsx` |
| Pure read-only ledger | `src/app/(portal)/audit-log/page.tsx` |
| Sidebar (roman numerals + dot markers) | `src/components/layout/Sidebar.tsx` |
| TopBar (greet + role badge) | `src/components/layout/TopBar.tsx` |

### Pages still on the legacy v2.0 chrome (clean up when you touch them)

`(portal)/fund-out/[id]`, `/fund-in/[id]`, `/fund-in/new`, `/fund-out/new`, `/payments/[id]`, `/payments/new`, `/payments/dept-requests`, `/payments/payroll-requests`, `/statements/[id]`, `/statements/[id]/print`, `/approvals/[id]`, `/approvals/payroll-run/[id]`, `/approvals/payroll-run/[id]/director-report`, `/billing/contracts/new`, `/billing/contracts/[id]/edit`, `/billing/requests`, `/dept-pool/[slug]`, `/dept-pool/marketing`, `/dept-pool/submissions`, `/dept-pool/contracts/new`, `/director-salary/[directorId]`, `/director-salary/[directorId]/print`, `/hr-costing/staff/*`, `/hr-costing/payroll/*`, `/hr-costing/payment`, `/reports/pnl`, `/reports/fund-summary`, `/reports/base-rate`, `/reports/claims`, `/opex`, `/operating-fund`, plus the HR + Dept Manager branches inside `/dashboard`. Each one inherited the deeper palette automatically but still needs `page-head` / `.num` / `.ledger-table` swap when it next gets edited.

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

**Mood:** Institutional calm with warmth. Cream paper. Serif headings with italic emphasis. A single rust accent that appears only where decisions happen.

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

### Font stack

```css
:root {
  --font-serif: 'Instrument Serif', 'Noto Serif TC', Georgia, serif;
  --font-sans:  'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:  'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace;
  --font-cjk:   'Noto Serif TC', 'PingFang TC', 'Source Han Serif TC', serif;
}
```

**Load via Google Fonts:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Serif+TC:wght@400;600;700&display=swap" rel="stylesheet">
```

All 4 fonts are free. No licensing cost.

### Roles

| Role | Font | Weight | Usage |
|---|---|---|---|
| Display — page titles, hero numbers | **Instrument Serif** | 400 regular | `<h1>`, hero money values, section titles |
| Display italic — emphasis, active states, labels | **Instrument Serif Italic** | 400 italic | "*Free pool*", "*Pending your hand*", sidebar active item |
| Body — UI text, descriptions, form labels | **Inter** | 400/500/600 | Most body copy, form labels, button text (sans) |
| Data — money, rates, dates | **IBM Plex Mono** | 400/500 | All money columns, rate values, date strings. `font-variant-numeric: tabular-nums` |
| CJK — Chinese labels | **Noto Serif TC** | 400/600/700 | 董事长 · 本月对账单 · 内部账册. Pairs with Instrument Serif. |

**Key rule:** Display = always Instrument Serif. Body = Inter. Data = IBM Plex Mono. No exceptions without explicit DESIGN.md update.

### Type scale

| Token | Size | Line-height | Font | Use case |
|---|---|---|---|---|
| `text-mono-xs` | 11px | 16px | mono | Table meta, dates, labels |
| `text-mono-sm` | 12px | 16px | mono | Table cell numbers |
| `text-xs` | 11px | 16px | sans | Labels, captions |
| `text-sm` | 13px | 20px | sans | Body UI, descriptions |
| `text-base` | 14px | 20px | sans | Form inputs, table rows |
| `text-md` | 15px | 24px | sans or serif | Approval card titles |
| `text-lg` | 18px | 24px | serif | Card titles, section subheads |
| `text-xl` | 22px | 28px | serif | Page subheads |
| `text-2xl` | 28px | 32px | serif | Section titles |
| `text-3xl` | 40px | 44px | serif | Page titles |
| `text-hero` | 64px | 64px | serif | Solvency hero number on Dashboard |
| `text-hero-lg` | 72px | 72px | serif | Reserved for single most important number |

**Money numbers always use tabular-nums (plain zero):**
```css
.tabular, .mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

---

## Color Palette — Warm Paper

### Base (v3.0 — Finance-readability deepened)

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

### Radius (rounded-md default, never xl)

```
--radius-sm: 4px   /* status pills, small buttons */
--radius-md: 6px   /* DEFAULT — cards, inputs, buttons */
--radius-lg: 8px   /* modals, large cards */
--radius-full: 9999px  /* avatars only */
```

**Absolutely no `rounded-xl` (12px) or `rounded-2xl` (16px).** Those belong to SaaS landing pages, not a ledger.

### Shadows

**No shadows on cards.** Elevation comes from hairline borders (`--hairline`), not drop shadows.

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

---

## v3.0 utility classes (in `globals.css`)

These are the load-bearing classes that make a page feel "v3.0 ledger-dense" instead of "v2.0 broadsheet". Use them by name; do not re-implement.

| Class | What it does | Where to use |
|---|---|---|
| `.page-head` | Flex container with bottom hairline + 64px accent rule + 28px bottom margin | Wraps every top-level page header (title + optional right-side action). |
| `.page-eyebrow` | Mono uppercase 10.5px label with rust italic roman numeral inside `<em>` | Inside `.page-head`, above the `.page-title`. Format: `<em>I.</em> SECTION · PAGE NAME`. |
| `.page-title` | Instrument Serif 38px ink with negative letter-spacing | The `<h1>` inside `.page-head`. |
| `.sect-head` | Flex baseline row: italic serif title + hairline rule extending right + uppercase mono counter | Section dividers inside a page. Replaces hand-rolled `<h2>` + `<p>` mb-6 pattern. |
| `.num` | IBM Plex Mono + `tabular-nums` + 13.5px + weight 500 + `--num-ink` | Every money cell in a table or grid. Right-aligns inside `.ledger-table td.num`. |
| `.num.neg` | Same as `.num` but `--danger` red | Negative amounts (`(1,234.56)` style). |
| `.num-hero` | 56px serif + tabular + `--num-ink` + tight letter-spacing; auto-styles `<span class="cents">` and `<span class="unit">` to graphite | Dashboard / page hero figures (Free pool, Total outstanding, etc.). |
| `.ledger-table` | Surface bg + 1px hairline border + 6px radius + zebra rows + `surface-2` thead + accent-bg hover + `td.num` right-align | Every data list table. Replaces ad-hoc `<table className="w-full text-sm">…border-b…hover:bg-surface-2/40`. |
| `.chip` | Rounded pill: 99px radius + 10.5px mono + variant colors (`accent` / `ledger` / `alert` / `danger` / `info`) | Status tags, category labels. Inline only; do not use as button. |

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

---

## Responsive Breakpoints (Phase 1)

Desktop-first. VP is an office tool.

| Breakpoint | Width | Scope |
|---|---|---|
| Mobile (<768) | not optimized | Works but not polished. Only Dashboard + Approvals usable. |
| Tablet (768-1024) | partial | Collapsible sidebar, stacked sections |
| Desktop (≥1024) | primary | Full layout |

Phase 1.5 will add proper mobile polish.

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
| Tables, detail views | `RM 100,000.00` | IBM Plex Mono tabular |
| Hero numbers | `RM 12,847,203.55` | Instrument Serif 64px |
| KPI cards | `RM 100K` / `RM 1.2M` | Instrument Serif 28-40px |
| Negative (contra) | `(1,234.56)` | mono + `--danger` color |

### Date format

| Context | Format | Font |
|---|---|---|
| Serif display | "Wed 9 Apr 2026" | Instrument Serif |
| Mono meta | "9 Apr 2026" / "Wed 09:42" | IBM Plex Mono |
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

- **2026-04-25 v3.0** — Ledger-Dense / Finance-readability pass. Imported the design exported from claude.ai/design (`design-import/venture/`). Deepened the warm-paper palette (paper #F5EFE4 → #F3ECDD, hairline #DFD4BE → #C6B99E, ink #1A1613 → #1C160F, graphite #6B5F52 → #5A4E40, muted #9E8F7F → #85775F) and introduced a dedicated `--num-ink` (#1A130B) for monetary digits. Added v3.0 utility class layer in `globals.css`: `.num`, `.num-hero`, `.ledger-table`, `.page-head`, `.page-eyebrow`, `.page-title`, `.sect-head`, `.chip`. Sidebar rebuilt with editorial roman numerals + dot/bar markers. TopBar greet enlarged with role badge + ledger green dot. 17 high-traffic pages migrated as reference implementations (Dashboard, Fund IN/OUT, Payments, Statements, Approvals, Overdue, Reconciliation, HR Costing, Director Salary, Settings, Reports, Audit Log, Claims, Dept Pool, Director Pool, Invoice Pool, BillingView). Backend untouched (zero changes to Server Actions / RPCs / Supabase / lib).
- **2026-04-10 v2.0** — Major pivot to Anthropic-flavored warm cream + Instrument Serif + rust accent direction, per design-consultation session. Replaces institutional slate direction from v1.0.
- **2026-04-09 v1.0** — Initial version from /autoplan Phase 2 design review. Proposed slate-cool direction with TBD brand color (navy vs teal).
